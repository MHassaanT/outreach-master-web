import logging
import re
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func, update, case, desc
from app.models.lead import Lead, LeadStatus
from app.models.message import Message
from app.services.phone_filter import normalize_phone, extract_phone_digits

logger = logging.getLogger(__name__)


async def merge_leads(db: AsyncSession, primary: Lead, secondaries: List[Lead]) -> Lead:
    """
    Consolidates secondary duplicate leads into a primary lead:
    1. Reassigns all messages from secondaries to primary.
    2. Updates timestamps (last_reply_at, last_contacted_at).
    3. Promotes primary status (e.g. to ONGOING if a secondary received a reply).
    4. Deletes the secondary leads.
    """
    primary_clean_e164, primary_fmt = normalize_phone(primary.phone_number)
    if primary_clean_e164:
        primary.phone_number = primary_clean_e164
        if not primary.formatted_phone:
            primary.formatted_phone = primary_fmt

    for sec in secondaries:
        if sec.id == primary.id:
            continue

        logger.info(
            "Merging duplicate lead ID %d ('%s', %s) into primary lead ID %d ('%s', %s)",
            sec.id, sec.business_name, sec.phone_number,
            primary.id, primary.business_name, primary.phone_number
        )

        # Move all messages to primary lead
        await db.execute(
            update(Message)
            .where(Message.lead_id == sec.id)
            .values(lead_id=primary.id)
        )

        # Merge timestamps
        if sec.last_reply_at:
            if not primary.last_reply_at or sec.last_reply_at > primary.last_reply_at:
                primary.last_reply_at = sec.last_reply_at

        if sec.last_contacted_at:
            if not primary.last_contacted_at or sec.last_contacted_at > primary.last_contacted_at:
                primary.last_contacted_at = sec.last_contacted_at

        # Promote status
        if sec.status == LeadStatus.ONGOING and primary.status != LeadStatus.FINALIZED:
            primary.status = LeadStatus.ONGOING
        elif sec.status == LeadStatus.FINALIZED:
            primary.status = LeadStatus.FINALIZED
        elif sec.status == LeadStatus.OUTREACH_SENT and primary.status == LeadStatus.NEW:
            primary.status = LeadStatus.OUTREACH_SENT

        # Keep richer notes/address if primary was missing them
        if not primary.address and sec.address:
            primary.address = sec.address
        if not primary.notes and sec.notes and "Auto-created" not in sec.notes:
            primary.notes = sec.notes

        # Delete secondary lead
        await db.delete(sec)

    await db.flush()
    return primary


async def find_lead_by_phone(db: AsyncSession, raw_phone: str) -> Optional[Lead]:
    """
    Finds a lead matching the incoming phone number regardless of whitespace,
    dashes, country code formats, or previous non-normalized storage.
    If multiple duplicate leads exist, automatically merges them and returns the primary lead.
    """
    if not raw_phone or not raw_phone.strip():
        return None

    clean_digits = extract_phone_digits(raw_phone)
    if not clean_digits:
        return None

    e164, formatted = normalize_phone(raw_phone)
    candidates = {raw_phone.strip(), clean_digits, f"+{clean_digits}"}
    if e164:
        candidates.add(e164)
    if formatted:
        candidates.add(formatted)

    # SQL expressions that strip common punctuation & spaces from columns
    clean_col = func.replace(
        func.replace(
            func.replace(
                func.replace(
                    func.replace(Lead.phone_number, " ", ""),
                    "-", ""
                ),
                "(", ""
            ),
            ")", ""
        ),
        "+", ""
    )

    clean_fmt = func.replace(
        func.replace(
            func.replace(
                func.replace(
                    func.replace(func.coalesce(Lead.formatted_phone, ""), " ", ""),
                    "-", ""
                ),
                "(", ""
            ),
            ")", ""
        ),
        "+", ""
    )

    conditions = [
        Lead.phone_number.in_(candidates),
        Lead.formatted_phone.in_(candidates),
        clean_col == clean_digits,
        clean_fmt == clean_digits,
    ]

    # Terminal suffix match for numbers with country code variations (e.g. 07... vs 447...)
    if len(clean_digits) >= 9:
        suffix_9 = clean_digits[-9:]
        conditions.append(clean_col.endswith(suffix_9))
        conditions.append(clean_fmt.endswith(suffix_9))

    if len(clean_digits) >= 10:
        suffix_10 = clean_digits[-10:]
        conditions.append(clean_col.endswith(suffix_10))
        conditions.append(clean_fmt.endswith(suffix_10))

    query = (
        select(Lead)
        .where(or_(*conditions))
        .order_by(
            # Prioritize genuine leads over auto-created leads
            case((Lead.notes.like("%Auto-created%"), 1), else_=0).asc(),
            Lead.google_place_id.isnot(None).desc(),
            (Lead.status == LeadStatus.OUTREACH_SENT).desc(),
            Lead.id.asc()
        )
    )

    res = await db.execute(query)
    matched_leads = list(res.scalars().all())

    if not matched_leads:
        # Fallback: scan all leads in-memory if SQL didn't catch a rare formatting
        all_res = await db.execute(select(Lead))
        for cand in all_res.scalars().all():
            cand_digits = extract_phone_digits(cand.phone_number)
            if cand_digits:
                if cand_digits == clean_digits or (
                    len(cand_digits) >= 9 and len(clean_digits) >= 9 and cand_digits[-9:] == clean_digits[-9:]
                ):
                    matched_leads.append(cand)

    if not matched_leads:
        return None

    # Sort matching leads to determine the primary lead
    matched_leads = list({l.id: l for l in matched_leads}.values())
    matched_leads.sort(
        key=lambda l: (
            1 if "Auto-created" in (l.notes or "") else 0,
            0 if l.google_place_id else 1,
            0 if l.status == LeadStatus.OUTREACH_SENT else 1,
            l.id
        )
    )

    primary = matched_leads[0]

    # Normalize primary phone if needed
    if e164 and primary.phone_number != e164:
        primary.phone_number = e164
        if not primary.formatted_phone:
            primary.formatted_phone = formatted

    # If duplicates were found, auto-merge them immediately
    if len(matched_leads) > 1:
        logger.info(
            "Found %d duplicate leads for phone %s. Merging into Lead ID %d ('%s')",
            len(matched_leads), raw_phone, primary.id, primary.business_name
        )
        primary = await merge_leads(db, primary, matched_leads[1:])

    return primary


async def sanitize_and_merge_existing_leads(db: AsyncSession) -> Dict[str, Any]:
    """
    Self-healing migration that runs on startup and maintenance:
    1. Normalizes all lead phone numbers to standard E.164 (removing spaces, dashes, etc.).
    2. Groups leads by clean phone digits (including UK 0-prefix vs +44 matching).
    3. Merges duplicate leads, consolidating messages and statuses into the primary lead.
    """
    logger.info("Running lead database sanitization & deduplication check...")
    res = await db.execute(select(Lead))
    all_leads = res.scalars().all()

    normalized_count = 0
    # Step 1: Normalize phone format in DB
    for lead in all_leads:
        clean_e164, formatted = normalize_phone(lead.phone_number)
        if clean_e164 and lead.phone_number != clean_e164:
            lead.phone_number = clean_e164
            if not lead.formatted_phone:
                lead.formatted_phone = formatted
            normalized_count += 1

    await db.flush()

    # Step 2: Group leads by canonical digits or 9-digit suffix
    groups: Dict[str, List[Lead]] = {}
    for lead in all_leads:
        digits = extract_phone_digits(lead.phone_number)
        if not digits:
            continue
        # Key on last 9 digits to bridge national/international differences
        key = digits[-9:] if len(digits) >= 9 else digits
        groups.setdefault(key, []).append(lead)

    merged_lead_count = 0
    # Step 3: Merge any group with multiple leads
    for key, group in groups.items():
        # Deduplicate objects by ID
        unique_group = list({l.id: l for l in group}.values())
        if len(unique_group) > 1:
            # Sort: primary is non-auto-created, has place ID, earlier ID
            unique_group.sort(
                key=lambda l: (
                    1 if "Auto-created" in (l.notes or "") else 0,
                    0 if l.google_place_id else 1,
                    0 if l.status == LeadStatus.OUTREACH_SENT else 1,
                    l.id
                )
            )
            primary = unique_group[0]
            secondaries = unique_group[1:]
            await merge_leads(db, primary, secondaries)
            merged_lead_count += len(secondaries)

    await db.commit()
    logger.info(
        "Lead sanitization completed. Normalized %d numbers, merged %d duplicate leads.",
        normalized_count, merged_lead_count
    )

    return {
        "normalized_count": normalized_count,
        "merged_duplicates_count": merged_lead_count
    }
