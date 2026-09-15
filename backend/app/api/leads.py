from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, or_
from app.core.database import get_db
from app.models.lead import Lead, LeadStatus
from app.api.deps import get_current_user
from app.models.user import User
from app.services.phone_filter import normalize_phone
from app.services.lead_service import find_lead_by_phone, sanitize_and_merge_existing_leads

router = APIRouter(prefix="/leads", tags=["Leads"])


class LeadCreate(BaseModel):
    business_name: str
    contact_name: Optional[str] = None
    phone_number: str
    formatted_phone: Optional[str] = None
    phone_type: Optional[str] = "mobile"
    address: Optional[str] = None
    rating: Optional[float] = None
    user_ratings_total: Optional[int] = None
    website: Optional[str] = None
    google_place_id: Optional[str] = None
    notes: Optional[str] = None


class LeadUpdateStatus(BaseModel):
    status: LeadStatus


class LeadUpdate(BaseModel):
    business_name: Optional[str] = None
    contact_name: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[LeadStatus] = None


@router.get("")
@router.get("/")
async def list_leads(
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(Lead)

    if status_filter and status_filter != "all":
        try:
            enum_val = LeadStatus(status_filter)
            query = query.where(Lead.status == enum_val)
        except ValueError:
            pass

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.where(
            or_(
                Lead.business_name.ilike(term),
                Lead.phone_number.ilike(term),
                Lead.address.ilike(term)
            )
        )

    query = query.order_by(desc(Lead.created_at)).offset(offset).limit(limit)
    result = await db.execute(query)
    leads = result.scalars().all()

    return [
        {
            "id": l.id,
            "business_name": l.business_name,
            "contact_name": l.contact_name,
            "phone_number": l.phone_number,
            "formatted_phone": l.formatted_phone or l.phone_number,
            "phone_type": l.phone_type,
            "address": l.address,
            "rating": l.rating,
            "user_ratings_total": l.user_ratings_total,
            "website": l.website,
            "google_place_id": l.google_place_id,
            "status": l.status.value,
            "notes": l.notes,
            "last_contacted_at": l.last_contacted_at.isoformat() if l.last_contacted_at else None,
            "last_reply_at": l.last_reply_at.isoformat() if l.last_reply_at else None,
            "created_at": l.created_at.isoformat()
        }
        for l in leads
    ]


@router.post("", status_code=status.HTTP_201_CREATED, include_in_schema=False)
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_lead(
    data: LeadCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    clean_e164, formatted = normalize_phone(data.phone_number)
    effective_phone = clean_e164 or data.phone_number.strip()
    effective_formatted = data.formatted_phone or formatted or effective_phone

    # Check if place_id already exists
    if data.google_place_id:
        existing = await db.execute(select(Lead).where(Lead.google_place_id == data.google_place_id))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="A lead with this Google Place ID already exists")

    # Check if a lead with this phone number already exists
    existing_phone = await find_lead_by_phone(db, effective_phone)
    if existing_phone:
        raise HTTPException(
            status_code=400,
            detail=f"A lead with this phone number already exists ('{existing_phone.business_name}')"
        )

    lead = Lead(
        business_name=data.business_name,
        contact_name=data.contact_name,
        phone_number=effective_phone,
        formatted_phone=effective_formatted,
        phone_type=data.phone_type or "mobile",
        address=data.address,
        rating=data.rating,
        user_ratings_total=data.user_ratings_total,
        website=data.website,
        google_place_id=data.google_place_id,
        notes=data.notes,
        status=LeadStatus.NEW
    )
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    return lead


@router.post("/bulk-import")
async def bulk_import_leads(
    leads_data: List[LeadCreate],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    imported_count = 0
    skipped_count = 0
    seen_in_batch = set()

    for item in leads_data:
        clean_e164, formatted = normalize_phone(item.phone_number)
        effective_phone = clean_e164 or item.phone_number.strip()
        effective_formatted = item.formatted_phone or formatted or effective_phone

        if effective_phone in seen_in_batch:
            skipped_count += 1
            continue

        # Check duplicate by place_id
        if item.google_place_id:
            existing = await db.execute(select(Lead).where(Lead.google_place_id == item.google_place_id))
            if existing.scalar_one_or_none():
                skipped_count += 1
                continue

        # Check duplicate by phone
        existing_phone = await find_lead_by_phone(db, effective_phone)
        if existing_phone:
            skipped_count += 1
            continue

        seen_in_batch.add(effective_phone)

        lead = Lead(
            business_name=item.business_name,
            contact_name=item.contact_name,
            phone_number=effective_phone,
            formatted_phone=effective_formatted,
            phone_type=item.phone_type or "mobile",
            address=item.address,
            rating=item.rating,
            user_ratings_total=item.user_ratings_total,
            website=item.website,
            google_place_id=item.google_place_id,
            notes=item.notes,
            status=LeadStatus.NEW
        )
        db.add(lead)
        imported_count += 1

    await db.commit()
    return {
        "imported_count": imported_count,
        "skipped_count": skipped_count
    }


@router.post("/merge-duplicates")
async def merge_duplicate_leads_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Manually triggers a database scan to normalize numbers and merge split duplicate threads.
    """
    stats = await sanitize_and_merge_existing_leads(db)
    return {"success": True, **stats}


@router.get("/{lead_id}")
async def get_lead(
    lead_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.patch("/{lead_id}/status")
async def update_lead_status(
    lead_id: int,
    body: LeadUpdateStatus,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    lead.status = body.status
    lead.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(lead)
    return {"success": True, "lead_id": lead.id, "status": lead.status.value}


@router.delete("/{lead_id}")
async def delete_lead(
    lead_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    await db.delete(lead)
    await db.commit()
    return {"success": True, "message": "Lead deleted"}
