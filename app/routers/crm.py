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
from app.models.follow_up import FollowUp, FollowUpStatus
from app.services.status_automation import StatusAutomationService
from app.models.email_template import EmailTemplate
from app.models.patient import Patient
from app.models.user import User
from app.models.hospital import Hospital
from app.models.case import Case
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
