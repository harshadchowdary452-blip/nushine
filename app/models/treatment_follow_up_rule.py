import uuid
from sqlalchemy import String, Integer, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class TreatmentFollowUpRule(Base):
    __tablename__ = "treatment_follow_up_rules"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)
    treatment_name: Mapped[str] = mapped_column(String(255), nullable=True)
    treatment_type_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_types.id"), nullable=True)
    treatment_template_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_templates.id"), nullable=True)
    follow_up_1_day: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    follow_up_7_day: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    recall_6_month: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    recall_12_month: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    custom_recall_days: Mapped[int] = mapped_column(Integer, nullable=True)
    enquiry_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    auto_appointment_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    assigned_doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
