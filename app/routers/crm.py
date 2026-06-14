from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, date, time, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import Role, Permission, verify_permission
from app.models.communication_log import CommunicationLog, CommunicationChannel, CommunicationStatus, MessageType
from app.models.notification import Notification
from app.models.patient_feedback import PatientFeedback
from app.models.follow_up import FollowUp, FollowUpStatus, FollowUpType
from app.models.follow_up_response import FollowUpResponse, FollowUpResponseStatus
from app.models.whatsapp_template import WhatsAppTemplate
from app.services.status_automation import StatusAutomationService
from app.models.email_template import EmailTemplate
from app.models.patient import Patient
from app.models.user import User
from app.models.hospital import Hospital
from app.models.case import Case
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.billing import Billing
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType
from app.utils.whatsapp import WhatsAppProvider
from app.utils.pdf import generate_invoice_pdf
from app.utils.template_engine import TemplateEngine

router = APIRouter(prefix="/crm", tags=["CRM"])

# --- Schemas ---

class SendWhatsAppRequest(BaseModel):
    patient_id: str
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

class DeliveryCallbackRequest(BaseModel):
    log_id: str
    status: str
    provider_response: Optional[str] = None


async def _get_patients_for_broadcast(
    db: AsyncSession,
    hospital_id: Optional[str],
    req: BroadcastRequest,
) -> tuple[list[Patient], list[str]]:
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
    appointment_date_str: Optional[str] = None,
) -> dict:
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
        appointment_date=appointment_date_str,
    )


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
    attachment_url: Optional[str] = None,
) -> CommunicationLog:
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
        attachment_url=attachment_url,
    )
    db.add(log)
    return log


# --- WhatsApp ---

@router.post("/whatsapp/send")
async def send_whatsapp(
    req: SendWhatsAppRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    patient = await db.get(Patient, req.patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    if not patient.phone:
        raise HTTPException(status_code=400, detail="Patient has no phone number")
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
        hospital_name=hospital_name,
    )
    rendered = TemplateEngine.render_template(req.message, variables)
    provider = WhatsAppProvider()
    success = await provider.send_message(patient.phone, rendered)
    status_val = CommunicationStatus.SENT.value if success else CommunicationStatus.FAILED.value
    log = await _log_communication(
        db, req.patient_id, hospital_id, current_user.get("sub"),
        CommunicationChannel.WHATSAPP.value, req.message_type, rendered, status_val,
    )
    await db.commit()
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send WhatsApp message")
    return {"success": True, "log_id": log.id, "rendered_message": rendered}


@router.post("/whatsapp/preview")
async def preview_broadcast(
    req: BroadcastRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    hospital_id = current_user.get("hospital_id")
    patients, errors = await _get_patients_for_broadcast(db, hospital_id, req)
    recipients = [{"id": p.id, "name": p.full_name, "phone": p.phone} for p in patients]
    return {
        "total_recipients": len(patients),
        "recipients": recipients,
        "errors": errors,
        "estimated_delivery": f"~{len(patients) * 2} seconds",
    }


@router.post("/whatsapp/broadcast")
async def broadcast_whatsapp(
    req: BroadcastRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
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
            CommunicationChannel.WHATSAPP.value, req.message_type, rendered, status_val,
        )
        if success:
            sent += 1
        else:
            failed += 1
    await db.commit()
    return {
        "success": True,
        "sent": sent,
        "failed": failed,
        "total": len(patients),
        "errors": errors,
    }


@router.post("/whatsapp/delivery-callback")
async def delivery_callback(
    req: DeliveryCallbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
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
    current_user: dict = Depends(get_current_user),
):
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
        hospital_name=hospital_name,
    )
    rendered_subject = TemplateEngine.render_template(req.subject, variables)
    rendered_body = TemplateEngine.render_template(req.body, variables)
    attachment_url = None
    if req.attach_invoice and req.invoice_id:
        attachment_url = await generate_invoice_pdf(db, req.invoice_id)
    log = await _log_communication(
        db, req.patient_id, hospital_id, current_user.get("sub"),
        CommunicationChannel.EMAIL.value, req.message_type, rendered_body,
        CommunicationStatus.SENT.value, subject=rendered_subject,
        attachment_url=attachment_url,
    )
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
    current_user: dict = Depends(get_current_user),
):
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
    current_user: dict = Depends(get_current_user),
):
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
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(EmailTemplate).where(EmailTemplate.is_active == True))
    templates = result.scalars().all()
    return [{"id": str(t.id), "name": t.name, "subject": t.subject, "body": t.body, "is_active": t.is_active} for t in templates]


@router.post("/templates")
async def create_template(
    req: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
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
    current_user: dict = Depends(get_current_user),
):
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
    current_user: dict = Depends(get_current_user),
):
    patient = await db.get(Patient, req.patient_id)
    if not patient: raise HTTPException(status_code=404, detail="Patient not found")
    hospital_id = current_user.get("hospital_id") or patient.hospital_id
    fb = PatientFeedback(
        patient_id=req.patient_id, hospital_id=hospital_id,
        doctor_id=req.doctor_id, case_id=req.case_id,
        rating=req.rating, review=req.review, comments=req.comments,
    )
    db.add(fb)
    await db.commit()
    return {"success": True, "id": str(fb.id)}


@router.get("/feedback")
async def list_feedback(
    hospital_id: Optional[str] = Query(None),
    doctor_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = select(PatientFeedback)
    if hospital_id: query = query.where(PatientFeedback.hospital_id == hospital_id)
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
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    hospital_id = current_user.get("hospital_id")
    follow_up_date = date.fromisoformat(req.follow_up_date)
    follow_up_time = time.fromisoformat(req.follow_up_time) if req.follow_up_time else time(9, 0)
    doctor_id = req.doctor_id or current_user.get("sub")

    # 1. Create the follow-up
    fu = FollowUp(
        patient_id=req.patient_id, hospital_id=hospital_id,
        doctor_id=doctor_id, case_id=req.case_id,
        follow_up_date=follow_up_date, follow_up_time=follow_up_time,
        notes=req.notes, status=FollowUpStatus.SCHEDULED.value,
    )
    db.add(fu)
    await db.flush()

    # 2. Auto-create appointment with type FOLLOW_UP
    appt = Appointment(
        patient_id=req.patient_id, doctor_id=doctor_id,
        appointment_date=follow_up_date, appointment_time=follow_up_time,
        status=AppointmentStatus.SCHEDULED,
        appointment_type=AppointmentType.FOLLOW_UP,
        notes=req.notes,
    )
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
        appointment_time=str(follow_up_time),
    )

    # 4. Send WhatsApp to patient (if phone available)
    if patient and patient.phone:
        whatsapp_message = TemplateEngine.render_template(
            "Dear {{patient_name}}, your follow-up appointment has been scheduled for {{appointment_date}} at {{appointment_time}} with Dr. {{doctor_name}} at {{hospital_name}}. Please arrive on time.",
            variables,
        )
        provider = WhatsAppProvider()
        whatsapp_success = await provider.send_message(patient.phone, whatsapp_message)
        if whatsapp_success:
            await _log_communication(
                db, req.patient_id, hospital_id, doctor_id,
                CommunicationChannel.WHATSAPP.value, "FOLLOW_UP_REMINDER",
                whatsapp_message, CommunicationStatus.SENT.value,
            )

    # 5. Send email to patient (if email available)
    if patient and patient.email:
        subject = TemplateEngine.render_template(
            "Follow-Up Appointment Scheduled - {{hospital_name}}", variables)
        body = TemplateEngine.render_template(
            "Dear {{patient_name}},<br><br>Your follow-up appointment has been scheduled:<br><br>"
            "Date: {{appointment_date}}<br>Time: {{appointment_time}}<br>"
            "Doctor: Dr. {{doctor_name}}<br>Location: {{hospital_name}}<br><br>"
            "Please arrive 15 minutes early.<br><br>Thank you,<br>{{hospital_name}}",
            variables,
        )
        await _log_communication(
            db, req.patient_id, hospital_id, doctor_id,
            CommunicationChannel.EMAIL.value, "FOLLOW_UP_REMINDER",
            body, CommunicationStatus.SENT.value, subject=subject,
        )

    # 6. Send in-app notification to the doctor
    notif = Notification(
        user_id=doctor_id, hospital_id=hospital_id,
        type="follow_up_assigned",
        title="New Follow-Up Assigned",
        description=TemplateEngine.render_template(
            "Follow-up scheduled for {{patient_name}} on {{appointment_date}} at {{appointment_time}}.",
            variables,
        ),
        entity_type="follow_up", entity_id=fu.id,
    )
    db.add(notif)

    await db.commit()
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
    current_user: dict = Depends(get_current_user),
):
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
    await db.delete(fu)
    await db.commit()
    return {"success": True}


@router.put("/follow-ups/{follow_up_id}")
async def update_follow_up(
    follow_up_id: str, req: FollowUpUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    fu = await db.get(FollowUp, follow_up_id)
    if not fu: raise HTTPException(status_code=404, detail="Follow-up not found")
    if req.status is not None: fu.status = req.status
    if req.notes is not None: fu.notes = req.notes
    # Sync linked appointment status
    if req.status is not None and fu.appointment_id:
        appt = await db.get(Appointment, fu.appointment_id)
        if appt:
            if req.status == "SCHEDULED":
                appt.status = AppointmentStatus.SCHEDULED
            elif req.status == "COMPLETED":
                appt.status = AppointmentStatus.COMPLETED
            elif req.status == "MISSED":
                appt.status = AppointmentStatus.NO_SHOW
            elif req.status == "CANCELLED":
                appt.status = AppointmentStatus.CANCELLED
    await db.commit()
    if req.status is not None:
        svc = StatusAutomationService(db)
        await svc.update_followup_status(follow_up_id, FollowUpStatus(req.status))
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
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    fu = await db.get(FollowUp, follow_up_id)
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    fr = FollowUpResponse(
        follow_up_id=follow_up_id,
        patient_id=req.patient_id,
        hospital_id=fu.hospital_id,
        response_message=req.response_message,
        response_status=req.response_status,
    )
    db.add(fr)
    fu.status = FollowUpStatus.COMPLETED.value
    await db.commit()
    return {"success": True, "id": str(fr.id)}


@router.get("/follow-up-responses/{patient_id}")
async def get_patient_follow_up_responses(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
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
    current_user: dict = Depends(get_current_user),
):
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
        func.count(CommunicationLog.id).label("count"),
    ).where(CommunicationLog.created_at >= since)
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
    current_user: dict = Depends(get_current_user),
):
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
    current_user: dict = Depends(get_current_user),
):
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
    current_user: dict = Depends(get_current_user),
):
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
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    t = await db.get(WhatsAppTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    if req.name is not None: t.name = req.name
    if req.message is not None: t.message = req.message
    if req.is_active is not None: t.is_active = req.is_active
    await db.commit()
    return {"success": True}


@router.delete("/whatsapp-templates/{template_id}")
async def delete_whatsapp_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    t = await db.get(WhatsAppTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(t)
    await db.commit()
    return {"success": True}


# --- CRM Dashboard (Follow-Up Reminders + Metrics) ---

@router.get("/dashboard")
async def get_crm_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    hospital_id = current_user.get("hospital_id")
    today = date.today()

    base = select(FollowUp)
    if hospital_id:
        base = base.where(FollowUp.hospital_id == hospital_id)

    # Today's follow-ups
    today_q = base.where(FollowUp.follow_up_date == today)
    today_fus = (await db.execute(today_q.order_by(FollowUp.follow_up_time).limit(50))).scalars().all()

    # Metrics
    all_q = base
    total = (await db.execute(select(func.count()).select_from(all_q.subquery()))).scalar() or 0
    pending_q = base.where(FollowUp.status.in_(["SCHEDULED", "PENDING", "CONTACTED", "NO_RESPONSE"]))
    pending = (await db.execute(select(func.count()).select_from(pending_q.subquery()))).scalar() or 0
    completed_q = base.where(FollowUp.status == "COMPLETED")
    completed = (await db.execute(select(func.count()).select_from(completed_q.subquery()))).scalar() or 0
    overdue_q = base.where(FollowUp.follow_up_date < today, FollowUp.status.in_(["SCHEDULED", "PENDING", "CONTACTED", "NO_RESPONSE"]))
    overdue = (await db.execute(select(func.count()).select_from(overdue_q.subquery()))).scalar() or 0
    one_day_q = base.where(FollowUp.follow_up_type == "1_DAY_POST_TREATMENT", FollowUp.follow_up_date == today)
    one_day_due = (await db.execute(select(func.count()).select_from(one_day_q.subquery()))).scalar() or 0
    six_month_q = base.where(FollowUp.follow_up_type == "6_MONTH_RECALL", FollowUp.follow_up_date == today)
    six_month_due = (await db.execute(select(func.count()).select_from(six_month_q.subquery()))).scalar() or 0

    # Response rate
    responded_q = base.where(FollowUp.status.in_(["RESPONDED", "APPOINTMENT_BOOKED", "COMPLETED"]))
    responded = (await db.execute(select(func.count()).select_from(responded_q.subquery()))).scalar() or 0
    # WhatsApp messages sent from follow-ups
    whatsapp_q = base.where(FollowUp.whatsapp_sent_at.isnot(None))
    whatsapp_sent = (await db.execute(select(func.count()).select_from(whatsapp_q.subquery()))).scalar() or 0
    # WhatsApp response rate
    whatsapp_responded_q = base.where(FollowUp.whatsapp_sent_at.isnot(None), FollowUp.status.in_(["RESPONDED", "APPOINTMENT_BOOKED", "COMPLETED"]))
    whatsapp_responded = (await db.execute(select(func.count()).select_from(whatsapp_responded_q.subquery()))).scalar() or 0

    # Patient source analytics
    patient_base = select(Patient)
    if hospital_id:
        patient_base = patient_base.where(Patient.hospital_id == hospital_id)
    source_counts_q = patient_base.where(Patient.patient_source.isnot(None)).with_entities(
        Patient.patient_source, func.count(Patient.id).label("count")
    ).group_by(Patient.patient_source).order_by(func.count(Patient.id).desc())
    source_counts = (await db.execute(source_counts_q)).all()
    patients_by_source = [{"source": row[0], "count": row[1]} for row in source_counts]
    total_patients_with_source = sum(row[1] for row in source_counts) or 1
    top_source = patients_by_source[0]["source"] if patients_by_source else None

    # Revenue by source (with patient count)
    revenue_by_source_q = select(
        Patient.patient_source,
        func.coalesce(func.sum(Billing.paid_amount), 0).label("revenue"),
        func.count(Patient.id.distinct()).label("patients")
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
        m_sources_q = patient_base.where(
            Patient.patient_source.isnot(None),
            Patient.created_at >= m_start,
            Patient.created_at <= m_end,
        ).with_entities(
            Patient.patient_source, func.count(Patient.id).label("count")
        ).group_by(Patient.patient_source)
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
    ).outerjoin(Case, Case.patient_id == Patient.id
    ).outerjoin(Billing, Billing.case_id == Case.id
    ).where(Patient.patient_source == "Campaign")
    if hospital_id:
        campaign_revenue_q = campaign_revenue_q.where(Patient.hospital_id == hospital_id)
    campaign_revenue = float((await db.execute(campaign_revenue_q)).scalar() or 0)
    total_revenue_all = float((await db.execute(
        select(func.coalesce(func.sum(Billing.paid_amount), 0))
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
            "total_follow_ups": total,
            "pending_follow_ups": pending,
            "completed_follow_ups": completed,
            "overdue_follow_ups": overdue,
            "one_day_follow_ups_due": one_day_due,
            "six_month_recalls_due": six_month_due,
            "response_rate": round(responded / total * 100, 1) if total else 0,
            "recall_success_rate": round(six_month_due / (six_month_due or 1) * 100, 1) if six_month_due else 0,
            "whatsapp_messages_sent": whatsapp_sent,
            "whatsapp_response_rate": round(whatsapp_responded / (whatsapp_sent or 1) * 100, 1) if whatsapp_sent else 0,
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
    current_user: dict = Depends(get_current_user),
):
    hospital_id = current_user.get("hospital_id")
    today = date.today()

    patient_base = select(Patient)
    if hospital_id:
        patient_base = patient_base.where(Patient.hospital_id == hospital_id)

    source_counts_q = patient_base.where(Patient.patient_source.isnot(None)).with_entities(
        Patient.patient_source, func.count(Patient.id).label("count")
    ).group_by(Patient.patient_source).order_by(func.count(Patient.id).desc())
    source_counts = (await db.execute(source_counts_q)).all()
    patients_by_source = [{"source": row[0], "count": row[1]} for row in source_counts]
    total_with_source = sum(row[1] for row in source_counts) or 1

    revenue_q = select(
        Patient.patient_source,
        func.coalesce(func.sum(Billing.paid_amount), 0).label("revenue"),
        func.count(Patient.id).label("count"),
    ).join(Case, Case.patient_id == Patient.id, isouter=True
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
            Patient.created_at <= (m_start + timedelta(days=32)).replace(day=1) - timedelta(days=1),
        ).with_entities(
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
            Patient.patient_source.isnot(None),
        )
    )).scalar() or 0
    last_month_count = (await db.execute(
        select(func.count(Patient.id)).where(
            Patient.created_at >= last_month_start,
            Patient.created_at <= last_month_end,
            Patient.patient_source.isnot(None),
        )
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
    current_user: dict = Depends(get_current_user),
):
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
            FollowUp.follow_up_date <= today.replace(day=1) + timedelta(days=31),
        )
    elif filter == "overdue":
        q = q.where(
            FollowUp.follow_up_date < today,
            FollowUp.status.in_(["SCHEDULED", "PENDING", "CONTACTED", "NO_RESPONSE"]),
        )
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
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    fu = await db.get(FollowUp, follow_up_id)
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    fu.status = FollowUpStatus.COMPLETED.value
    fu.completed_date = datetime.now(timezone.utc)
    fu.completed_by = current_user.get("sub")
    if req.notes:
        fu.notes = (fu.notes or "") + "\n[Done] " + req.notes
    await db.commit()
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
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    fu = await db.get(FollowUp, follow_up_id)
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")

    hospital_id = current_user.get("hospital_id") or fu.hospital_id
    patient = await db.get(Patient, fu.patient_id)

    if req.channel == "WHATSAPP":
        if not patient or not patient.phone:
            raise HTTPException(status_code=400, detail="Patient has no phone number")
        provider = WhatsAppProvider()
        success = await provider.send_message(patient.phone, req.message)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to send WhatsApp")
        fu.whatsapp_message = req.message
        fu.whatsapp_sent_at = datetime.now(timezone.utc)
        fu.status = FollowUpStatus.OPEN.value
        comm_status = CommunicationStatus.SENT.value
    elif req.channel == "CALL":
        fu.call_made_at = datetime.now(timezone.utc)
        if req.notes:
            fu.call_notes = (fu.call_notes or "") + "\n" + req.notes
        fu.status = FollowUpStatus.OPEN.value
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
        message=req.message,
        status=comm_status,
        sent_at=datetime.now(timezone.utc),
    )
    db.add(log)
    await db.commit()
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
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    fu = await db.get(FollowUp, follow_up_id)
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")

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
        created_by=current_user.get("sub"),
    )
    db.add(fr)

    if req.response_status == "POSITIVE":
        fu.status = FollowUpStatus.COMPLETED.value
    elif req.response_status in ("NEEDS_ATTENTION", "COMPLAINT", "EMERGENCY"):
        fu.status = FollowUpStatus.OPEN.value
    else:
        fu.status = FollowUpStatus.COMPLETED.value

    fu.completed_date = datetime.now(timezone.utc)
    fu.completed_by = current_user.get("sub")

    await db.commit()
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
    current_user: dict = Depends(get_current_user),
):
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
        notes=f"Follow-Up: {req.follow_up_reason}" + (f"\n{req.notes}" if req.notes else ""),
    )
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
        status=FollowUpStatus.SCHEDULED.value,
        created_at=now,
    )
    db.add(follow_up)
    await db.flush()

    # Update the response
    response.follow_up_required = True
    response.appointment_id = str(appt.id)

    await db.commit()
    return {
        "success": True,
        "follow_up_id": str(follow_up.id),
        "appointment_id": str(appt.id),
        "patient_name": patient.full_name,
        "doctor_id": req.doctor_id,
        "follow_up_date": req.follow_up_date.isoformat(),
    }


# --- 6-Month Recall Dashboard ---

@router.get("/recalls")
async def get_recall_list(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    hospital_id = current_user.get("hospital_id")
    today = date.today()
    q = select(FollowUp).where(
        FollowUp.follow_up_type == "6_MONTH_RECALL",
        FollowUp.follow_up_date == today,
    )
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
    current_user: dict = Depends(get_current_user),
):
    q = select(FollowUp).where(FollowUp.patient_id == patient_id).order_by(desc(FollowUp.created_at)).limit(50)
    result = await db.execute(q)
    items = result.scalars().all()
    enriched = []
    for fu in items:
        doctor = await db.get(User, fu.doctor_id) if fu.doctor_id else None
        comms_q = select(CommunicationLog).where(CommunicationLog.follow_up_id == fu.id).order_by(CommunicationLog.created_at.desc()).limit(10)
        comms_result = await db.execute(comms_q)
        comms = [{
            "id": str(c.id), "channel": c.channel,
            "message": c.message, "status": c.status,
            "sent_at": c.sent_at.isoformat() if c.sent_at else None,
        } for c in comms_result.scalars().all()]
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
            "communications": comms,
        })
    return enriched


# --- Enquiry Dashboard ---

@router.get("/enquiry/dashboard")
async def get_enquiry_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
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

    follow_ups_q = base.where(FollowUp.follow_up_type == "MANUAL")
    if hospital_id:
        follow_ups_q = follow_ups_q.where(FollowUp.hospital_id == hospital_id)
    follow_ups_created = (await db.execute(select(func.count()).select_from(follow_ups_q.subquery()))).scalar() or 0

    overdue_q = base.where(
        FollowUp.follow_up_date < today,
        FollowUp.status.in_(["SCHEDULED", "PENDING", "CONTACTED", "NO_RESPONSE"]),
    )
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
    }


# -- Today's Enquiries List --

@router.get("/enquiry/today")
async def get_todays_enquiries(
    tab: str = Query("today", description="Filter: today, tomorrow, week, overdue, recalls, completed, calendar"),
    calendar_date: Optional[str] = Query(None, description="Date for calendar view (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
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
            FollowUp.status.notin_(["COMPLETED", "CANCELLED", "MISSED"]),
        )
    elif tab == "recalls":
        q = q.where(
            FollowUp.follow_up_type == "6_MONTH_RECALL",
            FollowUp.status.notin_(["COMPLETED", "CANCELLED"]),
        ).order_by(FollowUp.follow_up_date)
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


# --- Campaign WhatsApp Sending ---

class CampaignWhatsAppSendRequest(BaseModel):
    campaign_id: str
    template_id: Optional[str] = None
    custom_message: Optional[str] = None


@router.post("/campaigns/send-whatsapp")
async def send_campaign_whatsapp(
    req: CampaignWhatsAppSendRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    from app.models.campaign import Campaign, CampaignRecipient, CampaignRecipientStatus, CampaignStatus

    campaign = await db.get(Campaign, req.campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    template_message = None
    if req.template_id:
        t = await db.get(WhatsAppTemplate, req.template_id)
        if t:
            template_message = t.message

    message = req.custom_message or template_message or campaign.message
    if not message:
        raise HTTPException(status_code=400, detail="No message content")

    hospital_name = None
    if campaign.hospital_id:
        h = await db.get(Hospital, campaign.hospital_id)
        if h:
            hospital_name = h.name

    recipients_q = select(CampaignRecipient).where(
        CampaignRecipient.campaign_id == req.campaign_id,
        CampaignRecipient.status == CampaignRecipientStatus.PENDING,
    )
    recipients = (await db.execute(recipients_q)).scalars().all()

    provider = WhatsAppProvider()
    sent = 0
    failed = 0
    for r in recipients:
        patient = await db.get(Patient, r.patient_id)
        if not patient or not patient.phone:
            r.status = CampaignRecipientStatus.FAILED.value if hasattr(CampaignRecipientStatus, 'FAILED') else "FAILED"
            failed += 1
            continue
        doctor = await db.get(User, patient.doctor_id) if patient.doctor_id else None
        variables = TemplateEngine.build_variables(
            patient_name=patient.full_name,
            doctor_name=doctor.full_name if doctor else None,
            hospital_name=hospital_name,
        )
        rendered = TemplateEngine.render_template(message, variables)
        success = await provider.send_message(patient.phone, rendered)
        if success:
            r.status = CampaignRecipientStatus.SENT.value
            r.response_message = rendered
            sent += 1
        else:
            r.status = "FAILED"
            failed += 1

        log = CommunicationLog(
            patient_id=patient.id, hospital_id=campaign.hospital_id,
            doctor_id=current_user.get("sub"),
            channel="WHATSAPP", message_type="CAMPAIGN",
            message=rendered,
            status="SENT" if success else "FAILED",
            sent_at=datetime.now(timezone.utc) if success else None,
        )
        db.add(log)

    campaign.messages_sent = (campaign.messages_sent or 0) + sent
    campaign.messages_delivered = (campaign.messages_delivered or 0) + sent
    if sent > 0:
        campaign.status = CampaignStatus.ACTIVE if hasattr(CampaignStatus, 'ACTIVE') else "ACTIVE"

    await db.commit()
    return {
        "success": True,
        "sent": sent,
        "failed": failed,
        "total": len(recipients),
    }
