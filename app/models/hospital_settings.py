import uuid
from sqlalchemy import String, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class HospitalSettings(Base):
    __tablename__ = "hospital_settings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    doctor_max_appointments_per_hour: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
