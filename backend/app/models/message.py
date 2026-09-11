import enum
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, DateTime, Integer, Text, Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class MessageDirection(str, enum.Enum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"


class MessageStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"


class MessageType(str, enum.Enum):
    TEXT = "text"
    TEMPLATE = "template"


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    lead_id: Mapped[int] = mapped_column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), index=True, nullable=False)
    
    direction: Mapped[MessageDirection] = mapped_column(
        Enum(MessageDirection, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False
    )
    message_type: Mapped[MessageType] = mapped_column(
        Enum(MessageType, values_callable=lambda obj: [e.value for e in obj]),
        default=MessageType.TEXT
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    template_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    whatsapp_message_id: Mapped[Optional[str]] = mapped_column(String(255), index=True, nullable=True)
    
    status: Mapped[MessageStatus] = mapped_column(
        Enum(MessageStatus, values_callable=lambda obj: [e.value for e in obj]),
        default=MessageStatus.SENT,
        index=True
    )
    error_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    lead: Mapped["Lead"] = relationship("Lead", back_populates="messages")
