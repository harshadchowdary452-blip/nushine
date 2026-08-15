from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date, time
from app.schemas.medication_prescription import MedicationPrescriptionCreate, MedicationPrescriptionResponse


class TreatmentSittingCreate(BaseModel):
    treatment_plan_id: str
    sitting_number: int = Field(..., ge=1)
    sitting_date: Optional[date] = None
    doctor_id: Optional[str] = None
    work_done: Optional[str] = None
    status: Optional[str] = None
    doctor_notes: Optional[str] = None
    procedure_performed: Optional[str] = None
    clinical_notes: Optional[str] = None
    prescription: Optional[str] = None
    next_appointment_date: Optional[date] = None
    next_appointment_time: Optional[time] = None
    next_appointment_doctor_id: Optional[str] = None
    next_visit_required: Optional[bool] = True
    materials_used: Optional[str] = None
    duration_minutes: Optional[int] = None
    images_json: Optional[str] = None
    digital_signature_url: Optional[str] = None
    lab_tracking_status: Optional[str] = None
    lab_tracking_notes: Optional[str] = None
    lab_tracking_due_date: Optional[date] = None
    lab_name: Optional[str] = None
    lab_order_number: Optional[str] = None
    lab_sent_date: Optional[date] = None
    lab_return_date: Optional[date] = None
    lab_cost: Optional[float] = None
    medications: Optional[List[MedicationPrescriptionCreate]] = None


class TreatmentSittingUpdate(BaseModel):
    work_done: Optional[str] = None
    status: Optional[str] = None
    doctor_id: Optional[str] = None
    doctor_notes: Optional[str] = None
    procedure_performed: Optional[str] = None
    clinical_notes: Optional[str] = None
    prescription: Optional[str] = None
    next_appointment_date: Optional[date] = None
    next_appointment_time: Optional[time] = None
    next_appointment_doctor_id: Optional[str] = None
    next_visit_required: Optional[bool] = None
    materials_used: Optional[str] = None
    duration_minutes: Optional[int] = None
    images_json: Optional[str] = None
    digital_signature_url: Optional[str] = None
    lab_tracking_status: Optional[str] = None
    lab_tracking_notes: Optional[str] = None
    lab_tracking_due_date: Optional[date] = None
    lab_name: Optional[str] = None
    lab_order_number: Optional[str] = None
    lab_sent_date: Optional[date] = None
    lab_return_date: Optional[date] = None
    lab_cost: Optional[float] = None
    medications: Optional[List[MedicationPrescriptionCreate]] = None


class TreatmentSittingResponse(BaseModel):
    id: str
    treatment_plan_id: str
    sitting_number: int
    sitting_date: Optional[date] = None
    doctor_id: Optional[str] = None
    work_done: Optional[str]
    status: str
    doctor_notes: Optional[str]
    procedure_performed: Optional[str] = None
    clinical_notes: Optional[str] = None
    prescription: Optional[str] = None
    next_appointment_date: Optional[date]
    next_appointment_time: Optional[time]
    next_appointment_doctor_id: Optional[str] = None
    next_appointment_doctor_name: Optional[str] = None
    next_visit_required: bool = True
    materials_used: Optional[str] = None
    duration_minutes: Optional[int] = None
    attachments_json: Optional[str] = None
    images_json: Optional[str] = None
    digital_signature_url: Optional[str] = None
    lab_tracking_status: Optional[str] = None
    lab_tracking_notes: Optional[str] = None
    lab_tracking_due_date: Optional[date] = None
    lab_name: Optional[str] = None
    lab_order_number: Optional[str] = None
    lab_sent_date: Optional[date] = None
    lab_return_date: Optional[date] = None
    lab_cost: Optional[float] = None
    completed_by_id: Optional[str] = None
    completed_at: Optional[datetime] = None
    doctor_name: Optional[str] = None
    completed_by_name: Optional[str] = None
    medications: Optional[List[MedicationPrescriptionResponse]] = Field(default=None, validation_alias="medication_prescriptions")
    charge: Optional[float] = None
    paid_amount: float = 0.0
    invoice_status: str = "NOT_INVOICED"
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
