import uuid
from sqlalchemy import String, Integer, Boolean, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class CrmOpdSetting(Base):
    __tablename__ = "crm_opd_settings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=False, index=True)
    opd_follow_up_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    default_due_days: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    assigned_staff_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    priority: Mapped[str] = mapped_column(String(20), default="MEDIUM", nullable=False)
    message_template: Mapped[str] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
