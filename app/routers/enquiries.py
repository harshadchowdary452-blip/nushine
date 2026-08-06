from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sa_delete, func, desc, case as sa_case, and_, or_
from typing import Optional, Any
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
from app.models.hospital import Hospital
from app.models.case import Case
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.treatment_sitting import TreatmentSitting
from app.models.appointment import Appointment
from app.models.lead import Lead
from app.models.patient_timeline import PatientTimeline
from app.services.timeline_helper import record_timeline_event
from app.services.timeline_service import TimelineService
from app.crm.services.entity_resolver import (
    resolve_display_info,
    resolve_lead_detail,
    resolve_patient_detail,
    PLACEHOLDER,
)

router = APIRouter(prefix="/crm/enquiries", tags=["CRM Enquiries"])

LEAD_FOLLOW_UP_TEMPLATE = """Hello {{lead_name}},

Thank you for contacting {{hospital_name}}.

We appreciate your interest in our dental services. Our team has received your enquiry regarding **{{treatment_name}}**.

One of our patient care executives will contact you shortly to understand your requirements and assist you in planning your visit.

If you have any immediate questions, feel free to reply to this message or call us at {{hospital_phone}}.

We look forward to welcoming you to {{hospital_name}} and providing you with the highest standard of dental care.

Warm Regards,

{{hospital_name}}
Patient Care Team"""

APPOINTMENT_REMINDER_TEMPLATE = """Hello {{patient_name}},

This is a friendly reminder from {{hospital_name}} regarding your upcoming appointment.

━━━━━━━━━━━━━━━━━━
Appointment Summary
━━━━━━━━━━━━━━━━━━

Doctor: Dr. {{doctor_name}}
Date: {{appointment_date}}
Time: {{appointment_time}}
OP Number: {{op_number}}
━━━━━━━━━━━━━━━━━━

Please arrive 10 minutes before your scheduled time. Kindly carry any relevant medical records or reports with you.

If you need to reschedule or cancel, please inform us at least 24 hours in advance so we can accommodate other patients.

For any assistance, contact us at {{hospital_phone}}.

Warm Regards,

{{hospital_name}}
Patient Care Team"""

OPD_FOLLOW_UP_TEMPLATE = """Hello {{patient_name}},

We hope your consultation at {{hospital_name}} with Dr. {{doctor_name}} was a helpful step toward better dental health.

Based on your consultation, Dr. {{doctor_name}} has recommended a personalised treatment plan designed to address your specific needs.

If you have any questions about the recommended treatment or would like to schedule your next appointment, please don't hesitate to reach out. Our team is here to guide you through every step.

You can contact us at {{hospital_phone}}.

Warm Regards,

{{hospital_name}}
Patient Care Team"""

TREATMENT_WELLNESS_TEMPLATE = """Hello {{patient_name}},

We hope you are recovering well after your recent {{treatment_name}} at {{hospital_name}}.

At {{hospital_name}}, your well-being is our highest priority. We would like to check in and see how you are feeling.

• Are you recovering as expected?
• Are you experiencing any discomfort or unusual symptoms?
• Would you like to schedule a follow-up visit with Dr. {{doctor_name}}?

Your feedback helps us ensure you receive the best possible care. Please take a moment to reply to this message or call us at {{hospital_phone}}.

Warm Regards,

{{hospital_name}}
Patient Care Team"""

CASE_WELLNESS_TEMPLATE = """Hello {{patient_name}},

We hope you are recovering well after completing your dental treatment at {{hospital_name}}.

━━━━━━━━━━━━━━━━━━
Treatment Summary
━━━━━━━━━━━━━━━━━━

{{completed_treatments}}
━━━━━━━━━━━━━━━━━━

If you have any concerns about your recovery or need further guidance, please contact us. Dr. {{doctor_name}} and our entire team are always available to assist you.

Regular follow-ups help ensure the long-term success of your treatment.

Warm Regards,

{{hospital_name}}
Patient Care Team"""

RECALL_TEMPLATE = """Hello {{patient_name}},

This is your scheduled dental recall reminder from {{hospital_name}}.

━━━━━━━━━━━━━━━━━━
Previous Treatment
━━━━━━━━━━━━━━━━━━

{{completed_treatments}}
━━━━━━━━━━━━━━━━━━

Your next preventive dental check-up is due on:

📅 {{next_recall_date}}

Regular dental reviews are essential for maintaining optimal oral health and detecting any potential issues early. A routine examination takes just 30 minutes and can prevent more complex problems in the future.

Please contact us at {{hospital_phone}} to schedule your appointment at a convenient time.

Warm Regards,

{{hospital_name}}
Patient Care Team"""

MISSED_APPOINTMENT_TEMPLATE = """Hello {{patient_name}},

We missed you at {{hospital_name}} for your scheduled appointment on {{appointment_date}}.

Your health and treatment progress are important to us. Please call us at {{hospital_phone}} so we can help you reschedule at a time that is convenient for you.

Warm Regards,

{{hospital_name}}
Patient Care Team"""

DEFAULT_TEMPLATES_BY_TYPE = {
    "LEAD_FOLLOW_UP": LEAD_FOLLOW_UP_TEMPLATE,
    "APPOINTMENT_REMINDER": APPOINTMENT_REMINDER_TEMPLATE,
    "OPD_FOLLOW_UP": OPD_FOLLOW_UP_TEMPLATE,
    "TREATMENT_WELLNESS": TREATMENT_WELLNESS_TEMPLATE,
    "CASE_WELLNESS": CASE_WELLNESS_TEMPLATE,
    "RECALL": RECALL_TEMPLATE,
    "MISSED_APPOINTMENT": MISSED_APPOINTMENT_TEMPLATE,
}


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
        logger.warning("Failed to publish ENQUIRY_CREATED event", exc_info=True)
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
            "patient_name": patient.full_name if patient else PLACEHOLDER,
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


async def _batch_load_entities(db: AsyncSession, model, ids: list[str]) -> dict[str, Any]:
    """Batch load full model instances by ID list, return dict keyed by str(id)."""
    if not ids:
        return {}
    q = select(model).where(model.id.in_(ids))
    rows = (await db.execute(q)).scalars().all()
    return {str(r.id): r for r in rows}


def _generate_description(enquiry_type: str, patient_name: str | None, lead_name: str | None,
                          treatment_name: str | None, case_obj: Any, lead_obj: Any,
                          appointment_obj: Any, tp_obj: Any, recurrence_info: dict | None) -> str:
    """Generate a meaningful description for every enquiry type — never empty/blank."""
    if enquiry_type == "LEAD_FOLLOW_UP":
        source = (lead_obj.source.replace("_", " ").title() + " Lead") if lead_obj and lead_obj.source else "Lead"
        interest = lead_obj.interested_treatment if lead_obj and lead_obj.interested_treatment else ""
        if interest:
            return f"{source} - Interested in {interest}"
        return f"{source} - Follow-up required"
    if enquiry_type == "OPD_FOLLOW_UP":
        return "Consultation completed. Treatment not yet started."
    if enquiry_type == "APPOINTMENT_REMINDER":
        if appointment_obj:
            doc_name = getattr(appointment_obj.doctor, "full_name", "") if appointment_obj.doctor else ""
            purpose = appointment_obj.notes.strip().title() if appointment_obj.notes else "Appointment"
            return f"{purpose} with Dr. {doc_name}" if doc_name else f"{purpose} scheduled"
        return "Appointment reminder"
    if enquiry_type == "TREATMENT_WELLNESS":
        name = treatment_name or "Treatment"
        if tp_obj:
            return f"{name} - Visit {tp_obj.completed_sittings + 1} of {tp_obj.total_sittings}" if tp_obj.total_sittings else f"{name} - Completed"
        return f"{name} - Wellness follow-up"
    if enquiry_type == "CASE_WELLNESS":
        return "Case completed. Recovery follow-up."
    if enquiry_type == "RECALL":
        if recurrence_info and recurrence_info.get("interval_days"):
            interval = recurrence_info["interval_days"]
            label = f"{interval}-Day" if interval != 180 else "6-Month"
            label = f"{interval}-Day" if interval != 365 else "12-Month"
            occ = recurrence_info.get("occurrence_number", 1)
            return f"{label} Recall{' #' + str(occ) if occ > 1 else ''} for completed Case."
        return "Scheduled recall follow-up"
    if enquiry_type == "MISSED_APPOINTMENT":
        if appointment_obj:
            return f"Missed appointment on {appointment_obj.appointment_date.isoformat() if appointment_obj.appointment_date else ''}"
        return "Missed appointment — follow-up required"
    if treatment_name:
        return f"{enquiry_type.replace('_', ' ').title()} — {treatment_name}"
    return f"{enquiry_type.replace('_', ' ').title()} follow-up required"


def _resolve_latest_doctor(case_obj: Any, tp_plans: list, appointments: list, fallback_doctor_id: str | None,
                           entity_dict: dict[str, Any],
                           linked_appointment_id: str | None = None) -> dict:
    """Resolve the latest consulting doctor from clinical activity.
    Priority: 1) Latest Treatment Visit Doctor 2) Latest Clinical Consultation 3) Latest Appointment Doctor
    Never returns case creator, hospital creator, or patient creator unless no clinical doctor exists."""
    doctor = {"id": None, "name": None, "specialization": None, "photo_url": None}
    # Priority 1: Latest Treatment Sitting Doctor
    if tp_plans:
        tp_ids = [tp.id for tp in tp_plans]
        from app.models.treatment_sitting import TreatmentSitting, TreatmentSittingStatus
        import logging
        logger = logging.getLogger("enquiries")
        try:
            sitting_q = select(TreatmentSitting).where(
                TreatmentSitting.treatment_plan_id.in_(tp_ids),
                TreatmentSitting.status.in_([TreatmentSittingStatus.COMPLETED.value, TreatmentSittingStatus.IN_PROGRESS.value]),
            ).order_by(desc(TreatmentSitting.sitting_date)).limit(1)
            # This will be executed per-call via the db session; for batch we handle separately
        except Exception:
            pass
    # Priority 2: Latest Treatment Plan assigned doctor
    if not doctor["id"] and tp_plans:
        for tp in sorted(tp_plans, key=lambda x: x.created_at or datetime.min, reverse=True):
            if tp.assigned_doctor_id and tp.assigned_doctor_id in entity_dict.get("users", {}):
                doc = entity_dict["users"][tp.assigned_doctor_id]
                doctor = {"id": str(doc.id), "name": doc.full_name,
                          "specialization": getattr(doc, "specialization", None), "photo_url": None}
                break
    # Priority 3: Case doctor (clinical consultation)
    if not doctor["id"] and case_obj and case_obj.doctor_id:
        if case_obj.doctor_id in entity_dict.get("users", {}):
            doc = entity_dict["users"][case_obj.doctor_id]
            doctor = {"id": str(doc.id), "name": doc.full_name,
                      "specialization": getattr(doc, "specialization", None), "photo_url": None}
    # Priority 4: Linked appointment doctor (for appointment reminders)
    if not doctor["id"] and linked_appointment_id:
        from app.models.appointment import Appointment
        # Note: entity_dict may not have the linked appointment pre-loaded, so check by ID
        linked_appt = None
        for appt in (appointments or []):
            if str(appt.id) == linked_appointment_id:
                linked_appt = appt
                break
        if linked_appt and linked_appt.doctor_id and linked_appt.doctor_id in entity_dict.get("users", {}):
            doc = entity_dict["users"][linked_appt.doctor_id]
            doctor = {"id": str(doc.id), "name": doc.full_name,
                      "specialization": getattr(doc, "specialization", None), "photo_url": None}

    # Priority 5: Latest appointment doctor (any appointment)
    if not doctor["id"] and appointments:
        for appt in sorted(appointments, key=lambda x: x.appointment_date or date.min, reverse=True):
            if appt.doctor_id and appt.doctor_id in entity_dict.get("users", {}):
                doc = entity_dict["users"][appt.doctor_id]
                doctor = {"id": str(doc.id), "name": doc.full_name,
                          "specialization": getattr(doc, "specialization", None), "photo_url": None}
                break
    # Priority 6: Fallback (doctor_id from enquiry)
    if not doctor["id"] and fallback_doctor_id:
        if fallback_doctor_id in entity_dict.get("users", {}):
            doc = entity_dict["users"][fallback_doctor_id]
            doctor = {"id": str(doc.id), "name": doc.full_name,
                      "specialization": getattr(doc, "specialization", None), "photo_url": None}
    return doctor


def _build_template_variables(enquiry_type: str, patient_obj: Any, lead_obj: Any, doctor_obj: dict,
                               hospital_obj: Any, case_obj: Any, tp_obj: Any,
                               appointment_obj: Any, treatment_name: str | None,
                               occ_number: int | None, total_visits: int | None,
                               completed_treatments: list | None = None,
                               due_date: Any = None) -> dict:
    """Type-scoped template variables — never empty/null/fallback.
    LEAD_FOLLOW_UP returns only lead/hospital variables.
    Patient types return all clinical variables."""
    v = {}
    is_lead = enquiry_type == "LEAD_FOLLOW_UP"

    # Hospital — always available
    v["hospital_name"] = hospital_obj.name if hospital_obj else ""
    v["hospital_phone"] = hospital_obj.phone if hospital_obj else ""
    v["hospital_address"] = hospital_obj.address if hospital_obj else ""
    v["clinic_name"] = hospital_obj.name if hospital_obj else ""
    v["current_date"] = date.today().isoformat()
    v["current_time"] = datetime.now().strftime("%H:%M")

    # Lead variables
    v["lead_name"] = lead_obj.lead_name if lead_obj else ""
    v["lead_source"] = (lead_obj.source.replace("_", " ").title()) if lead_obj and lead_obj.source else ""
    v["lead_status"] = lead_obj.status if lead_obj else ""
    v["lead_phone"] = lead_obj.mobile if lead_obj else ""

    if is_lead:
        v["interested_treatment"] = lead_obj.interested_treatment if lead_obj else ""
        v["treatment_name"] = lead_obj.interested_treatment if lead_obj else (treatment_name or "")
        v["assigned_staff"] = ""
        v["assigned_staff_name"] = ""
        return v  # LEAD type — no patient/clinical variables

    # ─── Patient-type variables below ────────────────────────────────────

    v["patient_name"] = patient_obj.full_name if patient_obj else (lead_obj.lead_name if lead_obj else "")
    v["patient_phone"] = patient_obj.phone if patient_obj else (lead_obj.mobile if lead_obj else "")
    v["patient_age"] = str(patient_obj.age) if patient_obj and patient_obj.age else ""
    v["patient_gender"] = patient_obj.gender if patient_obj else ""
    v["op_number"] = patient_obj.op_no if patient_obj else ""
    v["doctor_name"] = doctor_obj.get("name") or ""
    v["doctor_specialization"] = doctor_obj.get("specialization") or ""
    if not v["doctor_name"] and appointment_obj:
        v["doctor_name"] = "Our Doctor"
    v["staff_name"] = ""
    v["staff_phone"] = ""
    v["staff_email"] = ""
    if appointment_obj:
        v["appointment_date"] = appointment_obj.appointment_date.isoformat() if appointment_obj.appointment_date else ""
        v["appointment_time"] = str(appointment_obj.appointment_time) if appointment_obj.appointment_time else ""
    else:
        v["appointment_date"] = ""
        v["appointment_time"] = ""
    v["treatment_name"] = treatment_name or ""
    v["treatment_type"] = ""
    v["treatment_status"] = ""
    v["treatment_completion_date"] = ""
    if tp_obj:
        tt = tp_obj.treatment_type
        v["treatment_type"] = tt.name if tt else ""
        ts = tp_obj.status
        v["treatment_status"] = (ts.value if hasattr(ts, "value") else ts).replace("_", " ").title() if ts else ""
        v["treatment_completion_date"] = tp_obj.completed_at.strftime("%d %B %Y") if tp_obj.completed_at else ""
    v["case_name"] = case_obj.case_number if case_obj and case_obj.case_number else ""
    v["case_completion_date"] = case_obj.completion_date.strftime("%d %B %Y") if case_obj and case_obj.completion_date else ""
    v["visit_number"] = str(occ_number) if occ_number else (str(tp_obj.completed_sittings + 1) if tp_obj else "")
    v["remaining_visits"] = str(tp_obj.remaining_sittings) if tp_obj and tp_obj.remaining_sittings else ""
    v["total_visits"] = str(tp_obj.total_sittings) if tp_obj and tp_obj.total_sittings else ""
    if completed_treatments:
        v["completed_treatments"] = "\n".join(f"• {t.get('treatment_name', '')}" for t in completed_treatments if t.get("treatment_name"))
    else:
        v["completed_treatments"] = ""
    v["recall_interval"] = ""
    if enquiry_type == "RECALL" and due_date:
        v["next_recall_date"] = due_date.isoformat()
        v["recall_date"] = due_date.isoformat()
    else:
        v["next_recall_date"] = ""
        v["recall_date"] = ""
    v["followup_date"] = ""
    v["wellness_type"] = ""
    return v


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

    VALID_ENQUIRY_TYPES = [
        "LEAD_FOLLOW_UP", "OPD_FOLLOW_UP", "APPOINTMENT_REMINDER",
        "TREATMENT_WELLNESS", "CASE_WELLNESS", "RECALL", "MISSED_APPOINTMENT",
    ]
    ge_q = select(GeneratedEnquiry).where(
        GeneratedEnquiry.due_date >= start,
        GeneratedEnquiry.due_date <= end,
        GeneratedEnquiry.enquiry_type.in_(VALID_ENQUIRY_TYPES),
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

    # --- Extract all entity IDs for batch loading ---
    patient_ids = list({ge.patient_id for ge in ge_rows if ge.patient_id})
    lead_ids = list({ge.lead_id for ge in ge_rows if ge.lead_id})
    doctor_ids = list({ge.doctor_id for ge in ge_rows if ge.doctor_id})
    staff_ids = list({ge.assigned_staff_id for ge in ge_rows if ge.assigned_staff_id})
    case_ids = list({ge.case_id for ge in ge_rows if ge.case_id})
    tp_ids = list({ge.treatment_plan_id for ge in ge_rows if ge.treatment_plan_id})
    tp_item_ids = list({ge.treatment_plan_item_id for ge in ge_rows if ge.treatment_plan_item_id})
    appt_ids = list({ge.appointment_id for ge in ge_rows if ge.appointment_id})
    tt_ids = list({ge.treatment_type_id for ge in ge_rows if ge.treatment_type_id})
    hosp_ids = list({ge.hospital_id for ge in ge_rows if ge.hospital_id})
    all_user_ids = list(set(doctor_ids + staff_ids + [g.doctor_id for g in ge_rows if g.doctor_id]))

    # --- Batch load all entities ---
    patients = await _batch_load_entities(db, Patient, patient_ids)
    leads = await _batch_load_entities(db, Lead, lead_ids)
    users = await _batch_load_entities(db, User, all_user_ids)
    cases = await _batch_load_entities(db, Case, case_ids)
    tp_entities = await _batch_load_entities(db, TreatmentPlan, tp_ids) if tp_ids else {}
    appointments = await _batch_load_entities(db, Appointment, appt_ids) if appt_ids else {}
    hospitals = await _batch_load_entities(db, Hospital, hosp_ids)
    tt_entities = await _batch_load_entities(db, TreatmentType, tt_ids) if tt_ids else {}

    # --- Load treatment plans for each case (for latest doctor resolution) ---
    case_ids_for_tp = [c.id for c in cases.values()] if cases else []
    case_tp_map: dict[str, list] = {}
    tp_id_to_case: dict[str, str] = {}
    if case_ids_for_tp:
        tp_q = select(TreatmentPlan).where(TreatmentPlan.case_id.in_(case_ids_for_tp))
        tp_all = (await db.execute(tp_q)).scalars().all()
        for tp in tp_all:
            cid = str(tp.case_id)
            if cid not in case_tp_map:
                case_tp_map[cid] = []
            case_tp_map[cid].append(tp)
            tp_id_to_case[str(tp.id)] = cid

    # --- Batch load completed treatments for cases (for CASE_WELLNESS and RECALL) ---
    completed_tp_by_case: dict[str, list[dict]] = {}
    if case_ids_for_tp:
        all_tps_for_cases = (await db.execute(
            select(TreatmentPlan).where(
                TreatmentPlan.case_id.in_(case_ids_for_tp),
                TreatmentPlan.status == TreatmentPlanStatus.COMPLETED.value,
            )
        )).scalars().all()
        for tp in all_tps_for_cases:
            cid = str(tp.case_id)
            if cid not in completed_tp_by_case:
                completed_tp_by_case[cid] = []
            completed_tp_by_case[cid].append({
                "id": str(tp.id),
                "treatment_name": tp.treatment_name,
                "completed_at": tp.completed_at.isoformat() if tp.completed_at else None,
            })

    # --- Load appointments for each patient (for latest doctor resolution) ---
    appts_for_patient: dict[str, list] = {}
    if patient_ids:
        appt_q = select(Appointment).where(Appointment.patient_id.in_(patient_ids),
                                            Appointment.is_active == True)
        all_patient_appts = (await db.execute(appt_q)).scalars().all()
        for a in all_patient_appts:
            pid = str(a.patient_id)
            if pid not in appts_for_patient:
                appts_for_patient[pid] = []
            appts_for_patient[pid].append(a)

    # --- Load latest treatment sitting for each treatment plan (for doctor resolution) ---
    sitting_doctor_map: dict[str, str] = {}
    if tp_ids:
        all_tp_ids = list(tp_id_to_case.keys()) or tp_ids
        sitting_q = select(TreatmentSitting).where(
            TreatmentSitting.treatment_plan_id.in_(all_tp_ids),
            TreatmentSitting.status.in_(["COMPLETED", "IN_PROGRESS"]),
            TreatmentSitting.doctor_id.isnot(None),
        ).order_by(desc(TreatmentSitting.sitting_date))
        all_sittings = (await db.execute(sitting_q)).scalars().all()
        for s in all_sittings:
            stpid = str(s.treatment_plan_id)
            if stpid not in sitting_doctor_map:
                sitting_doctor_map[stpid] = str(s.doctor_id)

    entity_dict = {"users": users, "patients": patients, "leads": leads,
                   "cases": cases, "tp": tp_entities, "appointments": appointments,
                   "hospitals": hospitals, "tt": tt_entities, "sitting_doctor_map": sitting_doctor_map}

    result = []
    for ge in ge_rows:
        pid = str(ge.patient_id) if ge.patient_id else None
        lid = str(ge.lead_id) if ge.lead_id else None
        cid = str(ge.case_id) if ge.case_id else None
        tpid = str(ge.treatment_plan_id) if ge.treatment_plan_id else None
        apptid = str(ge.appointment_id) if ge.appointment_id else None
        ttid = str(ge.treatment_type_id) if ge.treatment_type_id else None
        hid = str(ge.hospital_id) if ge.hospital_id else None

        patient_obj = patients.get(pid) if pid else None
        lead_obj = leads.get(lid) if lid else None
        case_obj = cases.get(cid) if cid else None
        tp_obj = tp_entities.get(tpid) if tpid else None
        appt_obj = appointments.get(apptid) if apptid else None
        tt_obj = tt_entities.get(ttid) if ttid else None
        hospital_obj = hospitals.get(hid) if hid else None

        # --- Lead type check (must be before any is_lead usage due to Python scoping) ---
        is_lead = ge.enquiry_type == "LEAD_FOLLOW_UP"

        # --- Display info (single source of truth — type-aware) ---
        display_info = resolve_display_info(ge.enquiry_type, patient_obj, lead_obj)

        # --- Patient info (null for LEAD enquiries) ---
        patient_info = resolve_patient_detail(patient_obj, is_lead=is_lead)

        # --- Lead info ---
        lead_info = resolve_lead_detail(lead_obj)

        # --- Appointment info (null for LEAD enquiries) ---
        appointment_info = None
        if appt_obj and not is_lead:
            appt_doctor_name = None
            if appt_obj.doctor_id and appt_obj.doctor_id in users:
                appt_doctor_name = users[appt_obj.doctor_id].full_name
            appointment_info = {
                "id": str(appt_obj.id),
                "date": appt_obj.appointment_date.isoformat() if appt_obj.appointment_date else None,
                "time": str(appt_obj.appointment_time) if appt_obj.appointment_time else None,
                "doctor_name": appt_doctor_name,
                "purpose": getattr(appt_obj, "notes", None),
                "status": appt_obj.status.value if hasattr(appt_obj.status, "value") else appt_obj.status,
            }

        # --- Treatment info (null for LEAD enquiries) ---
        treatment_info = None
        treatment_display_name = None
        treatment_info = None
        if tp_obj and not is_lead:
            treatment_display_name = tp_obj.treatment_name
        if not treatment_display_name and ge.treatment_name and not is_lead:
            treatment_display_name = ge.treatment_name
        if not treatment_display_name and tt_obj and not is_lead:
            treatment_display_name = tt_obj.name
        if tp_obj and not is_lead:
            treatment_type_name = tt_obj.name if tt_obj else None
            treatment_info = {
                "id": str(tp_obj.id),
                "treatment_name": tp_obj.treatment_name,
                "treatment_type": treatment_type_name,
                "status": tp_obj.status.value if hasattr(tp_obj.status, "value") else tp_obj.status,
                "start_date": tp_obj.start_date.isoformat() if tp_obj.start_date else None,
                "completion_date": tp_obj.completed_at.isoformat() if tp_obj.completed_at else None,
                "total_visits": tp_obj.total_sittings,
                "completed_visits": tp_obj.completed_sittings,
                "remaining_visits": tp_obj.remaining_sittings,
                "current_visit": ge.visit_number,
            }

        # --- Case info (null for LEAD enquiries) ---
        case_info = None
        if case_obj and not is_lead:
            case_info = {
                "id": str(case_obj.id),
                "case_number": case_obj.case_number,
                "chief_complaint": case_obj.chief_complaint,
                "status": case_obj.status.value if hasattr(case_obj.status, "value") else case_obj.status,
                "diagnosis": case_obj.final_diagnosis or case_obj.diagnosis,
            }

        # --- Hospital info ---
        hospital_info = None
        if hospital_obj:
            hospital_info = {
                "id": str(hospital_obj.id),
                "name": hospital_obj.name,
                "phone": hospital_obj.phone,
                "address": hospital_obj.address,
                "logo_url": hospital_obj.logo_url,
            }

        # --- Doctor resolution (skip for LEAD enquiries) ---
        doctor_info = {"id": None, "name": None, "specialization": None, "photo_url": None}
        if not is_lead:
            case_tps = case_tp_map.get(cid, []) if cid else []
            patient_appts = appts_for_patient.get(pid, []) if pid else []
            sitting_doctor_id = None
            if tpid and tpid in sitting_doctor_map:
                sitting_doctor_id = sitting_doctor_map[tpid]
            elif cid:
                for tp in case_tps:
                    stpid = str(tp.id)
                    if stpid in sitting_doctor_map:
                        sitting_doctor_id = sitting_doctor_map[stpid]
                        break
            doctor_info = _resolve_latest_doctor(
                case_obj, case_tps, patient_appts,
                sitting_doctor_id or ge.doctor_id or ge.assigned_staff_id, entity_dict,
                linked_appointment_id=str(ge.appointment_id) if ge.appointment_id else None,
            )

        # --- Recurrence info ---
        recurrence_info = None
        if ge.enquiry_type == "RECALL" and ge.is_recurring:
            recurrence_info = {
                "is_recurring": True,
                "occurrence_number": ge.occurrence_number,
                "interval_days": ge.recurrence_interval_days,
                "chain_id": ge.chain_id,
            }

        # --- Completed Treatments (for CASE_WELLNESS and RECALL only) ---
        completed_treatments = []
        if not is_lead and cid:
            completed_treatments = completed_tp_by_case.get(cid, [])

        # --- Description ---
        description = _generate_description(
            ge.enquiry_type, patient_obj.full_name if patient_obj else None,
            lead_obj.lead_name if lead_obj else None,
            treatment_display_name, case_obj, lead_obj, appt_obj, tp_obj, recurrence_info
        )

        # --- Template variables ---
        template_vars = _build_template_variables(
            ge.enquiry_type, patient_obj, lead_obj, doctor_info, hospital_obj,
            case_obj, tp_obj, appt_obj, treatment_display_name,
            ge.occurrence_number, tp_obj.total_sittings if tp_obj else None,
            completed_treatments=completed_treatments,
            due_date=ge.due_date,
        )

        # --- Assigned staff ---
        assigned_staff_info = None
        if ge.assigned_staff_id and ge.assigned_staff_id in users:
            s = users[ge.assigned_staff_id]
            assigned_staff_info = {"id": str(s.id), "name": s.full_name}

        # Backward-compat fields — uses single source of truth
        backward_op_number = (patient_info or {}).get("op_number") if not is_lead else None
        backward_doctor_name = doctor_info.get("name")
        backward_treatment_type = (treatment_info or {}).get("treatment_type") or (tt_obj.name if tt_obj else None)

        item = {
            "id": str(ge.id),
            "source": "generated_enquiry",
            "enquiry_type": ge.enquiry_type or "ENQUIRY",
            "enquiry_number": ge.enquiry_number,
            "status": ge.status,
            "priority": ge.priority or "MEDIUM",
            "due_date": ge.due_date.isoformat(),
            "created_at": ge.created_at.isoformat() if ge.created_at else None,
            "description": description,
            "patient": patient_info,
            "lead": lead_info,
            "doctor": doctor_info,
            "hospital": hospital_info,
            "case": case_info,
            "treatment": treatment_info,
            "appointment": appointment_info,
            "recurrence": recurrence_info,
            "assigned_staff": assigned_staff_info,
            "treatment_name": treatment_display_name,
            "completed_treatments": completed_treatments,
            "template_variables": template_vars,
            "display_name": display_info["display_name"],
            "display_phone": display_info["display_phone"],
            "display_email": display_info["display_email"],
            "patient_name": display_info["display_name"],
            "patient_id": pid if not is_lead else None,
            "patient_phone": display_info["display_phone"],
            "op_number": backward_op_number,
            "doctor_name": backward_doctor_name,
            "doctor_id": doctor_info.get("id"),
            "treatment_type": backward_treatment_type,
        }
        result.append(item)

    # --- Search (type-aware: don't search patient fields for LEAD) ---
    if search:
        sl = search.lower()
        result = [
            r for r in result
            if sl in (r.get("description") or "").lower()
            or sl in ((r.get("lead") or {}).get("name") or "").lower()
            or sl in ((r.get("lead") or {}).get("mobile") or "").lower()
            or sl in ((r.get("hospital") or {}).get("name") or "").lower()
            or (r.get("patient_name") and sl in (r.get("patient_name") or "").lower())
            or (r.get("op_number") and sl in (r.get("op_number") or "").lower())
            or (r.get("patient_phone") and sl in (r.get("patient_phone") or "").lower())
            or (r.get("treatment_name") and sl in (r.get("treatment_name") or "").lower())
            or (r.get("doctor_name") and sl in (r.get("doctor_name") or "").lower())
            or ((r.get("case") or {}).get("case_number") and sl in ((r.get("case") or {}).get("case_number") or "").lower())
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

    VALID_ENQUIRY_TYPES = [
        "LEAD_FOLLOW_UP", "OPD_FOLLOW_UP", "APPOINTMENT_REMINDER",
        "TREATMENT_WELLNESS", "CASE_WELLNESS", "RECALL", "MISSED_APPOINTMENT",
    ]

    # --- Base filter for valid, non-terminal enquiries in date range ---
    base_filters = [
        GeneratedEnquiry.due_date.between(start, end),
        GeneratedEnquiry.enquiry_type.in_(VALID_ENQUIRY_TYPES),
    ]
    if hospital_id:
        base_filters.append(GeneratedEnquiry.hospital_id == hospital_id)
    if not include_terminal:
        base_filters.append(GeneratedEnquiry.status.notin_(terminal_statuses))

    # --- Total, by_type, by_status (within date range) ---
    ge_total = (await db.execute(
        select(func.count()).select_from(GeneratedEnquiry).where(and_(*base_filters))
    )).scalar() or 0
    counts["total"] = ge_total

    for tp, cnt in (await db.execute(
        select(GeneratedEnquiry.enquiry_type, func.count()).where(and_(*base_filters))
        .group_by(GeneratedEnquiry.enquiry_type)
    )).all():
        counts["by_type"][tp] = cnt

    for st, cnt in (await db.execute(
        select(GeneratedEnquiry.status, func.count()).where(and_(*base_filters))
        .group_by(GeneratedEnquiry.status)
    )).all():
        counts["by_status"][st] = cnt
        if st == "COMPLETED":
            counts["completed"] = cnt
        elif st in ("PENDING", "SCHEDULED", "OPEN", "NEW"):
            counts["pending"] += cnt

    # --- Overdue: active statuses with due_date < today (within date range) ---
    overdue_statuses = ["PENDING", "CONTACTED", "INTERESTED", "NEW", "NO_RESPONSE", "SCHEDULED", "OPEN"]
    ov_filters = [
        GeneratedEnquiry.due_date < today,
        GeneratedEnquiry.due_date >= start,
        GeneratedEnquiry.enquiry_type.in_(VALID_ENQUIRY_TYPES),
        GeneratedEnquiry.status.in_(overdue_statuses),
    ]
    if hospital_id:
        ov_filters.append(GeneratedEnquiry.hospital_id == hospital_id)
    counts["overdue"] = (await db.execute(
        select(func.count()).select_from(GeneratedEnquiry).where(and_(*ov_filters))
    )).scalar() or 0

    # --- Due Today ---
    dt_filters = [
        GeneratedEnquiry.due_date == today,
        GeneratedEnquiry.enquiry_type.in_(VALID_ENQUIRY_TYPES),
        GeneratedEnquiry.status.in_(overdue_statuses),
    ]
    if hospital_id:
        dt_filters.append(GeneratedEnquiry.hospital_id == hospital_id)
    counts["due_today"] = (await db.execute(
        select(func.count()).select_from(GeneratedEnquiry).where(and_(*dt_filters))
    )).scalar() or 0

    # --- Due Tomorrow ---
    dtm_filters = [
        GeneratedEnquiry.due_date == tomorrow,
        GeneratedEnquiry.enquiry_type.in_(VALID_ENQUIRY_TYPES),
        GeneratedEnquiry.status.in_(overdue_statuses),
    ]
    if hospital_id:
        dtm_filters.append(GeneratedEnquiry.hospital_id == hospital_id)
    counts["due_tomorrow"] = (await db.execute(
        select(func.count()).select_from(GeneratedEnquiry).where(and_(*dtm_filters))
    )).scalar() or 0

    # --- Due This Week: items in date range with active status ---
    counts["due_this_week"] = ge_total

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
    result = []

    VALID_ENQUIRY_TYPES = [
        "LEAD_FOLLOW_UP", "OPD_FOLLOW_UP", "APPOINTMENT_REMINDER",
        "TREATMENT_WELLNESS", "CASE_WELLNESS", "RECALL", "MISSED_APPOINTMENT",
    ]

    # --- Generated enquiries overdue ---
    ge_q = select(GeneratedEnquiry).where(
        GeneratedEnquiry.due_date < today,
        GeneratedEnquiry.status.in_(overdue_statuses),
        GeneratedEnquiry.enquiry_type.in_(VALID_ENQUIRY_TYPES),
    )
    if hospital_id:
        ge_q = ge_q.where(GeneratedEnquiry.hospital_id == hospital_id)
    if type_filter:
        ge_q = ge_q.where(GeneratedEnquiry.enquiry_type == type_filter)
    if doctor_id:
        ge_q = ge_q.where(GeneratedEnquiry.doctor_id == doctor_id)
    if patient_id:
        ge_q = ge_q.where(GeneratedEnquiry.patient_id == patient_id)
    ge_rows = (await db.execute(ge_q.order_by(GeneratedEnquiry.due_date))).scalars().all()

    ge_patient_ids = list({ge.patient_id for ge in ge_rows if ge.patient_id})
    ge_lead_ids = list({ge.lead_id for ge in ge_rows if ge.lead_id})
    ge_doctor_ids = list({ge.doctor_id for ge in ge_rows if ge.doctor_id})
    ge_staff_ids = list({ge.assigned_staff_id for ge in ge_rows if ge.assigned_staff_id})
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
    all_staff_ids = list(set(ge_doctor_ids + ge_staff_ids))
    ge_staff = await _batch_load_names(db, all_staff_ids, User, "full_name")
    ge_tt = {}
    if ge_tt_ids:
        tt_q = select(TreatmentType).where(TreatmentType.id.in_(ge_tt_ids))
        for tt in (await db.execute(tt_q)).scalars().all():
            ge_tt[str(tt.id)] = tt.name

    for ge in ge_rows:
        is_lead = ge.enquiry_type == "LEAD_FOLLOW_UP"
        pid = str(ge.patient_id) if ge.patient_id else None
        pph = ge_patients_phone.get(pid, {}) if pid else {}
        doctor_name = ge_staff.get(str(ge.doctor_id)) if ge.doctor_id else None
        assigned_name = ge_staff.get(str(ge.assigned_staff_id)) if ge.assigned_staff_id else None
        lead_name = ge_leads.get(str(ge.lead_id)) if ge.lead_id else None
        patient_name = ge_patients.get(pid, None) if pid else None
        display_name = lead_name if is_lead and lead_name else (patient_name or lead_name or PLACEHOLDER)
        result.append({
            "id": str(ge.id),
            "source": "generated_enquiry",
            "type": ge.enquiry_type or "UNKNOWN",
            "status": ge.status,
            "display_name": display_name,
            "patient_name": display_name,
            "patient_id": pid if not is_lead else None,
            "phone": pph.get("phone") if not is_lead else None,
            "op_no": pph.get("op_no") if not is_lead else None,
            "doctor_name": None if is_lead else (doctor_name or assigned_name),
            "doctor_id": None if is_lead else (str(ge.doctor_id) if ge.doctor_id else (str(ge.assigned_staff_id) if ge.assigned_staff_id else None)),
            "treatment_type": None if is_lead else (ge_tt.get(str(ge.treatment_type_id)) if ge.treatment_type_id else None),
            "treatment_type_id": None if is_lead else (str(ge.treatment_type_id) if ge.treatment_type_id else None),
            "due_date": ge.due_date.isoformat(),
            "notes": ge.notes,
            "days_overdue": (today - ge.due_date).days,
            "priority": ge.priority,
            "contact_channel": None,
            "last_contact_date": None,
            "patient_phone": None if is_lead else pph.get("phone"),
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
        old_status = ge.status
        ge.status = data.status
        if data.status == "COMPLETED":
            ge.updated_at = datetime.now(timezone.utc)
            try:
                from app.crm.services.event_dispatcher import publish_event
                from app.crm.enums import EventType, EventSource

                if ge.enquiry_type == "RECALL" and getattr(ge, 'is_recurring', False):
                    await publish_event(
                        event_type=EventType.RECALL_COMPLETED,
                        source_module=EventSource.RECALL,
                        entity_type="RECALL",
                        entity_id=ge.id,
                        hospital_id=ge.hospital_id,
                        patient_id=ge.patient_id,
                        payload={
                            "enquiry_id": ge.id,
                            "patient_id": ge.patient_id,
                            "case_id": ge.case_id,
                            "occurrence_number": ge.occurrence_number,
                            "chain_id": ge.chain_id,
                        },
                        db=db,
                    )

                if ge.enquiry_type == "LEAD_FOLLOW_UP":
                    await publish_event(
                        event_type=EventType.LEAD_FOLLOW_UP_COMPLETED,
                        source_module=EventSource.LEAD,
                        entity_type="LEAD_FOLLOW_UP",
                        entity_id=ge.id,
                        hospital_id=ge.hospital_id,
                        patient_id=ge.patient_id,
                        lead_id=ge.lead_id,
                        payload={
                            "enquiry_id": ge.id,
                            "patient_id": ge.patient_id,
                            "lead_id": ge.lead_id,
                            "occurrence_number": ge.occurrence_number,
                            "total_attempts": ge.total_attempts,
                            "chain_id": ge.chain_id,
                        },
                        db=db,
                    )
            except Exception:
                logger.warning("Failed to publish enquiry completion event", exc_info=True)
        elif data.status == "CANCELLED":
            ge.cancelled_by_event = "MANUAL"
            ge.cancelled_at = datetime.now(timezone.utc)
        if ge.patient_id:
            await record_timeline_event(
                db, current_user=current_user, patient_id=ge.patient_id,
                action="CRM Enquiry Status Updated",
                description=f"Status changed from {old_status} to {data.status}",
                module="CRM",
                changes=[{"field": "status", "old_value": old_status, "new_value": data.status}],
            )
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
        "patient_name": patient.full_name if patient else PLACEHOLDER,
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
        logger.warning("Failed to publish ENQUIRY_CONVERTED event", exc_info=True)
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


# =============================================================================
# ENRICHED ENQUIRY DETAIL — full context for the detail drawer
# =============================================================================
@router.get("/{enquiry_id}/detail")
async def get_enriched_enquiry_detail(
    enquiry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    """Returns fully enriched detail for a single GeneratedEnquiry."""
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)

    ge = await db.get(GeneratedEnquiry, enquiry_id)
    if not ge:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    hospital_id = current_user.get("hospital_id")
    if hospital_id and str(ge.hospital_id) != hospital_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # --- Batch load all related entities ---
    user_ids = list({ge.doctor_id, ge.assigned_staff_id})
    patients = await _batch_load_entities(db, Patient, [ge.patient_id]) if ge.patient_id else {}
    leads = await _batch_load_entities(db, Lead, [ge.lead_id]) if ge.lead_id else {}
    users = await _batch_load_entities(db, User, [u for u in user_ids if u])
    cases = await _batch_load_entities(db, Case, [ge.case_id]) if ge.case_id else {}
    tp_entities = await _batch_load_entities(db, TreatmentPlan, [ge.treatment_plan_id]) if ge.treatment_plan_id else {}
    appointments = await _batch_load_entities(db, Appointment, [ge.appointment_id]) if ge.appointment_id else {}
    hospitals = await _batch_load_entities(db, Hospital, [ge.hospital_id])
    tt_entities = await _batch_load_entities(db, TreatmentType, [ge.treatment_type_id]) if ge.treatment_type_id else {}

    pid = str(ge.patient_id) if ge.patient_id else None
    lid = str(ge.lead_id) if ge.lead_id else None
    cid = str(ge.case_id) if ge.case_id else None
    hid = str(ge.hospital_id) if ge.hospital_id else None

    patient_obj = patients.get(pid) if pid else None
    lead_obj = leads.get(lid) if lid else None
    case_obj = cases.get(str(ge.case_id)) if ge.case_id else None
    tp_obj = tp_entities.get(str(ge.treatment_plan_id)) if ge.treatment_plan_id else None
    appt_obj = appointments.get(str(ge.appointment_id)) if ge.appointment_id else None
    hospital_obj = hospitals.get(hid) if hid else None
    tt_obj = tt_entities.get(str(ge.treatment_type_id)) if ge.treatment_type_id else None

    is_lead = ge.enquiry_type == "LEAD_FOLLOW_UP"

    # Doctor resolution (LEAD enquiries get no doctor)
    doctor_info = {"id": None, "name": None, "specialization": None, "photo_url": None}
    treatment_display_name = None
    completed_treatments = []

    case_tps: list = []
    if not is_lead:
        if case_obj:
            tp_all = (await db.execute(
                select(TreatmentPlan).where(TreatmentPlan.case_id == case_obj.id)
                .order_by(TreatmentPlan.sequence_order, TreatmentPlan.created_at)
            )).scalars().all()
            case_tps = list(tp_all)
        patient_appts = []
        if patient_obj:
            appt_all = (await db.execute(
                select(Appointment).where(Appointment.patient_id == patient_obj.id,
                                            Appointment.is_active == True)
            )).scalars().all()
            patient_appts = list(appt_all)

        sitting_doctor_id = None
        if tp_obj:
            sitting_q = await db.execute(
                select(TreatmentSitting).where(
                    TreatmentSitting.treatment_plan_id == tp_obj.id,
                    TreatmentSitting.status.in_(["COMPLETED", "IN_PROGRESS"]),
                    TreatmentSitting.doctor_id.isnot(None),
                ).order_by(desc(TreatmentSitting.sitting_date)).limit(1)
            )
            latest_sitting = sitting_q.scalar_one_or_none()
            if latest_sitting:
                sitting_doctor_id = str(latest_sitting.doctor_id)

        entity_dict = {"users": users, "patients": patients, "leads": leads,
                       "cases": cases, "tp": tp_entities, "appointments": appointments,
                       "hospitals": hospitals, "tt": tt_entities}

        doctor_info = _resolve_latest_doctor(
            case_obj, case_tps, patient_appts,
            sitting_doctor_id or ge.doctor_id or ge.assigned_staff_id, entity_dict,
            linked_appointment_id=str(ge.appointment_id) if ge.appointment_id else None,
        )

        treatment_display_name = tp_obj.treatment_name if tp_obj else (ge.treatment_name or (tt_obj.name if tt_obj else None))

        # --- Completed Treatments for the case ---
        if ge.case_id:
            ct_q = select(TreatmentPlan).where(
                TreatmentPlan.case_id == ge.case_id,
                TreatmentPlan.status == TreatmentPlanStatus.COMPLETED.value,
            ).order_by(TreatmentPlan.completed_at, TreatmentPlan.sequence_order)
            for ct in (await db.execute(ct_q)).scalars().all():
                completed_treatments.append({
                    "id": str(ct.id),
                    "treatment_name": ct.treatment_name,
                    "completed_at": ct.completed_at.isoformat() if ct.completed_at else None,
                })

    # --- Display info (single source of truth — type-aware) ---
    display_info = resolve_display_info(ge.enquiry_type, patient_obj, lead_obj)

    # --- Patient Summary (null for LEAD enquiries) ---
    patient_info = resolve_patient_detail(patient_obj, is_lead=is_lead)

    # --- Lead Summary ---
    lead_info = resolve_lead_detail(lead_obj)
    if lead_info and lead_obj:
        lead_info["alternate_mobile"] = lead_obj.alternate_mobile
        lead_info["preferred_visit_date"] = lead_obj.preferred_visit_date.isoformat() if lead_obj.preferred_visit_date else None
        lead_info["age"] = lead_obj.age
        lead_info["gender"] = lead_obj.gender
        lead_info["city"] = lead_obj.city
        lead_info["lead_score"] = lead_obj.lead_score
        lead_info["converted_patient_id"] = lead_obj.converted_patient_id
        lead_info["assigned_doctor"] = users.get(lead_obj.assigned_doctor_id).full_name if lead_obj.assigned_doctor_id and lead_obj.assigned_doctor_id in users else None
        lead_info["assigned_staff"] = users.get(lead_obj.assigned_staff_id).full_name if lead_obj.assigned_staff_id and lead_obj.assigned_staff_id in users else None

    # --- Appointment Information (null for LEAD enquiries) ---
    appointment_info = None
    if appt_obj and not is_lead:
        appt_doctor_name = users[appt_obj.doctor_id].full_name if appt_obj.doctor_id and appt_obj.doctor_id in users else None
        appointment_info = {
            "id": str(appt_obj.id),
            "date": appt_obj.appointment_date.isoformat() if appt_obj.appointment_date else None,
            "time": str(appt_obj.appointment_time) if appt_obj.appointment_time else None,
            "end_time": str(appt_obj.end_time) if appt_obj.end_time else None,
            "doctor_name": appt_doctor_name,
            "department": None,
            "purpose": appt_obj.notes,
            "status": appt_obj.status.value if hasattr(appt_obj.status, "value") else appt_obj.status,
        }

    # --- Treatment Information (null for LEAD enquiries) ---
    treatment_info = None
    if tp_obj and not is_lead:
        treatment_type_name = tt_obj.name if tt_obj else None
        treatment_info = {
            "id": str(tp_obj.id),
            "treatment_name": tp_obj.treatment_name,
            "treatment_type": treatment_type_name,
            "treatment_number": tp_obj.treatment_number,
            "description": tp_obj.description,
            "status": tp_obj.status.value if hasattr(tp_obj.status, "value") else tp_obj.status,
            "start_date": tp_obj.start_date.isoformat() if tp_obj.start_date else None,
            "expected_completion_date": tp_obj.expected_completion_date.isoformat() if tp_obj.expected_completion_date else None,
            "completion_date": tp_obj.completed_at.isoformat() if tp_obj.completed_at else None,
            "total_visits": tp_obj.total_sittings,
            "completed_visits": tp_obj.completed_sittings,
            "remaining_visits": tp_obj.remaining_sittings,
            "current_stage": f"Visit {tp_obj.completed_sittings + 1} of {tp_obj.total_sittings}" if tp_obj.total_sittings else "Not started",
            "cost": tp_obj.cost,
            "paid_amount": tp_obj.paid_amount,
            "assigned_doctor": users.get(tp_obj.assigned_doctor_id).full_name if tp_obj.assigned_doctor_id and tp_obj.assigned_doctor_id in users else None,
        }

    # --- Case Information (null for LEAD enquiries) ---
    case_info = None
    if case_obj and not is_lead:
        case_info = {
            "id": str(case_obj.id),
            "case_number": case_obj.case_number,
            "chief_complaint": case_obj.chief_complaint,
            "diagnosis": case_obj.final_diagnosis or case_obj.diagnosis,
            "status": case_obj.status.value if hasattr(case_obj.status, "value") else case_obj.status,
            "hpi": case_obj.hpi,
            "dental_history": case_obj.dental_history,
            "medical_history": case_obj.medical_history,
            "completion_date": case_obj.completion_date.isoformat() if case_obj.completion_date else None,
        }

    # --- Hospital ---
    hospital_info = None
    if hospital_obj:
        hospital_info = {
            "id": str(hospital_obj.id),
            "name": hospital_obj.name,
            "phone": hospital_obj.phone,
            "email": hospital_obj.email,
            "address": hospital_obj.address,
            "logo_url": hospital_obj.logo_url,
        }

    # --- Recurrence ---
    recurrence_info = None
    if ge.enquiry_type == "RECALL" and ge.is_recurring:
        recurrence_info = {
            "is_recurring": True,
            "occurrence_number": ge.occurrence_number,
            "interval_days": ge.recurrence_interval_days,
            "chain_id": ge.chain_id,
        }

    description = _generate_description(
        ge.enquiry_type, patient_obj.full_name if patient_obj else None,
        lead_obj.lead_name if lead_obj else None,
        treatment_display_name, case_obj, lead_obj, appt_obj, tp_obj, recurrence_info
    )

    template_vars = _build_template_variables(
        ge.enquiry_type, patient_obj, lead_obj, doctor_info, hospital_obj,
        case_obj, tp_obj, appt_obj, treatment_display_name,
        ge.occurrence_number, tp_obj.total_sittings if tp_obj else None,
        completed_treatments=completed_treatments,
        due_date=ge.due_date,
    )

    # --- Communication History ---
    communication_history = []
    from app.models.communication_log import CommunicationLog
    comm_q = select(CommunicationLog).where(
        CommunicationLog.patient_id == ge.patient_id,
        CommunicationLog.hospital_id == ge.hospital_id,
    ).order_by(desc(CommunicationLog.created_at)).limit(20)
    for comm in (await db.execute(comm_q)).scalars().all():
        communication_history.append({
            "id": str(comm.id),
            "channel": comm.channel,
            "message_type": comm.message_type,
            "message": comm.message[:500] if comm.message else "",
            "status": comm.status,
            "sent_at": comm.sent_at.isoformat() if comm.sent_at else None,
            "created_at": comm.created_at.isoformat() if comm.created_at else None,
        })

    # --- Timeline (type-aware) ---
    timeline = []
    if is_lead and ge.lead_id:
        # Lead timeline: lead-created, status changes, follow-ups
        from app.models.lead import Lead
        from app.models.follow_up import FollowUp
        from app.models.communication_log import CommunicationLog
        lead = await db.get(Lead, ge.lead_id)
        if lead:
            timeline.append({
                "id": str(lead.id), "event_type": "LEAD_CREATED",
                "description": f"Lead created — {lead.source.replace('_', ' ').title() if lead.source else 'Unknown source'}",
                "created_at": lead.created_at.isoformat() if lead.created_at else None,
                "status": lead.status,
            })
        # Lead follow-up events
        fu_q = select(FollowUp).where(
            FollowUp.lead_id == ge.lead_id
        ).order_by(desc(FollowUp.created_at)).limit(20)
        for fu in (await db.execute(fu_q)).scalars().all():
            timeline.append({
                "id": str(fu.id), "event_type": "LEAD_FOLLOW_UP",
                "description": fu.notes or f"Follow-up ({fu.follow_up_type or 'General'})",
                "created_at": fu.created_at.isoformat() if fu.created_at else None,
                "status": fu.status,
            })
        # Lead communication events
        comm_q = select(CommunicationLog).where(
            CommunicationLog.lead_id == ge.lead_id
        ).order_by(desc(CommunicationLog.created_at)).limit(20)
        for comm in (await db.execute(comm_q)).scalars().all():
            timeline.append({
                "id": str(comm.id), "event_type": "LEAD_COMMUNICATION",
                "description": f"{comm.channel} — {comm.message[:100] if comm.message else 'No message'}",
                "created_at": comm.created_at.isoformat() if comm.created_at else None,
                "status": comm.status,
            })
        timeline.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    elif ge.patient_id and not is_lead:
        from app.services.timeline_service import TimelineService
        ts = TimelineService(db)
        timeline_raw, _ = await ts.get_timeline(ge.patient_id, limit=50)
        timeline = timeline_raw

    # --- Previous Visit (for APPOINTMENT_REMINDER only) ---
    previous_visit = None
    if ge.enquiry_type == "APPOINTMENT_REMINDER" and appt_obj and patient_obj:
        from app.models.treatment_sitting import TreatmentSitting
        last_sitting = (await db.execute(
            select(TreatmentSitting).where(
                TreatmentSitting.sitting_date < appt_obj.appointment_date,
                TreatmentSitting.status == "COMPLETED",
            ).order_by(desc(TreatmentSitting.sitting_date)).limit(1)
        )).scalar_one_or_none()
        if last_sitting:
            sit_doctor = users.get(str(last_sitting.doctor_id)) if last_sitting.doctor_id else None
            previous_visit = {
                "date": last_sitting.sitting_date.isoformat() if last_sitting.sitting_date else None,
                "doctor": sit_doctor.full_name if sit_doctor else None,
                "treatment_name": tp_obj.treatment_name if tp_obj and last_sitting.treatment_plan_id == tp_obj.id else None,
                "work_done": last_sitting.work_done,
                "sitting_number": last_sitting.sitting_number,
                "status": last_sitting.status.value if hasattr(last_sitting.status, "value") else last_sitting.status,
            }

    # --- Appointment Treatment (treatment linked to this appointment) ---
    appointment_treatment = None
    if appt_obj and not is_lead:
        if tp_obj:
            appointment_treatment = {
                "case_id": str(case_obj.id) if case_obj else None,
                "case_number": case_obj.case_number if case_obj else None,
                "treatments": [{"id": str(tp_obj.id), "name": tp_obj.treatment_name, "status": tp_obj.status.value if hasattr(tp_obj.status, "value") else tp_obj.status}],
            }
        elif case_obj and case_tps:
            active_treatments = [
                t for t in case_tps
                if t.status in (TreatmentPlanStatus.IN_PROGRESS, TreatmentPlanStatus.ASSIGNED, TreatmentPlanStatus.GENERATED)
            ]
            if active_treatments:
                appointment_treatment = {
                    "case_id": str(case_obj.id),
                    "case_number": case_obj.case_number,
                    "treatments": [
                        {"id": str(t.id), "name": t.treatment_name, "status": t.status.value if hasattr(t.status, "value") else t.status}
                        for t in active_treatments
                    ],
                }

    # --- Case Treatments (all treatments in the case, for CASE_WELLNESS etc.) ---
    case_treatments = []
    if case_obj and case_tps and not is_lead:
        case_treatments = [
            {
                "id": str(t.id),
                "treatment_name": t.treatment_name,
                "status": t.status.value if hasattr(t.status, "value") else t.status,
                "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            }
            for t in case_tps
        ]

    # --- Assigned Staff ---
    assigned_staff_info = None
    if ge.assigned_staff_id and ge.assigned_staff_id in users:
        s = users[ge.assigned_staff_id]
        assigned_staff_info = {"id": str(s.id), "name": s.full_name, "email": s.email, "phone": s.phone}

    return {
        "id": str(ge.id),
        "source": "generated_enquiry",
        "enquiry_type": ge.enquiry_type,
        "enquiry_number": ge.enquiry_number,
        "status": ge.status,
        "priority": ge.priority or "MEDIUM",
        "due_date": ge.due_date.isoformat(),
        "created_at": ge.created_at.isoformat() if ge.created_at else None,
        "updated_at": ge.updated_at.isoformat() if ge.updated_at else None,
        "description": description,
        "notes": ge.notes,
        "trigger_event": ge.trigger_event,
        "generation_reason": ge.generation_reason,
        "visit_number": ge.visit_number,
        "total_visits": ge.total_visits,
        "patient": patient_info,
        "lead": lead_info,
        "doctor": doctor_info,
        "hospital": hospital_info,
        "case": case_info,
        "treatment": treatment_info,
        "appointment": appointment_info,
        "recurrence": recurrence_info,
        "assigned_staff": assigned_staff_info,
        "completed_treatments": completed_treatments,
        "previous_visit": previous_visit,
        "appointment_treatment": appointment_treatment,
        "case_treatments": case_treatments,
        "template_variables": template_vars,
        "communication_history": communication_history,
        "timeline": timeline,
        "display_name": display_info["display_name"],
        "display_phone": display_info["display_phone"],
        "display_email": display_info["display_email"],
    }


# =============================================================================
# WHATSAPP PREVIEW FOR ENQUIRY
# =============================================================================
class WhatsAppPreviewRequest(BaseModel):
    template_message: Optional[str] = Field(None, description="Custom template message (uses default if not provided)")


class WhatsAppPreviewResponse(BaseModel):
    enquiry_id: str
    template_message: str
    rendered_message: str
    resolved_variables: dict
    unresolved_variables: list
    is_valid: bool


@router.post("/{enquiry_id}/whatsapp-preview")
async def get_whatsapp_preview(
    enquiry_id: str,
    request: WhatsAppPreviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get WhatsApp message preview for an enquiry. Resolves all template variables in real-time."""
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)

    ge = await db.get(GeneratedEnquiry, enquiry_id)
    if not ge:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    hospital_id = current_user.get("hospital_id")
    if hospital_id and str(ge.hospital_id) != hospital_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Find template
    from app.models.whatsapp_template import WhatsAppTemplate
    eq_type = ge.enquiry_type

    template_obj = None
    q = select(WhatsAppTemplate).where(
        WhatsAppTemplate.hospital_id == ge.hospital_id,
        WhatsAppTemplate.enquiry_type == eq_type,
        WhatsAppTemplate.is_active == True,
    )
    t = (await db.execute(q)).scalar_one_or_none()
    if t:
        template_obj = t
    else:
        q = select(WhatsAppTemplate).where(
            WhatsAppTemplate.hospital_id.is_(None),
            WhatsAppTemplate.enquiry_type == eq_type,
            WhatsAppTemplate.is_active == True,
        )
        t = (await db.execute(q)).scalar_one_or_none()
        if t:
            template_obj = t

    template_message = request.template_message
    if not template_message:
        if template_obj:
            template_message = template_obj.message
        else:
            template_message = DEFAULT_TEMPLATES_BY_TYPE.get(eq_type or "", "")

    # Resolve variables with type-scoped validation
    from app.crm.services.template_resolver import get_template_resolver
    resolver = get_template_resolver()
    rendered, invalid = await resolver.resolve_with_validation(
        db, template_message, enquiry_type=eq_type or "",
        patient_id=ge.patient_id,
        lead_id=ge.lead_id,
        hospital_id=ge.hospital_id,
        doctor_id=ge.doctor_id,
        appointment_id=ge.appointment_id,
        treatment_type_id=ge.treatment_type_id,
        case_id=ge.case_id,
        treatment_plan_id=ge.treatment_plan_id,
        staff_id=ge.assigned_staff_id,
        visit_number=ge.visit_number,
        total_visits=ge.total_visits,
        remaining_visits=ge.total_visits - ge.visit_number if ge.total_visits and ge.visit_number else None,
        treatment_name=ge.treatment_name,
    )

    # Also build the resolved_variables dict for frontend display
    variables = await resolver._build_variable_map(
        db, enquiry_type=eq_type or "",
        patient_id=ge.patient_id, lead_id=ge.lead_id, hospital_id=ge.hospital_id, doctor_id=ge.doctor_id,
        appointment_id=ge.appointment_id, treatment_type_id=ge.treatment_type_id, case_id=ge.case_id,
        treatment_plan_id=ge.treatment_plan_id, staff_id=ge.assigned_staff_id, visit_number=ge.visit_number,
        remaining_visits=ge.total_visits - ge.visit_number if ge.total_visits and ge.visit_number else None,
        total_visits=ge.total_visits,
        treatment_name=ge.treatment_name,
    )

    is_valid = len(invalid) == 0

    return WhatsAppPreviewResponse(
        enquiry_id=ge.id,
        template_message=template_message,
        rendered_message=rendered,
        resolved_variables=variables,
        unresolved_variables=invalid,
        is_valid=is_valid,
    )