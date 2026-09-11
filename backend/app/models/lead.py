import enum
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, DateTime, Integer, Float, Text, Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class LeadStatus(str, enum.Enum):
    NEW = "new"
    OUTREACH_SENT = "outreach_sent"
    ONGOING = "ongoing"
    FINALIZED = "finalized"
    NOT_INTERESTED = "not_interested"


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    business_name: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    contact_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone_number: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    formatted_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    phone_type: Mapped[str] = mapped_column(String(50), default="mobile")
    address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    rating: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    user_ratings_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    google_place_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    
    status: Mapped[LeadStatus] = mapped_column(
        Enum(LeadStatus, values_callable=lambda obj: [e.value for e in obj]),
        default=LeadStatus.NEW,
        index=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    last_contacted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_reply_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )

    messages: Mapped[List["Message"]] = relationship(
        "Message",
        back_populates="lead",
        cascade="all, delete-orphan",
        order_by="Message.timestamp"
    )
