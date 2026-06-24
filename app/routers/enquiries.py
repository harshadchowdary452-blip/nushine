from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sa_delete, func, desc
from typing import Optional
from datetime import datetime, timezone, date
from pydantic import BaseModel, Field
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.models.enquiry import Enquiry, EnquiryStatus, TreatmentInterest, EnquiryFollowUp
from app.models.patient import Patient
from app.models.user import User
from app.models.follow_up import FollowUp, FollowUpStatus, FollowUpType

router = APIRouter(prefix="/crm/enquiries", tags=["CRM Enquiries"])


def _verify_hospital_access(entity, current_user):
    role = current_user.get("role")
    if role in ("HOSPITAL_ADMIN", "DOCTOR"):
        ehid = getattr(entity, "hospital_id", None)
        uhid = current_user.get("hospital_id")
        if ehid and uhid and str(ehid) != str(uhid):
            raise HTTPException(status_code=403, detail="Access denied: belongs to another hospital")


# --- Schemas ---
class EnquiryCreate(BaseModel):
    patient_id: str
    treatment_interest: str = "OTHER"
    notes: Optional[str] = None
    assigned_staff_id: Optional[str] = None
    next_follow_up_date: Optional[str] = None


class EnquiryUpdate(BaseModel):
    treatment_interest: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    assigned_staff_id: Optional[str] = None
    next_follow_up_date: Optional[str] = None


class EnquiryFollowUpAction(BaseModel):
    action: str = Field(..., description="CALL, WHATSAPP, BOOK_APPOINTMENT, MARK_INTERESTED, MARK_NOT_INTERESTED, CONVERT_TO_TREATMENT")
    notes: Optional[str] = None
    next_follow_up_date: Optional[str] = None


# --- CRUD ---
@router.post("/")
async def create_enquiry(data: EnquiryCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    hospital_id = current_user.get("hospital_id")
    patient = await db.get(Patient, data.patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    if not hospital_id:
        hospital_id = patient.hospital_id
    enquiry = Enquiry(
        hospital_id=hospital_id, patient_id=data.patient_id,
        treatment_interest=data.treatment_interest, notes=data.notes,
        assigned_staff_id=data.assigned_staff_id or current_user.get("sub"),
        next_follow_up_date=date.fromisoformat(data.next_follow_up_date) if data.next_follow_up_date else None,
        status=EnquiryStatus.NEW.value,
    )
    db.add(enquiry)
    await db.flush()
    await db.commit()
    return {"id": str(enquiry.id), "status": enquiry.status}


@router.get("/")
async def list_enquiries(
    status_filter: Optional[str] = Query(None, alias="status"),
    patient_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")
    q = select(Enquiry)
    if hospital_id:
        q = q.where(Enquiry.hospital_id == hospital_id)
    if status_filter:
        q = q.where(Enquiry.status == status_filter)
    if patient_id:
        q = q.where(Enquiry.patient_id == patient_id)
    q = q.order_by(desc(Enquiry.created_at))
    rows = (await db.execute(q)).scalars().all()
    result = []
    for e in rows:
        patient = await db.get(Patient, e.patient_id)
        staff = await db.get(User, e.assigned_staff_id) if e.assigned_staff_id else None
        result.append({
            "id": str(e.id), "patient_id": str(e.patient_id),
            "patient_name": patient.full_name if patient else "Unknown",
            "patient_phone": patient.phone if patient else None,
            "treatment_interest": e.treatment_interest, "notes": e.notes,
            "status": e.status,
            "assigned_staff_id": str(e.assigned_staff_id) if e.assigned_staff_id else None,
            "assigned_staff_name": staff.full_name if staff else None,
            "next_follow_up_date": e.next_follow_up_date.isoformat() if e.next_follow_up_date else None,
            "created_at": e.created_at.isoformat(),
        })
    return result


@router.get("/calendar")
async def get_enquiry_calendar(
    start_date: str = Query(...), end_date: str = Query(...),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    q = select(Enquiry).where(Enquiry.created_at >= datetime.combine(start, datetime.min.time()), Enquiry.created_at <= datetime.combine(end, datetime.max.time()))
    if hospital_id:
        q = q.where(Enquiry.hospital_id == hospital_id)
    if status_filter:
        q = q.where(Enquiry.status == status_filter)
    q = q.order_by(desc(Enquiry.created_at))
    rows = (await db.execute(q)).scalars().all()
    result = []
    for e in rows:
        patient = await db.get(Patient, e.patient_id)
        staff = await db.get(User, e.assigned_staff_id) if e.assigned_staff_id else None
        result.append({
            "id": str(e.id), "patient_name": patient.full_name if patient else "Unknown",
            "treatment_interest": e.treatment_interest,
            "enquiry_date": e.created_at.date().isoformat() if e.created_at else None,
            "assigned_staff": staff.full_name if staff else None,
            "next_follow_up_date": e.next_follow_up_date.isoformat() if e.next_follow_up_date else None,
            "status": e.status,
        })
    return result


@router.get("/{enquiry_id}")
async def get_enquiry(enquiry_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    e = await db.get(Enquiry, enquiry_id)
    if not e:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    _verify_hospital_access(e, current_user)
    patient = await db.get(Patient, e.patient_id)
    staff = await db.get(User, e.assigned_staff_id) if e.assigned_staff_id else None
    return {
        "id": str(e.id), "patient_id": str(e.patient_id),
        "patient_name": patient.full_name if patient else "Unknown",
        "patient_phone": patient.phone if patient else None,
        "treatment_interest": e.treatment_interest, "notes": e.notes,
        "status": e.status,
        "assigned_staff_id": str(e.assigned_staff_id) if e.assigned_staff_id else None,
        "assigned_staff_name": staff.full_name if staff else None,
        "next_follow_up_date": e.next_follow_up_date.isoformat() if e.next_follow_up_date else None,
        "created_at": e.created_at.isoformat(), "updated_at": e.updated_at.isoformat(),
    }


@router.put("/{enquiry_id}")
async def update_enquiry(enquiry_id: str, data: EnquiryUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    e = await db.get(Enquiry, enquiry_id)
    if not e:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    _verify_hospital_access(e, current_user)
    if data.treatment_interest is not None: e.treatment_interest = data.treatment_interest
    if data.status is not None: e.status = data.status
    if data.notes is not None: e.notes = data.notes
    if data.assigned_staff_id is not None: e.assigned_staff_id = data.assigned_staff_id
    if data.next_follow_up_date is not None: e.next_follow_up_date = date.fromisoformat(data.next_follow_up_date)
    e.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"success": True}


@router.delete("/{enquiry_id}")
async def delete_enquiry(enquiry_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    e = await db.get(Enquiry, enquiry_id)
    if not e:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    _verify_hospital_access(e, current_user)
    await db.execute(sa_delete(EnquiryFollowUp).where(EnquiryFollowUp.enquiry_id == enquiry_id))
    await db.delete(e)
    await db.commit()
    return {"success": True}


# --- Enquiry Follow-Up Actions ---
@router.post("/{enquiry_id}/follow-ups")
async def create_enquiry_follow_up(enquiry_id: str, data: EnquiryFollowUpAction, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    e = await db.get(Enquiry, enquiry_id)
    if not e:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    _verify_hospital_access(e, current_user)
    fu = EnquiryFollowUp(enquiry_id=enquiry_id, staff_id=current_user.get("sub"), action=data.action, notes=data.notes)
    db.add(fu)
    # Update enquiry status based on action
    if data.action == "MARK_INTERESTED":
        e.status = EnquiryStatus.INTERESTED.value
    elif data.action == "MARK_NOT_INTERESTED":
        e.status = EnquiryStatus.NOT_INTERESTED.value
    elif data.action == "CONVERT_TO_TREATMENT":
        e.status = EnquiryStatus.CONVERTED.value
    elif data.action in ("CALL", "WHATSAPP"):
        if e.status == EnquiryStatus.NEW.value:
            e.status = EnquiryStatus.CONTACTED.value
    if data.next_follow_up_date:
        e.next_follow_up_date = date.fromisoformat(data.next_follow_up_date)
    await db.commit()
    return {"success": True, "enquiry_status": e.status}


@router.get("/{enquiry_id}/follow-ups")
async def list_enquiry_follow_ups(enquiry_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    q = select(EnquiryFollowUp).where(EnquiryFollowUp.enquiry_id == enquiry_id).order_by(desc(EnquiryFollowUp.created_at))
    rows = (await db.execute(q)).scalars().all()
    result = []
    for fu in rows:
        staff = await db.get(User, fu.staff_id) if fu.staff_id else None
        result.append({
            "id": str(fu.id), "enquiry_id": str(fu.enquiry_id),
            "staff_id": str(fu.staff_id) if fu.staff_id else None,
            "staff_name": staff.full_name if staff else None,
            "action": fu.action, "notes": fu.notes,
            "created_at": fu.created_at.isoformat(),
        })
    return result



