from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sa_delete, func, desc, case as sa_case
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
from app.models.treatment_type import TreatmentType
from app.services.timeline_helper import record_timeline_event

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
    await record_timeline_event(
        db, current_user=current_user, patient_id=data.patient_id,
        action="CRM Enquiry Created",
        description=f"Enquiry created for {data.treatment_interest} (status: {enquiry.status})",
        module="CRM",
    )
    try:
        from app.crm.events import get_publisher
        from app.crm.enums import EventType, EventSource
        await get_publisher().publish(
            event_type=EventType.ENQUIRY_CREATED,
            source_module=EventSource.CRM,
            entity_type="ENQUIRY",
            entity_id=enquiry.id,
            hospital_id=getattr(enquiry, 'hospital_id', None),
            patient_id=enquiry.patient_id,
            db=db,
        )
    except Exception:
        pass
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
    type_filter: Optional[str] = Query(None, alias="type"),
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    result = []

    # Fetch follow-ups in date range
    fu_q = select(FollowUp).where(
        FollowUp.follow_up_date >= start,
        FollowUp.follow_up_date <= end,
    )
    if hospital_id:
        fu_q = fu_q.where(FollowUp.hospital_id == hospital_id)
    if status_filter:
        fu_q = fu_q.where(FollowUp.status == status_filter)
    if type_filter:
        fu_q = fu_q.where(FollowUp.follow_up_type == type_filter)
    fu_q = fu_q.order_by(FollowUp.follow_up_date)
    fu_rows = (await db.execute(fu_q)).scalars().all()

    for fu in fu_rows:
        patient = await db.get(Patient, fu.patient_id)
        doctor = await db.get(User, fu.doctor_id) if fu.doctor_id else None
        tt_name = None
        if fu.treatment_type_id:
            tt = await db.get(TreatmentType, fu.treatment_type_id)
            tt_name = tt.name if tt else None
        result.append({
            "id": str(fu.id),
            "source": "follow_up",
            "patient_id": str(fu.patient_id),
            "patient_name": patient.full_name if patient else "Unknown",
            "op_number": patient.op_no if patient else None,
            "doctor_name": doctor.full_name if doctor else None,
            "doctor_id": str(fu.doctor_id) if fu.doctor_id else None,
            "treatment_type": tt_name,
            "treatment_name": fu.treatment_name,
            "follow_up_type": fu.follow_up_type,
            "due_date": fu.follow_up_date.isoformat(),
            "status": fu.status,
            "response": fu.response_summary,
            "feedback": fu.patient_feedback,
            "staff_notes": fu.staff_notes,
            "action_required": fu.outcome,
            "response_status": fu.response_status,
            "next_action": fu.next_action,
            "contact_channel": fu.contact_channel,
            "last_contact_date": fu.last_contact_date.isoformat() if fu.last_contact_date else None,
            "patient_phone": patient.phone if patient else None,
        })

    # Fetch enquiries in date range (by next_follow_up_date)
    enq_q = select(Enquiry).where(
        Enquiry.next_follow_up_date >= start,
        Enquiry.next_follow_up_date <= end,
    )
    if hospital_id:
        enq_q = enq_q.where(Enquiry.hospital_id == hospital_id)
    if status_filter:
        enq_q = enq_q.where(Enquiry.status == status_filter)
    enq_q = enq_q.order_by(Enquiry.next_follow_up_date)
    enq_rows = (await db.execute(enq_q)).scalars().all()

    for e in enq_rows:
        patient = await db.get(Patient, e.patient_id)
        staff = await db.get(User, e.assigned_staff_id) if e.assigned_staff_id else None
        fu_type = "OPD_FOLLOW_UP" if e.treatment_interest == "OPD_FOLLOW_UP" else "ENQUIRY"
        result.append({
            "id": str(e.id),
            "source": "enquiry",
            "patient_id": str(e.patient_id),
            "patient_name": patient.full_name if patient else "Unknown",
            "op_number": patient.op_no if patient else None,
            "doctor_name": staff.full_name if staff else None,
            "doctor_id": str(e.assigned_staff_id) if e.assigned_staff_id else None,
            "treatment_type": None,
            "treatment_name": e.treatment_interest,
            "follow_up_type": fu_type,
            "due_date": e.next_follow_up_date.isoformat() if e.next_follow_up_date else e.created_at.date().isoformat(),
            "status": e.status,
            "response": None,
            "feedback": e.notes,
            "staff_notes": None,
            "action_required": None,
            "response_status": None,
            "next_action": None,
            "contact_channel": None,
            "last_contact_date": None,
            "patient_phone": patient.phone if patient else None,
        })

    # Fetch generated enquiries in date range (by due_date) — created by CRM rules
    try:
        from app.models.generated_enquiry import GeneratedEnquiry
        ge_q = select(GeneratedEnquiry).where(
            GeneratedEnquiry.due_date >= start,
            GeneratedEnquiry.due_date <= end,
        )
        if hospital_id:
            ge_q = ge_q.where(GeneratedEnquiry.hospital_id == hospital_id)
        ge_q = ge_q.order_by(GeneratedEnquiry.due_date)
        ge_rows = (await db.execute(ge_q)).scalars().all()

        for ge in ge_rows:
            patient = await db.get(Patient, ge.patient_id)
            staff = await db.get(User, ge.assigned_staff_id) if ge.assigned_staff_id else None
            tt_name = None
            if ge.treatment_type_id:
                tt = await db.get(TreatmentType, ge.treatment_type_id)
                tt_name = tt.name if tt else None
            result.append({
                "id": str(ge.id),
                "source": "generated_enquiry",
                "patient_id": str(ge.patient_id),
                "patient_name": patient.full_name if patient else "Unknown",
                "op_number": patient.op_no if patient else None,
                "doctor_name": staff.full_name if staff else None,
                "doctor_id": str(ge.assigned_staff_id) if ge.assigned_staff_id else None,
                "treatment_type": tt_name,
                "treatment_name": ge.treatment_name or ge.enquiry_type,
                "follow_up_type": ge.trigger_event or "CRM_RULE",
                "due_date": ge.due_date.isoformat(),
                "status": ge.status,
                "response": None,
                "feedback": ge.notes,
                "staff_notes": None,
                "action_required": ge.enquiry_type,
                "response_status": None,
                "next_action": None,
                "contact_channel": None,
                "last_contact_date": None,
                "patient_phone": patient.phone if patient else None,
            })
    except Exception:
        pass

    # Sort by due_date
    result.sort(key=lambda x: x["due_date"])
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
    old_status = e.status
    old_interest = e.treatment_interest
    if data.treatment_interest is not None: e.treatment_interest = data.treatment_interest
    if data.status is not None: e.status = data.status
    if data.notes is not None: e.notes = data.notes
    if data.assigned_staff_id is not None: e.assigned_staff_id = data.assigned_staff_id
    if data.next_follow_up_date is not None: e.next_follow_up_date = date.fromisoformat(data.next_follow_up_date)
    e.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=e.patient_id,
        action="CRM Enquiry Updated",
        description=f"Enquiry updated: status {old_status} -> {e.status}",
        module="CRM",
        changes=[{"field": "status", "old_value": old_status, "new_value": e.status}] if old_status != e.status else None,
    )
    return {"success": True}


@router.delete("/{enquiry_id}")
async def delete_enquiry(enquiry_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    e = await db.get(Enquiry, enquiry_id)
    if not e:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    _verify_hospital_access(e, current_user)
    patient_id = e.patient_id
    await db.execute(sa_delete(EnquiryFollowUp).where(EnquiryFollowUp.enquiry_id == enquiry_id))
    await db.delete(e)
    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="CRM Enquiry Deleted",
        description=f"Enquiry deleted",
        module="CRM",
    )
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
    await record_timeline_event(
        db, current_user=current_user, patient_id=e.patient_id,
        action="CRM Follow-Up Action",
        description=f"Follow-up action '{data.action}' performed on enquiry",
        module="CRM",
    )
    try:
        from app.crm.events import get_publisher
        from app.crm.enums import EventType, EventSource
        if data.action == "CONVERT_TO_TREATMENT":
            await get_publisher().publish(
                event_type=EventType.ENQUIRY_CONVERTED,
                source_module=EventSource.CRM,
                entity_type="ENQUIRY",
                entity_id=enquiry_id,
                hospital_id=getattr(e, 'hospital_id', None),
                patient_id=e.patient_id,
                db=db,
            )
    except Exception:
        pass
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



