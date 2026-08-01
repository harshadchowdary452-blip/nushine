import asyncio
import calendar
import traceback
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, date, time, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.database import get_db

logger = logging.getLogger("crm-router")
logging.basicConfig(level=logging.DEBUG)
from app.dependencies import get_current_user


def _verify_hospital_access(entity, current_user):
    """Raise 403 if the entity's hospital_id doesn't match the user's hospital_id (HOSPITAL_ADMIN/DOCTOR)."""
    role = current_user.get("role")
    if role in ("HOSPITAL_ADMIN", "DOCTOR"):
        entity_hid = getattr(entity, "hospital_id", None)
        user_hid = current_user.get("hospital_id")
        if entity_hid and user_hid and str(entity_hid) != str(user_hid):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: entity belongs to another hospital")
from app.core.permissions import Role, Permission, verify_permission
from app.services.timeline_helper import record_timeline_event, build_changes
from app.models.communication_log import CommunicationLog, CommunicationChannel, CommunicationStatus, MessageType
from app.models.notification import Notification
from app.models.patient_feedback import PatientFeedback
from app.models.follow_up import FollowUp, FollowUpStatus, FollowUpType
from app.models.treatment_type import TreatmentType
from app.models.enquiry import Enquiry
from app.models.follow_up_response import FollowUpResponse, FollowUpResponseStatus
from app.models.whatsapp_template import WhatsAppTemplate
from app.services.status_automation import StatusAutomationService
from app.models.email_template import EmailTemplate
from app.models.patient import Patient
from app.models.user import User
from app.models.hospital import Hospital
from app.models.lead import Lead, LeadCommunication, LeadCall, LeadStatus
from app.models.generated_enquiry import GeneratedEnquiry
from app.models.case import Case
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.billing import Billing
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType
from app.models.communication_log import CommunicationLog, CommunicationChannel, CommunicationStatus
from app.utils.whatsapp import WhatsAppProvider
from app.utils.pdf import generate_invoice_pdf
from app.utils.template_engine import TemplateEngine

router = APIRouter(prefix="/crm", tags=["CRM"])

# --- Schemas ---

class SendWhatsAppRequest(BaseModel):
    patient_id: Optional[str] = None
    lead_id: Optional[str] = None
    message: str = Field(..., min_length=1, max_length=1000)
    message_type: str = "GENERAL"

class SendEmailRequest(BaseModel):
    patient_id: str
    subject: str = Field(..., min_length=1, max_length=255)
    body: str = Field(..., min_length=1)
    message_type: str = "GENERAL"
    attach_invoice: Optional[bool] = False
    invoice_id: Optional[str] = None

class BroadcastRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    message_type: str = "CAMPAIGN"
    patient_ids: Optional[List[str]] = None
    lead_ids: Optional[List[str]] = None
    appointment_date: Optional[str] = None
    doctor_id: Optional[str] = None
    status: Optional[str] = None
    filter_type: str = "all"

class TemplateCreate(BaseModel):
    name: str
    subject: str
    body: str

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    is_active: Optional[bool] = None

class FeedbackCreate(BaseModel):
    patient_id: str
    doctor_id: Optional[str] = None
    case_id: Optional[str] = None
    rating: int = Field(..., ge=1, le=5)
    review: Optional[str] = None
    comments: Optional[str] = None

class FollowUpCreate(BaseModel):
    patient_id: str
    doctor_id: Optional[str] = None
    case_id: Optional[str] = None
    follow_up_date: str
    follow_up_time: Optional[str] = None
    notes: Optional[str] = None

class FollowUpUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    patient_feedback: Optional[str] = None
    staff_notes: Optional[str] = None
    response_summary: Optional[str] = None
    response_status: Optional[str] = None
    next_action: Optional[str] = None
    interested_to_visit_again: Optional[str] = None
    contact_channel: Optional[str] = None
    follow_up_date: Optional[str] = None
    follow_up_time: Optional[str] = None
    appointment_id: Optional[str] = None
    whatsapp_message: Optional[str] = None

class FollowUpFeedbackCreate(BaseModel):
    response_status: str  # INTERESTED, NOT_INTERESTED, NEEDS_MORE_TIME, REQUESTED_CALLBACK, BUSY, NO_RESPONSE, WRONG_NUMBER, TREATMENT_COMPLETED, NEEDS_REVIEW
    patient_feedback: Optional[str] = None
    staff_notes: Optional[str] = None
    response_summary: Optional[str] = None
    next_action: Optional[str] = None  # CALL_AGAIN, CREATE_FOLLOW_UP, BOOK_APPOINTMENT, CLOSE_ENQUIRY
    contact_channel: Optional[str] = None  # CALL, WHATSAPP, SMS, EMAIL, IN_PERSON

class CreateAppointmentFromFu(BaseModel):
    doctor_id: str
    appointment_date: str
    appointment_time: str
    appointment_type: Optional[str] = "FOLLOW_UP"

class RescheduleFollowUp(BaseModel):
    follow_up_date: str
    follow_up_time: Optional[str] = None

class DeliveryCallbackRequest(BaseModel):
    log_id: str
    status: str
    provider_response: Optional[str] = None


async def _get_patients_for_broadcast(
    db: AsyncSession,
    hospital_id: Optional[str],
    req: BroadcastRequest) -> tuple[list[Patient], list[str]]:
    """Resolve patient list based on broadcast filters. Returns (patients, errors)."""
    query = select(Patient).where(Patient.is_active == True)
    if hospital_id:
        query = query.where(Patient.hospital_id == hospital_id)
    if req.filter_type == "ids" and req.patient_ids:
        query = query.where(Patient.id.in_(req.patient_ids))
    elif req.filter_type == "appointment_date" and req.appointment_date:
        appt_date = date.fromisoformat(req.appointment_date)
        appt_subq = select(Appointment.patient_id).where(Appointment.appointment_date == appt_date)
        if hospital_id:
            appt_subq = appt_subq.select_from(Appointment).join(Patient, Appointment.patient_id == Patient.id).where(Patient.hospital_id == hospital_id)
        query = query.where(Patient.id.in_(appt_subq))
    elif req.filter_type == "doctor" and req.doctor_id:
        query = query.where(Patient.doctor_id == req.doctor_id)
    elif req.filter_type == "status" and req.status:
        query = query.where(Patient.status == req.status)
    result = await db.execute(query)
    patients = list(result.scalars().all())
    errors = []
    for p in patients:
        if not p.phone:
            errors.append(f"Patient {p.full_name} has no phone")
    return patients, errors


async def _build_message_variables(
    db: AsyncSession,
    patient: Patient,
    hospital_name: Optional[str],
    appointment_date_str: Optional[str] = None) -> dict:
    """Build template variables for a given patient."""
    doctor_name = None
    if patient.doctor_id:
        doc = await db.get(User, patient.doctor_id)
        if doc:
            doctor_name = doc.full_name
    return TemplateEngine.build_variables(
        patient_name=patient.full_name,
        doctor_name=doctor_name,
        hospital_name=hospital_name,
        appointment_date=appointment_date_str)


async def _log_communication(
    db: AsyncSession,
    patient_id: str,
    hospital_id: Optional[str],
    doctor_id: Optional[str],
    channel: str,
    message_type: str,
    message: str,
    status: str,
    subject: Optional[str] = None,
    attachment_url: Optional[str] = None) -> CommunicationLog:
    log = CommunicationLog(
        patient_id=patient_id,
        hospital_id=hospital_id,
        doctor_id=doctor_id,
        channel=channel,
        message_type=message_type,
        subject=subject,
        message=message,
        status=status,
        sent_at=datetime.now(timezone.utc) if status != CommunicationStatus.FAILED.value else None,
        attachment_url=attachment_url)
    db.add(log)
    return log


# --- WhatsApp ---

@router.post("/whatsapp/send")
async def send_whatsapp(
    req: SendWhatsAppRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    phone = None
    recipient_name = ""
    hospital_id = current_user.get("hospital_id")

    if req.lead_id:
        lead = await db.get(Lead, req.lead_id)
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        phone = lead.mobile
        recipient_name = lead.lead_name
        hospital_id = hospital_id or lead.hospital_id
        hospital_obj = await db.get(Hospital, hospital_id)
        hospital_name = hospital_obj.name if hospital_obj else None
        variables = TemplateEngine.build_variables(
            lead_name=lead.lead_name,
            hospital_name=hospital_name)
        rendered = TemplateEngine.render_template(req.message, variables)
        provider = WhatsAppProvider()
        success = await provider.send_message(phone, rendered)
        comm = LeadCommunication(
            lead_id=lead.id, hospital_id=hospital_id, sent_by=current_user.get("sub"),
            channel="WHATSAPP", message_type=req.message_type, message=rendered,
            status="SENT" if success else "FAILED",
            sent_at=datetime.now(timezone.utc) if success else None)
        db.add(comm)
        await db.commit()
        if not success:
            raise HTTPException(status_code=500, detail="Failed to send WhatsApp message")
        return {"success": True, "lead_comm_id": comm.id, "rendered_message": rendered}

    patient = await db.get(Patient, req.patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    if not patient.phone:
        raise HTTPException(status_code=400, detail="Patient has no phone number")
    phone = patient.phone
    recipient_name = patient.full_name
    hospital_id = hospital_id or patient.hospital_id
    doctor_name = None
    if patient.doctor_id:
        doc = await db.get(User, patient.doctor_id)
        if doc: doctor_name = doc.full_name
    hospital_obj = await db.get(Hospital, hospital_id)
    hospital_name = hospital_obj.name if hospital_obj else None
    variables = TemplateEngine.build_variables(
        patient_name=patient.full_name,
        doctor_name=doctor_name,
        hospital_name=hospital_name)
    rendered = TemplateEngine.render_template(req.message, variables)
    provider = WhatsAppProvider()
    success = await provider.send_message(phone, rendered)
    status_val = CommunicationStatus.SENT.value if success else CommunicationStatus.FAILED.value
    log = await _log_communication(
        db, req.patient_id, hospital_id, current_user.get("sub"),
        CommunicationChannel.WHATSAPP.value, req.message_type, rendered, status_val)
    try:
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        event_type = EventType.COMMUNICATION_SENT if success else EventType.COMMUNICATION_FAILED
        await publish_event(
            event_type=event_type,
            source_module=EventSource.COMMUNICATION,
            entity_type="COMMUNICATION",
            entity_id=log.id,
            hospital_id=hospital_id,
            patient_id=req.patient_id,
            db=db,
        )
    except Exception:
        pass
    await db.commit()
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send WhatsApp message")
    return {"success": True, "log_id": log.id, "rendered_message": rendered}


@router.post("/whatsapp/preview")
async def preview_broadcast(
    req: BroadcastRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    hospital_id = current_user.get("hospital_id")
    patients, errors = await _get_patients_for_broadcast(db, hospital_id, req)
    recipients = [{"id": p.id, "name": p.full_name, "phone": p.phone} for p in patients]

    leads = []
    if req.lead_ids:
        from sqlalchemy import select
        result = await db.execute(select(Lead).where(Lead.id.in_(req.lead_ids)))
        leads = list(result.scalars().all())
        recipients.extend([{"id": l.id, "name": l.lead_name, "phone": l.mobile, "type": "lead"} for l in leads])

    return {
        "total_recipients": len(patients) + len(leads),
        "recipients": recipients,
        "errors": errors,
        "estimated_delivery": f"~{(len(patients) + len(leads)) * 2} seconds",
    }


@router.post("/whatsapp/broadcast")
async def broadcast_whatsapp(
    req: BroadcastRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    hospital_id = current_user.get("hospital_id")
    hospital_name = None
    if hospital_id:
        hospital_obj = await db.get(Hospital, hospital_id)
        if hospital_obj: hospital_name = hospital_obj.name
    patients, errors = await _get_patients_for_broadcast(db, hospital_id, req)
    provider = WhatsAppProvider()
    sent = 0
    failed = 0
    appt_date_str = req.appointment_date
    for patient in patients:
        if not patient.phone:
            failed += 1
            continue
        variables = await _build_message_variables(db, patient, hospital_name, appt_date_str)
        rendered = TemplateEngine.render_template(req.message, variables)
        success = await provider.send_message(patient.phone, rendered)
        status_val = CommunicationStatus.SENT.value if success else CommunicationStatus.FAILED.value
        await _log_communication(
            db, patient.id, hospital_id, current_user.get("sub"),
            CommunicationChannel.WHATSAPP.value, req.message_type, rendered, status_val)
        if success:
            sent += 1
        else:
            failed += 1

    if req.lead_ids:
        from sqlalchemy import select
        result = await db.execute(select(Lead).where(Lead.id.in_(req.lead_ids)))
        leads = list(result.scalars().all())
        for lead in leads:
            if not lead.mobile:
                failed += 1
                continue
            variables = TemplateEngine.build_variables(
                lead_name=lead.lead_name,
                hospital_name=hospital_name or "")
            rendered = TemplateEngine.render_template(req.message, variables)
            success = await provider.send_message(lead.mobile, rendered)
            comm = LeadCommunication(
                lead_id=lead.id, hospital_id=hospital_id, sent_by=current_user.get("sub"),
                channel="WHATSAPP", message_type=req.message_type, message=rendered,
                status="SENT" if success else "FAILED",
                sent_at=datetime.now(timezone.utc) if success else None)
            db.add(comm)
            if success:
                sent += 1
            else:
                failed += 1

    await db.commit()
    total = len(patients) + (len(req.lead_ids) if req.lead_ids else 0)
    return {
        "success": True,
        "sent": sent,
        "failed": failed,
        "total": total,
        "errors": errors,
    }


@router.post("/whatsapp/delivery-callback")
async def delivery_callback(
    req: DeliveryCallbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    log = await db.get(CommunicationLog, req.log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Communication log not found")
    log.status = req.status
    if req.provider_response:
        log.provider_response = req.provider_response
    await db.commit()
    return {"success": True}


# --- Email ---

@router.post("/email/send")
async def send_email(
    req: SendEmailRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    patient = await db.get(Patient, req.patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    hospital_id = current_user.get("hospital_id") or patient.hospital_id
    doctor_name = None
    if patient.doctor_id:
        doc = await db.get(User, patient.doctor_id)
        if doc: doctor_name = doc.full_name
    hospital_obj = await db.get(Hospital, hospital_id)
    hospital_name = hospital_obj.name if hospital_obj else None
    variables = TemplateEngine.build_variables(
        patient_name=patient.full_name,
        doctor_name=doctor_name,
        hospital_name=hospital_name)
    rendered_subject = TemplateEngine.render_template(req.subject, variables)
    rendered_body = TemplateEngine.render_template(req.body, variables)
    attachment_url = None
    if req.attach_invoice and req.invoice_id:
        attachment_url = await generate_invoice_pdf(db, req.invoice_id)
    log = await _log_communication(
        db, req.patient_id, hospital_id, current_user.get("sub"),
        CommunicationChannel.EMAIL.value, req.message_type, rendered_body,
        CommunicationStatus.SENT.value, subject=rendered_subject,
        attachment_url=attachment_url)
    try:
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        await publish_event(
            event_type=EventType.COMMUNICATION_SENT,
            source_module=EventSource.COMMUNICATION,
            entity_type="COMMUNICATION",
            entity_id=log.id,
            hospital_id=hospital_id,
            patient_id=req.patient_id,
            db=db,
        )
    except Exception:
        pass
    await db.commit()
    return {"success": True, "log_id": log.id}


# --- Communication History ---

@router.get("/communications")
async def list_communications(
    patient_id: Optional[str] = Query(None),
    channel: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    query = select(CommunicationLog)
    hospital_id = current_user.get("hospital_id")
    if hospital_id:
        query = query.where(CommunicationLog.hospital_id == hospital_id)
    if patient_id:
        query = query.where(CommunicationLog.patient_id == patient_id)
    if channel:
        query = query.where(CommunicationLog.channel == channel.upper())
    query = query.order_by(desc(CommunicationLog.created_at)).offset(offset).limit(limit)
    result = await db.execute(query)
    items = result.scalars().all()
    count_q = select(func.count(CommunicationLog.id))
    if hospital_id: count_q = count_q.where(CommunicationLog.hospital_id == hospital_id)
    if patient_id: count_q = count_q.where(CommunicationLog.patient_id == patient_id)
    total = (await db.execute(count_q)).scalar() or 0
    return {"items": [{
        "id": str(c.id), "patient_id": str(c.patient_id),
        "channel": c.channel, "message_type": c.message_type,
        "subject": c.subject, "message": c.message,
        "status": c.status, "sent_at": c.sent_at.isoformat() if c.sent_at else None,
        "created_at": c.created_at.isoformat(),
        "attachment_url": c.attachment_url,
    } for c in items], "total": total}


@router.get("/communications/{patient_id}")
async def get_patient_communications(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    pat = await db.get(Patient, patient_id)
    if not pat:
        raise HTTPException(status_code=404, detail="Patient not found")
    _verify_hospital_access(pat, current_user)
    query = select(CommunicationLog).where(CommunicationLog.patient_id == patient_id)
    query = query.order_by(desc(CommunicationLog.created_at)).limit(50)
    result = await db.execute(query)
    items = result.scalars().all()
    return [{
        "id": str(c.id), "channel": c.channel,
        "message_type": c.message_type, "subject": c.subject,
        "message": c.message, "status": c.status,
        "sent_at": c.sent_at.isoformat() if c.sent_at else None,
        "created_at": c.created_at.isoformat(),
    } for c in items]


# --- Email Templates ---

@router.get("/templates")
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    result = await db.execute(select(EmailTemplate).where(EmailTemplate.is_active == True))
    templates = result.scalars().all()
    return [{"id": str(t.id), "name": t.name, "subject": t.subject, "body": t.body, "is_active": t.is_active} for t in templates]


@router.post("/templates")
async def create_template(
    req: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    t = EmailTemplate(name=req.name, subject=req.subject, body=req.body)
    db.add(t)
    await db.commit()
    return {"id": str(t.id), "name": t.name}


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    t = await db.get(EmailTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(t)
    await db.commit()
    return {"success": True}


@router.put("/templates/{template_id}")
async def update_template(
    template_id: str, req: TemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    t = await db.get(EmailTemplate, template_id)
    if not t: raise HTTPException(status_code=404, detail="Template not found")
    if req.name is not None: t.name = req.name
    if req.subject is not None: t.subject = req.subject
    if req.body is not None: t.body = req.body
    if req.is_active is not None: t.is_active = req.is_active
    await db.commit()
    return {"success": True}


# --- Patient Feedback ---

@router.post("/feedback")
async def submit_feedback(
    req: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    patient = await db.get(Patient, req.patient_id)
    if not patient: raise HTTPException(status_code=404, detail="Patient not found")
    hospital_id = current_user.get("hospital_id") or patient.hospital_id
    fb = PatientFeedback(
        patient_id=req.patient_id, hospital_id=hospital_id,
        doctor_id=req.doctor_id, case_id=req.case_id,
        rating=req.rating, review=req.review, comments=req.comments)
    db.add(fb)
    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=req.patient_id,
        action="Feedback Submitted",
        description=f"Feedback submitted with rating {req.rating}",
        module="CRM",
    )
    return {"success": True, "id": str(fb.id)}


@router.get("/feedback")
async def list_feedback(
    hospital_id: Optional[str] = Query(None),
    doctor_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    query = select(PatientFeedback)
    role = current_user.get("role")
    if role in ("HOSPITAL_ADMIN", "DOCTOR"):
        query = query.where(PatientFeedback.hospital_id == current_user.get("hospital_id"))
    elif hospital_id:
        query = query.where(PatientFeedback.hospital_id == hospital_id)
    if doctor_id: query = query.where(PatientFeedback.doctor_id == doctor_id)
    query = query.order_by(desc(PatientFeedback.created_at)).limit(50)
    result = await db.execute(query)
    items = result.scalars().all()
    return [{
        "id": str(f.id), "patient_id": str(f.patient_id),
        "doctor_id": str(f.doctor_id) if f.doctor_id else None,
        "rating": f.rating, "review": f.review,
        "created_at": f.created_at.isoformat(),
    } for f in items]


# --- Follow-Ups ---

@router.post("/follow-ups")
async def create_follow_up(
    req: FollowUpCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    hospital_id = current_user.get("hospital_id")
    # Verify patient belongs to user's hospital
    pat_check = await db.get(Patient, req.patient_id)
    if not pat_check:
        raise HTTPException(status_code=404, detail="Patient not found")
    _verify_hospital_access(pat_check, current_user)
    follow_up_date = date.fromisoformat(req.follow_up_date)
    follow_up_time = time.fromisoformat(req.follow_up_time) if req.follow_up_time else time(9, 0)
    doctor_id = req.doctor_id or current_user.get("sub")

    # 1. Create the follow-up
    fu = FollowUp(
        patient_id=req.patient_id, hospital_id=hospital_id,
        doctor_id=doctor_id, case_id=req.case_id,
        follow_up_date=follow_up_date, follow_up_time=follow_up_time,
        notes=req.notes, status=FollowUpStatus.PENDING.value)
    db.add(fu)
    await db.flush()

    # 2. Auto-create appointment with type FOLLOW_UP
    appt = Appointment(
        patient_id=req.patient_id, doctor_id=doctor_id,
        appointment_date=follow_up_date, appointment_time=follow_up_time,
        status=AppointmentStatus.SCHEDULED,
        appointment_type=AppointmentType.FOLLOW_UP,
        notes=req.notes)
    db.add(appt)
    await db.flush()

    # Link appointment to follow-up
    fu.appointment_id = appt.id

    # 3. Build common variables
    patient = await db.get(Patient, req.patient_id)
    doc = await db.get(User, doctor_id) if doctor_id else None
    hospital_obj = await db.get(Hospital, hospital_id) if hospital_id else None
    variables = TemplateEngine.build_variables(
        patient_name=patient.full_name if patient else "Patient",
        doctor_name=doc.full_name if doc else "Doctor",
        hospital_name=hospital_obj.name if hospital_obj else "Hospital",
        appointment_date=follow_up_date.isoformat(),
        appointment_time=str(follow_up_time))

    # 4. Send WhatsApp to patient (if phone available)
    if patient and patient.phone:
        whatsapp_message = TemplateEngine.render_template(
            "Dear {{patient_name}}, your follow-up appointment has been scheduled for {{appointment_date}} at {{appointment_time}} with Dr. {{doctor_name}} at {{hospital_name}}. Please arrive on time.",
            variables)
        provider = WhatsAppProvider()
        whatsapp_success = await provider.send_message(patient.phone, whatsapp_message)
        if whatsapp_success:
            await _log_communication(
                db, req.patient_id, hospital_id, doctor_id,
                CommunicationChannel.WHATSAPP.value, "FOLLOW_UP_REMINDER",
                whatsapp_message, CommunicationStatus.SENT.value)

    # 5. Send email to patient (if email available)
    if patient and patient.email:
        subject = TemplateEngine.render_template(
            "Follow-Up Appointment Scheduled - {{hospital_name}}", variables)
        body = TemplateEngine.render_template(
            "Dear {{patient_name}},<br><br>Your follow-up appointment has been scheduled:<br><br>"
            "Date: {{appointment_date}}<br>Time: {{appointment_time}}<br>"
            "Doctor: Dr. {{doctor_name}}<br>Location: {{hospital_name}}<br><br>"
            "Please arrive 15 minutes early.<br><br>Thank you,<br>{{hospital_name}}",
            variables)
        await _log_communication(
            db, req.patient_id, hospital_id, doctor_id,
            CommunicationChannel.EMAIL.value, "FOLLOW_UP_REMINDER",
            body, CommunicationStatus.SENT.value, subject=subject)

    # 6. Send in-app notification to the doctor
    notif = Notification(
        user_id=doctor_id, hospital_id=hospital_id,
        type="follow_up_assigned",
        title="New Follow-Up Assigned",
        description=TemplateEngine.render_template(
            "Follow-up scheduled for {{patient_name}} on {{appointment_date}} at {{appointment_time}}.",
            variables),
        entity_type="follow_up", entity_id=fu.id)
    db.add(notif)

    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=req.patient_id,
        action="Follow-Up Created",
        description=f"Follow-up appointment created for {req.follow_up_date}",
        module="CRM",
    )
    return {
        "success": True,
        "id": str(fu.id),
        "appointment_id": str(appt.id),
    }


@router.get("/follow-ups")
async def list_follow_ups(
    patient_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    query = select(FollowUp)
    hospital_id = current_user.get("hospital_id")
    if hospital_id: query = query.where(FollowUp.hospital_id == hospital_id)
    if patient_id: query = query.where(FollowUp.patient_id == patient_id)
    if status: query = query.where(FollowUp.status == status)
    query = query.order_by(desc(FollowUp.created_at)).limit(50)
    result = await db.execute(query)
    items = result.scalars().all()
    return [{
        "id": str(f.id), "patient_id": str(f.patient_id),
        "doctor_id": str(f.doctor_id) if f.doctor_id else None,
        "case_id": str(f.case_id) if f.case_id else None,
        "appointment_id": str(f.appointment_id) if f.appointment_id else None,
        "follow_up_date": f.follow_up_date.isoformat(),
        "follow_up_time": str(f.follow_up_time) if f.follow_up_time else None,
        "notes": f.notes, "status": f.status,
        "reminder_sent": f.reminder_sent,
        "created_at": f.created_at.isoformat(),
    } for f in items]


@router.delete("/follow-ups/{follow_up_id}")
async def delete_follow_up(follow_up_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    fu = await db.get(FollowUp, follow_up_id)
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    _verify_hospital_access(fu, current_user)
    patient_id = fu.patient_id
    await db.delete(fu)
    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Follow-Up Deleted",
        description=f"Follow-up deleted",
        module="CRM",
    )
    return {"success": True}


@router.put("/follow-ups/{follow_up_id}")
async def update_follow_up(
    follow_up_id: str, req: FollowUpUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    fu = await db.get(FollowUp, follow_up_id)
    if not fu: raise HTTPException(status_code=404, detail="Follow-up not found")
    _verify_hospital_access(fu, current_user)
    if req.status is not None: fu.status = req.status
    if req.notes is not None: fu.notes = req.notes
    if req.patient_feedback is not None: fu.patient_feedback = req.patient_feedback
    if req.staff_notes is not None: fu.staff_notes = req.staff_notes
    if req.response_summary is not None: fu.response_summary = req.response_summary
    if req.response_status is not None: fu.response_status = req.response_status
    if req.next_action is not None: fu.next_action = req.next_action
    if req.interested_to_visit_again is not None: fu.interested_to_visit_again = req.interested_to_visit_again
    if req.contact_channel is not None: fu.contact_channel = req.contact_channel
    if req.status is not None or req.patient_feedback is not None:
        fu.last_contact_date = datetime.now(timezone.utc)
    if req.follow_up_date is not None: fu.follow_up_date = date.fromisoformat(req.follow_up_date)
    if req.follow_up_time is not None: fu.follow_up_time = time.fromisoformat(req.follow_up_time)
    if req.appointment_id is not None: fu.appointment_id = req.appointment_id
    if req.whatsapp_message is not None: fu.whatsapp_message = req.whatsapp_message
    # Sync linked appointment status
    if req.status is not None and fu.appointment_id:
        appt = await db.get(Appointment, fu.appointment_id)
        if appt:
            if req.status == "APPOINTMENT_BOOKED":
                appt.status = AppointmentStatus.SCHEDULED
            elif req.status == "COMPLETED":
                appt.status = AppointmentStatus.COMPLETED
            elif req.status == "LOST":
                appt.status = AppointmentStatus.CANCELLED
    patient_id = fu.patient_id
    await db.commit()
    if req.status is not None:
        svc = StatusAutomationService(db)
        await svc.update_followup_status(follow_up_id, FollowUpStatus(req.status))
        await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Follow-Up Updated",
        description=f"Follow-up status: {req.status or 'unchanged'}",
        module="CRM",
    )
    return {"success": True}


# --- Follow-Up Feedback ---

@router.post("/follow-ups/{follow_up_id}/feedback")
async def record_follow_up_feedback(
    follow_up_id: str, req: FollowUpFeedbackCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    fu = await db.get(FollowUp, follow_up_id)
    if not fu: raise HTTPException(status_code=404, detail="Follow-up not found")
    _verify_hospital_access(fu, current_user)
    now = datetime.now(timezone.utc)
    fu.response_status = req.response_status
    if req.patient_feedback is not None: fu.patient_feedback = req.patient_feedback
    if req.staff_notes is not None: fu.staff_notes = req.staff_notes
    if req.response_summary is not None: fu.response_summary = req.response_summary
    if req.next_action is not None: fu.next_action = req.next_action
    if req.contact_channel is not None: fu.contact_channel = req.contact_channel
    fu.last_contact_date = now
    # Update status based on response
    if req.response_status in ("NO_RESPONSE", "BUSY", "WRONG_NUMBER"):
        fu.status = FollowUpStatus.NO_RESPONSE.value
    elif req.response_status in ("NOT_INTERESTED",):
        fu.status = FollowUpStatus.LOST.value
    elif req.response_status in ("INTERESTED", "NEEDS_MORE_TIME", "REQUESTED_CALLBACK", "NEEDS_REVIEW"):
        fu.status = FollowUpStatus.CONTACTED.value
    elif req.response_status == "TREATMENT_COMPLETED":
        fu.status = FollowUpStatus.COMPLETED.value
    patient_id = fu.patient_id
    await db.commit()
    # Log to timeline
    svc = StatusAutomationService(db)
    await svc.update_followup_status(follow_up_id, FollowUpStatus(fu.status))
    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Follow-Up Feedback Recorded",
        description=f"Follow-up feedback: {req.response_status}",
        module="CRM",
    )
    return {"success": True}


@router.post("/follow-ups/{follow_up_id}/create-appointment")
async def create_appointment_from_follow_up(
    follow_up_id: str, req: CreateAppointmentFromFu,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    fu = await db.get(FollowUp, follow_up_id)
    if not fu: raise HTTPException(status_code=404, detail="Follow-up not found")
    _verify_hospital_access(fu, current_user)
    patient = await db.get(Patient, fu.patient_id)
    if not patient: raise HTTPException(status_code=404, detail="Patient not found")
    appt_date = date.fromisoformat(req.appointment_date)
    appt_time = time.fromisoformat(req.appointment_time)
    from app.models.appointment import Appointment
    appt = Appointment(
        patient_id=fu.patient_id, doctor_id=req.doctor_id,
        appointment_date=appt_date, appointment_time=appt_time,
        appointment_type=req.appointment_type,
    )
    db.add(appt)
    await db.flush()
    fu.appointment_id = appt.id
    fu.status = FollowUpStatus.APPOINTMENT_BOOKED.value
    fu.next_action = "BOOK_APPOINTMENT"
    fu.last_contact_date = datetime.now(timezone.utc)
    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=fu.patient_id,
        action="Appointment Booked from Follow-Up",
        description=f"Appointment booked from follow-up on {req.appointment_date}",
        module="CRM",
    )
    return {"success": True, "appointment_id": str(appt.id)}


@router.post("/follow-ups/{follow_up_id}/reschedule")
async def reschedule_follow_up(
    follow_up_id: str, req: RescheduleFollowUp,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    fu = await db.get(FollowUp, follow_up_id)
    if not fu: raise HTTPException(status_code=404, detail="Follow-up not found")
    _verify_hospital_access(fu, current_user)
    fu.follow_up_date = date.fromisoformat(req.follow_up_date)
    if req.follow_up_time:
        fu.follow_up_time = time.fromisoformat(req.follow_up_time)
    fu.status = FollowUpStatus.PENDING.value
    patient_id = fu.patient_id
    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Follow-Up Rescheduled",
        description=f"Follow-up rescheduled to {req.follow_up_date}",
        module="CRM",
    )
    return {"success": True, "new_date": req.follow_up_date}


@router.post("/follow-ups/{follow_up_id}/mark-completed")
async def mark_follow_up_completed(
    follow_up_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    fu = await db.get(FollowUp, follow_up_id)
    if not fu: raise HTTPException(status_code=404, detail="Follow-up not found")
    _verify_hospital_access(fu, current_user)
    fu.status = FollowUpStatus.COMPLETED.value
    fu.completed_date = datetime.now(timezone.utc)
    fu.completed_by = current_user.get("id")
    fu.last_contact_date = datetime.now(timezone.utc)
    patient_id = fu.patient_id
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Follow-Up Completed",
        description=f"Follow-up marked as completed",
        module="CRM",
    )
    try:
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        await publish_event(
            event_type=EventType.FOLLOWUP_COMPLETED,
            source_module=EventSource.FOLLOW_UP,
            entity_type="FOLLOW_UP",
            entity_id=follow_up_id,
            hospital_id=getattr(fu, 'hospital_id', None),
            patient_id=fu.patient_id,
            db=db,
        )
    except Exception:
        pass
    await db.commit()
    return {"success": True}


# --- Follow-Up Responses ---

class FollowUpResponseCreate(BaseModel):
    follow_up_id: str
    patient_id: str
    response_message: Optional[str] = None
    response_status: str = "NO_RESPONSE"


@router.post("/follow-ups/{follow_up_id}/response")
async def record_follow_up_response(
    follow_up_id: str,
    req: FollowUpResponseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    fu = await db.get(FollowUp, follow_up_id)
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    _verify_hospital_access(fu, current_user)
    fr = FollowUpResponse(
        follow_up_id=follow_up_id,
        patient_id=req.patient_id,
        hospital_id=fu.hospital_id,
        response_message=req.response_message,
        response_status=req.response_status)
    db.add(fr)
    fu.status = FollowUpStatus.COMPLETED.value
    patient_id = fu.patient_id
    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Follow-Up Response Recorded",
        description=f"Follow-up response: {req.response_status}",
        module="CRM",
    )
    return {"success": True, "id": str(fr.id)}


@router.get("/follow-up-responses/{patient_id}")
async def get_patient_follow_up_responses(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    pat = await db.get(Patient, patient_id)
    if not pat:
        raise HTTPException(status_code=404, detail="Patient not found")
    _verify_hospital_access(pat, current_user)
    q = select(FollowUpResponse).where(FollowUpResponse.patient_id == patient_id).order_by(desc(FollowUpResponse.created_at)).limit(30)
    result = await db.execute(q)
    items = result.scalars().all()
    enriched = []
    for r in items:
        follow_up = await db.get(FollowUp, r.follow_up_id) if r.follow_up_id else None
        doctor_name = None
        created_by_name = None
        if r.created_by:
            u = await db.get(User, r.created_by)
            if u: created_by_name = u.full_name
        if follow_up and follow_up.doctor_id:
            u = await db.get(User, follow_up.doctor_id)
            if u: doctor_name = u.full_name
        enriched.append({
            "id": str(r.id), "follow_up_id": str(r.follow_up_id),
            "patient_id": str(r.patient_id),
            "response_message": r.response_message,
            "response_status": r.response_status,
            "feedback": r.feedback,
            "follow_up_required": r.follow_up_required,
            "appointment_id": r.appointment_id,
            "follow_up_type": follow_up.follow_up_type if follow_up else None,
            "doctor_name": doctor_name,
            "created_by_name": created_by_name,
            "created_at": r.created_at.isoformat(),
        })
    return enriched


# --- Patient Segments ---

@router.get("/segments")
async def get_patient_segments(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_ALL_PATIENTS)
    hospital_id = current_user.get("hospital_id")
    base = select(Patient)
    if hospital_id: base = base.where(Patient.hospital_id == hospital_id)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    pending_q = base.where(Patient.status == "ACTIVE")
    pending_total = (await db.execute(select(func.count()).select_from(pending_q.subquery()))).scalar() or 0
    six_months_ago = date.today() - timedelta(days=180)
    no_visit = base.where(Patient.updated_at < six_months_ago)
    no_visit_count = (await db.execute(select(func.count()).select_from(no_visit.subquery()))).scalar() or 0
    completed = base.where(Patient.status == "COMPLETED")
    completed_count = (await db.execute(select(func.count()).select_from(completed.subquery()))).scalar() or 0
    return {
        "total_patients": total,
        "active_patients": pending_total,
        "no_visit_6_months": no_visit_count,
        "treatment_completed": completed_count,
    }


async def _get_today_messages(db: AsyncSession, hospital_id: Optional[str]) -> int:
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    q = select(func.count(CommunicationLog.id)).where(CommunicationLog.created_at >= today_start)
    if hospital_id: q = q.where(CommunicationLog.hospital_id == hospital_id)
    return (await db.execute(q)).scalar() or 0


async def _get_top_communication_days(db: AsyncSession, hospital_id: Optional[str], days: int = 30) -> list:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    q = select(
        func.date(CommunicationLog.created_at).label("day"),
        func.count(CommunicationLog.id).label("count")).where(CommunicationLog.created_at >= since)
    if hospital_id: q = q.where(CommunicationLog.hospital_id == hospital_id)
    q = q.group_by(func.date(CommunicationLog.created_at)).order_by(desc("count")).limit(5)
    result = await db.execute(q)
    return [{"date": str(r[0]), "count": r[1]} for r in result.all()]


async def _get_broadcast_success_rate(db: AsyncSession, hospital_id: Optional[str]) -> dict:
    q = select(CommunicationLog.channel, CommunicationLog.status, func.count(CommunicationLog.id))
    if hospital_id: q = q.where(CommunicationLog.hospital_id == hospital_id)
    q = q.group_by(CommunicationLog.channel, CommunicationLog.status)
    result = await db.execute(q)
    rows = result.all()
    total = sum(r[2] for r in rows)
    success = sum(r[2] for r in rows if r[1] in ("SENT", "DELIVERED", "READ"))
    return {
        "total": total,
        "successful": success,
        "failed": total - success,
        "success_rate": round(success / total * 100, 1) if total else 0,
    }


# --- CRM Analytics ---

@router.get("/analytics")
async def get_crm_analytics(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")
    base = select(CommunicationLog)
    if hospital_id: base = base.where(CommunicationLog.hospital_id == hospital_id)
    all_items = (await db.execute(base)).scalars().all()
    total = len(all_items)
    whatsapp = sum(1 for c in all_items if c.channel == "WHATSAPP")
    emails = sum(1 for c in all_items if c.channel == "EMAIL")
    delivered = sum(1 for c in all_items if c.status in ("DELIVERED", "READ"))
    read_count = sum(1 for c in all_items if c.status == "READ")
    appointment_reminders = sum(1 for c in all_items if c.message_type == "APPOINTMENT_REMINDER")
    payment_reminders = sum(1 for c in all_items if c.message_type == "PAYMENT_REMINDER")
    campaigns = sum(1 for c in all_items if c.message_type == "CAMPAIGN")
    feedback_q = select(PatientFeedback)
    if hospital_id: feedback_q = feedback_q.where(PatientFeedback.hospital_id == hospital_id)
    feedbacks = (await db.execute(feedback_q)).scalars().all()
    avg_rating = round(sum(f.rating for f in feedbacks) / len(feedbacks), 1) if feedbacks else 0
    today_count = await _get_today_messages(db, hospital_id)
    top_days = await _get_top_communication_days(db, hospital_id)
    success_rate = await _get_broadcast_success_rate(db, hospital_id)
    return {
        "total_messages": total,
        "whatsapp_sent": whatsapp,
        "emails_sent": emails,
        "campaigns_sent": campaigns,
        "delivery_rate": round(delivered / total * 100, 1) if total else 0,
        "read_rate": round(read_count / total * 100, 1) if total else 0,
        "appointment_reminders_sent": appointment_reminders,
        "payment_reminders_sent": payment_reminders,
        "todays_messages": today_count,
        "broadcast_success_rate": success_rate,
        "top_communication_days": top_days,
        "average_rating": avg_rating,
        "total_feedbacks": len(feedbacks),
    }


# --- WhatsApp Templates ---

class WhatsAppTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1)


class WhatsAppTemplateUpdate(BaseModel):
    name: Optional[str] = None
    message: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/whatsapp-templates")
async def list_whatsapp_templates(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    hospital_id = current_user.get("hospital_id")
    q = select(WhatsAppTemplate).where(WhatsAppTemplate.is_active == True)
    if hospital_id:
        q = q.where(WhatsAppTemplate.hospital_id == hospital_id)
    q = q.order_by(WhatsAppTemplate.created_at.desc())
    result = await db.execute(q)
    return [{"id": str(t.id), "name": t.name, "message": t.message, "is_active": t.is_active} for t in result.scalars().all()]


@router.post("/whatsapp-templates")
async def create_whatsapp_template(
    req: WhatsAppTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    hospital_id = current_user.get("hospital_id")
    t = WhatsAppTemplate(hospital_id=hospital_id, name=req.name, message=req.message)
    db.add(t)
    await db.commit()
    return {"id": str(t.id), "name": t.name}


@router.put("/whatsapp-templates/{template_id}")
async def update_whatsapp_template(
    template_id: str, req: WhatsAppTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    t = await db.get(WhatsAppTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    _verify_hospital_access(t, current_user)
    if req.name is not None: t.name = req.name
    if req.message is not None: t.message = req.message
    if req.is_active is not None: t.is_active = req.is_active
    await db.commit()
    return {"success": True}


@router.delete("/whatsapp-templates/{template_id}")
async def delete_whatsapp_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    t = await db.get(WhatsAppTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    _verify_hospital_access(t, current_user)
    await db.delete(t)
    await db.commit()
    return {"success": True}


# --- Comprehensive CRM Dashboard (All KPIs + Analytics) ---

@router.get("/dashboard2")
async def get_comprehensive_crm_dashboard(
    period: str = Query("this_month", description="today, this_week, this_month, this_quarter, this_year, custom"),
    start_date: Optional[str] = Query(None, description="Custom start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Custom end date (YYYY-MM-DD)"),
    doctor: Optional[str] = Query(None, description="Filter by doctor ID"),
    source: Optional[str] = Query(None, description="Filter by lead source"),
    campaign: Optional[str] = Query(None, description="Filter by campaign"),
    staff: Optional[str] = Query(None, description="Filter by staff ID"),
    lead_status: Optional[str] = Query(None, description="Filter by lead status"),
    treatment: Optional[str] = Query(None, description="Filter by treatment name"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")
    today = date.today()
    now = datetime.now(timezone.utc)

    # Date range helpers
    if period == "today":
        date_start = today
        date_end = today
    elif period == "this_week":
        date_start = today - timedelta(days=today.weekday())
        date_end = date_start + timedelta(days=6)
    elif period == "this_month":
        date_start = today.replace(day=1)
        date_end = today
    elif period == "this_quarter":
        q = (today.month - 1) // 3
        date_start = today.replace(month=q*3+1, day=1)
        date_end = today
    elif period == "this_year":
        date_start = today.replace(month=1, day=1)
        date_end = today
    elif period == "custom" and start_date and end_date:
        date_start = date.fromisoformat(start_date)
        date_end = date.fromisoformat(end_date)
    else:
        date_start = today.replace(day=1)
        date_end = today

    # Apply filters
    def apply_hospital(q):
        if hospital_id:
            return q.where(FollowUp.hospital_id == hospital_id)
        return q

    # =========================================================================
    # TOP KPI CARDS
    # =========================================================================
    # Leads
    lead_base = select(Lead)
    if hospital_id:
        lead_base = lead_base.where(Lead.hospital_id == hospital_id)
    if source:
        lead_base = lead_base.where(Lead.source.ilike(f"%{source}%"))
    if doctor:
        lead_base = lead_base.where(Lead.assigned_doctor_id == doctor)
    if campaign:
        lead_base = lead_base.where(Lead.source.ilike(f"%{campaign}%"))
    if staff:
        lead_base = lead_base.where(Lead.assigned_staff_id == staff)
    if lead_status:
        lead_base = lead_base.where(Lead.status == lead_status)
    if treatment:
        lead_base = lead_base.where(Lead.interested_treatment.ilike(f"%{treatment}%"))

    total_leads = (await db.execute(select(func.count()).select_from(lead_base.subquery()))).scalar() or 0
    new_leads_q = lead_base.where(Lead.created_at >= datetime.combine(date_start, datetime.min.time()))
    new_leads = (await db.execute(select(func.count()).select_from(new_leads_q.subquery()))).scalar() or 0
    converted_leads_q = lead_base.where(Lead.status == LeadStatus.CONVERTED.value)
    converted_leads = (await db.execute(select(func.count()).select_from(converted_leads_q.subquery()))).scalar() or 0
    conversion_rate = round((converted_leads / total_leads * 100), 1) if total_leads > 0 else 0

    # Revenue from CRM (leads that converted + their cases billing)
    crm_revenue = 0.0
    if hospital_id:
        conv_patient_ids_q = select(Lead.converted_patient_id).where(
            Lead.hospital_id == hospital_id,
            Lead.converted_patient_id.isnot(None),
            Lead.status == LeadStatus.CONVERTED.value)
    else:
        conv_patient_ids_q = select(Lead.converted_patient_id).where(
            Lead.converted_patient_id.isnot(None),
            Lead.status == LeadStatus.CONVERTED.value)
    conv_patient_ids = [row[0] for row in (await db.execute(conv_patient_ids_q)).all()]
    if conv_patient_ids:
        crm_case_ids_q = select(Case.id).where(Case.patient_id.in_(conv_patient_ids))
        crm_case_ids = [row[0] for row in (await db.execute(crm_case_ids_q)).all()]
        if crm_case_ids:
            crm_rev_q = select(func.coalesce(func.sum(Billing.paid_amount), 0)).where(Billing.case_id.in_(crm_case_ids))
            crm_rev_q = crm_rev_q.where(Billing.updated_at >= datetime.combine(date_start, datetime.min.time()))
            if period != "custom" and period not in ["today", "this_week", "this_month", "this_quarter", "this_year"]:
                crm_rev_q = crm_rev_q.where(Billing.updated_at <= datetime.combine(date_end, datetime.max.time()))
            crm_revenue = float((await db.execute(crm_rev_q)).scalar() or 0)

    cost_per_lead = round(crm_revenue / total_leads, 2) if total_leads > 0 else 0

    # Pending follow-ups today & pending enquiries
    fu_base = select(FollowUp)
    if hospital_id:
        fu_base = fu_base.where(FollowUp.hospital_id == hospital_id)
    if doctor:
        fu_base = fu_base.where(FollowUp.doctor_id == doctor)
    if treatment:
        fu_base = fu_base.join(Patient, Patient.id == FollowUp.patient_id).where(FollowUp.treatment_name.ilike(f"%{treatment}%"))
    pending_follow_ups_today_q = fu_base.where(
        FollowUp.follow_up_date == today,
        FollowUp.status.in_(["SCHEDULED", "PENDING"]))
    pending_follow_ups_today = (await db.execute(select(func.count()).select_from(pending_follow_ups_today_q.subquery()))).scalar() or 0
    pending_enquiries_q = fu_base.where(
        FollowUp.status.in_(["SCHEDULED", "PENDING", "CONTACTED", "NO_RESPONSE"]))
    pending_enquiries = (await db.execute(select(func.count()).select_from(pending_enquiries_q.subquery()))).scalar() or 0

    # =========================================================================
    # LEAD GROWTH TREND
    # =========================================================================
    lead_growth_trend = []
    for i in range(5, -1, -1):
        ym = today - timedelta(days=30 * i)
        m_start = ym.replace(day=1)
        m_q = lead_base.where(
            Lead.created_at >= datetime.combine(m_start, datetime.min.time()),
            Lead.created_at < datetime.combine((m_start + timedelta(days=32)).replace(day=1), datetime.min.time()))
        m_count = (await db.execute(select(func.count()).select_from(m_q.subquery()))).scalar() or 0
        lead_growth_trend.append({"month": m_start.strftime("%b %Y"), "count": m_count})

    # Leads by source with conversion stats
    leads_by_source = []
    lead_sources_raw = select(Lead.source, func.count(Lead.id).label("count")).where(Lead.source.isnot(None))
    if hospital_id:
        lead_sources_raw = lead_sources_raw.where(Lead.hospital_id == hospital_id)
    lead_sources_raw = lead_sources_raw.group_by(Lead.source).order_by(func.count(Lead.id).desc())
    lead_sources_rows = (await db.execute(lead_sources_raw)).all()
    for src, cnt in lead_sources_rows:
        conv_q = select(func.count(Lead.id)).where(Lead.source == src, Lead.converted_patient_id.isnot(None))
        if hospital_id:
            conv_q = conv_q.where(Lead.hospital_id == hospital_id)
        conv_count = (await db.execute(conv_q)).scalar() or 0
        pat_ids_q = select(Lead.converted_patient_id).where(Lead.source == src, Lead.converted_patient_id.isnot(None))
        if hospital_id:
            pat_ids_q = pat_ids_q.where(Lead.hospital_id == hospital_id)
        pat_ids = [r[0] for r in (await db.execute(pat_ids_q)).all()]
        revenue = 0.0
        if pat_ids:
            case_ids = [r[0] for r in (await db.execute(select(Case.id).where(Case.patient_id.in_(pat_ids)))).all()]
            if case_ids:
                revenue = float((await db.execute(select(func.coalesce(func.sum(Billing.paid_amount), 0)).where(Billing.case_id.in_(case_ids)))).scalar() or 0)
        leads_by_source.append({
            "source": src, "count": cnt, "converted": conv_count,
            "conversion_rate": round((conv_count / cnt) * 100, 1) if cnt > 0 else 0,
            "revenue": revenue,
            "avg_revenue_per_lead": round(revenue / cnt, 2) if cnt > 0 else 0,
        })

    # Leads by staff
    leads_by_staff_raw = select(Lead.assigned_staff_id, func.count(Lead.id).label("count"))
    if hospital_id:
        leads_by_staff_raw = leads_by_staff_raw.where(Lead.hospital_id == hospital_id)
    leads_by_staff_raw = leads_by_staff_raw.where(Lead.assigned_staff_id.isnot(None)).group_by(Lead.assigned_staff_id).order_by(func.count(Lead.id).desc())
    leads_by_staff_rows = (await db.execute(leads_by_staff_raw)).all()
    leads_by_staff = []
    for staff_id, cnt in leads_by_staff_rows:
        staff_user = await db.get(User, staff_id)
        leads_by_staff.append({"staff_id": staff_id, "staff_name": staff_user.full_name if staff_user else "Unknown", "count": cnt})

    # Leads by doctor
    leads_by_doctor_raw = select(Lead.assigned_doctor_id, func.count(Lead.id).label("count"))
    if hospital_id:
        leads_by_doctor_raw = leads_by_doctor_raw.where(Lead.hospital_id == hospital_id)
    leads_by_doctor_raw = leads_by_doctor_raw.where(Lead.assigned_doctor_id.isnot(None)).group_by(Lead.assigned_doctor_id).order_by(func.count(Lead.id).desc())
    leads_by_doctor_rows = (await db.execute(leads_by_doctor_raw)).all()
    leads_by_doctor = []
    for doc_id, cnt in leads_by_doctor_rows:
        doc = await db.get(User, doc_id) if doc_id else None
        leads_by_doctor.append({"doctor_id": doc_id, "doctor_name": doc.full_name if doc else "Unknown", "count": cnt})

    # Leads by status
    leads_by_status_raw = select(Lead.status, func.count(Lead.id).label("count"))
    if hospital_id:
        leads_by_status_raw = leads_by_status_raw.where(Lead.hospital_id == hospital_id)
    leads_by_status_raw = leads_by_status_raw.group_by(Lead.status).order_by(func.count(Lead.id).desc())
    leads_by_status = [{"status": r[0], "count": r[1]} for r in (await db.execute(leads_by_status_raw)).all()]

    # Lead timeline (recent)
    lead_timeline = (await db.execute(
        lead_base.order_by(Lead.created_at.desc()).limit(20)
    )).scalars().all()
    lead_timeline_data = [{
        "id": str(l.id), "lead_name": l.lead_name, "status": l.status,
        "created_at": l.created_at.isoformat() if l.created_at else None,
        "source": l.source,
    } for l in lead_timeline]

    # Lead score distribution (hot/warm/cold/lost)
    score_categories = [("Hot (81-100)", 81, 100), ("Warm (61-80)", 61, 80), ("Cold (21-60)", 21, 60), ("Lost (0-20)", 0, 20)]
    all_leads_for_scores = (await db.execute(lead_base.add_columns(Lead.lead_score))).all()
    score_distribution = []
    for label, lo, hi in score_categories:
        cnt = sum(1 for row in all_leads_for_scores if row.lead_score is not None and lo <= row.lead_score <= hi)
        score_distribution.append({"category": label, "count": cnt})
 
    # =========================================================================
    # LEAD CONVERSION FUNNEL
    # =========================================================================
    funnel_stages = ["Lead", "Contacted", "Interested", "Appointment Booked", "Visited", "Converted"]
    funnel_data = []
    lead_status_map = {
        "Lead": "NEW",
        "Contacted": "CONTACTED",
        "Interested": "INTERESTED",
        "Appointment Booked": "APPOINTMENT_BOOKED",
        "Visited": "VISITED",
        "Converted": "CONVERTED",
    }
    prev_count = total_leads
    for stage in funnel_stages:
        status_val = lead_status_map.get(stage)
        if status_val == "NEW":
            stage_count = total_leads
        else:
            stage_q = lead_base.where(Lead.status == status_val)
            stage_count = (await db.execute(select(func.count()).select_from(stage_q.subquery()))).scalar() or 0
        pct = round((stage_count / total_leads * 100), 1) if total_leads > 0 else 0
        drop_off = prev_count - stage_count
        drop_rate = round((drop_off / prev_count * 100), 1) if prev_count > 0 else 0
        funnel_data.append({
            "stage": stage, "count": stage_count, "percentage": pct,
            "drop_off": drop_off, "drop_rate": drop_rate,
        })
        prev_count = stage_count

    # =========================================================================
    # LEAD DASHBOARD (recent leads)
    # =========================================================================
    recent_leads_q = lead_base.order_by(Lead.created_at.desc()).limit(50)
    recent_leads_rows = (await db.execute(recent_leads_q)).scalars().all()
    recent_leads_data = []
    for l in recent_leads_rows:
        staff_name = None
        if l.assigned_staff_id:
            u = await db.get(User, l.assigned_staff_id)
            staff_name = u.full_name if u else None
        doc_name = None
        if l.assigned_doctor_id:
            d = await db.get(User, l.assigned_doctor_id)
            doc_name = d.full_name if d else None
        recent_leads_data.append({
            "id": str(l.id), "lead_name": l.lead_name, "mobile": l.mobile,
            "email": l.email, "source": l.source,
            "assigned_staff": staff_name, "assigned_doctor": doc_name,
            "status": l.status, "lead_score": l.lead_score,
            "interested_treatment": l.interested_treatment,
            "budget": float(l.budget) if l.budget else 0,
            "last_contacted_at": l.last_contacted_at.isoformat() if l.last_contacted_at else None,
            "next_follow_up_date": l.next_follow_up_date.isoformat() if l.next_follow_up_date else None,
            "created_at": l.created_at.isoformat() if l.created_at else None,
        })

    # =========================================================================
    # ENQUIRY DASHBOARD
    # =========================================================================
    tomorrow = today + timedelta(days=1)
    week_end = today + timedelta(days=6 - today.weekday())

    todays_enquiries_q = fu_base.where(FollowUp.follow_up_date == today)
    todays_enquiries_count = (await db.execute(select(func.count()).select_from(todays_enquiries_q.subquery()))).scalar() or 0
    tomorrows_enquiries_q = fu_base.where(FollowUp.follow_up_date == tomorrow)
    tomorrows_enquiries_count = (await db.execute(select(func.count()).select_from(tomorrows_enquiries_q.subquery()))).scalar() or 0
    this_week_enquiries_q = fu_base.where(FollowUp.follow_up_date.between(today, week_end))
    this_week_enquiries_count = (await db.execute(select(func.count()).select_from(this_week_enquiries_q.subquery()))).scalar() or 0
    overdue_enquiries_q = fu_base.where(
        FollowUp.follow_up_date < today,
        FollowUp.status.notin_(["COMPLETED", "LOST"]))
    overdue_enquiries_count = (await db.execute(select(func.count()).select_from(overdue_enquiries_q.subquery()))).scalar() or 0
    completed_enquiries_q = fu_base.where(FollowUp.status == "COMPLETED")
    completed_enquiries_count = (await db.execute(select(func.count()).select_from(completed_enquiries_q.subquery()))).scalar() or 0
    six_month_recall_q = fu_base.where(
        FollowUp.follow_up_type == "6_MONTH_RECALL",
        FollowUp.follow_up_date <= today)
    six_month_recall_count = (await db.execute(select(func.count()).select_from(six_month_recall_q.subquery()))).scalar() or 0

    # Today's enquiries detail
    todays_enquiries_detail_q = fu_base.where(FollowUp.follow_up_date == today).order_by(FollowUp.follow_up_time).limit(50)
    todays_enquiries_rows = (await db.execute(todays_enquiries_detail_q)).scalars().all()
    todays_enquiries_detail = []
    for fu in todays_enquiries_rows:
        patient = await db.get(Patient, fu.patient_id) if fu.patient_id else None
        doctor = await db.get(User, fu.doctor_id) if fu.doctor_id else None
        priority = "High" if fu.follow_up_type == "1_DAY_POST_TREATMENT" else "Medium" if fu.follow_up_type == "MANUAL" else "Low"
        billing_date = None
        if fu.billing_id:
            billing = await db.get(Billing, fu.billing_id)
            billing_date = billing.created_at.isoformat() if billing else None
        todays_enquiries_detail.append({
            "id": str(fu.id), "patient_id": str(fu.patient_id) if fu.patient_id else None,
            "patient_name": patient.full_name if patient else "Unknown",
            "phone": patient.phone if patient else None,
            "treatment": fu.treatment_name,
            "doctor_name": doctor.full_name if doctor else None,
            "follow_up_date": fu.follow_up_date.isoformat(),
            "enquiry_due_date": fu.follow_up_date.isoformat(),
            "follow_up_type": fu.follow_up_type,
            "status": fu.status, "notes": fu.notes,
            "enquiry_source": patient.patient_source if patient else None,
            "priority": priority,
            "assigned_staff": doctor.full_name if doctor else None,
            "billing_date": billing_date,
        })

    # =========================================================================
    # FOLLOW-UP DASHBOARD
    # =========================================================================
    pending_fu_q = fu_base.where(FollowUp.status.in_(["SCHEDULED", "PENDING"]), FollowUp.follow_up_date == today)
    pending_follow_ups = (await db.execute(select(func.count()).select_from(pending_fu_q.subquery()))).scalar() or 0
    completed_follow_ups_q = fu_base.where(FollowUp.status == "COMPLETED", FollowUp.follow_up_date == today)
    completed_follow_ups = (await db.execute(select(func.count()).select_from(completed_follow_ups_q.subquery()))).scalar() or 0
    response_fu_q = fu_base.where(FollowUp.status == "OPEN", FollowUp.follow_up_date == today)
    response_follow_ups = (await db.execute(select(func.count()).select_from(response_fu_q.subquery()))).scalar() or 0
    # Feedback count from FollowUpResponse (today)
    feedback_base = select(func.count(FollowUpResponse.id)).where(
        FollowUpResponse.created_at >= datetime.combine(today, datetime.min.time()),
        FollowUpResponse.created_at < datetime.combine(today + timedelta(days=1), datetime.min.time()))
    if hospital_id:
        feedback_base = feedback_base.where(FollowUpResponse.hospital_id == hospital_id)
    feedback_count = (await db.execute(feedback_base)).scalar() or 0
    overdue_count = (await db.execute(select(func.count()).select_from(
        fu_base.where(FollowUp.follow_up_date < today, FollowUp.status.in_(["SCHEDULED", "PENDING", "OPEN"])).subquery()
    ))).scalar() or 0

    # Recent follow-ups detail — only today's active follow-ups
    today_fu_base = fu_base.where(
        FollowUp.follow_up_date == today,
        FollowUp.status.in_(["SCHEDULED", "PENDING", "OPEN"]))
    recent_follow_ups_q = today_fu_base.order_by(FollowUp.follow_up_time.asc().nullslast(), FollowUp.created_at.desc()).limit(50)
    recent_follow_ups_rows = (await db.execute(recent_follow_ups_q)).scalars().all()
    recent_follow_ups_data = []
    for fu in recent_follow_ups_rows:
        patient = await db.get(Patient, fu.patient_id) if fu.patient_id else None
        doctor = await db.get(User, fu.doctor_id) if fu.doctor_id else None
        recent_follow_ups_data.append({
            "id": str(fu.id), "patient_id": str(fu.patient_id) if fu.patient_id else None,
            "patient_name": patient.full_name if patient else "Unknown",
            "patient_phone": patient.phone if patient else None,
            "doctor_name": doctor.full_name if doctor else None,
            "status": fu.status, "follow_up_type": fu.follow_up_type,
            "follow_up_date": fu.follow_up_date.isoformat(),
            "follow_up_time": str(fu.follow_up_time) if fu.follow_up_time else None,
            "notes": fu.notes,
            "created_at": fu.created_at.isoformat() if fu.created_at else None,
            "treatment_name": fu.treatment_name,
        })

    # Follow-up analytics
    successful_follow_ups_q = fu_base.where(FollowUp.status == "COMPLETED")
    successful_follow_ups = (await db.execute(select(func.count()).select_from(successful_follow_ups_q.subquery()))).scalar() or 0
    failed_follow_ups_q = fu_base.where(FollowUp.status == "LOST")
    failed_follow_ups = (await db.execute(select(func.count()).select_from(failed_follow_ups_q.subquery()))).scalar() or 0

    # Follow-ups by staff
    fu_by_staff_raw = select(FollowUp.doctor_id, func.count(FollowUp.id).label("count"))
    if hospital_id:
        fu_by_staff_raw = fu_by_staff_raw.where(FollowUp.hospital_id == hospital_id)
    fu_by_staff_raw = fu_by_staff_raw.where(FollowUp.doctor_id.isnot(None)).group_by(FollowUp.doctor_id).order_by(func.count(FollowUp.id).desc())
    fu_by_staff_rows = (await db.execute(fu_by_staff_raw)).all()
    follow_ups_by_staff = []
    for doc_id, cnt in fu_by_staff_rows:
        d = await db.get(User, doc_id)
        follow_ups_by_staff.append({"doctor_id": doc_id, "doctor_name": d.full_name if d else "Unknown", "count": cnt})

    # Follow-ups by outcome
    fu_by_outcome_raw = select(FollowUp.status, func.count(FollowUp.id).label("count"))
    if hospital_id:
        fu_by_outcome_raw = fu_by_outcome_raw.where(FollowUp.hospital_id == hospital_id)
    fu_by_outcome_raw = fu_by_outcome_raw.group_by(FollowUp.status).order_by(func.count(FollowUp.id).desc())
    follow_ups_by_outcome = [{"status": r[0], "count": r[1]} for r in (await db.execute(fu_by_outcome_raw)).all()]

    # Follow-up completion rate
    total_fu = (await db.execute(select(func.count()).select_from(fu_base.subquery()))).scalar() or 0
    fu_completion_rate = round((completed_follow_ups / total_fu * 100), 1) if total_fu > 0 else 0

    # Follow-ups by source (via patient)
    fu_by_source_raw = select(Patient.patient_source, func.count(FollowUp.id).label("count")).select_from(FollowUp).join(Patient, Patient.id == FollowUp.patient_id).where(Patient.patient_source.isnot(None))
    if hospital_id:
        fu_by_source_raw = fu_by_source_raw.where(FollowUp.hospital_id == hospital_id)
    fu_by_source_raw = fu_by_source_raw.group_by(Patient.patient_source).order_by(func.count(FollowUp.id).desc()).limit(10)
    follow_ups_by_source = [{"source": r[0], "count": r[1]} for r in (await db.execute(fu_by_source_raw)).all()]

    # Avg response time (hours between created_at and follow_up_date)
    avg_response_raw = select(func.coalesce(func.avg(
        func.extract("epoch", FollowUp.completed_date - FollowUp.created_at) / 3600
    ), 0)).where(FollowUp.completed_date.isnot(None), FollowUp.created_at.isnot(None))
    if hospital_id:
        avg_response_raw = avg_response_raw.where(FollowUp.hospital_id == hospital_id)
    avg_response_hours = float((await db.execute(avg_response_raw)).scalar() or 0)

    # Lead conversion from follow-ups
    fu_conversion_raw = select(func.count(Lead.id)).select_from(FollowUp).join(Patient, Patient.id == FollowUp.patient_id, isouter=True).join(Lead, Lead.converted_patient_id == Patient.id, isouter=True).where(Lead.id.isnot(None))
    if hospital_id:
        fu_conversion_raw = fu_conversion_raw.where(FollowUp.hospital_id == hospital_id)
    lead_conversion_from_fu = (await db.execute(fu_conversion_raw)).scalar() or 0

    # =========================================================================
    # CALL ANALYTICS
    # =========================================================================
    # We track calls through LeadCommunication / CommunicationLog
    call_base = select(CommunicationLog).where(CommunicationLog.channel == "CALL")
    if hospital_id:
        call_base = call_base.where(CommunicationLog.hospital_id == hospital_id)

    total_calls = (await db.execute(select(func.count()).select_from(call_base.subquery()))).scalar() or 0
    # Also check LeadCall records
    lead_call_base = select(LeadCall)
    if hospital_id:
        lead_call_base = lead_call_base.join(Lead, LeadCall.lead_id == Lead.id).where(Lead.hospital_id == hospital_id)
    total_lead_calls = (await db.execute(select(func.count()).select_from(lead_call_base.subquery()))).scalar() or 0
    total_calls += total_lead_calls

    answered_calls_q = call_base.where(CommunicationLog.status == "SENT")
    answered_calls = (await db.execute(select(func.count()).select_from(answered_calls_q.subquery()))).scalar() or 0
    missed_calls = total_calls - answered_calls

    outgoing_calls = total_lead_calls
    incoming_calls = total_calls - outgoing_calls

    # Avg duration from LeadCall
    avg_duration_q = select(func.coalesce(func.avg(LeadCall.duration_seconds), 0))
    if hospital_id:
        avg_duration_q = avg_duration_q.select_from(LeadCall).join(Lead, LeadCall.lead_id == Lead.id).where(Lead.hospital_id == hospital_id)
    avg_duration = float((await db.execute(avg_duration_q)).scalar() or 0)

    # Calls per day
    calls_per_day_raw = select(
        func.date(CommunicationLog.created_at).label("day"),
        func.count(CommunicationLog.id).label("count")).where(CommunicationLog.channel == "CALL")
    if hospital_id:
        calls_per_day_raw = calls_per_day_raw.where(CommunicationLog.hospital_id == hospital_id)
    calls_per_day_raw = calls_per_day_raw.group_by(func.date(CommunicationLog.created_at)).order_by(func.date(CommunicationLog.created_at).desc()).limit(30)
    calls_per_day = [{"day": str(r[0]), "count": r[1]} for r in (await db.execute(calls_per_day_raw)).all()]

    # =========================================================================
    # WHATSAPP ANALYTICS
    # =========================================================================
    wa_base = select(CommunicationLog).where(CommunicationLog.channel == "WHATSAPP")
    if hospital_id:
        wa_base = wa_base.where(CommunicationLog.hospital_id == hospital_id)

    messages_sent = (await db.execute(select(func.count()).select_from(wa_base.subquery()))).scalar() or 0
    broadcast_messages_q = wa_base.where(CommunicationLog.message_type == "CAMPAIGN")
    broadcast_messages = (await db.execute(select(func.count()).select_from(broadcast_messages_q.subquery()))).scalar() or 0
    appointment_reminders_q = wa_base.where(CommunicationLog.message_type == "APPOINTMENT_REMINDER")
    appointment_reminders = (await db.execute(select(func.count()).select_from(appointment_reminders_q.subquery()))).scalar() or 0
    recall_messages_q = wa_base.where(CommunicationLog.message_type == "RECALL")
    recall_messages = (await db.execute(select(func.count()).select_from(recall_messages_q.subquery()))).scalar() or 0
    enquiry_messages_q = wa_base.where(CommunicationLog.message_type == "ENQUIRY")
    enquiry_messages = (await db.execute(select(func.count()).select_from(enquiry_messages_q.subquery()))).scalar() or 0
    lead_messages_q = wa_base.where(CommunicationLog.message_type == "LEAD")
    lead_messages = (await db.execute(select(func.count()).select_from(lead_messages_q.subquery()))).scalar() or 0

    # Messages by day
    wa_by_day_raw = select(
        func.date(CommunicationLog.created_at).label("day"),
        func.count(CommunicationLog.id).label("count")).where(CommunicationLog.channel == "WHATSAPP")
    if hospital_id:
        wa_by_day_raw = wa_by_day_raw.where(CommunicationLog.hospital_id == hospital_id)
    wa_by_day_raw = wa_by_day_raw.group_by(func.date(CommunicationLog.created_at)).order_by(func.date(CommunicationLog.created_at).desc()).limit(30)
    messages_by_day = [{"day": str(r[0]), "count": r[1]} for r in (await db.execute(wa_by_day_raw)).all()]

    # Messages by template
    wa_by_template_raw = select(
        CommunicationLog.message_type,
        func.count(CommunicationLog.id).label("count")).where(CommunicationLog.channel == "WHATSAPP")
    if hospital_id:
        wa_by_template_raw = wa_by_template_raw.where(CommunicationLog.hospital_id == hospital_id)
    wa_by_template_raw = wa_by_template_raw.group_by(CommunicationLog.message_type).order_by(func.count(CommunicationLog.id).desc())
    messages_by_template = [{"template": r[0] or "General", "count": r[1]} for r in (await db.execute(wa_by_template_raw)).all()]

    # Messages by staff
    wa_by_staff_raw = select(CommunicationLog.doctor_id, func.count(CommunicationLog.id).label("count")).where(CommunicationLog.channel == "WHATSAPP", CommunicationLog.doctor_id.isnot(None))
    if hospital_id:
        wa_by_staff_raw = wa_by_staff_raw.where(CommunicationLog.hospital_id == hospital_id)
    wa_by_staff_raw = wa_by_staff_raw.group_by(CommunicationLog.doctor_id).order_by(func.count(CommunicationLog.id).desc()).limit(10)
    wa_by_staff_rows = (await db.execute(wa_by_staff_raw)).all()
    messages_by_staff = []
    for sid, cnt in wa_by_staff_rows:
        u = await db.get(User, sid) if sid else None
        messages_by_staff.append({"staff_id": sid, "staff_name": u.full_name if u else "Unknown", "count": cnt})

    # =========================================================================
    # PATIENT ACQUISITION ANALYTICS (via Patient.source → Case → Billing)
    # =========================================================================
    pat_source_patterns = {
        "Lead": ("Lead"),
        "Google Search": ("GOOGLE_SEARCH", "Google Search"),
        "Google Maps": ("GOOGLE_MAPS", "Google Maps"),
        "Instagram": ("INSTAGRAM", "Instagram"),
        "Facebook": ("FACEBOOK", "Facebook"),
        "WhatsApp": ("WHATSAPP", "WhatsApp"),
        "Website": ("WEBSITE", "Website"),
        "Referral": ("REFERRAL", "Referral - Existing Patient", "Referral - Doctor", "Referral - Clinic"),
        "Walk-In": ("WALK_IN", "Walk-In"),
        "Campaign": ("CAMPAIGN", "Campaign"),
        "Doctor Referral": ("DOCTOR_REFERRAL", "CLINIC_REFERRAL"),
    }
    all_pat_sources = {v for vals in pat_source_patterns.values() for v in vals} | {"OTHER"}
    acquisition_sources = ["Lead", "Google Search", "Google Maps", "Instagram", "Facebook", "WhatsApp", "Website", "Referral", "Walk-In", "Campaign", "Doctor Referral", "Other"]
    acquisition_data = []
    for src_display in acquisition_sources:
        if src_display == "Lead":
            src_filter = Patient.patient_source == "Lead"
        elif src_display == "Other":
            src_filter = ~Patient.patient_source.in_(all_pat_sources)
        else:
            patterns = pat_source_patterns.get(src_display)
            if patterns:
                src_filter = Patient.patient_source.in_(patterns)
            else:
                src_filter = Patient.patient_source.ilike(f"%{src_display}%")
        pat_q = select(Patient.id).where(src_filter, Patient.patient_source.isnot(None))
        if hospital_id:
            pat_q = pat_q.where(Patient.hospital_id == hospital_id)
        pids = [r[0] for r in (await db.execute(pat_q)).all()]
        src_patients = len(pids)
        src_revenue = 0.0
        if pids:
            cids = [r[0] for r in (await db.execute(select(Case.id).where(Case.patient_id.in_(pids)))).all()]
            if cids:
                src_revenue = float((await db.execute(
                    select(func.coalesce(func.sum(Billing.paid_amount), 0)).where(Billing.case_id.in_(cids))
                )).scalar() or 0)
        acquisition_data.append({
            "source": src_display, "patients": src_patients,
            "revenue": src_revenue,
            "conversion_rate": 0,
        })

    # =========================================================================
    # REVENUE ATTRIBUTION (via Patient.source → Case → Billing)
    # =========================================================================
    pat_source_list = ["Lead", "Google Search", "Google Maps", "Instagram", "Facebook", "WhatsApp", "Website", "Referral", "Walk-In", "Campaign", "Doctor Referral", "Other"]

    revenue_by_source_data = []
    for src_display in pat_source_list:
        if src_display == "Lead":
            src_filter = Patient.patient_source == "Lead"
        elif src_display == "Other":
            src_filter = ~Patient.patient_source.in_(all_pat_sources)
        else:
            patterns = pat_source_patterns.get(src_display)
            if patterns:
                src_filter = Patient.patient_source.in_(patterns)
            else:
                src_filter = Patient.patient_source.ilike(f"%{src_display}%")
        pat_q = select(Patient.id).where(src_filter, Patient.patient_source.isnot(None))
        if hospital_id:
            pat_q = pat_q.where(Patient.hospital_id == hospital_id)
        pids = [r[0] for r in (await db.execute(pat_q)).all()]
        rev = 0.0
        if pids:
            cids = [r[0] for r in (await db.execute(select(Case.id).where(Case.patient_id.in_(pids)))).all()]
            if cids:
                rev = float((await db.execute(
                    select(func.coalesce(func.sum(Billing.paid_amount), 0)).where(Billing.case_id.in_(cids))
                )).scalar() or 0)
        revenue_by_source_data.append({"source": src_display, "revenue": rev})

    # Revenue by doctor with proper hospital + doctor isolation
    revenue_by_doctor_data = []
    doc_rev_raw = select(
        Case.doctor_id,
        func.coalesce(func.sum(Billing.paid_amount), 0).label("paid_amount"),
        func.coalesce(func.sum(Billing.pending_amount), 0).label("pending_amount"),
        func.coalesce(func.sum(Billing.total_amount), 0).label("total_amount"),
        func.count(func.distinct(Case.patient_id)).label("patient_count"),
        func.count(func.distinct(Case.id)).label("treatment_count")).select_from(Case).join(Billing, Billing.case_id == Case.id).join(Patient, Patient.id == Case.patient_id).where(Case.doctor_id.isnot(None))
    if hospital_id:
        doc_rev_raw = doc_rev_raw.where(Patient.hospital_id == hospital_id)
        doc_rev_raw = doc_rev_raw.where(
            Case.doctor_id.in_(
                select(User.id).where(User.hospital_id == hospital_id, User.role == "DOCTOR")
            )
        )
    doc_rev_raw = doc_rev_raw.group_by(Case.doctor_id).order_by(func.sum(Billing.paid_amount).desc())
    for row in (await db.execute(doc_rev_raw)).all():
        d = await db.get(User, row.doctor_id)
        paid = float(row.paid_amount)
        total = float(row.total_amount)
        patients = row.patient_count
        treatments = row.treatment_count
        avg_billing = round(total / treatments, 2) if treatments > 0 else 0
        revenue_by_doctor_data.append({
            "doctor_id": row.doctor_id, "doctor_name": d.full_name if d else "Unknown",
            "paid_amount": paid, "pending_amount": float(row.pending_amount),
            "total_amount": total, "patient_count": patients,
            "treatment_count": treatments, "avg_billing_value": avg_billing,
        })

    # Revenue by treatment (with patients + avg ticket)
    revenue_by_treatment_data = []
    tp_rev_raw = select(
        TreatmentPlan.treatment_name,
        func.coalesce(func.sum(Billing.paid_amount), 0).label("revenue"),
        func.count(func.distinct(Case.patient_id)).label("patients"),
        func.count(func.distinct(TreatmentPlan.id)).label("treatments")).select_from(TreatmentPlan).join(Case, Case.id == TreatmentPlan.case_id, isouter=True).join(Patient, Patient.id == Case.patient_id, isouter=True).join(Billing, Billing.case_id == Case.id, isouter=True).where(TreatmentPlan.treatment_name.isnot(None))
    if hospital_id:
        tp_rev_raw = tp_rev_raw.where(Patient.hospital_id == hospital_id)
    tp_rev_raw = tp_rev_raw.group_by(TreatmentPlan.treatment_name).order_by(func.sum(Billing.paid_amount).desc()).limit(10)
    for row in (await db.execute(tp_rev_raw)).all():
        rev = float(row.revenue)
        pats = row.patients
        revenue_by_treatment_data.append({
            "treatment": row.treatment_name, "revenue": rev,
            "patients": pats, "avg_ticket_size": round(rev / pats, 2) if pats > 0 else 0,
        })

    # Revenue trend (monthly)
    revenue_trend_data = []
    for i in range(5, -1, -1):
        ym = today - timedelta(days=30 * i)
        m_start = ym.replace(day=1)
        m_end = (m_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        m_rev = 0.0
        m_cases_q = select(Case.id)
        if hospital_id:
            m_pids = [row[0] for row in (await db.execute(select(Patient.id).where(Patient.hospital_id == hospital_id))).all()]
            if m_pids:
                m_cases_q = m_cases_q.where(Case.patient_id.in_(m_pids))
        m_cids = [row[0] for row in (await db.execute(m_cases_q)).all()]
        if m_cids:
            m_rev = float((await db.execute(
                select(func.coalesce(func.sum(Billing.paid_amount), 0)).where(
                    Billing.case_id.in_(m_cids),
                    Billing.updated_at >= datetime.combine(m_start, datetime.min.time()),
                    Billing.updated_at <= datetime.combine(m_end, datetime.max.time()))
            )).scalar() or 0)
        revenue_trend_data.append({"month": m_start.strftime("%b %Y"), "revenue": m_rev})

    # =========================================================================
    # CALENDAR WIDGET DATA
    # =========================================================================
    calendar_enquiries = (await db.execute(
        select(func.count()).select_from(fu_base.where(FollowUp.follow_up_date == today).subquery())
    )).scalar() or 0
    calendar_appointments = (await db.execute(
        select(func.count(Appointment.id)).where(Appointment.appointment_date == today)
    )).scalar() or 0

    # =========================================================================
    # ALERTS & REMINDERS
    # =========================================================================
    high_priority_leads_q = lead_base.where(Lead.priority == "HIGH", Lead.status != LeadStatus.CONVERTED.value)
    high_priority_leads = (await db.execute(select(func.count()).select_from(high_priority_leads_q.subquery()))).scalar() or 0
    missed_calls_action_q = lead_call_base.where(LeadCall.outcome.is_(None))
    missed_calls_action = (await db.execute(select(func.count()).select_from(missed_calls_action_q.subquery()))).scalar() or 0
    upcoming_appts_q = select(func.count(Appointment.id)).where(Appointment.appointment_date == today, Appointment.status == "SCHEDULED")
    upcoming_appointments = (await db.execute(upcoming_appts_q)).scalar() or 0

    # Low conversion alert
    low_conversion_alert = conversion_rate < 20

    # Patient acquisition count (total patients accumulated)
    pat_base = select(Patient)
    if hospital_id:
        pat_base = pat_base.where(Patient.hospital_id == hospital_id)
    patient_acquisition_total = (await db.execute(select(func.count()).select_from(pat_base.subquery()))).scalar() or 0

    # Lead sources count (distinct)
    ls_base = select(Lead.source).distinct().where(Lead.source.isnot(None))
    if hospital_id:
        ls_base = ls_base.where(Lead.hospital_id == hospital_id)
    lead_sources_count = len((await db.execute(ls_base)).scalars().all())

    kpis = {
        "total_leads": total_leads,
        "new_leads": new_leads,
        "converted_leads": converted_leads,
        "conversion_rate": conversion_rate,
        "total_follow_ups": total_fu,
        "pending_follow_ups_today": pending_follow_ups_today,
        "pending_follow_ups": pending_follow_ups,
        "completed_follow_ups": completed_follow_ups,
        "response_follow_ups": response_follow_ups,
        "feedback_count": feedback_count,
        "patient_acquisition": patient_acquisition_total,
        "lead_sources": lead_sources_count,
    }

    # =========================================================================
    # REVENUE FROM LEADS TREND
    # =========================================================================
    revenue_from_leads_trend = []
    for i in range(5, -1, -1):
        ym = today - timedelta(days=30 * i)
        m_start = ym.replace(day=1)
        m_end = (m_start + timedelta(days=32)).replace(day=1)
        rev_q = select(
            Lead.source,
            func.coalesce(func.sum(Billing.paid_amount), 0).label('revenue'),
            func.count(func.distinct(Lead.id)).label('lead_count')).select_from(Lead).join(
            Patient, Lead.converted_patient_id == Patient.id
        ).join(
            Case, Case.patient_id == Patient.id
        ).join(
            Billing, Billing.case_id == Case.id
        ).where(
            Lead.converted_patient_id.isnot(None),
            Billing.paid_amount > 0,
            Billing.created_at >= datetime.combine(m_start, datetime.min.time()),
            Billing.created_at < datetime.combine(m_end, datetime.min.time()))
        if hospital_id:
            rev_q = rev_q.where(Lead.hospital_id == hospital_id)
        rev_q = rev_q.group_by(Lead.source)
        rev_rows = (await db.execute(rev_q)).all()
        sources_data = [{"source": r[0], "revenue": float(r[1] or 0), "lead_count": r[2]} for r in rev_rows]
        total_rev = sum(s["revenue"] for s in sources_data)
        revenue_from_leads_trend.append({
            "month": m_start.strftime("%b %Y"),
            "total_revenue": total_rev,
            "by_source": sources_data,
        })

    return {
        "kpis": kpis,
        "lead_analytics": {
            "growth_trend": lead_growth_trend,
            "by_source": leads_by_source,
            "by_staff": leads_by_staff,
            "by_doctor": leads_by_doctor,
            "by_status": leads_by_status,
            "timeline": lead_timeline_data,
            "score_distribution": score_distribution,
            "score_distribution_categories": [s["category"] for s in score_distribution],
        },
        "conversion_analytics": {
            "revenue_generated": crm_revenue,
            "conversion_trend": lead_growth_trend,
            "top_sources": leads_by_source[:5],
            "top_staff": leads_by_staff[:5],
        },
        "revenue_by_doctor": revenue_by_doctor_data,
        "revenue_from_leads_trend": revenue_from_leads_trend,
        "lead_dashboard": recent_leads_data,
        "enquiry_dashboard": {
            "today": todays_enquiries_count,
            "tomorrow": tomorrows_enquiries_count,
            "this_week": this_week_enquiries_count,
            "overdue": overdue_enquiries_count,
            "completed": completed_enquiries_count,
            "six_month_recall": six_month_recall_count,
            "todays_detail": todays_enquiries_detail,
        },
        "follow_up_dashboard": {
            "pending": pending_follow_ups,
            "completed": completed_follow_ups,
            "response": response_follow_ups,
            "feedback": feedback_count,
            "recent": recent_follow_ups_data,
        },
        "follow_up_analytics": {
            "total_follow_ups": total_fu,
            "completed_follow_ups": completed_follow_ups,
            "pending_follow_ups": pending_follow_ups,
            "response_follow_ups": response_follow_ups,
            "feedback_count": feedback_count,
            "successful_follow_ups": successful_follow_ups,
            "failed_follow_ups": failed_follow_ups,
            "by_staff": follow_ups_by_staff,
            "by_doctor": leads_by_doctor[:10],
            "by_source": follow_ups_by_source,
            "by_outcome": follow_ups_by_outcome,
            "completion_rate": fu_completion_rate,
            "avg_response_time": round(avg_response_hours, 1),
            "lead_conversion_from_fu": lead_conversion_from_fu,
        },
        "call_analytics": {
            "total_calls": total_calls,
            "answered_calls": answered_calls,
            "missed_calls": missed_calls,
            "outgoing_calls": outgoing_calls,
            "incoming_calls": incoming_calls,
            "avg_duration": round(avg_duration, 0),
            "calls_per_day": calls_per_day,
        },
        "whatsapp_analytics": {
            "messages_sent": messages_sent,
            "broadcast_messages": broadcast_messages,
            "appointment_reminders": appointment_reminders,
            "recall_messages": recall_messages,
            "enquiry_messages": enquiry_messages,
            "lead_messages": lead_messages,
            "messages_by_day": messages_by_day,
            "messages_by_template": messages_by_template,
            "messages_by_staff": messages_by_staff,
        },
        "patient_acquisition": acquisition_data,
        "calendar_widget": {
            "enquiries": calendar_enquiries,
            "follow_ups": pending_follow_ups_today,
            "appointments": calendar_appointments,
        },
        "alerts": {
            "overdue_follow_ups": overdue_count,
            "response_follow_ups": response_follow_ups,
            "feedback_count": feedback_count,
            "high_priority_leads": high_priority_leads,
            "missed_calls_action": missed_calls_action,
            "pending_enquiries": pending_enquiries,
            "upcoming_appointments": upcoming_appointments,
            "recall_patients_due": six_month_recall_count,
            "low_conversion_alert": low_conversion_alert,
        },
    }


# --- CRM Dashboard (Follow-Up Reminders + Metrics) ---

@router.get("/dashboard")
async def get_crm_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")
    today = date.today()

    base = select(FollowUp)
    if hospital_id:
        base = base.where(FollowUp.hospital_id == hospital_id)

    # Today's follow-ups
    today_q = base.where(FollowUp.follow_up_date == today)
    today_fus = (await db.execute(today_q.order_by(FollowUp.follow_up_time).limit(50))).scalars().all()

    # Separate treatment follow-up types vs recall types
    treatment_fu_types = ["1_DAY_FOLLOW_UP", "7_DAY_FOLLOW_UP"]
    recall_types = ["6_MONTH_RECALL", "12_MONTH_RECALL", "CUSTOM_FOLLOW_UP"]

    async def _count(extra_filters):
        q = base.where(*extra_filters)
        result = await db.execute(select(func.count()).select_from(q.subquery()))
        return result.scalar() or 0

    # Follow-up metrics (treatment follow-ups only)
    total_fu = await _count([FollowUp.follow_up_type.in_(treatment_fu_types)])
    pending_fu = await _count([FollowUp.follow_up_type.in_(treatment_fu_types), FollowUp.status.in_(["PENDING", "CONTACTED", "NO_RESPONSE"])])
    completed_fu = await _count([FollowUp.follow_up_type.in_(treatment_fu_types), FollowUp.status == "COMPLETED"])
    overdue_fu = await _count([FollowUp.follow_up_type.in_(treatment_fu_types), FollowUp.follow_up_date < today, FollowUp.status.in_(["PENDING", "CONTACTED", "NO_RESPONSE"])])
    one_day_due = await _count([FollowUp.follow_up_type == "1_DAY_FOLLOW_UP", FollowUp.follow_up_date == today])

    # Recall metrics (recalls only)
    total_rec = await _count([FollowUp.follow_up_type.in_(recall_types)])
    pending_rec = await _count([FollowUp.follow_up_type.in_(recall_types), FollowUp.status.in_(["PENDING", "CONTACTED", "NO_RESPONSE"])])
    completed_rec = await _count([FollowUp.follow_up_type.in_(recall_types), FollowUp.status == "COMPLETED"])
    overdue_rec = await _count([FollowUp.follow_up_type.in_(recall_types), FollowUp.follow_up_date < today, FollowUp.status.in_(["PENDING", "CONTACTED", "NO_RESPONSE"])])
    six_month_due = await _count([FollowUp.follow_up_type == "6_MONTH_RECALL", FollowUp.follow_up_date == today])
    twelve_month_due = await _count([FollowUp.follow_up_type == "12_MONTH_RECALL", FollowUp.follow_up_date == today])

    # Enquiry metrics
    enq_base = select(func.count(Enquiry.id))
    if hospital_id:
        enq_base = enq_base.where(Enquiry.hospital_id == hospital_id)
    total_enquiries = (await db.execute(enq_base)).scalar() or 0
    new_enquiries = (await db.execute(enq_base.where(Enquiry.status == "NEW"))).scalar() or 0
    contacted_enquiries = (await db.execute(enq_base.where(Enquiry.status == "CONTACTED"))).scalar() or 0
    interested_enquiries = (await db.execute(enq_base.where(Enquiry.status == "INTERESTED"))).scalar() or 0
    converted_enquiries = (await db.execute(enq_base.where(Enquiry.status == "CONVERTED"))).scalar() or 0
    lost_enquiries = (await db.execute(enq_base.where(Enquiry.status.in_(["NOT_INTERESTED", "LOST"])))).scalar() or 0

    # Response rate (treatment follow-ups only)
    responded = await _count([FollowUp.follow_up_type.in_(treatment_fu_types), FollowUp.status.in_(["RESPONDED", "APPOINTMENT_BOOKED", "COMPLETED"])])
    # WhatsApp messages sent (treatment follow-ups only)
    whatsapp_sent = await _count([FollowUp.follow_up_type.in_(treatment_fu_types), FollowUp.whatsapp_sent_at.isnot(None)])
    whatsapp_responded = await _count([FollowUp.follow_up_type.in_(treatment_fu_types), FollowUp.whatsapp_sent_at.isnot(None), FollowUp.status.in_(["RESPONDED", "APPOINTMENT_BOOKED", "COMPLETED"])])

    # Patient source analytics
    patient_base = select(Patient)
    if hospital_id:
        patient_base = patient_base.where(Patient.hospital_id == hospital_id)
    source_counts_q = select(
        Patient.patient_source, func.count(Patient.id).label("count")
    ).where(Patient.patient_source.isnot(None))
    if hospital_id:
        source_counts_q = source_counts_q.where(Patient.hospital_id == hospital_id)
    source_counts_q = source_counts_q.group_by(Patient.patient_source).order_by(func.count(Patient.id).desc())
    source_counts = (await db.execute(source_counts_q)).all()
    patients_by_source = [{"source": row[0], "count": row[1]} for row in source_counts]
    total_patients_with_source = sum(row[1] for row in source_counts) or 1
    top_source = patients_by_source[0]["source"] if patients_by_source else None

    # Revenue by source (with patient count)
    revenue_by_source_q = select(
        Patient.patient_source,
        func.coalesce(func.sum(Billing.paid_amount), 0).label("revenue"),
        func.count(Patient.id.distinct()).label("patients")
    ).select_from(Patient
    ).outerjoin(Case, Case.patient_id == Patient.id
    ).outerjoin(Billing, Billing.case_id == Case.id
    ).where(Patient.patient_source.isnot(None))
    if hospital_id:
        revenue_by_source_q = revenue_by_source_q.where(Patient.hospital_id == hospital_id)
    revenue_by_source_q = revenue_by_source_q.group_by(Patient.patient_source).order_by(func.sum(Billing.paid_amount).desc())
    revenue_rows = (await db.execute(revenue_by_source_q)).all()
    revenue_by_source = [{"source": row[0], "revenue": float(row[1]), "patients": row[2]} for row in revenue_rows]

    # New patients this month
    month_start = today.replace(day=1)
    new_this_month_q = select(func.count(Patient.id)).where(Patient.created_at >= month_start)
    if hospital_id:
        new_this_month_q = new_this_month_q.where(Patient.hospital_id == hospital_id)
    new_this_month = (await db.execute(new_this_month_q)).scalar() or 0

    # Top referral source
    referral_prefixes = ["Referral - "]
    referral_sources = [r for r in patients_by_source if any(r["source"].startswith(p) for p in referral_prefixes)]
    top_referral = max(referral_sources, key=lambda r: r["count"]) if referral_sources else None

    # Monthly patient acquisition by source (last 6 months)
    monthly_acquisition = []
    for i in range(5, -1, -1):
        ym = today - timedelta(days=30 * i)
        m_start = ym.replace(day=1)
        if i > 0:
            m_end = (ym.replace(day=1) + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        else:
            m_end = today
        m_sources_q = select(
            Patient.patient_source, func.count(Patient.id).label("count")
        ).where(
            Patient.patient_source.isnot(None),
            Patient.created_at >= m_start,
            Patient.created_at <= m_end)
        if hospital_id:
            m_sources_q = m_sources_q.where(Patient.hospital_id == hospital_id)
        m_sources_q = m_sources_q.group_by(Patient.patient_source)
        m_rows = (await db.execute(m_sources_q)).all()
        month_label = m_start.strftime("%b %Y")
        monthly_acquisition.append({
            "month": month_label,
            "sources": [{"source": row[0], "count": row[1]} for row in m_rows],
        })

    # Campaign analytics
    campaign_base = patient_base.where(Patient.patient_source == "Campaign")
    campaign_patients = (await db.execute(select(func.count()).select_from(campaign_base.subquery()))).scalar() or 0
    campaign_revenue_q = select(
        func.coalesce(func.sum(Billing.paid_amount), 0)
    ).select_from(Patient
    ).outerjoin(Case, Case.patient_id == Patient.id
    ).outerjoin(Billing, Billing.case_id == Case.id
    ).where(Patient.patient_source == "Campaign")
    if hospital_id:
        campaign_revenue_q = campaign_revenue_q.where(Patient.hospital_id == hospital_id)
    campaign_revenue = float((await db.execute(campaign_revenue_q)).scalar() or 0)
    total_revenue_all = float((await db.execute(
        select(func.coalesce(func.sum(Billing.paid_amount), 0)).select_from(Billing)
    )).scalar() or 1)
    campaign_roi = round((campaign_revenue / total_revenue_all) * 100, 1) if total_revenue_all else 0

    # Enrich today's follow-ups with patient + doctor names + billing info
    enriched = []
    for fu in today_fus:
        patient = await db.get(Patient, fu.patient_id)
        doctor = await db.get(User, fu.doctor_id) if fu.doctor_id else None
        case = await db.get(Case, fu.case_id) if fu.case_id else None
        invoice_number = None
        billing_id = fu.billing_id
        if not billing_id and case:
            billing_r = await db.execute(
                select(Billing).where(Billing.case_id == case.id).order_by(Billing.created_at.desc()).limit(1)
            )
            b = billing_r.scalar_one_or_none()
            if b:
                billing_id = str(b.id)
                invoice_number = b.invoice_number
        elif billing_id:
            b = await db.get(Billing, billing_id)
            if b:
                invoice_number = b.invoice_number
        enriched.append({
            "id": str(fu.id), "patient_id": str(fu.patient_id),
            "patient_name": patient.full_name if patient else "Unknown",
            "patient_phone": patient.phone if patient else None,
            "doctor_id": str(fu.doctor_id) if fu.doctor_id else None,
            "doctor_name": doctor.full_name if doctor else None,
            "hospital_id": str(fu.hospital_id) if fu.hospital_id else None,
            "case_id": str(fu.case_id) if fu.case_id else None,
            "appointment_id": str(fu.appointment_id) if fu.appointment_id else None,
            "billing_id": billing_id,
            "invoice_number": invoice_number,
            "follow_up_date": fu.follow_up_date.isoformat(),
            "follow_up_time": str(fu.follow_up_time) if fu.follow_up_time else None,
            "follow_up_type": fu.follow_up_type,
            "treatment_name": fu.treatment_name,
            "treatment_completed_date": fu.treatment_completed_date.isoformat() if fu.treatment_completed_date else None,
            "notes": fu.notes, "status": fu.status,
            "reminder_sent": fu.reminder_sent,
            "completed_date": fu.completed_date.isoformat() if fu.completed_date else None,
            "whatsapp_sent_at": fu.whatsapp_sent_at.isoformat() if fu.whatsapp_sent_at else None,
            "call_made_at": fu.call_made_at.isoformat() if fu.call_made_at else None,
            "created_at": fu.created_at.isoformat(),
        })

    return {
        "todays_follow_ups": enriched,
        "metrics": {
            "todays_follow_ups_count": len(enriched),
            "total_follow_ups": total_fu,
            "pending_follow_ups": pending_fu,
            "completed_follow_ups": completed_fu,
            "overdue_follow_ups": overdue_fu,
            "one_day_follow_ups_due": one_day_due,
            "six_month_recalls_due": six_month_due,
            # Separated recall metrics
            "total_recalls": total_rec,
            "pending_recalls": pending_rec,
            "completed_recalls": completed_rec,
            "overdue_recalls": overdue_rec,
            "twelve_month_recalls_due": twelve_month_due,
            "response_rate": round(responded / total_fu * 100, 1) if total_fu else 0,
            "recall_success_rate": round(six_month_due / (six_month_due or 1) * 100, 1) if six_month_due else 0,
            "whatsapp_messages_sent": whatsapp_sent,
            "whatsapp_response_rate": round(whatsapp_responded / (whatsapp_sent or 1) * 100, 1) if whatsapp_sent else 0,
            # Enquiry metrics
            "total_enquiries": total_enquiries,
            "new_enquiries": new_enquiries,
            "contacted_enquiries": contacted_enquiries,
            "interested_enquiries": interested_enquiries,
            "converted_enquiries": converted_enquiries,
            "lost_enquiries": lost_enquiries,
            "enquiry_conversion_rate": round(converted_enquiries / (total_enquiries or 1) * 100, 1) if total_enquiries else 0,
        },
        "source_analytics": {
            "patients_by_source": patients_by_source,
            "total_patients_with_source": total_patients_with_source,
            "top_source": top_source,
            "top_referral_source": top_referral["source"] if top_referral else None,
            "top_referral_count": top_referral["count"] if top_referral else 0,
            "new_patients_this_month": new_this_month,
            "revenue_by_source": revenue_by_source,
            "monthly_acquisition": monthly_acquisition,
            "campaign_patients": campaign_patients,
            "campaign_revenue": campaign_revenue,
            "campaign_roi": campaign_roi,
            "highest_revenue_source": max(revenue_by_source, key=lambda r: r["revenue"]) if revenue_by_source else None,
            "highest_patient_source": max(patients_by_source, key=lambda r: r["count"]) if patients_by_source else None,
        },
    }


# --- Patient Source Analytics Drawer ---

@router.get("/source-analytics")
async def get_source_analytics(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    hospital_id = current_user.get("hospital_id")
    today = date.today()

    patient_base = select(Patient)
    if hospital_id:
        patient_base = patient_base.where(Patient.hospital_id == hospital_id)

    source_counts_q = patient_base.where(Patient.patient_source.isnot(None)).add_columns(
        Patient.patient_source, func.count(Patient.id).label("count")
    ).group_by(Patient.patient_source).order_by(func.count(Patient.id).desc())
    source_counts = (await db.execute(source_counts_q)).all()
    patients_by_source = [{"source": row[0], "count": row[1]} for row in source_counts]
    total_with_source = sum(row[1] for row in source_counts) or 1

    revenue_q = select(
        Patient.patient_source,
        func.coalesce(func.sum(Billing.paid_amount), 0).label("revenue"),
        func.count(Patient.id).label("count")).join(Case, Case.patient_id == Patient.id, isouter=True
    ).join(Billing, Billing.case_id == Case.id, isouter=True
    ).where(Patient.patient_source.isnot(None))
    if hospital_id:
        revenue_q = revenue_q.where(Patient.hospital_id == hospital_id)
    revenue_q = revenue_q.group_by(Patient.patient_source)
    revenue_rows = (await db.execute(revenue_q)).all()
    revenue_by_source = [{"source": r[0], "revenue": float(r[1]), "patients": r[2]} for r in revenue_rows]

    # Monthly trends (last 12 months)
    monthly_trends = []
    for i in range(11, -1, -1):
        ym = today - timedelta(days=30 * i)
        m_start = ym.replace(day=1)
        m_sources_q = patient_base.where(
            Patient.patient_source.isnot(None),
            Patient.created_at >= m_start,
            Patient.created_at <= (m_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)).add_columns(
            Patient.patient_source, func.count(Patient.id).label("count")
        ).group_by(Patient.patient_source)
        m_rows = (await db.execute(m_sources_q)).all()
        monthly_trends.append({
            "month": m_start.strftime("%b %Y"),
            "sources": [{"source": r[0], "count": r[1]} for r in m_rows],
        })

    # Growth percentage (comparing this month vs last month)
    this_month_start = today.replace(day=1)
    last_month_end = this_month_start - timedelta(days=1)
    last_month_start = last_month_end.replace(day=1)
    this_month_count = (await db.execute(
        select(func.count(Patient.id)).where(
            Patient.created_at >= this_month_start,
            Patient.patient_source.isnot(None))
    )).scalar() or 0
    last_month_count = (await db.execute(
        select(func.count(Patient.id)).where(
            Patient.created_at >= last_month_start,
            Patient.created_at <= last_month_end,
            Patient.patient_source.isnot(None))
    )).scalar() or 0
    growth_pct = round((this_month_count - last_month_count) / (last_month_count or 1) * 100, 1)

    return {
        "patients_by_source": patients_by_source,
        "revenue_by_source": revenue_by_source,
        "monthly_trends": monthly_trends,
        "growth_percentage": growth_pct,
        "total_patients_with_source": total_with_source,
        "highest_revenue_source": max(revenue_by_source, key=lambda r: r["revenue"]) if revenue_by_source else None,
        "highest_patient_source": max(patients_by_source, key=lambda r: r["count"]) if patients_by_source else None,
    }


# --- Enhanced Follow-Up List with Filters ---

@router.get("/follow-ups/list")
async def list_follow_ups_filtered(
    filter: Optional[str] = Query(None),
    follow_up_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    patient_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    hospital_id = current_user.get("hospital_id")
    today = date.today()
    q = select(FollowUp)
    if hospital_id:
        q = q.where(FollowUp.hospital_id == hospital_id)
    if patient_id:
        q = q.where(FollowUp.patient_id == patient_id)
    if follow_up_type:
        q = q.where(FollowUp.follow_up_type == follow_up_type)
    if status:
        q = q.where(FollowUp.status == status)

    if filter == "today":
        q = q.where(FollowUp.follow_up_date == today)
    elif filter == "tomorrow":
        q = q.where(FollowUp.follow_up_date == today + timedelta(days=1))
    elif filter == "this_week":
        end = today + timedelta(days=6 - today.weekday())
        q = q.where(FollowUp.follow_up_date.between(today, end))
    elif filter == "this_month":
        q = q.where(
            FollowUp.follow_up_date >= today.replace(day=1),
            FollowUp.follow_up_date <= today.replace(day=1) + timedelta(days=31))
    elif filter == "overdue":
        q = q.where(
            FollowUp.follow_up_date < today,
            FollowUp.status.in_(["SCHEDULED", "PENDING", "CONTACTED", "NO_RESPONSE"]))
    elif filter == "one_day":
        q = q.where(FollowUp.follow_up_type == "1_DAY_POST_TREATMENT")
    elif filter == "six_month":
        q = q.where(FollowUp.follow_up_type == "6_MONTH_RECALL")
    elif filter == "completed":
        q = q.where(FollowUp.status == "COMPLETED")
    elif filter == "pending":
        q = q.where(FollowUp.status.in_(["SCHEDULED", "PENDING", "CONTACTED", "NO_RESPONSE"]))

    q = q.order_by(desc(FollowUp.follow_up_date)).limit(100)
    result = await db.execute(q)
    items = result.scalars().all()

    enriched = []
    for fu in items:
        patient = await db.get(Patient, fu.patient_id)
        doctor = await db.get(User, fu.doctor_id) if fu.doctor_id else None
        invoice_number = None
        billing_id = fu.billing_id
        if not billing_id and fu.case_id:
            billing_r = await db.execute(
                select(Billing).where(Billing.case_id == fu.case_id).order_by(Billing.created_at.desc()).limit(1)
            )
            b = billing_r.scalar_one_or_none()
            if b:
                billing_id = str(b.id)
                invoice_number = b.invoice_number
        elif billing_id:
            b = await db.get(Billing, billing_id)
            if b:
                invoice_number = b.invoice_number
        enriched.append({
            "id": str(fu.id), "patient_id": str(fu.patient_id),
            "patient_name": patient.full_name if patient else "Unknown",
            "patient_phone": patient.phone if patient else None,
            "doctor_id": str(fu.doctor_id) if fu.doctor_id else None,
            "doctor_name": doctor.full_name if doctor else None,
            "hospital_id": str(fu.hospital_id) if fu.hospital_id else None,
            "case_id": str(fu.case_id) if fu.case_id else None,
            "appointment_id": str(fu.appointment_id) if fu.appointment_id else None,
            "billing_id": billing_id,
            "invoice_number": invoice_number,
            "follow_up_date": fu.follow_up_date.isoformat(),
            "follow_up_time": str(fu.follow_up_time) if fu.follow_up_time else None,
            "follow_up_type": fu.follow_up_type,
            "treatment_name": fu.treatment_name,
            "treatment_completed_date": fu.treatment_completed_date.isoformat() if fu.treatment_completed_date else None,
            "notes": fu.notes, "status": fu.status,
            "reminder_sent": fu.reminder_sent,
            "completed_date": fu.completed_date.isoformat() if fu.completed_date else None,
            "whatsapp_sent_at": fu.whatsapp_sent_at.isoformat() if fu.whatsapp_sent_at else None,
            "call_made_at": fu.call_made_at.isoformat() if fu.call_made_at else None,
            "whatsapp_message": fu.whatsapp_message,
            "call_notes": fu.call_notes,
            "created_at": fu.created_at.isoformat(),
        })
    return enriched


# --- Follow-Up Actions ---

class MarkDoneRequest(BaseModel):
    notes: Optional[str] = None


@router.post("/follow-ups/{follow_up_id}/mark-done")
async def mark_follow_up_done(
    follow_up_id: str,
    req: MarkDoneRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    fu = await db.get(FollowUp, follow_up_id)
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    _verify_hospital_access(fu, current_user)
    fu.status = FollowUpStatus.COMPLETED.value
    fu.completed_date = datetime.now(timezone.utc)
    fu.completed_by = current_user.get("sub")
    if req.notes:
        fu.notes = (fu.notes or "") + "\n[Done] " + req.notes
    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=fu.patient_id,
        action="Follow-Up Marked Done",
        description=f"Follow-up marked as completed",
        module="CRM",
    )
    return {"success": True}


class LogCommunicationRequest(BaseModel):
    channel: str = "WHATSAPP"
    message: str = Field(..., min_length=1, max_length=1000)
    notes: Optional[str] = None


@router.post("/follow-ups/{follow_up_id}/communicate")
async def log_follow_up_communication(
    follow_up_id: str,
    req: LogCommunicationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    fu = await db.get(FollowUp, follow_up_id)
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    _verify_hospital_access(fu, current_user)

    hospital_id = current_user.get("hospital_id") or fu.hospital_id
    patient = await db.get(Patient, fu.patient_id)

    if req.channel == "WHATSAPP":
        if not patient or not patient.phone:
            raise HTTPException(status_code=400, detail="Patient has no phone number")
        from app.routers.whatsapp_messaging import resolve_variables, render_message, unresolved_in_message
        ctx = await resolve_variables(db, patient.id, hospital_id)
        rendered = render_message(req.message, ctx["resolved"])
        missing = unresolved_in_message(rendered, ctx["resolved"])
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Cannot send: unresolved variables {', '.join(missing)}. Resolve or remove them before sending.",
            )
        provider = WhatsAppProvider()
        success = await provider.send_message(patient.phone, rendered)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to send WhatsApp")
        fu.whatsapp_message = rendered
        fu.whatsapp_sent_at = datetime.now(timezone.utc)
        fu.status = FollowUpStatus.PENDING.value
        comm_status = CommunicationStatus.SENT.value
    elif req.channel == "CALL":
        fu.call_made_at = datetime.now(timezone.utc)
        if req.notes:
            fu.call_notes = (fu.call_notes or "") + "\n" + req.notes
        fu.status = FollowUpStatus.PENDING.value
        comm_status = CommunicationStatus.SENT.value
    else:
        raise HTTPException(status_code=400, detail="Invalid channel. Use WHATSAPP or CALL")

    log = CommunicationLog(
        patient_id=fu.patient_id,
        hospital_id=hospital_id,
        doctor_id=current_user.get("sub"),
        follow_up_id=follow_up_id,
        channel=req.channel,
        message_type="FOLLOW_UP",
        message=rendered if req.channel == "WHATSAPP" else req.message,
        status=comm_status,
        sent_at=datetime.now(timezone.utc))
    db.add(log)
    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=fu.patient_id,
        action="Follow-Up Communication Sent",
        description=f"{req.channel} communication sent for follow-up",
        module="CRM",
    )
    return {"success": True, "log_id": str(log.id)}


class RecordResponseRequest(BaseModel):
    response_message: Optional[str] = None
    response_status: str = "POSITIVE"
    feedback: Optional[str] = None


@router.post("/follow-ups/{follow_up_id}/record-response")
async def record_follow_up_response_crm(
    follow_up_id: str,
    req: RecordResponseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    fu = await db.get(FollowUp, follow_up_id)
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    _verify_hospital_access(fu, current_user)

    feedback_val = req.feedback
    if not feedback_val:
        if req.response_status == "POSITIVE":
            feedback_val = "POSITIVE"
        elif req.response_status in ("NEEDS_ATTENTION", "COMPLAINT"):
            feedback_val = "NEGATIVE"
        elif req.response_status == "EMERGENCY":
            feedback_val = "NEGATIVE"
        elif req.response_status == "NO_RESPONSE":
            feedback_val = "NEUTRAL"

    fr = FollowUpResponse(
        follow_up_id=follow_up_id,
        patient_id=fu.patient_id,
        hospital_id=fu.hospital_id,
        response_message=req.response_message,
        response_status=req.response_status,
        feedback=feedback_val,
        follow_up_required=req.response_status in ("NEEDS_ATTENTION", "COMPLAINT", "EMERGENCY"),
        created_by=current_user.get("sub"))
    db.add(fr)

    if req.response_status == "POSITIVE":
        fu.status = FollowUpStatus.COMPLETED.value
    elif req.response_status in ("NEEDS_ATTENTION", "COMPLAINT", "EMERGENCY"):
        fu.status = FollowUpStatus.PENDING.value
    else:
        fu.status = FollowUpStatus.COMPLETED.value

    fu.completed_date = datetime.now(timezone.utc)
    fu.completed_by = current_user.get("sub")

    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=fu.patient_id,
        action="Follow-Up Response Recorded",
        description=f"Response recorded ({req.response_status})",
        module="CRM",
    )
    return {
        "success": True,
        "response_id": str(fr.id),
    }


class CreateFollowUpFromEnquiryRequest(BaseModel):
    patient_id: str
    response_id: str
    follow_up_reason: str = Field(..., min_length=1, max_length=500)
    priority: str = Field(default="NORMAL")
    doctor_id: str
    follow_up_date: date
    follow_up_time: Optional[time] = None
    notes: Optional[str] = None


@router.post("/enquiry/create-follow-up")
async def create_follow_up_from_enquiry(
    req: CreateFollowUpFromEnquiryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    hospital_id = current_user.get("hospital_id")
    if not hospital_id:
        raise HTTPException(status_code=400, detail="User has no hospital assigned")

    # Verify the response exists
    response = await db.get(FollowUpResponse, req.response_id)
    if not response:
        raise HTTPException(status_code=404, detail="Response not found")

    # Verify patient
    patient = await db.get(Patient, req.patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Create appointment first
    now = datetime.now(timezone.utc)
    appt = Appointment(
        patient_id=req.patient_id,
        doctor_id=req.doctor_id,
        appointment_date=req.follow_up_date,
        appointment_time=req.follow_up_time or now.time(),
        status=AppointmentStatus.SCHEDULED,
        appointment_type=AppointmentType.FOLLOW_UP,
        notes=f"Follow-Up: {req.follow_up_reason}" + (f"\n{req.notes}" if req.notes else ""))
    db.add(appt)
    await db.flush()

    # Create follow-up record
    follow_up = FollowUp(
        patient_id=req.patient_id,
        hospital_id=hospital_id,
        doctor_id=req.doctor_id,
        follow_up_date=req.follow_up_date,
        follow_up_time=req.follow_up_time,
        follow_up_type=FollowUpType.MANUAL.value,
        notes=req.notes or req.follow_up_reason,
        appointment_id=str(appt.id),
        status=FollowUpStatus.PENDING.value,
        created_at=now)
    db.add(follow_up)
    await db.flush()

    # Update the response
    response.follow_up_required = True
    response.appointment_id = str(appt.id)

    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=req.patient_id,
        action="Follow-Up Created from Enquiry",
        description=f"Follow-up created from enquiry response for {patient.full_name}",
        module="CRM",
    )
    return {
        "success": True,
        "follow_up_id": str(follow_up.id),
        "appointment_id": str(appt.id),
        "patient_name": patient.full_name,
        "doctor_id": req.doctor_id,
        "follow_up_date": req.follow_up_date.isoformat(),
    }


# --- 6-Month Recall Dashboard ---

@router.get("/recalls/due-today")
async def get_recalls_due_today(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    hospital_id = current_user.get("hospital_id")
    today = date.today()
    q = select(FollowUp).where(
        FollowUp.follow_up_type == "6_MONTH_RECALL",
        FollowUp.follow_up_date == today)
    if hospital_id:
        q = q.where(FollowUp.hospital_id == hospital_id)
    q = q.order_by(FollowUp.follow_up_time).limit(50)
    result = await db.execute(q)
    items = result.scalars().all()
    enriched = []
    for fu in items:
        patient = await db.get(Patient, fu.patient_id)
        doctor = await db.get(User, fu.doctor_id) if fu.doctor_id else None
        case = await db.get(Case, fu.case_id) if fu.case_id else None
        enriched.append({
            "id": str(fu.id), "patient_id": str(fu.patient_id),
            "patient_name": patient.full_name if patient else "Unknown",
            "patient_phone": patient.phone if patient else None,
            "doctor_name": doctor.full_name if doctor else None,
            "treatment_name": fu.treatment_name,
            "treatment_completed_date": fu.treatment_completed_date.isoformat() if fu.treatment_completed_date else None,
            "follow_up_date": fu.follow_up_date.isoformat(),
            "status": fu.status,
        })
    return enriched


# --- Follow-Up History for Patient Detail ---

@router.get("/patients/{patient_id}/follow-up-history")
async def get_patient_follow_up_history(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    pat = await db.get(Patient, patient_id)
    if not pat:
        raise HTTPException(status_code=404, detail="Patient not found")
    _verify_hospital_access(pat, current_user)
    q = select(FollowUp).where(FollowUp.patient_id == patient_id).order_by(desc(FollowUp.created_at)).limit(50)
    result = await db.execute(q)
    items = result.scalars().all()
    enriched = []
    for fu in items:
        doctor = await db.get(User, fu.doctor_id) if fu.doctor_id else None
        enriched.append({
            "id": str(fu.id), "follow_up_type": fu.follow_up_type,
            "treatment_name": fu.treatment_name,
            "follow_up_date": fu.follow_up_date.isoformat(),
            "status": fu.status, "notes": fu.notes,
            "doctor_name": doctor.full_name if doctor else None,
            "completed_date": fu.completed_date.isoformat() if fu.completed_date else None,
            "completed_by": fu.completed_by,
            "whatsapp_sent_at": fu.whatsapp_sent_at.isoformat() if fu.whatsapp_sent_at else None,
            "call_made_at": fu.call_made_at.isoformat() if fu.call_made_at else None,
            "created_at": fu.created_at.isoformat(),
        })
    return enriched


# --- Enquiry Dashboard ---

@router.get("/enquiry/dashboard")
async def get_enquiry_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    hospital_id = current_user.get("hospital_id")
    today = date.today()
    base = select(FollowUp)
    if hospital_id:
        base = base.where(FollowUp.hospital_id == hospital_id)

    total_q = base
    total = (await db.execute(select(func.count()).select_from(total_q.subquery()))).scalar() or 0

    today_q = base.where(FollowUp.follow_up_date == today)
    todays_enquiries = (await db.execute(select(func.count()).select_from(today_q.subquery()))).scalar() or 0

    pending_q = base.where(FollowUp.status.in_(["SCHEDULED", "PENDING", "CONTACTED", "NO_RESPONSE"]))
    pending = (await db.execute(select(func.count()).select_from(pending_q.subquery()))).scalar() or 0

    completed_q = base.where(FollowUp.status == "COMPLETED")
    completed = (await db.execute(select(func.count()).select_from(completed_q.subquery()))).scalar() or 0

    emergency_q = select(FollowUpResponse).where(FollowUpResponse.response_status == "EMERGENCY")
    if hospital_id:
        emergency_q = emergency_q.where(FollowUpResponse.hospital_id == hospital_id)
    emergency = (await db.execute(select(func.count()).select_from(emergency_q.subquery()))).scalar() or 0

    positive_q = select(FollowUpResponse).where(FollowUpResponse.response_status == "POSITIVE")
    if hospital_id:
        positive_q = positive_q.where(FollowUpResponse.hospital_id == hospital_id)
    positive = (await db.execute(select(func.count()).select_from(positive_q.subquery()))).scalar() or 0

    negative_q = select(FollowUpResponse).where(FollowUpResponse.feedback == "NEGATIVE")
    if hospital_id:
        negative_q = negative_q.where(FollowUpResponse.hospital_id == hospital_id)
    negative = (await db.execute(select(func.count()).select_from(negative_q.subquery()))).scalar() or 0

    appointments_q = select(FollowUpResponse).where(FollowUpResponse.appointment_id.isnot(None))
    if hospital_id:
        appointments_q = appointments_q.where(FollowUpResponse.hospital_id == hospital_id)
    appointments_created = (await db.execute(select(func.count()).select_from(appointments_q.subquery()))).scalar() or 0

    recall_q = base.where(FollowUp.follow_up_type == "6_MONTH_RECALL", FollowUp.follow_up_date <= today, FollowUp.status == "COMPLETED")
    if hospital_id:
        recall_q = recall_q.where(FollowUp.hospital_id == hospital_id)
    recall_conversions = (await db.execute(select(func.count()).select_from(recall_q.subquery()))).scalar() or 0

    pending_6month_q = base.where(
        FollowUp.follow_up_type == "6_MONTH_RECALL",
        FollowUp.status.notin_(["COMPLETED", "CANCELLED", "LOST"]))
    pending_6month_recalls = (await db.execute(select(func.count()).select_from(pending_6month_q.subquery()))).scalar() or 0

    follow_ups_q = base.where(FollowUp.follow_up_type == "MANUAL")
    if hospital_id:
        follow_ups_q = follow_ups_q.where(FollowUp.hospital_id == hospital_id)
    follow_ups_created = (await db.execute(select(func.count()).select_from(follow_ups_q.subquery()))).scalar() or 0

    overdue_q = base.where(
        FollowUp.follow_up_date < today,
        FollowUp.status.in_(["SCHEDULED", "PENDING", "CONTACTED", "NO_RESPONSE"]))
    overdue = (await db.execute(select(func.count()).select_from(overdue_q.subquery()))).scalar() or 0

    return {
        "total_enquiries": total,
        "todays_enquiries": todays_enquiries,
        "pending_enquiries": pending,
        "completed_enquiries": completed,
        "overdue_enquiries": overdue,
        "emergency_responses": emergency,
        "positive_responses": positive,
        "negative_responses": negative,
        "follow_ups_created": follow_ups_created,
        "appointments_created": appointments_created,
        "recall_conversions": recall_conversions,
        "pending_6month_recalls": pending_6month_recalls,
    }


# -- Today's Enquiries List --

@router.get("/enquiry/today")
async def get_todays_enquiries(
    tab: str = Query("today", description="Filter: today, tomorrow, week, overdue, recalls, completed, calendar"),
    calendar_date: Optional[str] = Query(None, description="Date for calendar view (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    hospital_id = current_user.get("hospital_id")
    today = date.today()
    q = select(FollowUp)

    if tab == "today":
        q = q.where(FollowUp.follow_up_date == today)
    elif tab == "tomorrow":
        q = q.where(FollowUp.follow_up_date == today + timedelta(days=1))
    elif tab == "week":
        start_of_week = today - timedelta(days=today.weekday())
        end_of_week = start_of_week + timedelta(days=6)
        q = q.where(FollowUp.follow_up_date.between(start_of_week, end_of_week))
    elif tab == "overdue":
        q = q.where(
            FollowUp.follow_up_date < today,
            FollowUp.status.notin_(["COMPLETED", "LOST"]))
    elif tab == "recalls":
        q = q.where(
            FollowUp.follow_up_type == "6_MONTH_RECALL",
            FollowUp.status.notin_(["COMPLETED", "CANCELLED", "LOST"])).order_by(FollowUp.follow_up_date)
    elif tab == "completed":
        q = q.where(FollowUp.status == "COMPLETED")
    elif tab == "calendar" and calendar_date:
        q = q.where(FollowUp.follow_up_date == date.fromisoformat(calendar_date))
    else:
        q = q.where(FollowUp.follow_up_date == today)

    if hospital_id:
        q = q.where(FollowUp.hospital_id == hospital_id)
    q = q.order_by(FollowUp.follow_up_time).limit(100)
    result = await db.execute(q)
    items = result.scalars().all()
    enriched = []
    for fu in items:
        patient = await db.get(Patient, fu.patient_id)
        doctor = await db.get(User, fu.doctor_id) if fu.doctor_id else None
        case = await db.get(Case, fu.case_id) if fu.case_id else None
        treatment_status = None
        if fu.treatment_id:
            tp = await db.get(TreatmentPlan, fu.treatment_id)
            if tp:
                treatment_status = tp.status.value if hasattr(tp.status, 'value') else tp.status
        billing_info = {}
        if fu.billing_id:
            b = await db.get(Billing, fu.billing_id)
            if b:
                billing_info = {
                    "billing_id": str(b.id),
                    "invoice_number": b.invoice_number,
                    "invoice_amount": b.total_amount,
                    "billing_paid_at": b.paid_at.isoformat() if b.paid_at else None,
                }
        elif fu.case_id:
            br = await db.execute(
                select(Billing).where(Billing.case_id == fu.case_id).order_by(Billing.created_at.desc()).limit(1)
            )
            b = br.scalar_one_or_none()
            if b:
                billing_info = {
                    "billing_id": str(b.id),
                    "invoice_number": b.invoice_number,
                    "invoice_amount": b.total_amount,
                    "billing_paid_at": b.paid_at.isoformat() if b.paid_at else None,
                }
        enriched.append({
            "id": str(fu.id),
            "patient_id": str(fu.patient_id),
            "patient_name": patient.full_name if patient else "Unknown",
            "patient_phone": patient.phone if patient else None,
            "doctor_id": str(fu.doctor_id) if fu.doctor_id else None,
            "doctor_name": doctor.full_name if doctor else None,
            "case_id": str(fu.case_id) if fu.case_id else None,
            "case_number": str(case.id)[:8] if case else None,
            "treatment_id": str(fu.treatment_id) if fu.treatment_id else None,
            "treatment_status": treatment_status,
            "follow_up_date": fu.follow_up_date.isoformat(),
            "follow_up_time": str(fu.follow_up_time) if fu.follow_up_time else None,
            "follow_up_type": fu.follow_up_type,
            "treatment_name": fu.treatment_name or (case.chief_complaint if case else None),
            "treatment_completed_date": fu.treatment_completed_date.isoformat() if fu.treatment_completed_date else None,
            "status": fu.status,
            "notes": fu.notes,
            **billing_info,
        })
    return enriched


# =========================================================================
# CRM QUICK VIEW ENDPOINTS
# =========================================================================


@router.get("/quick-view/leads")
async def crm_quick_view_leads(
    period: str = Query("this_month"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")
    today = date.today()

    if period == "today":
        date_start = today
        date_end = today
    elif period == "this_week":
        date_start = today - timedelta(days=today.weekday())
        date_end = date_start + timedelta(days=6)
    elif period == "this_month":
        date_start = today.replace(day=1)
        date_end = today
    elif period == "this_quarter":
        q = (today.month - 1) // 3
        date_start = today.replace(month=q*3+1, day=1)
        date_end = today
    elif period == "this_year":
        date_start = today.replace(month=1, day=1)
        date_end = today
    elif period == "custom" and start_date and end_date:
        date_start = date.fromisoformat(start_date)
        date_end = date.fromisoformat(end_date)
    else:
        date_start = today.replace(day=1)
        date_end = today

    lead_base = select(Lead)
    if hospital_id:
        lead_base = lead_base.where(Lead.hospital_id == hospital_id)

    # Lead growth trend (last 6 months)
    lead_growth_trend = []
    for i in range(5, -1, -1):
        ym = today - timedelta(days=30 * i)
        m_start = ym.replace(day=1)
        m_q = lead_base.where(
            Lead.created_at >= datetime.combine(m_start, datetime.min.time()),
            Lead.created_at < datetime.combine((m_start + timedelta(days=32)).replace(day=1), datetime.min.time()))
        m_count = (await db.execute(select(func.count()).select_from(m_q.subquery()))).scalar() or 0
        lead_growth_trend.append({"month": m_start.strftime("%b %Y"), "count": m_count})

    # Leads by source
    ls_raw = select(Lead.source, func.count(Lead.id).label("count")).where(Lead.source.isnot(None))
    if hospital_id:
        ls_raw = ls_raw.where(Lead.hospital_id == hospital_id)
    ls_raw = ls_raw.group_by(Lead.source).order_by(func.count(Lead.id).desc())
    leads_by_source = [{"source": r[0], "count": r[1]} for r in (await db.execute(ls_raw)).all()]

    # Leads by status
    ls_status_raw = select(Lead.status, func.count(Lead.id).label("count"))
    if hospital_id:
        ls_status_raw = ls_status_raw.where(Lead.hospital_id == hospital_id)
    ls_status_raw = ls_status_raw.group_by(Lead.status).order_by(func.count(Lead.id).desc())
    leads_by_status = [{"status": r[0], "count": r[1]} for r in (await db.execute(ls_status_raw)).all()]

    # Score distribution
    all_leads = (await db.execute(lead_base.add_columns(Lead.lead_score))).all()
    score_categories = [("Hot (81-100)", 81, 100), ("Warm (61-80)", 61, 80), ("Cold (21-60)", 21, 60), ("Lost (0-20)", 0, 20)]
    score_distribution = []
    for label, lo, hi in score_categories:
        cnt = sum(1 for row in all_leads if row.lead_score is not None and lo <= row.lead_score <= hi)
        score_distribution.append({"category": label, "count": cnt})

    # Conversion analytics
    total_leads = (await db.execute(select(func.count()).select_from(lead_base.subquery()))).scalar() or 0
    converted_q = lead_base.where(Lead.status == LeadStatus.CONVERTED.value)
    converted_leads = (await db.execute(select(func.count()).select_from(converted_q.subquery()))).scalar() or 0
    conversion_rate = round((converted_leads / total_leads * 100), 1) if total_leads > 0 else 0

    # Top converting sources
    top_converting = []
    for src_info in leads_by_source:
        conv_q = select(func.count(Lead.id)).where(Lead.source == src_info["source"], Lead.converted_patient_id.isnot(None))
        if hospital_id:
            conv_q = conv_q.where(Lead.hospital_id == hospital_id)
        conv = (await db.execute(conv_q)).scalar() or 0
        top_converting.append({"source": src_info["source"], "count": src_info["count"], "converted": conv})

    return {
        "growth_trend": lead_growth_trend,
        "by_source": leads_by_source,
        "by_status": leads_by_status,
        "score_distribution": score_distribution,
        "conversion_rate": conversion_rate,
        "total_leads": total_leads,
        "converted_leads": converted_leads,
        "top_converting_sources": sorted(top_converting, key=lambda x: x["converted"], reverse=True)[:5],
    }


@router.get("/quick-view/converted-leads")
async def crm_quick_view_converted_leads(
    period: str = Query("this_month"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")
    today = date.today()

    if period == "today":
        date_start = today
        date_end = today
    elif period == "this_week":
        date_start = today - timedelta(days=today.weekday())
        date_end = date_start + timedelta(days=6)
    elif period == "this_month":
        date_start = today.replace(day=1)
        date_end = today
    elif period == "this_quarter":
        q = (today.month - 1) // 3
        date_start = today.replace(month=q*3+1, day=1)
        date_end = today
    elif period == "this_year":
        date_start = today.replace(month=1, day=1)
        date_end = today
    elif period == "custom" and start_date and end_date:
        date_start = date.fromisoformat(start_date)
        date_end = date.fromisoformat(end_date)
    else:
        date_start = today.replace(day=1)
        date_end = today

    lead_base = select(Lead)
    if hospital_id:
        lead_base = lead_base.where(Lead.hospital_id == hospital_id)
    converted_base = lead_base.where(Lead.status == LeadStatus.CONVERTED.value)

    # Converted patients list
    converted_rows = (await db.execute(converted_base.order_by(Lead.created_at.desc()).limit(50))).scalars().all()
    converted_patients = []
    for l in converted_rows:
        pat = await db.get(Patient, l.converted_patient_id) if l.converted_patient_id else None
        converted_patients.append({
            "lead_id": str(l.id), "lead_name": l.lead_name, "source": l.source,
            "patient_name": pat.full_name if pat else None,
            "converted_at": l.updated_at.isoformat() if l.updated_at else None,
        })

    # Monthly conversion trend (last 6 months)
    monthly_trend = []
    for i in range(5, -1, -1):
        ym = today - timedelta(days=30 * i)
        m_start = ym.replace(day=1)
        m_q = converted_base.where(
            Lead.updated_at >= datetime.combine(m_start, datetime.min.time()),
            Lead.updated_at < datetime.combine((m_start + timedelta(days=32)).replace(day=1), datetime.min.time()))
        m_count = (await db.execute(select(func.count()).select_from(m_q.subquery()))).scalar() or 0
        monthly_trend.append({"month": m_start.strftime("%b %Y"), "count": m_count})

    # By source
    source_conv_raw = select(Lead.source, func.count(Lead.id).label("count")).where(
        Lead.status == LeadStatus.CONVERTED.value, Lead.source.isnot(None))
    if hospital_id:
        source_conv_raw = source_conv_raw.where(Lead.hospital_id == hospital_id)
    source_conv_raw = source_conv_raw.group_by(Lead.source).order_by(func.count(Lead.id).desc())
    by_source = [{"source": r[0], "count": r[1]} for r in (await db.execute(source_conv_raw)).all()]

    # By doctor
    doc_conv_raw = select(Lead.assigned_doctor_id, func.count(Lead.id).label("count")).where(
        Lead.status == LeadStatus.CONVERTED.value, Lead.assigned_doctor_id.isnot(None))
    if hospital_id:
        doc_conv_raw = doc_conv_raw.where(Lead.hospital_id == hospital_id)
    doc_conv_raw = doc_conv_raw.group_by(Lead.assigned_doctor_id).order_by(func.count(Lead.id).desc())
    by_doctor = []
    for doc_id, cnt in (await db.execute(doc_conv_raw)).all():
        d = await db.get(User, doc_id)
        by_doctor.append({"doctor_id": doc_id, "doctor_name": d.full_name if d else "Unknown", "count": cnt})

    # Campaign conversion
    campaign_conv = []
    pat_source_q = select(Patient.id).where(Patient.source_campaign_id.isnot(None))
    if hospital_id:
        pat_source_q = pat_source_q.where(Patient.hospital_id == hospital_id)
    camp_pids = [r[0] for r in (await db.execute(pat_source_q)).all()]
    if camp_pids:
        lead_ids_from_camp = [r[0] for r in (await db.execute(
            select(Lead.id).where(Lead.converted_patient_id.in_(camp_pids), Lead.status == LeadStatus.CONVERTED.value)
        )).all()]
        campaign_conv.append({"source": "Campaign", "count": len(lead_ids_from_camp)})

    return {
        "converted_patients": converted_patients,
        "monthly_trend": monthly_trend,
        "by_source": by_source,
        "by_doctor": by_doctor,
        "by_campaign": campaign_conv,
    }


@router.get("/quick-view/follow-ups")
async def crm_quick_view_follow_ups(
    period: str = Query("this_month"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")
    today = date.today()

    fu_base = select(FollowUp)
    if hospital_id:
        fu_base = fu_base.where(FollowUp.hospital_id == hospital_id)

    active = (await db.execute(select(func.count()).select_from(
        fu_base.where(FollowUp.status.in_(["SCHEDULED", "PENDING", "OPEN"])).subquery()
    ))).scalar() or 0
    upcoming = (await db.execute(select(func.count()).select_from(
        fu_base.where(FollowUp.follow_up_date >= today, FollowUp.status.in_(["SCHEDULED", "PENDING"])).subquery()
    ))).scalar() or 0
    completed = (await db.execute(select(func.count()).select_from(
        fu_base.where(FollowUp.status == "COMPLETED").subquery()
    ))).scalar() or 0
    overdue = (await db.execute(select(func.count()).select_from(
        fu_base.where(FollowUp.follow_up_date < today, FollowUp.status.in_(["SCHEDULED", "PENDING", "OPEN"])).subquery()
    ))).scalar() or 0

    # Priority breakdown
    high_priority = (await db.execute(select(func.count()).select_from(
        fu_base.where(FollowUp.follow_up_type == "1_DAY_POST_TREATMENT").subquery()
    ))).scalar() or 0
    medium_priority = (await db.execute(select(func.count()).select_from(
        fu_base.where(FollowUp.follow_up_type == "MANUAL").subquery()
    ))).scalar() or 0
    low_priority = (await db.execute(select(func.count()).select_from(
        fu_base.where(FollowUp.follow_up_type.in_(["6_MONTH_RECALL", "3_MONTH_FOLLOW_UP", "YEARLY_FOLLOW_UP"])).subquery()
    ))).scalar() or 0

    # Doctor-wise follow-ups
    doc_fu_raw = select(FollowUp.doctor_id, func.count(FollowUp.id).label("count")).where(FollowUp.doctor_id.isnot(None))
    if hospital_id:
        doc_fu_raw = doc_fu_raw.where(FollowUp.hospital_id == hospital_id)
    doc_fu_raw = doc_fu_raw.group_by(FollowUp.doctor_id).order_by(func.count(FollowUp.id).desc())
    by_doctor = []
    for doc_id, cnt in (await db.execute(doc_fu_raw)).all():
        d = await db.get(User, doc_id)
        by_doctor.append({"doctor_id": doc_id, "doctor_name": d.full_name if d else "Unknown", "count": cnt})

    # Follow-up trend (last 6 months)
    trend = []
    for i in range(5, -1, -1):
        ym = today - timedelta(days=30 * i)
        m_start = ym.replace(day=1)
        m_end = (m_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        m_q = fu_base.where(FollowUp.follow_up_date >= m_start, FollowUp.follow_up_date <= m_end)
        m_count = (await db.execute(select(func.count()).select_from(m_q.subquery()))).scalar() or 0
        trend.append({"month": m_start.strftime("%b %Y"), "count": m_count})

    # Outcome trend
    outcome_raw = select(FollowUp.status, func.count(FollowUp.id).label("count"))
    if hospital_id:
        outcome_raw = outcome_raw.where(FollowUp.hospital_id == hospital_id)
    outcome_raw = outcome_raw.group_by(FollowUp.status).order_by(func.count(FollowUp.id).desc())
    by_outcome = [{"status": r[0], "count": r[1]} for r in (await db.execute(outcome_raw)).all()]

    # Patient breakdown (recent follow-ups) — only today's active
    today_fu_base = fu_base.where(
        FollowUp.follow_up_date == today,
        FollowUp.status.in_(["SCHEDULED", "PENDING", "OPEN"]))
    recent_rows = (await db.execute(
        today_fu_base.order_by(FollowUp.follow_up_time.asc().nullslast(), FollowUp.created_at.desc()).limit(20)
    )).scalars().all()
    by_patient = []
    for fu in recent_rows:
        pat = await db.get(Patient, fu.patient_id) if fu.patient_id else None
        by_patient.append({
            "patient_id": str(fu.patient_id) if fu.patient_id else None,
            "patient_name": pat.full_name if pat else "Unknown",
            "status": fu.status, "follow_up_date": fu.follow_up_date.isoformat() if fu.follow_up_date else None,
        })

    return {
        "active": active, "upcoming": upcoming,
        "completed": completed, "overdue": overdue,
        "high_priority": high_priority, "medium_priority": medium_priority, "low_priority": low_priority,
        "by_doctor": by_doctor, "by_patient": by_patient, "by_outcome": by_outcome,
        "trend": trend,
    }


@router.get("/quick-view/patient-acquisition")
async def crm_quick_view_patient_acquisition(
    period: str = Query("this_month"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")
    today = date.today()

    pat_source_patterns = {
        "Lead": ("Lead"),
        "Google Search": ("GOOGLE_SEARCH", "Google Search"),
        "Google Maps": ("GOOGLE_MAPS", "Google Maps"),
        "Instagram": ("INSTAGRAM", "Instagram"),
        "Facebook": ("FACEBOOK", "Facebook"),
        "WhatsApp": ("WHATSAPP", "WhatsApp"),
        "Website": ("WEBSITE", "Website"),
        "Referral": ("REFERRAL", "Referral - Existing Patient", "Referral - Doctor", "Referral - Clinic"),
        "Walk-In": ("WALK_IN", "Walk-In"),
        "Campaign": ("CAMPAIGN", "Campaign"),
        "Doctor Referral": ("DOCTOR_REFERRAL", "CLINIC_REFERRAL"),
    }
    all_pat_sources = {v for vals in pat_source_patterns.values() for v in vals} | {"OTHER"}
    acquisition_sources = ["Lead", "Google Search", "Google Maps", "Instagram", "Facebook", "WhatsApp", "Website", "Referral", "Walk-In", "Campaign", "Doctor Referral", "Other"]

    pat_base = select(Patient)
    if hospital_id:
        pat_base = pat_base.where(Patient.hospital_id == hospital_id)

    patients_by_source = []
    for src_display in acquisition_sources:
        if src_display == "Lead":
            src_filter = Patient.patient_source == "Lead"
        elif src_display == "Other":
            src_filter = ~Patient.patient_source.in_(all_pat_sources)
        else:
            patterns = pat_source_patterns.get(src_display)
            src_filter = Patient.patient_source.in_(patterns) if patterns else Patient.patient_source.ilike(f"%{src_display}%")
        pat_q = pat_base.where(src_filter, Patient.patient_source.isnot(None))
        cnt = (await db.execute(select(func.count()).select_from(pat_q.subquery()))).scalar() or 0
        patients_by_source.append({"source": src_display, "count": cnt})

    # Monthly acquisition (last 6 months)
    monthly = []
    for i in range(5, -1, -1):
        ym = today - timedelta(days=30 * i)
        m_start = ym.replace(day=1)
        m_end = (m_start + timedelta(days=32)).replace(day=1) - timedelta(days=1) if i > 0 else today
        m_q = pat_base.where(Patient.created_at >= m_start, Patient.created_at <= m_end)
        m_count = (await db.execute(select(func.count()).select_from(m_q.subquery()))).scalar() or 0
        monthly.append({"month": m_start.strftime("%b %Y"), "count": m_count})

    # Growth (cumulative)
    growth = []
    cumulative = 0
    for m in monthly:
        cumulative += m["count"]
        growth.append({"month": m["month"], "cumulative": cumulative})

    return {
        "by_source": patients_by_source,
        "monthly": monthly,
        "growth": growth,
    }


@router.get("/quick-view/lead-sources")
async def crm_quick_view_lead_sources(
    period: str = Query("this_month"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")
    today = date.today()

    lead_base = select(Lead)
    if hospital_id:
        lead_base = lead_base.where(Lead.hospital_id == hospital_id)

    ls_raw = select(Lead.source, func.count(Lead.id).label("count")).where(Lead.source.isnot(None))
    if hospital_id:
        ls_raw = ls_raw.where(Lead.hospital_id == hospital_id)
    ls_raw = ls_raw.group_by(Lead.source).order_by(func.count(Lead.id).desc())
    sources = []
    for src, cnt in (await db.execute(ls_raw)).all():
        conv_q = select(func.count(Lead.id)).where(Lead.source == src, Lead.converted_patient_id.isnot(None))
        if hospital_id:
            conv_q = conv_q.where(Lead.hospital_id == hospital_id)
        conv = (await db.execute(conv_q)).scalar() or 0
        sources.append({
            "source": src, "count": cnt,
            "converted": conv,
            "conversion_rate": round((conv / cnt) * 100, 1) if cnt > 0 else 0,
        })

    # Growth trend (last 6 months)
    growth = []
    for i in range(5, -1, -1):
        ym = today - timedelta(days=30 * i)
        m_start = ym.replace(day=1)
        m_q = lead_base.where(
            Lead.created_at >= datetime.combine(m_start, datetime.min.time()),
            Lead.created_at < datetime.combine((m_start + timedelta(days=32)).replace(day=1), datetime.min.time()))
        m_count = (await db.execute(select(func.count()).select_from(m_q.subquery()))).scalar() or 0
        growth.append({"month": m_start.strftime("%b %Y"), "count": m_count})

    return {"sources": sources, "growth_trend": growth}


@router.get("/enhanced-dashboard")
async def get_enhanced_crm_dashboard(
    period: str = Query("today", description="today, tomorrow, this_week, this_month, custom"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    doctor_id: Optional[str] = Query(None, alias="doctor"),
    follow_up_type: Optional[str] = Query(None, alias="type"),
    status_filter: Optional[str] = Query(None, alias="status"),
    source_filter: Optional[str] = Query(None, alias="source"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")
    today = date.today()

    # Date range
    if period == "today":
        d_start = today; d_end = today
    elif period == "tomorrow":
        d_start = today + timedelta(days=1); d_end = d_start
    elif period == "this_week":
        d_start = today - timedelta(days=today.weekday()); d_end = d_start + timedelta(days=6)
    elif period == "this_month":
        d_start = today.replace(day=1); d_end = today
    elif period == "custom" and start_date and end_date:
        d_start = date.fromisoformat(start_date); d_end = date.fromisoformat(end_date)
    else:
        d_start = today; d_end = today

    def hid(q):
        if hospital_id: return q.where(FollowUp.hospital_id == hospital_id)
        return q

    # ─────────────────────────────────────────────────
    # SECTION 1: Today's Overview
    # ─────────────────────────────────────────────────
    fu_base = hid(select(FollowUp))
    if doctor_id: fu_base = fu_base.where(FollowUp.doctor_id == doctor_id)
    if follow_up_type: fu_base = fu_base.where(FollowUp.follow_up_type == follow_up_type)
    if status_filter: fu_base = fu_base.where(FollowUp.status == status_filter)

    today_fu = fu_base.where(FollowUp.follow_up_date == today)
    today_count = (await db.execute(select(func.count()).select_from(today_fu.subquery()))).scalar() or 0

    six_month = (await db.execute(
        select(func.count()).select_from(today_fu.where(FollowUp.follow_up_type == "6_MONTH_RECALL").subquery())
    )).scalar() or 0
    twelve_month = (await db.execute(
        select(func.count()).select_from(today_fu.where(FollowUp.follow_up_type == "12_MONTH_RECALL").subquery())
    )).scalar() or 0

    contacted_today = (await db.execute(
        select(func.count()).select_from(fu_base.where(
            FollowUp.last_contact_date >= datetime.combine(today, datetime.min.time()),
            FollowUp.last_contact_date <= datetime.combine(today, datetime.max.time())
        ).subquery())
    )).scalar() or 0

    appt_q = select(Appointment).where(Appointment.appointment_date == today)
    if hospital_id: appt_q = appt_q.where(Appointment.patient.has(Patient.hospital_id == hospital_id))
    appts_today = (await db.execute(select(func.count()).select_from(appt_q.subquery()))).scalar() or 0

    crm_appt_q = select(Appointment).where(Appointment.appointment_date >= d_start, Appointment.appointment_date <= d_end, Appointment.appointment_type == AppointmentType.FOLLOW_UP.value)
    if hospital_id: crm_appt_q = crm_appt_q.where(Appointment.patient.has(Patient.hospital_id == hospital_id))
    crm_appts = (await db.execute(select(func.count()).select_from(crm_appt_q.subquery()))).scalar() or 0

    overdue = (await db.execute(
        select(func.count()).select_from(fu_base.where(
            FollowUp.follow_up_date < today,
            FollowUp.status.in_(["PENDING", "CONTACTED", "NO_RESPONSE", "SCHEDULED", "OPEN"])
        ).subquery())
    )).scalar() or 0

    overview = {
        "crm_tasks": today_count, "follow_ups_today": today_count,
        "six_month_recalls": six_month, "twelve_month_recalls": twelve_month,
        "patients_contacted": contacted_today,
        "appointments_created_today": appts_today,
        "appointments_from_crm": crm_appts,
        "overdue_tasks": overdue,
    }

    # ─────────────────────────────────────────────────
    # SECTION 2: Today's Work Queue
    # ─────────────────────────────────────────────────
    work_q = fu_base.where(
        FollowUp.follow_up_date == today,
        FollowUp.status.in_(["PENDING", "CONTACTED", "NO_RESPONSE", "SCHEDULED", "OPEN"])
    ).order_by(FollowUp.follow_up_time).limit(50)
    work_rows = (await db.execute(work_q)).scalars().all()
    work_queue = []
    for fu in work_rows:
        pat = await db.get(Patient, fu.patient_id) if fu.patient_id else None
        doc = await db.get(User, fu.doctor_id) if fu.doctor_id else None
        tt_name = None
        if fu.treatment_type_id:
            tt = await db.get(TreatmentType, fu.treatment_type_id)
            tt_name = tt.name if tt else None
        work_queue.append({
            "id": str(fu.id), "patient_id": str(fu.patient_id) if fu.patient_id else None,
            "patient_name": pat.full_name if pat else "Unknown",
            "op_number": pat.op_no if pat else None,
            "patient_phone": pat.phone if pat else None,
            "doctor_name": doc.full_name if doc else None,
            "doctor_id": str(fu.doctor_id) if fu.doctor_id else None,
            "treatment_type": tt_name,
            "treatment_name": fu.treatment_name,
            "follow_up_type": fu.follow_up_type,
            "due_time": fu.follow_up_time.strftime("%H:%M") if fu.follow_up_time else None,
            "status": fu.status,
            "response_status": fu.response_status,
            "contact_channel": fu.contact_channel,
            "last_contact_date": fu.last_contact_date.isoformat() if fu.last_contact_date else None,
        })

    # ─────────────────────────────────────────────────
    # SECTION 3: Follow-Up Summary by type
    # ─────────────────────────────────────────────────
    type_counts = {}
    for ft in ["1_DAY_FOLLOW_UP", "7_DAY_FOLLOW_UP", "6_MONTH_RECALL", "12_MONTH_RECALL", "CUSTOM_FOLLOW_UP", "ENQUIRY", "MANUAL"]:
        cnt = (await db.execute(
            select(func.count()).select_from(
                fu_base.where(FollowUp.follow_up_type == ft, FollowUp.follow_up_date == today).subquery())
        )).scalar() or 0
        type_counts[ft] = cnt
    completed_today = (await db.execute(
        select(func.count()).select_from(
            fu_base.where(FollowUp.status == "COMPLETED", FollowUp.completed_date >= datetime.combine(today, datetime.min.time())).subquery())
    )).scalar() or 0

    follow_up_summary = {
        "1_day_due": type_counts.get("1_DAY_FOLLOW_UP", 0),
        "7_day_due": type_counts.get("7_DAY_FOLLOW_UP", 0),
        "6_month_due": type_counts.get("6_MONTH_RECALL", 0),
        "12_month_due": type_counts.get("12_MONTH_RECALL", 0),
        "custom_due": type_counts.get("CUSTOM_FOLLOW_UP", 0) + type_counts.get("ENQUIRY", 0) + type_counts.get("MANUAL", 0),
        "completed_today": completed_today,
        "overdue": overdue,
    }

    # ─────────────────────────────────────────────────
    # SECTION 4: Appointment Conversion Funnel
    # ─────────────────────────────────────────────────
    period_fu = fu_base.where(FollowUp.follow_up_date >= d_start, FollowUp.follow_up_date <= d_end)
    total_fu = (await db.execute(select(func.count()).select_from(period_fu.subquery()))).scalar() or 0
    contacted_fu = (await db.execute(
        select(func.count()).select_from(period_fu.where(
            FollowUp.status.in_(["CONTACTED", "INTERESTED", "APPOINTMENT_REQUIRED", "APPOINTMENT_BOOKED", "COMPLETED"])
        ).subquery())
    )).scalar() or 0
    positive_fu = (await db.execute(
        select(func.count()).select_from(period_fu.where(
            FollowUp.response_status.in_(["INTERESTED", "TREATMENT_COMPLETED", "NEEDS_REVIEW"])
        ).subquery())
    )).scalar() or 0
    booked_fu = (await db.execute(
        select(func.count()).select_from(period_fu.where(FollowUp.status == "APPOINTMENT_BOOKED").subquery())
    )).scalar() or 0
    completed_fu = (await db.execute(
        select(func.count()).select_from(period_fu.where(FollowUp.status == "COMPLETED").subquery())
    )).scalar() or 0

    funnel = {
        "total_due": total_fu, "contacted": contacted_fu, "positive": positive_fu,
        "appointments_booked": booked_fu, "appointments_completed": completed_fu,
        "contact_rate": round(contacted_fu / total_fu * 100, 1) if total_fu else 0,
        "positive_rate": round(positive_fu / contacted_fu * 100, 1) if contacted_fu else 0,
        "booking_rate": round(booked_fu / positive_fu * 100, 1) if positive_fu else 0,
        "completion_rate": round(completed_fu / booked_fu * 100, 1) if booked_fu else 0,
    }

    # ─────────────────────────────────────────────────
    # SECTION 5: Patient Response Analytics
    # ─────────────────────────────────────────────────
    response_labels = {
        "INTERESTED": "Interested", "APPOINTMENT_REQUIRED": "Appointment Requested",
        "NOT_INTERESTED": "Not Interested", "NEEDS_MORE_TIME": "Needs More Time",
        "REQUESTED_CALLBACK": "Requested Callback", "NO_RESPONSE": "No Response",
        "WRONG_NUMBER": "Wrong Number", "TREATMENT_COMPLETED": "Treatment Successful",
        "NEEDS_REVIEW": "Needs Review", "BUSY": "Busy",
    }
    patient_responses = []
    for rs, label in response_labels.items():
        cnt = (await db.execute(
            select(func.count()).select_from(
                fu_base.where(FollowUp.response_status == rs, FollowUp.follow_up_date >= d_start, FollowUp.follow_up_date <= d_end).subquery())
        )).scalar() or 0
        if cnt > 0:
            patient_responses.append({"name": label, "value": cnt, "key": rs})

    # ─────────────────────────────────────────────────
    # SECTION 6: Patient Condition Analytics (from outcome)
    # ─────────────────────────────────────────────────
    outcome_labels = {
        "DOING_WELL": "Recovered", "MINOR_SENSITIVITY": "Minor Pain",
        "NEEDS_CLEANING": "Needs Cleaning", "INTERESTED_IN_CROWN": "Interested in Crown",
        "NEEDS_REVIEW": "Needs Clinical Review", "NEEDS_APPOINTMENT": "Needs Appointment",
        "TREATMENT_SUCCESSFUL": "Recovered", "NO_RESPONSE": "No Response",
    }
    conditions = []
    for oc, label in outcome_labels.items():
        cnt = (await db.execute(
            select(func.count()).select_from(
                fu_base.where(FollowUp.outcome == oc, FollowUp.follow_up_date >= d_start, FollowUp.follow_up_date <= d_end).subquery())
        )).scalar() or 0
        if cnt > 0:
            conditions.append({"name": label, "count": cnt, "key": oc})

    # ─────────────────────────────────────────────────
    # SECTION 7: Treatment Type Performance
    # ─────────────────────────────────────────────────
    tt_raw = select(FollowUp.treatment_name, func.count(FollowUp.id).label("follow_ups"))
    if hospital_id: tt_raw = tt_raw.where(FollowUp.hospital_id == hospital_id)
    tt_raw = tt_raw.where(FollowUp.treatment_name.isnot(None)).group_by(FollowUp.treatment_name).order_by(func.count(FollowUp.id).desc()).limit(10)
    tt_rows = (await db.execute(tt_raw)).all()
    treatment_performance = []
    for tname, fcnt in tt_rows:
        acnt_q = select(func.count(Appointment.id)).select_from(Appointment).join(Patient, Appointment.patient_id == Patient.id)
        if hospital_id: acnt_q = acnt_q.where(Patient.hospital_id == hospital_id)
        acnt = (await db.execute(acnt_q.where(Appointment.created_at >= datetime.combine(d_start, datetime.min.time()), Appointment.appointment_type == AppointmentType.FOLLOW_UP.value))).scalar() or 0
        treatment_performance.append({"name": tname or "Other", "follow_ups": fcnt, "appointments": acnt})

    # ─────────────────────────────────────────────────
    # SECTION 8: Doctor Engagement Leaderboard
    # ─────────────────────────────────────────────────
    doc_ids_q = select(FollowUp.doctor_id).where(FollowUp.doctor_id.isnot(None))
    if hospital_id: doc_ids_q = doc_ids_q.where(FollowUp.hospital_id == hospital_id)
    doc_ids = list(set(r[0] for r in (await db.execute(doc_ids_q)).all()))
    doctor_engagement = []
    for did in doc_ids:
        d = await db.get(User, did) if did else None
        if not d: continue
        d_contacted = (await db.execute(
            select(func.count()).select_from(hid(select(FollowUp)).where(
                FollowUp.doctor_id == did, FollowUp.contact_channel.isnot(None),
                FollowUp.follow_up_date >= d_start, FollowUp.follow_up_date <= d_end).subquery())
        )).scalar() or 0
        d_appt_q = select(Appointment).where(Appointment.doctor_id == did, Appointment.created_at >= datetime.combine(d_start, datetime.min.time()))
        if hospital_id: d_appt_q = d_appt_q.where(Appointment.patient.has(Patient.hospital_id == hospital_id))
        d_appts = (await db.execute(select(func.count()).select_from(d_appt_q.subquery()))).scalar() or 0
        d_completed = (await db.execute(
            select(func.count()).select_from(hid(select(FollowUp)).where(
                FollowUp.doctor_id == did, FollowUp.status == "COMPLETED",
                FollowUp.follow_up_date >= d_start, FollowUp.follow_up_date <= d_end).subquery())
        )).scalar() or 0
        d_positive = (await db.execute(
            select(func.count()).select_from(hid(select(FollowUp)).where(
                FollowUp.doctor_id == did,
                FollowUp.response_status.in_(["INTERESTED", "TREATMENT_COMPLETED"]),
                FollowUp.follow_up_date >= d_start, FollowUp.follow_up_date <= d_end).subquery())
        )).scalar() or 0
        doctor_engagement.append({
            "doctor_id": did, "doctor_name": d.full_name or "Unknown",
            "patients_contacted": d_contacted, "appointments_generated": d_appts,
            "follow_ups_completed": d_completed, "positive_feedback": d_positive,
            "score": d_contacted + d_appts * 2 + d_completed * 3 + d_positive * 4,
        })
    doctor_engagement.sort(key=lambda x: x["score"], reverse=True)

    # ─────────────────────────────────────────────────
    # SECTION 9: Patient Acquisition & Revenue by Source
    # ─────────────────────────────────────────────────
    src_q = select(Patient.patient_source, func.count(Patient.id).label("patients")).where(Patient.patient_source.isnot(None))
    if hospital_id: src_q = src_q.where(Patient.hospital_id == hospital_id)
    src_rows = (await db.execute(src_q.group_by(Patient.patient_source).order_by(func.count(Patient.id).desc()))).all()
    acquisition = []
    for src, pcnt in src_rows:
        rev_q = select(func.coalesce(func.sum(Billing.paid_amount), 0)).select_from(Billing).join(Case, Billing.case_id == Case.id).join(Patient, Case.patient_id == Patient.id).where(Patient.patient_source == src)
        if hospital_id: rev_q = rev_q.where(Patient.hospital_id == hospital_id)
        rev = float((await db.execute(rev_q)).scalar() or 0)
        conv_q = select(func.count(func.distinct(Patient.id))).where(Patient.patient_source == src, Patient.status != "NEW")
        if hospital_id: conv_q = conv_q.where(Patient.hospital_id == hospital_id)
        conv_cnt = (await db.execute(conv_q)).scalar() or 0
        acquisition.append({
            "source": src or "Unknown", "patients": pcnt,
            "revenue": rev, "converted": conv_cnt,
            "conversion_rate": round(conv_cnt / pcnt * 100, 1) if pcnt > 0 else 0,
            "avg_revenue": round(rev / pcnt, 2) if pcnt > 0 else 0,
        })
    acquisition.sort(key=lambda x: x["patients"], reverse=True)
    revenue_by_source = [{"source": a["source"], "revenue": a["revenue"]} for a in acquisition]

    # ─────────────────────────────────────────────────
    # SECTION 10: CRM Timeline / Activity Feed
    # ─────────────────────────────────────────────────
    timeline = []
    recent_fus = (await db.execute(
        fu_base.order_by(FollowUp.last_contact_date.desc().nullslast()).limit(30)
    )).scalars().all()
    for fu in recent_fus:
        if not fu.last_contact_date and fu.status == "PENDING":
            continue
        pat = await db.get(Patient, fu.patient_id) if fu.patient_id else None
        activity = fu.contact_channel or "STATUS_UPDATE"
        desc = f"Status changed to {fu.status}"
        if fu.contact_channel == "CALL": desc = "Call completed"
        elif fu.contact_channel == "WHATSAPP": desc = "WhatsApp sent"
        elif fu.contact_channel == "SMS": desc = "SMS sent"
        elif fu.contact_channel == "EMAIL": desc = "Email sent"
        elif fu.contact_channel == "IN_PERSON": desc = "In-person visit"
        elif fu.status == "COMPLETED": desc = "Follow-up completed"
        elif fu.status == "APPOINTMENT_BOOKED": desc = "Appointment booked"
        elif fu.response_status: desc = f"Feedback: {response_labels.get(fu.response_status, fu.response_status)}"
        timeline.append({
            "id": str(fu.id), "patient_name": pat.full_name if pat else "Unknown",
            "patient_id": str(fu.patient_id) if fu.patient_id else None,
            "activity": activity, "description": desc,
            "status": fu.status, "response_status": fu.response_status,
            "timestamp": fu.last_contact_date.isoformat() if fu.last_contact_date else fu.created_at.isoformat() if fu.created_at else None,
        })
    timeline.sort(key=lambda x: x["timestamp"] or "", reverse=True)

    # ─────────────────────────────────────────────────
    # SECTION 11: Upcoming Work
    # ─────────────────────────────────────────────────
    tomorrow = today + timedelta(days=1)
    next7 = today + timedelta(days=7)
    next30 = today + timedelta(days=30)

    async def count_fu_type_range(start, end, fu_type=None):
        q = fu_base.where(FollowUp.follow_up_date >= start, FollowUp.follow_up_date <= end,
                          FollowUp.status.in_(["PENDING", "SCHEDULED", "CONTACTED", "NO_RESPONSE"]))
        if fu_type: q = q.where(FollowUp.follow_up_type == fu_type)
        return (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0

    tom_total, tom_1d, tom_7d, tom_6m, tom_12m = await asyncio.gather(
        count_fu_type_range(tomorrow, tomorrow),
        count_fu_type_range(tomorrow, tomorrow, "1_DAY_FOLLOW_UP"),
        count_fu_type_range(tomorrow, tomorrow, "7_DAY_FOLLOW_UP"),
        count_fu_type_range(tomorrow, tomorrow, "6_MONTH_RECALL"),
        count_fu_type_range(tomorrow, tomorrow, "12_MONTH_RECALL"),
    )
    n7_total, n7_1d, n7_7d, n7_6m, n7_12m = await asyncio.gather(
        count_fu_type_range(today + timedelta(days=2), next7),
        count_fu_type_range(today + timedelta(days=2), next7, "1_DAY_FOLLOW_UP"),
        count_fu_type_range(today + timedelta(days=2), next7, "7_DAY_FOLLOW_UP"),
        count_fu_type_range(today + timedelta(days=2), next7, "6_MONTH_RECALL"),
        count_fu_type_range(today + timedelta(days=2), next7, "12_MONTH_RECALL"),
    )
    n30_total, n30_1d, n30_7d, n30_6m, n30_12m = await asyncio.gather(
        count_fu_type_range(today + timedelta(days=8), next30),
        count_fu_type_range(today + timedelta(days=8), next30, "1_DAY_FOLLOW_UP"),
        count_fu_type_range(today + timedelta(days=8), next30, "7_DAY_FOLLOW_UP"),
        count_fu_type_range(today + timedelta(days=8), next30, "6_MONTH_RECALL"),
        count_fu_type_range(today + timedelta(days=8), next30, "12_MONTH_RECALL"),
    )
    upcoming_work = {
        "tomorrow": {
            "total": tom_total,
            "1_day": tom_1d, "7_day": tom_7d,
            "6_month": tom_6m, "12_month": tom_12m,
        },
        "next_7_days": {
            "total": n7_total,
            "1_day": n7_1d, "7_day": n7_7d,
            "6_month": n7_6m, "12_month": n7_12m,
        },
        "next_30_days": {
            "total": n30_total,
            "1_day": n30_1d, "7_day": n30_7d,
            "6_month": n30_6m, "12_month": n30_12m,
        },
    }

    return {
        "overview": overview,
        "work_queue": work_queue,
        "follow_up_summary": follow_up_summary,
        "conversion_funnel": funnel,
        "patient_responses": patient_responses,
        "patient_conditions": conditions,
        "treatment_performance": treatment_performance,
        "doctor_engagement": doctor_engagement,
        "patient_acquisition": acquisition,
        "revenue_by_source": revenue_by_source,
        "timeline": timeline,
        "upcoming_work": upcoming_work,
    }


@router.get("/analytics/revenue-by-doctor")
async def crm_revenue_by_doctor(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")

    doc_rev_raw = select(
        Case.doctor_id,
        func.coalesce(func.sum(Billing.paid_amount), 0).label("paid_amount"),
        func.coalesce(func.sum(Billing.pending_amount), 0).label("pending_amount"),
        func.coalesce(func.sum(Billing.total_amount), 0).label("total_amount"),
        func.count(func.distinct(Case.patient_id)).label("patient_count"),
        func.count(func.distinct(Case.id)).label("treatment_count")).select_from(Case).join(Billing, Billing.case_id == Case.id).join(Patient, Patient.id == Case.patient_id).where(Case.doctor_id.isnot(None))
    if hospital_id:
        doc_rev_raw = doc_rev_raw.where(Patient.hospital_id == hospital_id)
        doc_rev_raw = doc_rev_raw.where(
            Case.doctor_id.in_(
                select(User.id).where(User.hospital_id == hospital_id, User.role == "DOCTOR")
            )
        )
    doc_rev_raw = doc_rev_raw.group_by(Case.doctor_id).order_by(func.sum(Billing.paid_amount).desc())
    data = []
    for row in (await db.execute(doc_rev_raw)).all():
        d = await db.get(User, row.doctor_id)
        paid = float(row.paid_amount)
        total = float(row.total_amount)
        treatments = row.treatment_count
        patients = row.patient_count
        avg_billing = round(total / treatments, 2) if treatments > 0 else 0
        data.append({
            "doctor_id": row.doctor_id, "doctor_name": d.full_name if d else "Unknown",
            "paid_amount": paid, "pending_amount": float(row.pending_amount),
            "total_amount": total, "patient_count": patients,
            "treatment_count": treatments, "avg_billing_value": avg_billing,
        })
    return data


# =============================================================================
# CRM COMMAND CENTER — Part 3C time-based enterprise analytics
# -----------------------------------------------------------------------------
# One aggregation endpoint powering the entire CRM Command Center dashboard.
# Every metric is scoped to the requested period (full preset list incl.
# yesterday/last_7_days/last_week/last_month/last_quarter/last_year) and
# compared against the immediately preceding same-length window so KPI
# deltas are computed on the backend with a single round trip.
# =============================================================================

TERMINAL_LEAD_STATUSES = ["CONVERTED", "LOST", "NOT_INTERESTED", "NO_RESPONSE"]
OPEN_FOLLOW_UP_STATUSES = ["PENDING", "CONTACTED", "NO_RESPONSE", "SCHEDULED", "OPEN"]


def _start_of_quarter(d: date) -> date:
    return d.replace(month=((d.month - 1) // 3) * 3 + 1, day=1)


def _add_months(d: date, months: int) -> date:
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _resolve_crm_range(period: str, start_date: Optional[str], end_date: Optional[str]):
    """Resolve the inclusive date range + the same-length preceding window.

    Ranges mirror frontend `resolvePeriodRange` (this_month/quarter/year are
    full calendar windows) so every KPI drills down to exactly the same
    records shown on the list pages.
    """
    today = date.today()
    if period == "today":
        s, e = today, today
    elif period == "yesterday":
        s, e = today - timedelta(days=1), today - timedelta(days=1)
    elif period == "last_7_days":
        s, e = today - timedelta(days=6), today
    elif period == "last_30_days":
        s, e = today - timedelta(days=29), today
    elif period == "this_week":
        s, e = today - timedelta(days=today.weekday()), today
    elif period == "last_week":
        s = today - timedelta(days=today.weekday() + 7)
        e = s + timedelta(days=6)
    elif period == "this_month":
        s, e = today.replace(day=1), today
    elif period == "last_month":
        first = today.replace(day=1) - timedelta(days=1)
        s, e = first.replace(day=1), first
    elif period == "this_quarter":
        s, e = _start_of_quarter(today), today
    elif period == "last_quarter":
        s = _add_months(_start_of_quarter(today), -3)
        e = s + timedelta(days=(today - _start_of_quarter(today)).days)
    elif period == "this_year":
        s, e = today.replace(month=1, day=1), today
    elif period == "last_year":
        s, e = date(today.year - 1, 1, 1), date(today.year - 1, 12, 31)
    elif period == "custom" and start_date and end_date:
        s, e = date.fromisoformat(start_date), date.fromisoformat(end_date)
    else:
        s, e = today.replace(day=1), today
    span = (e - s).days + 1
    prev_e = s - timedelta(days=1)
    prev_s = prev_e - timedelta(days=span - 1)
    return s, e, prev_s, prev_e


@router.get("/command-center")
async def get_crm_command_center(
    period: str = Query("this_month", description="today, yesterday, last_7_days, last_30_days, this_week, last_week, this_month, last_month, this_quarter, last_quarter, this_year, last_year, custom"),
    start_date: Optional[str] = Query(None, description="Custom start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Custom end date (YYYY-MM-DD)"),
    doctor: Optional[str] = Query(None, description="Filter by doctor ID"),
    source: Optional[str] = Query(None, description="Filter by lead source"),
    campaign: Optional[str] = Query(None, description="Filter by campaign/source campaign"),
    staff: Optional[str] = Query(None, description="Filter by staff ID"),
    lead_status: Optional[str] = Query(None, description="Filter by lead status"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")
    today = date.today()

    d_start, d_end, prev_start, prev_end = _resolve_crm_range(period, start_date, end_date)
    s_dt = datetime.combine(d_start, datetime.min.time())
    e_dt = datetime.combine(d_end, datetime.max.time())
    ps_dt = datetime.combine(prev_start, datetime.min.time())
    pe_dt = datetime.combine(prev_end, datetime.max.time())

    # -------------------------------------------------------------
    # Shared scoping helpers
    # -------------------------------------------------------------
    def lead_scope(q, start=None, end=None):
        if hospital_id:
            q = q.where(Lead.hospital_id == hospital_id)
        if source:
            q = q.where(Lead.source.ilike(f"%{source}%"))
        if doctor:
            q = q.where(Lead.assigned_doctor_id == doctor)
        if staff:
            q = q.where(Lead.assigned_staff_id == staff)
        if lead_status:
            q = q.where(Lead.status == lead_status)
        if campaign:
            q = q.where(Lead.source.ilike(f"%{campaign}%"))
        if start is not None:
            q = q.where(Lead.created_at >= start)
        if end is not None:
            q = q.where(Lead.created_at <= end)
        return q

    def fu_scope(q):
        if hospital_id:
            q = q.where(FollowUp.hospital_id == hospital_id)
        if doctor:
            q = q.where(FollowUp.doctor_id == doctor)
        return q

    def comm_scope(q):
        if hospital_id:
            q = q.where(CommunicationLog.hospital_id == hospital_id)
        return q

    async def count(q):
        return (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0

    # -------------------------------------------------------------
    # KPI CORE (current + previous windows)
    # -------------------------------------------------------------
    async def lead_counts(start, end):
        base = lead_scope(select(Lead), start, end)
        new_leads = await count(base)
        open_q = base.where(Lead.status.notin_(TERMINAL_LEAD_STATUSES))
        open_leads = await count(open_q)
        converted = await count(base.where(Lead.status == LeadStatus.CONVERTED.value, Lead.updated_at >= start, Lead.updated_at <= end))
        return new_leads, open_leads, converted

    cur_new, cur_open, cur_conv = await lead_counts(s_dt, e_dt)
    prev_new, prev_open, prev_conv = await lead_counts(ps_dt, pe_dt)
    cur_conv_rate = round(cur_conv / cur_new * 100, 1) if cur_new > 0 else 0.0
    prev_conv_rate = round(prev_conv / prev_new * 100, 1) if prev_new > 0 else 0.0

    # Response time: hours from lead creation to first outbound communication
    async def avg_response_hours(start, end):
        rows = (await db.execute(
            select(Lead.id, Lead.created_at, func.min(LeadCommunication.created_at))
            .join(LeadCommunication, LeadCommunication.lead_id == Lead.id)
            .where(Lead.created_at >= start, Lead.created_at <= end, LeadCommunication.created_at >= Lead.created_at)
            .group_by(Lead.id, Lead.created_at)
        )).all()
        total_h = 0.0
        n = 0
        for lead_id, created_at, first_comm in rows:
            if created_at and first_comm:
                total_h += (first_comm - created_at).total_seconds() / 3600
                n += 1
        return round(total_h / n, 1) if n > 0 else 0.0

    cur_response = await avg_response_hours(s_dt, e_dt)
    prev_response = await avg_response_hours(ps_dt, pe_dt)

    # Lead age: average days open leads from this period have been in pipeline
    async def avg_lead_age(start, end):
        rows = (await db.execute(
            select(Lead.created_at).where(Lead.created_at >= start, Lead.created_at <= end, Lead.status.notin_(TERMINAL_LEAD_STATUSES))
        )).all()
        if not rows:
            return 0.0
        now = datetime.now(timezone.utc)
        return round(sum((now - r[0]).total_seconds() / 86400 for r in rows if r[0]) / len(rows), 1)

    cur_age = await avg_lead_age(s_dt, e_dt)
    prev_age = await avg_lead_age(ps_dt, pe_dt)

    # Follow-ups due / overdue
    async def follow_up_due(start, end):
        base = fu_scope(select(FollowUp))
        q = base.where(FollowUp.follow_up_date >= start, FollowUp.follow_up_date <= end, FollowUp.status.in_(OPEN_FOLLOW_UP_STATUSES))
        return await count(q)

    cur_fu = await follow_up_due(d_start, d_end)
    prev_fu = await follow_up_due(prev_start, prev_end)
    overdue = await count(fu_scope(select(FollowUp)).where(
        FollowUp.follow_up_date < today, FollowUp.status.in_(OPEN_FOLLOW_UP_STATUSES)))

    # Communication health
    async def comm_stats(start, end):
        base = comm_scope(select(CommunicationLog)).where(CommunicationLog.created_at >= start, CommunicationLog.created_at <= end)
        rows = (await db.execute(
            base.with_only_columns(CommunicationLog.status, func.count())
            .group_by(CommunicationLog.status)
        )).all()
        totals = {r[0]: r[1] for r in rows}
        sent = totals.get("SENT", 0)
        delivered = totals.get("DELIVERED", 0)
        read = totals.get("READ", 0)
        failed = totals.get("FAILED", 0)
        pending = totals.get("PENDING", 0)
        whatsapp = await count(base.where(CommunicationLog.channel == CommunicationChannel.WHATSAPP.value))
        attempts = sent + delivered + read + failed
        success = delivered + read
        rate = round(success / attempts * 100, 1) if attempts > 0 else 0.0
        return sent, delivered, read, failed, pending, whatsapp, rate

    cur_comm = await comm_stats(s_dt, e_dt)
    prev_comm = await comm_stats(ps_dt, pe_dt)

    # Calls
    async def call_stats(start, end):
        base = select(LeadCall).join(Lead, Lead.id == LeadCall.lead_id).where(LeadCall.created_at >= start, LeadCall.created_at <= end)
        if hospital_id:
            base = base.where(Lead.hospital_id == hospital_id)
        rows = (await db.execute(base.with_only_columns(LeadCall.outcome, func.count()).group_by(LeadCall.outcome))).all()
        by_outcome = {r[0]: r[1] for r in rows if r[0]}
        total = sum(by_outcome.values())
        missed = by_outcome.get("NO_ANSWER", 0) + by_outcome.get("BUSY", 0)
        return total, missed, by_outcome

    cur_calls, cur_missed, _ = await call_stats(s_dt, e_dt)
    prev_calls, prev_missed, _ = await call_stats(ps_dt, pe_dt)

    # -------------------------------------------------------------
    # RECALLS / WELLNESS / APPOINTMENT REMINDERS (GeneratedEnquiry based)
    # -------------------------------------------------------------
    def enq_scope(q):
        if hospital_id:
            q = q.where(GeneratedEnquiry.hospital_id == hospital_id)
        if doctor:
            q = q.where(GeneratedEnquiry.doctor_id == doctor)
        return q

    RECALL_TYPES = ("RECALL",)
    WELLNESS_TYPES = ("TREATMENT_WELLNESS", "CASE_WELLNESS")
    APPT_REMINDER_TYPES = ("APPOINTMENT_REMINDER",)
    ENQUIRY_TERMINAL = ["COMPLETED", "CANCELLED", "LOST", "CONVERTED"]

    def due_scope(types, start, end):
        return enq_scope(select(GeneratedEnquiry)).where(
            GeneratedEnquiry.enquiry_type.in_(types),
            GeneratedEnquiry.status.notin_(ENQUIRY_TERMINAL),
            ((GeneratedEnquiry.due_date >= start) & (GeneratedEnquiry.due_date <= end))
            | (GeneratedEnquiry.due_date < start),
        )

    async def enq_due_count(types, start, end):
        return await count(due_scope(types, start, end))

    cur_recalls = await enq_due_count(RECALL_TYPES, d_start, d_end)
    prev_recalls = await enq_due_count(RECALL_TYPES, prev_start, prev_end)
    cur_wellness = await enq_due_count(WELLNESS_TYPES, d_start, d_end)
    prev_wellness = await enq_due_count(WELLNESS_TYPES, prev_start, prev_end)
    cur_appt_reminders = await enq_due_count(APPT_REMINDER_TYPES, d_start, d_end)
    prev_appt_reminders = await enq_due_count(APPT_REMINDER_TYPES, prev_start, prev_end)

    # Leads ready for conversion (current state)
    LEAD_READY_STATUSES = ["APPOINTMENT_BOOKED", "VISITED", "INTERESTED", "FOLLOW_UP_REQUIRED"]
    leads_ready_now = await count(lead_scope(select(Lead).where(Lead.status.in_(LEAD_READY_STATUSES))))

    # Unread / failed messages (current state)
    cur_unread = await count(comm_scope(select(CommunicationLog)).where(CommunicationLog.status.in_(["SENT", "DELIVERED"])))
    cur_failed = await count(comm_scope(select(CommunicationLog)).where(CommunicationLog.status == "FAILED"))

    def pct(cur, prev):
        if prev is None or prev == 0:
            return None
        return round((cur - prev) / prev * 100, 1)

    def change(cur, prev, invert=False):
        c = pct(cur, prev)
        if c is None:
            return None
        return -c if invert else c

    def drill(entity, params=None):
        return {"entity": entity, "params": params or {}}

    kpis = [
        {"key": "new_leads", "label": "New Leads", "value": cur_new, "change": change(cur_new, prev_new), "positive_is_good": True, "raw": cur_new, "previous": prev_new, "drilldown": drill("leads")},
        {"key": "open_leads", "label": "Open Leads", "value": cur_open, "change": change(cur_open, prev_open), "positive_is_good": True, "raw": cur_open, "previous": prev_open, "drilldown": drill("leads", {"open": "1"})},
        {"key": "leads_ready_for_conversion", "label": "Ready for Conversion", "value": leads_ready_now, "change": None, "positive_is_good": True, "raw": leads_ready_now, "previous": None, "drilldown": drill("leads", {"statuses": ",".join(LEAD_READY_STATUSES)})},
        {"key": "converted_leads", "label": "Conversions", "value": cur_conv, "change": change(cur_conv, prev_conv), "positive_is_good": True, "raw": cur_conv, "previous": prev_conv, "drilldown": drill("leads", {"status": LeadStatus.CONVERTED.value})},
        {"key": "conversion_rate", "label": "Conversion Rate", "value": cur_conv_rate, "change": change(cur_conv_rate, prev_conv_rate), "positive_is_good": True, "raw": cur_conv_rate, "previous": prev_conv_rate, "suffix": "%", "drilldown": drill("leads")},
        {"key": "pending_follow_ups", "label": "Follow-Ups Due", "value": cur_fu, "change": change(cur_fu, prev_fu), "positive_is_good": True, "raw": cur_fu, "previous": prev_fu, "drilldown": drill("enquiry-calendar")},
        {"key": "overdue_follow_ups", "label": "Overdue Follow-Ups", "value": overdue, "change": None, "positive_is_good": False, "raw": overdue, "previous": None, "drilldown": drill("enquiry-calendar", {"overdue": "1"})},
        {"key": "recalls_due", "label": "Recalls Due", "value": cur_recalls, "change": change(cur_recalls, prev_recalls), "positive_is_good": True, "raw": cur_recalls, "previous": prev_recalls, "drilldown": drill("enquiry-calendar", {"type": "RECALL"})},
        {"key": "wellness_due", "label": "Wellness Check-ins", "value": cur_wellness, "change": change(cur_wellness, prev_wellness), "positive_is_good": True, "raw": cur_wellness, "previous": prev_wellness, "drilldown": drill("enquiry-calendar", {"type": "WELLNESS"})},
        {"key": "appointment_reminders_due", "label": "Appointment Reminders", "value": cur_appt_reminders, "change": change(cur_appt_reminders, prev_appt_reminders), "positive_is_good": True, "raw": cur_appt_reminders, "previous": prev_appt_reminders, "drilldown": drill("enquiry-calendar", {"type": "APPOINTMENT_REMINDER"})},
        {"key": "avg_response_hours", "label": "Response Time", "value": cur_response, "change": change(cur_response, prev_response, invert=True), "positive_is_good": False, "raw": cur_response, "previous": prev_response, "suffix": "h", "drilldown": drill("leads")},
        {"key": "avg_lead_age", "label": "Lead Age", "value": cur_age, "change": change(cur_age, prev_age, invert=True), "positive_is_good": False, "raw": cur_age, "previous": prev_age, "suffix": "d", "drilldown": drill("leads", {"open": "1"})},
        {"key": "whatsapp_sent", "label": "WhatsApp Sent", "value": cur_comm[5], "change": change(cur_comm[5], prev_comm[5]), "positive_is_good": True, "raw": cur_comm[5], "previous": prev_comm[5], "drilldown": drill("whatsapp")},
        {"key": "communication_success_rate", "label": "Comm. Success", "value": cur_comm[6], "change": change(cur_comm[6], prev_comm[6]), "positive_is_good": True, "raw": cur_comm[6], "previous": prev_comm[6], "suffix": "%", "drilldown": drill("whatsapp")},
        {"key": "unread_messages", "label": "Unread Messages", "value": cur_unread, "change": None, "positive_is_good": False, "raw": cur_unread, "previous": None, "drilldown": drill("whatsapp", {"status": "unread"})},
        {"key": "failed_messages", "label": "Failed Messages", "value": cur_failed, "change": None, "positive_is_good": False, "raw": cur_failed, "previous": None, "drilldown": drill("whatsapp", {"status": "failed"})},
        {"key": "calls_made", "label": "Calls Made", "value": cur_calls, "change": change(cur_calls, prev_calls), "positive_is_good": True, "raw": cur_calls, "previous": prev_calls, "drilldown": drill("leads", {"tab": "calls"})},
        {"key": "missed_calls", "label": "Missed Calls", "value": cur_missed, "change": change(cur_missed, prev_missed, invert=True), "positive_is_good": False, "raw": cur_missed, "previous": prev_missed, "drilldown": drill("leads", {"tab": "calls"})},
    ]

    # -------------------------------------------------------------
    # LEAD ANALYTICS
    # -------------------------------------------------------------
    in_range_leads = lead_scope(select(Lead), s_dt, e_dt)
    lead_sub = in_range_leads.subquery()

    # Growth trend bucketed by day/week/month depending on window length
    span_days = (d_end - d_start).days + 1
    key_fmt = "%Y-%m-%d" if span_days <= 31 else "%Y-%m"

    from collections import OrderedDict
    trend_map = OrderedDict()
    if span_days <= 31:
        day_rows = (await db.execute(
            select(func.date_trunc("day", lead_sub.c.created_at), lead_sub.c.status)
        )).all()
        for created, status in day_rows:
            key = created.strftime(key_fmt) if created else "?"
            entry = trend_map.setdefault(key, {"label": key, "leads": 0, "converted": 0})
            entry["leads"] += 1
            if status == LeadStatus.CONVERTED.value:
                entry["converted"] += 1
    else:
        raw_rows = (await db.execute(
            select(lead_sub.c.created_at, lead_sub.c.status)
        )).all()
        for created, status in raw_rows:
            if created is None:
                key = "?"
            elif span_days <= 120:
                iso = created.isocalendar()
                key = f"{iso[0]}-W{iso[1]:02d}"
            else:
                key = created.strftime(key_fmt)
            entry = trend_map.setdefault(key, {"label": key, "leads": 0, "converted": 0})
            entry["leads"] += 1
            if status == LeadStatus.CONVERTED.value:
                entry["converted"] += 1
    growth_trend = list(trend_map.values())

    by_source_rows = (await db.execute(
        select(lead_sub.c.source, func.count()).group_by(lead_sub.c.source)
    )).all()
    by_source = [{"name": r[0].replace("_", " ").title(), "key": r[0], "value": r[1]} for r in by_source_rows]

    by_status_rows = (await db.execute(
        select(lead_sub.c.status, func.count()).group_by(lead_sub.c.status)
    )).all()
    by_status = [{"name": r[0].replace("_", " ").title(), "key": r[0], "value": r[1]} for r in by_status_rows]

    by_priority_rows = (await db.execute(
        select(lead_sub.c.priority, func.count()).group_by(lead_sub.c.priority)
    )).all()
    by_priority = [{"name": r[0].title(), "key": r[0], "value": r[1]} for r in by_priority_rows]

    # Funnel (from leads created in the period)
    total_funnel = cur_new
    contacted_rows = (await db.execute(
        in_range_leads.with_only_columns(Lead.id).where(
            Lead.last_contacted_at.isnot(None) | Lead.status.in_(["CONTACTED", "INTERESTED", "FOLLOW_UP_REQUIRED", "APPOINTMENT_BOOKED", "VISITED", "CONVERTED", "LOST"])
        )
    )).all()
    contacted = len(contacted_rows)
    interested = await count(in_range_leads.where(Lead.status.in_(["INTERESTED", "FOLLOW_UP_REQUIRED", "APPOINTMENT_BOOKED", "VISITED", "CONVERTED"])))
    booked = await count(in_range_leads.where(Lead.status.in_(["APPOINTMENT_BOOKED", "VISITED", "CONVERTED"])))
    converted_in_range = await count(in_range_leads.where(Lead.status == LeadStatus.CONVERTED.value))
    funnel = [
        {"stage": "New", "value": total_funnel},
        {"stage": "Contacted", "value": contacted},
        {"stage": "Interested", "value": interested},
        {"stage": "Appointment", "value": booked},
        {"stage": "Converted", "value": converted_in_range},
    ]

    # Lead ageing buckets for open leads from the period
    now_utc = datetime.now(timezone.utc)
    ageing = {k: 0 for k in ["0-3d", "4-7d", "8-14d", "15-30d", "30+d"]}
    open_rows = (await db.execute(
        in_range_leads.with_only_columns(Lead.created_at).where(Lead.status.notin_(TERMINAL_LEAD_STATUSES))
    )).all()
    for row in open_rows:
        days = (now_utc - row[0]).total_seconds() / 86400 if row[0] else 0
        if days <= 3:
            ageing["0-3d"] += 1
        elif days <= 7:
            ageing["4-7d"] += 1
        elif days <= 14:
            ageing["8-14d"] += 1
        elif days <= 30:
            ageing["15-30d"] += 1
        else:
            ageing["30+d"] += 1
    ageing_buckets = [{"name": k, "value": v} for k, v in ageing.items()]

    # -------------------------------------------------------------
    # COMMUNICATION CENTER
    # -------------------------------------------------------------
    comm_range_base = comm_scope(select(CommunicationLog)).where(CommunicationLog.created_at >= s_dt, CommunicationLog.created_at <= e_dt)

    by_channel_rows = (await db.execute(
        comm_range_base.with_only_columns(CommunicationLog.channel, func.count()).group_by(CommunicationLog.channel)
    )).all()
    by_channel = [{"name": r[0], "value": r[1]} for r in by_channel_rows]

    by_comm_status = [
        {"name": "Pending", "value": cur_comm[4]},
        {"name": "Sent", "value": cur_comm[0]},
        {"name": "Delivered", "value": cur_comm[1]},
        {"name": "Read", "value": cur_comm[2]},
        {"name": "Failed", "value": cur_comm[3]},
    ]

    comm_trend_map = OrderedDict()
    day_trunc = func.date_trunc("day", CommunicationLog.created_at)
    comm_day_rows = (await db.execute(
        comm_range_base.with_only_columns(day_trunc, func.count())
        .group_by(day_trunc).order_by(day_trunc)
    )).all()
    for created, c in comm_day_rows:
        key = created.strftime("%Y-%m-%d") if created else "?"
        comm_trend_map[key] = c
    comm_trend = [{"label": k, "messages": v} for k, v in comm_trend_map.items()]

    # Recent communications (CommunicationLog + lead comms merged)
    comm_recent_rows = (await db.execute(
        comm_range_base.order_by(CommunicationLog.created_at.desc()).limit(8)
    )).scalars().all()
    recent_comm = []
    for cl in comm_recent_rows:
        pat = await db.get(Patient, cl.patient_id) if cl.patient_id else None
        recent_comm.append({
            "id": str(cl.id), "entity": "patient",
            "name": pat.full_name if pat else "Patient",
            "channel": cl.channel, "message_type": cl.message_type, "status": cl.status,
            "created_at": cl.created_at.isoformat() if cl.created_at else None,
            "link": f"/patients/{cl.patient_id}" if cl.patient_id else None,
        })
    lead_comm_base = select(LeadCommunication)
    if hospital_id:
        lead_comm_base = lead_comm_base.where(LeadCommunication.hospital_id == hospital_id)
    lead_comm_rows = (await db.execute(
        lead_comm_base.where(LeadCommunication.created_at >= s_dt, LeadCommunication.created_at <= e_dt)
        .order_by(LeadCommunication.created_at.desc()).limit(6)
    )).scalars().all()
    for lc in lead_comm_rows:
        lead = await db.get(Lead, lc.lead_id) if lc.lead_id else None
        recent_comm.append({
            "id": str(lc.id), "entity": "lead",
            "name": lead.lead_name if lead else "Lead",
            "channel": lc.channel, "message_type": lc.message_type, "status": lc.delivery_status or lc.status,
            "created_at": lc.created_at.isoformat() if lc.created_at else None,
            "link": f"/leads/{lc.lead_id}" if lc.lead_id else None,
        })
    recent_comm.sort(key=lambda x: x["created_at"] or "", reverse=True)
    recent_comm = recent_comm[:10]

    # -------------------------------------------------------------
    # ENQUIRY ANALYTICS (recall / wellness / appointment reminders)
    # -------------------------------------------------------------
    enq_range_base = enq_scope(select(GeneratedEnquiry)).where(
        GeneratedEnquiry.due_date >= d_start, GeneratedEnquiry.due_date <= d_end)

    enq_by_type = [{"name": r[0].replace("_", " ").title(), "key": r[0], "value": r[1]} for r in (await db.execute(
        enq_range_base.with_only_columns(GeneratedEnquiry.enquiry_type, func.count()).group_by(GeneratedEnquiry.enquiry_type)
    )).all()]
    enq_by_status = [{"name": r[0], "key": r[0], "value": r[1]} for r in (await db.execute(
        enq_range_base.with_only_columns(GeneratedEnquiry.status, func.count()).group_by(GeneratedEnquiry.status)
    )).all()]
    enq_total = await count(enq_range_base)
    enq_open = await count(enq_range_base.where(GeneratedEnquiry.status.notin_(ENQUIRY_TERMINAL)))
    enq_completed = await count(enq_range_base.where(GeneratedEnquiry.status == "COMPLETED"))
    enq_overdue = await count(enq_range_base.where(GeneratedEnquiry.due_date < today, GeneratedEnquiry.status.notin_(ENQUIRY_TERMINAL)))

    enq_trend_map = OrderedDict()
    enq_trunc = func.date_trunc("day", GeneratedEnquiry.due_date)
    enq_day_rows = (await db.execute(
        enq_range_base.with_only_columns(enq_trunc, func.count()).group_by(enq_trunc).order_by(enq_trunc)
    )).all()
    for created, c in enq_day_rows:
        key = created.strftime("%Y-%m-%d") if created else "?"
        enq_trend_map[key] = c
    enq_trend = [{"label": k, "enquiries": v} for k, v in enq_trend_map.items()]

    # Actionable recall / wellness / reminder list (due through period end)
    rw_types = RECALL_TYPES + WELLNESS_TYPES + APPT_REMINDER_TYPES
    rw_rows = (await db.execute(
        enq_scope(select(GeneratedEnquiry)).where(
            GeneratedEnquiry.enquiry_type.in_(rw_types),
            GeneratedEnquiry.status.notin_(ENQUIRY_TERMINAL),
            GeneratedEnquiry.due_date <= d_end)
        .order_by(GeneratedEnquiry.due_date.asc()).limit(12)
    )).scalars().all()
    recall_wellness_list = []
    for e in rw_rows:
        pat = await db.get(Patient, e.patient_id) if e.patient_id else None
        lead = await db.get(Lead, e.lead_id) if e.lead_id else None
        recall_wellness_list.append({
            "id": str(e.id),
            "enquiry_type": e.enquiry_type,
            "patient_id": str(e.patient_id) if e.patient_id else None,
            "name": pat.full_name if pat else (lead.lead_name if lead else "—"),
            "phone": pat.phone if pat else None,
            "due_date": e.due_date.isoformat() if e.due_date else None,
            "status": e.status,
            "priority": e.priority,
            "treatment_name": e.treatment_name,
            "link": f"/crm/enquiry-calendar?focus={e.id}",
        })

    # -------------------------------------------------------------
    # CONVERSIONS
    # -------------------------------------------------------------
    conv_rows = (await db.execute(
        in_range_leads.where(Lead.status == LeadStatus.CONVERTED.value)
        .order_by(Lead.updated_at.desc()).limit(8)
    )).scalars().all()
    conversions = [{
        "id": str(l.id), "name": l.lead_name, "source": l.source,
        "converted_at": (l.updated_at or l.created_at).isoformat(),
        "link": f"/leads/{l.id}",
        "converted_patient_id": str(l.converted_patient_id) if l.converted_patient_id else None,
    } for l in conv_rows]

    # -------------------------------------------------------------
    # TODAY'S WORK QUEUE
    # -------------------------------------------------------------
    work_q = fu_scope(select(FollowUp)).where(
        FollowUp.follow_up_date == today,
        FollowUp.status.in_(OPEN_FOLLOW_UP_STATUSES)
    ).order_by(FollowUp.follow_up_time).limit(25)
    work_rows = (await db.execute(work_q)).scalars().all()
    work_queue = []
    for fu in work_rows:
        pat = await db.get(Patient, fu.patient_id) if fu.patient_id else None
        doc = await db.get(User, fu.doctor_id) if fu.doctor_id else None
        work_queue.append({
            "id": str(fu.id), "patient_id": str(fu.patient_id) if fu.patient_id else None,
            "patient_name": pat.full_name if pat else "Unknown",
            "op_number": pat.op_no if pat else None,
            "patient_phone": pat.phone if pat else None,
            "doctor_name": doc.full_name if doc else None,
            "follow_up_type": fu.follow_up_type,
            "treatment_name": fu.treatment_name,
            "due_time": fu.follow_up_time.strftime("%H:%M") if fu.follow_up_time else None,
            "status": fu.status,
            "link": f"/crm/enquiry-calendar?focus={fu.id}",
        })

    # -------------------------------------------------------------
    # RECENT ACTIVITY FEED
    # -------------------------------------------------------------
    activity = []
    for cl in recent_comm[:5]:
        activity.append({
            "id": f"comm-{cl['id']}", "description": f"{cl['channel'].title()} {cl['message_type'].replace('_', ' ').title()} → {cl['name']}",
            "date": cl["created_at"], "type": "communication", "link": cl["link"],
        })
    for l in conv_rows[:4]:
        activity.append({
            "id": f"conv-{l.id}", "description": f"{l.lead_name} converted to patient",
            "date": (l.updated_at or l.created_at).isoformat(), "type": "conversion", "link": f"/leads/{l.id}",
        })
    for fu in work_rows[:4]:
        activity.append({
            "id": f"fu-{fu.id}", "description": f"{fu.follow_up_type.replace('_', ' ').title()} for {fu.patient_id or 'lead'}",
            "date": datetime.combine(fu.follow_up_date, datetime.min.time()).isoformat(),
            "type": "follow_up", "link": f"/crm/enquiry-calendar?focus={fu.id}",
        })
    activity.sort(key=lambda x: x["date"] or "", reverse=True)

    # -------------------------------------------------------------
    # TODAY'S COMMAND CENTER (what needs attention right now)
    # -------------------------------------------------------------
    follow_ups_due_today = await count(fu_scope(select(FollowUp)).where(
        FollowUp.follow_up_date == today, FollowUp.status.in_(OPEN_FOLLOW_UP_STATUSES)))
    converted_today = await count(lead_scope(select(Lead)).where(
        Lead.status == LeadStatus.CONVERTED.value, Lead.updated_at >= s_dt, Lead.updated_at <= e_dt))

    today_center = {
        "date": today.isoformat(),
        "follow_ups_due_today": follow_ups_due_today,
        "overdue_follow_ups": overdue,
        "recalls_due": await count(due_scope(RECALL_TYPES, today, today)),
        "wellness_due": await count(due_scope(WELLNESS_TYPES, today, today)),
        "appointment_reminders_due": await count(due_scope(APPT_REMINDER_TYPES, today, today)),
        "leads_ready_for_conversion": leads_ready_now,
        "converted_today": converted_today,
        "unread_messages": cur_unread,
        "failed_messages": cur_failed,
        "calls_made": cur_calls,
        "missed_calls": cur_missed,
    }

    return {
        "meta": {
            "period": period,
            "date_start": d_start.isoformat(), "date_end": d_end.isoformat(),
            "prev_start": prev_start.isoformat(), "prev_end": prev_end.isoformat(),
            "generated_at": now_utc.isoformat(),
        },
        "kpis": kpis,
        "today": today_center,
        "lead_analytics": {
            "growth_trend": growth_trend, "by_source": by_source, "by_status": by_status,
            "by_priority": by_priority, "funnel": funnel, "ageing_buckets": ageing_buckets,
        },
        "enquiry_analytics": {
            "by_type": enq_by_type,
            "by_status": enq_by_status,
            "total": enq_total,
            "open": enq_open,
            "completed": enq_completed,
            "overdue": enq_overdue,
            "trend": enq_trend,
        },
        "recall_wellness": {
            "recalls": {"due": cur_recalls},
            "wellness": {"due": cur_wellness},
            "appointment_reminders": {"due": cur_appt_reminders},
            "list": recall_wellness_list,
        },
        "communication": {
            "by_channel": by_channel, "by_status": by_comm_status,
            "calls": {"total": cur_calls, "missed": cur_missed},
            "trend": comm_trend, "recent": recent_comm,
        },
        "conversions": {"recent": conversions, "count": cur_conv},
        "work_queue": work_queue,
        "activity": activity,
    }
