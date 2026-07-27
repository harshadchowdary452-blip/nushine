from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sa_delete, func, desc, case as sa_case, and_, or_
from typing import Optional
from datetime import datetime, timezone, date, timedelta
from pydantic import BaseModel, Field
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.models.enquiry import Enquiry, EnquiryStatus, TreatmentInterest, EnquiryFollowUp
from app.models.patient import Patient
from app.models.user import User
from app.models.follow_up import FollowUp, FollowUpStatus, FollowUpType
from app.models.treatment_type import TreatmentType
from app.models.generated_enquiry import GeneratedEnquiry
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
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        await publish_event(
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


async def _batch_load_names(db: AsyncSession, ids: list[str], model, name_field="full_name"):
    if not ids:
        return {}
    q = select(model).where(model.id.in_(ids))
    rows = (await db.execute(q)).scalars().all()
    return {str(r.id): getattr(r, name_field, None) or getattr(r, "name", None) or str(r.id) for r in rows}


@router.get("/calendar")
async def get_enquiry_calendar(
    start_date: str = Query(...), end_date: str = Query(...),
    status_filter: Optional[str] = Query(None, alias="status"),
    type_filter: Optional[str] = Query(None, alias="type"),
    search: Optional[str] = Query(None),
    doctor_id: Optional[str] = Query(None),
    patient_id: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    include_terminal: bool = Query(False, alias="include_terminal"),
    page: int = Query(1, ge=1),
    page_size: int = Query(500, ge=1, le=1000),
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)

    terminal_statuses = ["COMPLETED", "CANCELLED", "LOST", "CONVERTED"]
    exclude_terminal = (not include_terminal) and (not status_filter)
    result = []
    today = date.today()

    # --- 1. Follow-ups (date range only — overdue shown in summary, not in grid) ---
    fu_q = select(FollowUp).where(
        FollowUp.follow_up_date >= start,
        FollowUp.follow_up_date <= end,
    )
    if hospital_id:
        fu_q = fu_q.where(FollowUp.hospital_id == hospital_id)
    if status_filter:
        fu_q = fu_q.where(FollowUp.status == status_filter)
    elif exclude_terminal:
        fu_q = fu_q.where(FollowUp.status.notin_(terminal_statuses))
    if type_filter:
        fu_q = fu_q.where(FollowUp.follow_up_type == type_filter)
    if doctor_id:
        fu_q = fu_q.where(FollowUp.doctor_id == doctor_id)
    if patient_id:
        fu_q = fu_q.where(FollowUp.patient_id == patient_id)
    fu_rows = (await db.execute(fu_q.order_by(FollowUp.follow_up_date))).scalars().all()

    fu_patient_ids = list({fu.patient_id for fu in fu_rows})
    fu_doctor_ids = list({fu.doctor_id for fu in fu_rows if fu.doctor_id})
    fu_tt_ids = list({fu.treatment_type_id for fu in fu_rows if fu.treatment_type_id})
    fu_patients = await _batch_load_names(db, fu_patient_ids, Patient, "full_name")
    fu_patients_phone = {}
    if fu_patient_ids:
        ph_q = select(Patient.id, Patient.phone, Patient.op_no).where(Patient.id.in_(fu_patient_ids))
        for row in (await db.execute(ph_q)).all():
            fu_patients_phone[str(row[0])] = {"phone": row[1], "op_no": row[2]}
    fu_doctors = await _batch_load_names(db, fu_doctor_ids, User, "full_name")
    fu_tt = {}
    if fu_tt_ids:
        tt_q = select(TreatmentType).where(TreatmentType.id.in_(fu_tt_ids))
        for tt in (await db.execute(tt_q)).scalars().all():
            fu_tt[str(tt.id)] = tt.name

    for fu in fu_rows:
        pid = str(fu.patient_id)
        pph = fu_patients_phone.get(pid, {})
        patient_name = fu_patients.get(pid, "Unknown")
        result.append({
            "id": str(fu.id),
            "source": "follow_up",
            "enquiry_type": fu.follow_up_type or "ENQUIRY",
            "patient_id": pid,
            "patient_name": patient_name,
            "op_number": pph.get("op_no"),
            "doctor_name": fu_doctors.get(str(fu.doctor_id), None) if fu.doctor_id else None,
            "doctor_id": str(fu.doctor_id) if fu.doctor_id else None,
            "treatment_type": fu_tt.get(str(fu.treatment_type_id)) if fu.treatment_type_id else None,
            "treatment_name": fu.treatment_name,
            "follow_up_type": fu.follow_up_type,
            "due_date": fu.follow_up_date.isoformat(),
            "priority": fu.priority or "MEDIUM",
            "status": fu.status,
            "response": fu.response_summary,
            "feedback": fu.patient_feedback,
            "staff_notes": fu.staff_notes,
            "action_required": fu.outcome,
            "response_status": fu.response_status,
            "next_action": fu.next_action,
            "contact_channel": fu.contact_channel,
            "last_contact_date": fu.last_contact_date.isoformat() if fu.last_contact_date else None,
            "patient_phone": pph.get("phone"),
        })

    # --- 2. Enquiries (date range only) ---
    enq_q = select(Enquiry).where(
        Enquiry.next_follow_up_date >= start,
        Enquiry.next_follow_up_date <= end,
    )
    if hospital_id:
        enq_q = enq_q.where(Enquiry.hospital_id == hospital_id)
    if status_filter:
        enq_q = enq_q.where(Enquiry.status == status_filter)
    elif exclude_terminal:
        enq_q = enq_q.where(Enquiry.status.notin_(terminal_statuses))
    if doctor_id:
        enq_q = enq_q.where(Enquiry.assigned_staff_id == doctor_id)
    if patient_id:
        enq_q = enq_q.where(Enquiry.patient_id == patient_id)
    enq_rows = (await db.execute(enq_q.order_by(Enquiry.next_follow_up_date))).scalars().all()

    enq_patient_ids = list({e.patient_id for e in enq_rows})
    enq_staff_ids = list({e.assigned_staff_id for e in enq_rows if e.assigned_staff_id})
    enq_patients = await _batch_load_names(db, enq_patient_ids, Patient, "full_name")
    enq_patients_phone = {}
    if enq_patient_ids:
        ph_q = select(Patient.id, Patient.phone, Patient.op_no).where(Patient.id.in_(enq_patient_ids))
        for row in (await db.execute(ph_q)).all():
            enq_patients_phone[str(row[0])] = {"phone": row[1], "op_no": row[2]}
    enq_staff = await _batch_load_names(db, enq_staff_ids, User, "full_name")

    for e in enq_rows:
        pid = str(e.patient_id)
        pph = enq_patients_phone.get(pid, {})
        fu_type = "OPD_FOLLOW_UP" if e.treatment_interest == "OPD_FOLLOW_UP" else "ENQUIRY"
        result.append({
            "id": str(e.id),
            "source": "enquiry",
            "enquiry_type": fu_type,
            "patient_id": pid,
            "patient_name": enq_patients.get(pid, "Unknown"),
            "op_number": pph.get("op_no"),
            "doctor_name": enq_staff.get(str(e.assigned_staff_id)) if e.assigned_staff_id else None,
            "doctor_id": str(e.assigned_staff_id) if e.assigned_staff_id else None,
            "treatment_type": None,
            "treatment_name": e.treatment_interest,
            "follow_up_type": fu_type,
            "due_date": e.next_follow_up_date.isoformat() if e.next_follow_up_date else e.created_at.date().isoformat(),
            "priority": "MEDIUM",
            "status": e.status,
            "response": None,
            "feedback": e.notes,
            "staff_notes": None,
            "action_required": None,
            "response_status": None,
            "next_action": None,
            "contact_channel": None,
            "last_contact_date": None,
            "patient_phone": pph.get("phone"),
        })

    # --- 3. Generated enquiries (CRM automation, date range only) ---
    ge_q = select(GeneratedEnquiry).where(
        GeneratedEnquiry.due_date >= start,
        GeneratedEnquiry.due_date <= end,
    )
    if hospital_id:
        ge_q = ge_q.where(GeneratedEnquiry.hospital_id == hospital_id)
    if status_filter:
        ge_q = ge_q.where(GeneratedEnquiry.status == status_filter)
    elif exclude_terminal:
        ge_q = ge_q.where(GeneratedEnquiry.status.notin_(terminal_statuses))
    if type_filter:
        ge_q = ge_q.where(GeneratedEnquiry.enquiry_type == type_filter)
    if doctor_id:
        ge_q = ge_q.where(
            or_(GeneratedEnquiry.doctor_id == doctor_id, GeneratedEnquiry.assigned_staff_id == doctor_id)
        )
    if patient_id:
        ge_q = ge_q.where(GeneratedEnquiry.patient_id == patient_id)
    if priority:
        ge_q = ge_q.where(GeneratedEnquiry.priority == priority)
    ge_rows = (await db.execute(ge_q.order_by(GeneratedEnquiry.due_date))).scalars().all()

    ge_patient_ids = list({ge.patient_id for ge in ge_rows if ge.patient_id})
    ge_lead_ids = list({ge.lead_id for ge in ge_rows if ge.lead_id})
    ge_staff_ids = list({ge.assigned_staff_id for ge in ge_rows if ge.assigned_staff_id})
    ge_doctor_ids = list({ge.doctor_id for ge in ge_rows if ge.doctor_id})
    ge_tt_ids = list({ge.treatment_type_id for ge in ge_rows if ge.treatment_type_id})
    ge_patients = await _batch_load_names(db, ge_patient_ids, Patient, "full_name")
    ge_patients_phone = {}
    if ge_patient_ids:
        ph_q = select(Patient.id, Patient.phone, Patient.op_no).where(Patient.id.in_(ge_patient_ids))
        for row in (await db.execute(ph_q)).all():
            ge_patients_phone[str(row[0])] = {"phone": row[1], "op_no": row[2]}
    ge_leads = {}
    if ge_lead_ids:
        from app.models.lead import Lead
        lead_q = select(Lead.id, Lead.lead_name).where(Lead.id.in_(ge_lead_ids))
        for row in (await db.execute(lead_q)).all():
            ge_leads[str(row[0])] = row[1]
    all_staff_ids = list(set(ge_staff_ids + ge_doctor_ids))
    ge_staff = await _batch_load_names(db, all_staff_ids, User, "full_name")
    ge_tt = {}
    if ge_tt_ids:
        tt_q = select(TreatmentType).where(TreatmentType.id.in_(ge_tt_ids))
        for tt in (await db.execute(tt_q)).scalars().all():
            ge_tt[str(tt.id)] = tt.name

    for ge in ge_rows:
        pid = str(ge.patient_id) if ge.patient_id else None
        pph = ge_patients_phone.get(pid, {}) if pid else {}
        doctor_name = ge_staff.get(str(ge.doctor_id)) if ge.doctor_id else None
        assigned_name = ge_staff.get(str(ge.assigned_staff_id)) if ge.assigned_staff_id else None
        lead_name = ge_leads.get(str(ge.lead_id)) if ge.lead_id else None
        patient_display = ge_patients.get(pid, None) if pid else None
        if not patient_display:
            patient_display = lead_name or "Unknown"
        result.append({
            "id": str(ge.id),
            "source": "generated_enquiry",
            "enquiry_type": ge.enquiry_type or "ENQUIRY",
            "patient_id": pid,
            "patient_name": patient_display,
            "op_number": pph.get("op_no"),
            "doctor_name": doctor_name or assigned_name,
            "doctor_id": str(ge.doctor_id) if ge.doctor_id else (str(ge.assigned_staff_id) if ge.assigned_staff_id else None),
            "treatment_type": ge_tt.get(str(ge.treatment_type_id)) if ge.treatment_type_id else None,
            "treatment_name": ge.treatment_name or ge.enquiry_type,
            "follow_up_type": ge.enquiry_type or ge.trigger_event or "CRM_RULE",
            "due_date": ge.due_date.isoformat(),
            "priority": ge.priority or "MEDIUM",
            "status": ge.status,
            "response": None,
            "feedback": ge.notes,
            "staff_notes": None,
            "action_required": ge.enquiry_type,
            "response_status": None,
            "next_action": None,
            "contact_channel": None,
            "last_contact_date": None,
            "patient_phone": pph.get("phone"),
        })

    # --- Search filter (client-side for name/phone/op_number) ---
    if search:
        sl = search.lower()
        result = [
            r for r in result
            if sl in (r.get("patient_name") or "").lower()
            or sl in (r.get("op_number") or "").lower()
            or sl in (r.get("patient_phone") or "").lower()
            or sl in (r.get("treatment_name") or "").lower()
        ]

    # Sort by due_date
    result.sort(key=lambda x: x["due_date"])

    # Pagination
    total = len(result)
    start_idx = (page - 1) * page_size
    paginated = result[start_idx:start_idx + page_size]

    return {
        "items": paginated,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


# --- Calendar Summary (analytics cards) ---
@router.get("/calendar/summary")
async def get_calendar_summary(
    start_date: str = Query(...), end_date: str = Query(...),
    include_terminal: bool = Query(False, alias="include_terminal"),
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)

    terminal_statuses = ["COMPLETED", "CANCELLED", "LOST", "CONVERTED"]

    counts = {
        "total": 0, "pending": 0, "completed": 0, "overdue": 0,
        "due_today": 0, "due_tomorrow": 0, "due_this_week": 0,
        "by_type": {}, "by_status": {},
    }
    today = date.today()
    tomorrow = today + timedelta(days=1)
    week_end = today + timedelta(days=7)

    # --- Follow-ups (date range) ---
    fu_filters = [
        FollowUp.follow_up_date.between(start, end),
    ]
    if hospital_id:
        fu_filters.append(FollowUp.hospital_id == hospital_id)
    if not include_terminal:
        fu_filters.append(FollowUp.status.notin_(terminal_statuses))
    fu_base = select(func.count()).select_from(FollowUp).where(and_(*fu_filters))
    fu_total = (await db.execute(fu_base)).scalar() or 0

    fu_status_q = select(FollowUp.status, func.count()).where(and_(*fu_filters))
    fu_status_q = fu_status_q.group_by(FollowUp.status)
    for st, cnt in (await db.execute(fu_status_q)).all():
        counts["by_status"][st] = counts["by_status"].get(st, 0) + cnt
        if st == "COMPLETED":
            counts["completed"] += cnt
        elif st in ("PENDING", "SCHEDULED", "OPEN"):
            counts["pending"] += cnt

    fu_type_q = select(FollowUp.follow_up_type, func.count()).where(and_(*fu_filters))
    fu_type_q = fu_type_q.group_by(FollowUp.follow_up_type)
    for tp, cnt in (await db.execute(fu_type_q)).all():
        counts["by_type"][tp] = counts["by_type"].get(tp, 0) + cnt

    # --- Enquiries (date range) ---
    enq_filters = [
        Enquiry.next_follow_up_date.between(start, end),
    ]
    if hospital_id:
        enq_filters.append(Enquiry.hospital_id == hospital_id)
    if not include_terminal:
        enq_filters.append(Enquiry.status.notin_(terminal_statuses))
    enq_q = select(func.count()).select_from(Enquiry).where(and_(*enq_filters))
    enq_total = (await db.execute(enq_q)).scalar() or 0

    enq_status_q = select(Enquiry.status, func.count()).where(and_(*enq_filters))
    enq_status_q = enq_status_q.group_by(Enquiry.status)
    for st, cnt in (await db.execute(enq_status_q)).all():
        counts["by_status"][st] = counts["by_status"].get(st, 0) + cnt
        if st in ("CONVERTED",):
            counts["completed"] += cnt

    # --- Generated enquiries (date range) ---
    ge_filters = [
        GeneratedEnquiry.due_date.between(start, end),
    ]
    if hospital_id:
        ge_filters.append(GeneratedEnquiry.hospital_id == hospital_id)
    if not include_terminal:
        ge_filters.append(GeneratedEnquiry.status.notin_(terminal_statuses))
    ge_base = select(func.count()).select_from(GeneratedEnquiry).where(and_(*ge_filters))
    ge_total = (await db.execute(ge_base)).scalar() or 0

    ge_type_q = select(GeneratedEnquiry.enquiry_type, func.count()).where(and_(*ge_filters))
    ge_type_q = ge_type_q.group_by(GeneratedEnquiry.enquiry_type)
    for tp, cnt in (await db.execute(ge_type_q)).all():
        counts["by_type"][tp] = counts["by_type"].get(tp, 0) + cnt

    ge_status_q = select(GeneratedEnquiry.status, func.count()).where(and_(*ge_filters))
    ge_status_q = ge_status_q.group_by(GeneratedEnquiry.status)
    for st, cnt in (await db.execute(ge_status_q)).all():
        counts["by_status"][st] = counts["by_status"].get(st, 0) + cnt
        if st == "COMPLETED":
            counts["completed"] += cnt
        elif st == "PENDING":
            counts["pending"] += cnt

    counts["total"] = fu_total + enq_total + ge_total

    # --- Overdue: PENDING + active statuses with due_date < today ---
    overdue_statuses = ["PENDING", "CONTACTED", "INTERESTED", "NEW", "NO_RESPONSE", "SCHEDULED", "OPEN"]
    ov_fu = select(func.count()).select_from(FollowUp).where(
        FollowUp.follow_up_date < today,
        FollowUp.status.in_(overdue_statuses),
    )
    if hospital_id:
        ov_fu = ov_fu.where(FollowUp.hospital_id == hospital_id)
    counts["overdue"] = (await db.execute(ov_fu)).scalar() or 0

    ov_ge = select(func.count()).select_from(GeneratedEnquiry).where(
        GeneratedEnquiry.due_date < today,
        GeneratedEnquiry.status.in_(overdue_statuses),
    )
    if hospital_id:
        ov_ge = ov_ge.where(GeneratedEnquiry.hospital_id == hospital_id)
    counts["overdue"] += (await db.execute(ov_ge)).scalar() or 0

    # --- Due Today ---
    dt_fu = select(func.count()).select_from(FollowUp).where(
        FollowUp.follow_up_date == today,
        FollowUp.status.in_(overdue_statuses),
    )
    if hospital_id:
        dt_fu = dt_fu.where(FollowUp.hospital_id == hospital_id)
    counts["due_today"] = (await db.execute(dt_fu)).scalar() or 0

    dt_ge = select(func.count()).select_from(GeneratedEnquiry).where(
        GeneratedEnquiry.due_date == today,
        GeneratedEnquiry.status.in_(overdue_statuses),
    )
    if hospital_id:
        dt_ge = dt_ge.where(GeneratedEnquiry.hospital_id == hospital_id)
    counts["due_today"] += (await db.execute(dt_ge)).scalar() or 0

    # --- Due Tomorrow ---
    dtm_fu = select(func.count()).select_from(FollowUp).where(
        FollowUp.follow_up_date == tomorrow,
        FollowUp.status.in_(overdue_statuses),
    )
    if hospital_id:
        dtm_fu = dtm_fu.where(FollowUp.hospital_id == hospital_id)
    counts["due_tomorrow"] = (await db.execute(dtm_fu)).scalar() or 0

    dtm_ge = select(func.count()).select_from(GeneratedEnquiry).where(
        GeneratedEnquiry.due_date == tomorrow,
        GeneratedEnquiry.status.in_(overdue_statuses),
    )
    if hospital_id:
        dtm_ge = dtm_ge.where(GeneratedEnquiry.hospital_id == hospital_id)
    counts["due_tomorrow"] += (await db.execute(dtm_ge)).scalar() or 0

    # --- Due This Week ---
    dw_fu = select(func.count()).select_from(FollowUp).where(
        FollowUp.follow_up_date >= today,
        FollowUp.follow_up_date <= week_end,
        FollowUp.status.in_(overdue_statuses),
    )
    if hospital_id:
        dw_fu = dw_fu.where(FollowUp.hospital_id == hospital_id)
    counts["due_this_week"] = (await db.execute(dw_fu)).scalar() or 0

    dw_ge = select(func.count()).select_from(GeneratedEnquiry).where(
        GeneratedEnquiry.due_date >= today,
        GeneratedEnquiry.due_date <= week_end,
        GeneratedEnquiry.status.in_(overdue_statuses),
    )
    if hospital_id:
        dw_ge = dw_ge.where(GeneratedEnquiry.hospital_id == hospital_id)
    counts["due_this_week"] += (await db.execute(dw_ge)).scalar() or 0

    return counts


# --- Overdue Items (separate from calendar grid) ---
@router.get("/calendar/overdue")
async def calendar_overdue_items(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    include_terminal: bool = Query(False),
    type_filter: Optional[str] = Query(None),
    doctor_id: Optional[str] = Query(None),
    patient_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """Return overdue items (due_date < today, active status) — NOT part of calendar grid."""
    hospital_id = current_user.get("hospital_id")
    today = date.today()
    terminal_statuses = ["COMPLETED", "CANCELLED", "LOST", "CONVERTED"]
    overdue_statuses = ["PENDING", "CONTACTED", "INTERESTED", "APPOINTMENT_REQUIRED",
                        "APPOINTMENT_BOOKED", "NEW", "NO_RESPONSE", "SCHEDULED", "OPEN"]
    exclude_terminal = (not include_terminal) and (not type_filter)
    result = []

    # --- Follow-ups overdue ---
    fu_q = select(FollowUp).where(
        FollowUp.follow_up_date < today,
        FollowUp.status.in_(overdue_statuses),
    )
    if hospital_id:
        fu_q = fu_q.where(FollowUp.hospital_id == hospital_id)
    if type_filter:
        fu_q = fu_q.where(FollowUp.follow_up_type == type_filter)
    elif exclude_terminal:
        fu_q = fu_q.where(FollowUp.status.notin_(terminal_statuses))
    if doctor_id:
        fu_q = fu_q.where(FollowUp.doctor_id == doctor_id)
    if patient_id:
        fu_q = fu_q.where(FollowUp.patient_id == patient_id)
    fu_rows = (await db.execute(fu_q.order_by(FollowUp.follow_up_date))).scalars().all()

    fu_patient_ids = list({fu.patient_id for fu in fu_rows})
    fu_doctor_ids = list({fu.doctor_id for fu in fu_rows if fu.doctor_id})
    fu_tt_ids = list({fu.treatment_type_id for fu in fu_rows if fu.treatment_type_id})
    fu_patients = await _batch_load_names(db, fu_patient_ids, Patient, "full_name")
    fu_patients_phone = {}
    if fu_patient_ids:
        ph_q = select(Patient.id, Patient.phone, Patient.op_no).where(Patient.id.in_(fu_patient_ids))
        for row in (await db.execute(ph_q)).all():
            fu_patients_phone[str(row[0])] = {"phone": row[1], "op_no": row[2]}
    fu_doctors = await _batch_load_names(db, fu_doctor_ids, User, "full_name")
    fu_tt = {}
    if fu_tt_ids:
        tt_q = select(TreatmentType).where(TreatmentType.id.in_(fu_tt_ids))
        for tt in (await db.execute(tt_q)).scalars().all():
            fu_tt[str(tt.id)] = tt.name

    for fu in fu_rows:
        pid = str(fu.patient_id)
        pph = fu_patients_phone.get(pid, {})
        patient_name = fu_patients.get(pid, "Unknown")
        doctor_name = fu_doctors.get(str(fu.doctor_id), None) if fu.doctor_id else None
        result.append({
            "id": str(fu.id),
            "source": "follow_up",
            "type": fu.follow_up_type or "GENERAL",
            "status": fu.status,
            "patient_name": patient_name,
            "patient_id": pid,
            "phone": pph.get("phone"),
            "op_no": pph.get("op_no"),
            "doctor_name": doctor_name,
            "doctor_id": str(fu.doctor_id) if fu.doctor_id else None,
            "treatment_type": fu_tt.get(str(fu.treatment_type_id)) if fu.treatment_type_id else None,
            "treatment_type_id": str(fu.treatment_type_id) if fu.treatment_type_id else None,
            "due_date": fu.follow_up_date.isoformat(),
            "notes": fu.notes,
            "days_overdue": (today - fu.follow_up_date).days,
            "contact_channel": None,
            "last_contact_date": None,
            "patient_phone": pph.get("phone"),
        })

    # --- Enquiries overdue ---
    enq_q = select(Enquiry).where(
        Enquiry.next_follow_up_date < today,
        Enquiry.status.in_(overdue_statuses),
    )
    if hospital_id:
        enq_q = enq_q.where(Enquiry.hospital_id == hospital_id)
    if type_filter:
        enq_q = enq_q.where(Enquiry.treatment_interest == type_filter)
    elif exclude_terminal:
        enq_q = enq_q.where(Enquiry.status.notin_(terminal_statuses))
    if doctor_id:
        enq_q = enq_q.where(Enquiry.assigned_staff_id == doctor_id)
    if patient_id:
        enq_q = enq_q.where(Enquiry.patient_id == patient_id)
    enq_rows = (await db.execute(enq_q.order_by(Enquiry.next_follow_up_date))).scalars().all()

    enq_patient_ids = list({e.patient_id for e in enq_rows})
    enq_doctor_ids = list({e.assigned_staff_id for e in enq_rows if e.assigned_staff_id})
    enq_patients = await _batch_load_names(db, enq_patient_ids, Patient, "full_name")
    enq_patients_phone = {}
    if enq_patient_ids:
        ph_q = select(Patient.id, Patient.phone, Patient.op_no).where(Patient.id.in_(enq_patient_ids))
        for row in (await db.execute(ph_q)).all():
            enq_patients_phone[str(row[0])] = {"phone": row[1], "op_no": row[2]}
    enq_doctors = await _batch_load_names(db, enq_doctor_ids, User, "full_name")

    for e in enq_rows:
        pid = str(e.patient_id)
        pph = enq_patients_phone.get(pid, {})
        result.append({
            "id": str(e.id),
            "source": "enquiry",
            "type": e.treatment_interest or "GENERAL",
            "status": e.status,
            "patient_name": enq_patients.get(pid, "Unknown"),
            "patient_id": pid,
            "phone": pph.get("phone"),
            "op_no": pph.get("op_no"),
            "doctor_name": enq_doctors.get(str(e.assigned_staff_id)) if e.assigned_staff_id else None,
            "doctor_id": str(e.assigned_staff_id) if e.assigned_staff_id else None,
            "treatment_type": None,
            "treatment_type_id": None,
            "due_date": e.next_follow_up_date.isoformat(),
            "notes": e.notes,
            "days_overdue": (today - e.next_follow_up_date).days,
            "contact_channel": None,
            "last_contact_date": None,
            "patient_phone": pph.get("phone"),
        })

    # --- Generated enquiries overdue ---
    ge_q = select(GeneratedEnquiry).where(
        GeneratedEnquiry.due_date < today,
        GeneratedEnquiry.status.in_(overdue_statuses),
    )
    if hospital_id:
        ge_q = ge_q.where(GeneratedEnquiry.hospital_id == hospital_id)
    if type_filter:
        ge_q = ge_q.where(GeneratedEnquiry.enquiry_type == type_filter)
    elif exclude_terminal:
        ge_q = ge_q.where(GeneratedEnquiry.status.notin_(terminal_statuses))
    if doctor_id:
        ge_q = ge_q.where(GeneratedEnquiry.doctor_id == doctor_id)
    if patient_id:
        ge_q = ge_q.where(GeneratedEnquiry.patient_id == patient_id)
    ge_rows = (await db.execute(ge_q.order_by(GeneratedEnquiry.due_date))).scalars().all()

    ge_patient_ids = list({ge.patient_id for ge in ge_rows})
    ge_doctor_ids = list({ge.doctor_id for ge in ge_rows if ge.doctor_id})
    ge_tt_ids = list({ge.treatment_type_id for ge in ge_rows if ge.treatment_type_id})
    ge_patients = await _batch_load_names(db, ge_patient_ids, Patient, "full_name")
    ge_patients_phone = {}
    if ge_patient_ids:
        ph_q = select(Patient.id, Patient.phone, Patient.op_no).where(Patient.id.in_(ge_patient_ids))
        for row in (await db.execute(ph_q)).all():
            ge_patients_phone[str(row[0])] = {"phone": row[1], "op_no": row[2]}
    ge_doctors = await _batch_load_names(db, ge_doctor_ids, User, "full_name")
    ge_tt = {}
    if ge_tt_ids:
        tt_q = select(TreatmentType).where(TreatmentType.id.in_(ge_tt_ids))
        for tt in (await db.execute(tt_q)).scalars().all():
            ge_tt[str(tt.id)] = tt.name

    for ge in ge_rows:
        pid = str(ge.patient_id)
        pph = ge_patients_phone.get(pid, {})
        result.append({
            "id": str(ge.id),
            "source": "generated",
            "type": ge.enquiry_type or "GENERAL",
            "status": ge.status,
            "patient_name": ge_patients.get(pid, "Unknown"),
            "patient_id": pid,
            "phone": pph.get("phone"),
            "op_no": pph.get("op_no"),
            "doctor_name": ge_doctors.get(str(ge.doctor_id)) if ge.doctor_id else None,
            "doctor_id": str(ge.doctor_id) if ge.doctor_id else None,
            "treatment_type": ge_tt.get(str(ge.treatment_type_id)) if ge.treatment_type_id else None,
            "treatment_type_id": str(ge.treatment_type_id) if ge.treatment_type_id else None,
            "due_date": ge.due_date.isoformat(),
            "notes": ge.notes,
            "days_overdue": (today - ge.due_date).days,
            "priority": ge.priority,
            "contact_channel": None,
            "last_contact_date": None,
            "patient_phone": pph.get("phone"),
        })

    # Sort by days_overdue desc (most overdue first), paginate
    result.sort(key=lambda x: x["days_overdue"], reverse=True)
    total = len(result)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size

    return {
        "items": result[start_idx:end_idx],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


# --- Reschedule (for drag-and-drop) ---
class RescheduleRequest(BaseModel):
    new_date: str = Field(..., description="New due date (YYYY-MM-DD)")

@router.patch("/{enquiry_id}/reschedule")
async def reschedule_enquiry(
    enquiry_id: str, data: RescheduleRequest,
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    new_date = date.fromisoformat(data.new_date)

    # Try follow_up first
    fu = await db.get(FollowUp, enquiry_id)
    if fu:
        _verify_hospital_access(fu, current_user)
        fu.follow_up_date = new_date
        await db.commit()
        return {"success": True, "source": "follow_up", "new_date": new_date.isoformat()}

    # Try generated_enquiry
    ge = await db.get(GeneratedEnquiry, enquiry_id)
    if ge:
        _verify_hospital_access(ge, current_user)
        ge.due_date = new_date
        ge.updated_at = datetime.now(timezone.utc)
        await db.commit()
        return {"success": True, "source": "generated_enquiry", "new_date": new_date.isoformat()}

    # Try enquiry
    enq = await db.get(Enquiry, enquiry_id)
    if enq:
        _verify_hospital_access(enq, current_user)
        enq.next_follow_up_date = new_date
        enq.updated_at = datetime.now(timezone.utc)
        await db.commit()
        return {"success": True, "source": "enquiry", "new_date": new_date.isoformat()}

    raise HTTPException(status_code=404, detail="Enquiry not found")


# --- Quick status update ---
class StatusUpdateRequest(BaseModel):
    status: str

@router.patch("/{enquiry_id}/status")
async def update_enquiry_status(
    enquiry_id: str, data: StatusUpdateRequest,
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)

    # Try follow_up
    fu = await db.get(FollowUp, enquiry_id)
    if fu:
        _verify_hospital_access(fu, current_user)
        fu.status = data.status
        if data.status == "COMPLETED":
            fu.completed_date = datetime.now(timezone.utc)
            fu.completed_by = current_user.get("sub")
        await db.commit()
        return {"success": True, "source": "follow_up"}

    # Try generated_enquiry
    ge = await db.get(GeneratedEnquiry, enquiry_id)
    if ge:
        _verify_hospital_access(ge, current_user)
        ge.status = data.status
        if data.status == "COMPLETED":
            ge.updated_at = datetime.now(timezone.utc)
        elif data.status == "CANCELLED":
            ge.cancelled_by_event = "MANUAL"
            ge.cancelled_at = datetime.now(timezone.utc)
        await db.commit()
        return {"success": True, "source": "generated_enquiry"}

    # Try enquiry
    enq = await db.get(Enquiry, enquiry_id)
    if enq:
        _verify_hospital_access(enq, current_user)
        old_status = enq.status
        enq.status = data.status
        enq.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await record_timeline_event(
            db, current_user=current_user, patient_id=enq.patient_id,
            action="CRM Enquiry Status Updated",
            description=f"Status changed from {old_status} to {data.status}",
            module="CRM",
            changes=[{"field": "status", "old_value": old_status, "new_value": data.status}],
        )
        return {"success": True, "source": "enquiry"}

    raise HTTPException(status_code=404, detail="Enquiry not found")


# --- Assign staff ---
class AssignRequest(BaseModel):
    assigned_staff_id: str

@router.patch("/{enquiry_id}/assign")
async def assign_enquiry(
    enquiry_id: str, data: AssignRequest,
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)

    staff = await db.get(User, data.assigned_staff_id)
    if not staff:
        raise HTTPException(status_code=404, detail="Staff user not found")

    # Try follow_up
    fu = await db.get(FollowUp, enquiry_id)
    if fu:
        _verify_hospital_access(fu, current_user)
        fu.doctor_id = data.assigned_staff_id
        await db.commit()
        return {"success": True, "source": "follow_up"}

    # Try generated_enquiry
    ge = await db.get(GeneratedEnquiry, enquiry_id)
    if ge:
        _verify_hospital_access(ge, current_user)
        ge.assigned_staff_id = data.assigned_staff_id
        await db.commit()
        return {"success": True, "source": "generated_enquiry"}

    # Try enquiry
    enq = await db.get(Enquiry, enquiry_id)
    if enq:
        _verify_hospital_access(enq, current_user)
        enq.assigned_staff_id = data.assigned_staff_id
        enq.updated_at = datetime.now(timezone.utc)
        await db.commit()
        return {"success": True, "source": "enquiry"}

    raise HTTPException(status_code=404, detail="Enquiry not found")


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
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        if data.action == "CONVERT_TO_TREATMENT":
            await publish_event(
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



