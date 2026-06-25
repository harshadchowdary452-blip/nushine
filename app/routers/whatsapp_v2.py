from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, date, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import joinedload
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import Permission, verify_permission, verify_tenant_access
from app.models.patient import Patient
from app.models.hospital import Hospital
from app.models.user import User
from app.models.appointment import Appointment, AppointmentStatus
from app.models.case import Case
from app.models.treatment_plan import TreatmentPlan
from app.models.treatment_sitting import TreatmentSitting
from app.models.billing import Billing, PaymentStatus
from app.models.follow_up import FollowUp
from app.models.communication_log import CommunicationLog, CommunicationStatus, MessageAudit, MessageType
from app.utils.whatsapp import WhatsAppProvider
import json

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp Messaging v2"])

TEMPLATE_VARIABLES = {
    "{{patient_name}}": "Patient's full name",
    "{{patient_phone}}": "Patient's phone number",
    "{{doctor_name}}": "Assigned doctor name",
    "{{hospital_name}}": "Hospital/clinic name",
    "{{appointment_date}}": "Next scheduled appointment date",
    "{{appointment_time}}": "Next scheduled appointment time",
    "{{treatment_name}}": "Latest treatment name",
    "{{follow_up_date}}": "Next follow-up date",
    "{{recall_date}}": "Next recall date",
    "{{invoice_number}}": "Latest invoice number",
    "{{pending_amount}}": "Pending payment amount",
    "{{due_date}}": "Payment due date",
}


class PreviewRequest(BaseModel):
    patient_id: str
    message: str = Field(..., min_length=1, max_length=2000)
    message_type: str = "GENERAL"


class PreviewResponse(BaseModel):
    patient_id: str
    patient_name: str
    patient_phone: Optional[str] = None
    doctor_name: Optional[str] = None
    hospital_name: Optional[str] = None
    rendered_message: str
    resolved_variables: Dict[str, str]
    unresolved_variables: List[str]
    validation: Dict[str, bool]
    variables_panel: Dict[str, Any]


class SendRequest(BaseModel):
    patient_id: str
    message: str = Field(..., min_length=1, max_length=2000)
    message_type: str = "GENERAL"
    send_mode: str = Field(default="redirect", pattern="^(redirect|api)$")
    template_id: Optional[str] = None
    template_name: Optional[str] = None
    rendered_variables: Optional[Dict[str, str]] = None
    follow_up_id: Optional[str] = None


class SendResponse(BaseModel):
    success: bool
    message_id: Optional[str] = None
    wa_link: Optional[str] = None
    web_link: Optional[str] = None
    phone: Optional[str] = None
    sent_via: str


class BulkPreviewRequest(BaseModel):
    patient_ids: List[str] = Field(..., min_length=1, max_length=500)
    message: str = Field(..., min_length=1, max_length=2000)
    message_type: str = "GENERAL"


class BulkSendRequest(BaseModel):
    items: List[Dict[str, Any]] = Field(..., min_length=1, max_length=500)


class HistoryFilter(BaseModel):
    patient_id: Optional[str] = None
    message_type: Optional[str] = None
    status: Optional[str] = None
    sent_via: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


async def resolve_variables(db: AsyncSession, patient_id: str, hospital_id: Optional[str] = None) -> Dict[str, Any]:
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    result = {"patient_name": None, "patient_phone": None, "doctor_name": None, "hospital_name": None,
              "appointment_date": None, "appointment_time": None, "treatment_name": None,
              "follow_up_date": None, "recall_date": None, "invoice_number": None,
              "pending_amount": None, "due_date": None}
    resolved = {}
    unresolved = []

    if patient.full_name:
        resolved["patient_name"] = patient.full_name
    else:
        unresolved.append("{{patient_name}}")

    if patient.phone:
        resolved["patient_phone"] = patient.phone
    else:
        unresolved.append("{{patient_phone}}")

    effective_hospital_id = hospital_id or patient.hospital_id
    if effective_hospital_id:
        hospital = await db.get(Hospital, effective_hospital_id)
        if hospital and hospital.name:
            resolved["hospital_name"] = hospital.name
        else:
            unresolved.append("{{hospital_name}}")
    else:
        unresolved.append("{{hospital_name}}")

    doctor_id = patient.doctor_id
    if doctor_id:
        doctor = await db.get(User, doctor_id)
        if doctor and doctor.full_name:
            resolved["doctor_name"] = doctor.full_name
        else:
            unresolved.append("{{doctor_name}}")
    else:
        unresolved.append("{{doctor_name}}")

    upcoming_appt = await db.execute(
        select(Appointment).where(
            Appointment.patient_id == patient_id,
            Appointment.is_active == True,
            Appointment.status.in_([AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED]),
            Appointment.appointment_date >= date.today()
        ).order_by(Appointment.appointment_date.asc(), Appointment.appointment_time.asc()).limit(1)
    )
    upcoming = upcoming_appt.scalar_one_or_none()
    if upcoming:
        resolved["appointment_date"] = upcoming.appointment_date.isoformat()
        resolved["appointment_time"] = upcoming.appointment_time.strftime("%H:%M")
        if not doctor_id and upcoming.doctor_id:
            doc = await db.get(User, upcoming.doctor_id)
            if doc and doc.full_name:
                resolved["doctor_name"] = doc.full_name
            elif "doctor_name" not in resolved:
                unresolved.append("{{doctor_name}}")
    else:
        unresolved.append("{{appointment_date}}")
        unresolved.append("{{appointment_time}}")

    case_result = await db.execute(
        select(Case).where(Case.patient_id == patient_id).order_by(Case.created_at.desc()).limit(1)
    )
    latest_case = case_result.scalar_one_or_none()

    treatment_name = None
    if latest_case:
        tp_result = await db.execute(
        select(TreatmentPlan).where(TreatmentPlan.case_id == latest_case.id).order_by(TreatmentPlan.created_at.desc()).limit(1)
    )
        latest_tp = tp_result.scalar_one_or_none()
        if latest_tp and latest_tp.treatment_name:
            treatment_name = latest_tp.treatment_name
            resolved["treatment_name"] = treatment_name

    if not treatment_name:
        unresolved.append("{{treatment_name}}")

    next_fu = await db.execute(
        select(FollowUp).where(
            FollowUp.patient_id == patient_id,
            FollowUp.status.in_(["OPEN", "SCHEDULED"]),
            FollowUp.follow_up_date >= date.today()
        ).order_by(FollowUp.follow_up_date.asc()).limit(1)
    )
    nfu = next_fu.scalar_one_or_none()
    if nfu:
        resolved["follow_up_date"] = nfu.follow_up_date.isoformat()
    else:
        unresolved.append("{{follow_up_date}}")

    next_recall = await db.execute(
        select(FollowUp).where(
            FollowUp.patient_id == patient_id,
            FollowUp.status.in_(["OPEN", "SCHEDULED"]),
            FollowUp.follow_up_type.in_(["6_MONTH_RECALL", "12_MONTH_RECALL", "CUSTOM_RECALL", "CUSTOM_FOLLOW_UP"]),
            FollowUp.follow_up_date >= date.today()
        ).order_by(FollowUp.follow_up_date.asc()).limit(1)
    )
    nr = next_recall.scalar_one_or_none()
    if nr:
        resolved["recall_date"] = nr.follow_up_date.isoformat()
    else:
        unresolved.append("{{recall_date}}")

    billing_result = await db.execute(
        select(Billing).where(
            Billing.case_id.in_(
                select(Case.id).where(Case.patient_id == patient_id).subquery()
            ),
            Billing.payment_status.in_([PaymentStatus.PARTIAL, PaymentStatus.OVERDUE])
        ).order_by(Billing.created_at.desc()).limit(1)
    )
    latest_billing = billing_result.scalar_one_or_none()
    if latest_billing:
        if latest_billing.invoice_number:
            resolved["invoice_number"] = latest_billing.invoice_number
        else:
            unresolved.append("{{invoice_number}}")
        if latest_billing.pending_amount is not None:
            resolved["pending_amount"] = str(latest_billing.pending_amount)
        else:
            unresolved.append("{{pending_amount}}")
        if latest_billing.due_date:
            resolved["due_date"] = latest_billing.due_date.isoformat()
        else:
            unresolved.append("{{due_date}}")
    else:
        unresolved.append("{{invoice_number}}")
        unresolved.append("{{pending_amount}}")
        unresolved.append("{{due_date}}")

    validation = {
        "patient_exists": bool(patient),
        "has_phone": bool(patient.phone),
        "doctor_available": "doctor_name" in resolved and bool(resolved["doctor_name"]),
        "hospital_available": "hospital_name" in resolved and bool(resolved["hospital_name"]),
        "appointment_found": "appointment_date" in resolved and bool(resolved["appointment_date"]),
    }

    variables_panel = {
        "patient": {"name": patient.full_name, "phone": patient.phone, "id": patient_id},
        "doctor": resolved.get("doctor_name"),
        "hospital": resolved.get("hospital_name"),
        "appointment": {"date": resolved.get("appointment_date"), "time": resolved.get("appointment_time")},
        "treatment": resolved.get("treatment_name"),
        "billing": {"invoice": resolved.get("invoice_number"), "pending": resolved.get("pending_amount"), "due": resolved.get("due_date")},
        "follow_up": resolved.get("follow_up_date"),
        "recall": resolved.get("recall_date"),
    }

    return {
        "patient": patient,
        "resolved": resolved,
        "unresolved": unresolved,
        "validation": validation,
        "variables_panel": variables_panel,
    }


def render_message(template: str, variables: Dict[str, str]) -> str:
    rendered = template
    for var, value in variables.items():
        if value:
            rendered = rendered.replace(var, value)
    return rendered


def find_unresolved_vars(message: str) -> List[str]:
    import re
    return re.findall(r'\{\{(\w+)\}\}', message)


@router.post("/preview", response_model=PreviewResponse)
async def preview_message(
    request: PreviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS, Permission.VIEW_ALL_PATIENTS)
    ctx = await resolve_variables(db, request.patient_id, current_user.get("hospital_id"))
    patient = ctx["patient"]
    resolved = ctx["resolved"]
    unresolved = ctx["unresolved"]
    validation = ctx["validation"]

    rendered = render_message(request.message, resolved)

    template_unresolved = find_unresolved_vars(rendered)
    remaining = [f"{{{{{v}}}}}" for v in template_unresolved if f"{{{{{v}}}}}" not in resolved or not resolved.get(f"{{{{{v}}}}}")]
    all_unresolved = list(set(unresolved + remaining))

    return PreviewResponse(
        patient_id=patient.id,
        patient_name=patient.full_name or "Unknown",
        patient_phone=patient.phone,
        doctor_name=resolved.get("doctor_name"),
        hospital_name=resolved.get("hospital_name"),
        rendered_message=rendered,
        resolved_variables=resolved,
        unresolved_variables=all_unresolved,
        validation=validation,
        variables_panel=ctx["variables_panel"],
    )


@router.post("/send", response_model=SendResponse)
async def send_whatsapp(
    request: SendRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS, Permission.VIEW_ALL_PATIENTS)
    patient = await db.get(Patient, request.patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    await verify_tenant_access(current_user, patient, "patient", db)

    ctx = await resolve_variables(db, request.patient_id, current_user.get("hospital_id"))
    rendered = render_message(request.message, ctx["resolved"])

    provider = WhatsAppProvider()
    hospital_id = current_user.get("hospital_id") or patient.hospital_id

    log = CommunicationLog(
        patient_id=patient.id,
        hospital_id=hospital_id,
        doctor_id=current_user.get("id") or patient.doctor_id,
        channel="WHATSAPP",
        message_type=request.message_type,
        message=rendered,
        status=CommunicationStatus.SENT.value if request.send_mode == "api" else CommunicationStatus.PENDING.value,
        sent_at=datetime.now(timezone.utc) if request.send_mode == "api" else None,
        template_id=request.template_id,
        template_name=request.template_name,
        rendered_variables=json.dumps(request.rendered_variables) if request.rendered_variables else json.dumps(ctx["resolved"]),
        sent_via=request.send_mode,
        approved_by=current_user.get("id"),
        approved_at=datetime.now(timezone.utc),
        follow_up_id=request.follow_up_id,
    )
    db.add(log)
    await db.flush()

    audit_entry = MessageAudit(
        communication_log_id=log.id,
        patient_id=patient.id,
        hospital_id=hospital_id,
        action="preview_generated" if request.send_mode == "redirect" else "message_sent",
        details=json.dumps({"send_mode": request.send_mode, "resolved_vars": ctx["resolved"]}),
        created_by=current_user.get("id"),
    )
    db.add(audit_entry)

    if request.send_mode == "api":
        success = await provider.send_message(patient.phone, rendered)
        if success:
            log.status = CommunicationStatus.SENT.value
            log.sent_at = datetime.now(timezone.utc)
        else:
            log.status = CommunicationStatus.FAILED.value
            raise HTTPException(status_code=500, detail="Failed to send WhatsApp message")
    else:
        links = provider.generate_deep_link(patient.phone or "", rendered)
        audit_entry2 = MessageAudit(
            communication_log_id=log.id,
            patient_id=patient.id,
            hospital_id=hospital_id,
            action="wa_link_generated",
            details=json.dumps(links),
            created_by=current_user.get("id"),
        )
        db.add(audit_entry2)

    await db.commit()
    await db.refresh(log)

    links = provider.generate_deep_link(patient.phone or "", rendered)

    return SendResponse(
        success=True,
        message_id=log.id,
        wa_link=links.get("wa_link"),
        web_link=links.get("web_link"),
        phone=links.get("phone"),
        sent_via=request.send_mode,
    )


@router.post("/bulk-preview")
async def bulk_preview(
    request: BulkPreviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS, Permission.VIEW_ALL_PATIENTS)
    results = []
    for pid in request.patient_ids:
        try:
            ctx = await resolve_variables(db, pid, current_user.get("hospital_id"))
            patient = ctx["patient"]
            rendered = render_message(request.message, ctx["resolved"])
            results.append({
                "patient_id": pid,
                "patient_name": patient.full_name or "Unknown",
                "patient_phone": patient.phone,
                "rendered_message": rendered,
                "resolved_variables": ctx["resolved"],
                "unresolved_variables": ctx["unresolved"],
                "validation": ctx["validation"],
                "has_phone": bool(patient.phone),
                "is_valid": ctx["validation"]["patient_exists"] and bool(patient.phone),
            })
        except HTTPException:
            results.append({
                "patient_id": pid,
                "patient_name": "Unknown",
                "patient_phone": None,
                "rendered_message": request.message,
                "resolved_variables": {},
                "unresolved_variables": [],
                "validation": {"patient_exists": False, "has_phone": False},
                "has_phone": False,
                "is_valid": False,
            })

    totals = {
        "total": len(results),
        "valid": sum(1 for r in results if r["is_valid"]),
        "invalid": sum(1 for r in results if not r["is_valid"]),
        "with_phone": sum(1 for r in results if r["has_phone"]),
        "without_phone": sum(1 for r in results if not r["has_phone"]),
    }

    return {"items": results, "totals": totals, "message": request.message}


@router.post("/bulk-send")
async def bulk_send(
    request: BulkSendRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS, Permission.VIEW_ALL_PATIENTS)
    sent = 0
    failed = 0
    results = []
    provider = WhatsAppProvider()
    hospital_id = current_user.get("hospital_id")

    for item in request.items:
        pid = item.get("patient_id")
        message = item.get("message", "")
        send_mode = item.get("send_mode", "redirect")
        msg_type = item.get("message_type", "GENERAL")
        follow_up_id = item.get("follow_up_id")

        patient = await db.get(Patient, pid)
        if not patient:
            failed += 1
            results.append({"patient_id": pid, "success": False, "error": "Patient not found"})
            continue

        log = CommunicationLog(
            patient_id=pid,
            hospital_id=hospital_id or patient.hospital_id,
            doctor_id=current_user.get("id") or patient.doctor_id,
            channel="WHATSAPP",
            message_type=msg_type,
            message=message,
            status=CommunicationStatus.PENDING.value,
            sent_via=send_mode,
            approved_by=current_user.get("id"),
            approved_at=datetime.now(timezone.utc),
            follow_up_id=follow_up_id,
        )
        db.add(log)
        await db.flush()

        if send_mode == "api":
            ok = await provider.send_message(patient.phone, message)
            if ok:
                log.status = CommunicationStatus.SENT.value
                log.sent_at = datetime.now(timezone.utc)
                sent += 1
                results.append({"patient_id": pid, "success": True, "message_id": log.id})
            else:
                log.status = CommunicationStatus.FAILED.value
                failed += 1
                results.append({"patient_id": pid, "success": False, "error": "Send failed"})
        else:
            links = provider.generate_deep_link(patient.phone or "", message)
            sent += 1
            results.append({"patient_id": pid, "success": True, "message_id": log.id, **links})

    await db.commit()
    return {"success": True, "sent": sent, "failed": failed, "results": results}


@router.get("/history")
async def get_history(
    patient_id: Optional[str] = None,
    message_type: Optional[str] = None,
    status: Optional[str] = None,
    sent_via: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS, Permission.VIEW_ALL_PATIENTS)
    query = select(CommunicationLog).where(
        CommunicationLog.channel == "WHATSAPP",
        CommunicationLog.hospital_id == current_user.get("hospital_id"),
    )

    if patient_id:
        query = query.where(CommunicationLog.patient_id == patient_id)
    if message_type:
        query = query.where(CommunicationLog.message_type == message_type)
    if status:
        query = query.where(CommunicationLog.status == status)
    if sent_via:
        query = query.where(CommunicationLog.sent_via == sent_via)
    if start_date:
        query = query.where(CommunicationLog.created_at >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.where(CommunicationLog.created_at <= datetime.fromisoformat(end_date))

    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)

    query = query.order_by(CommunicationLog.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    logs = result.scalars().all()

    items = []
    for log in logs:
        patient = await db.get(Patient, log.patient_id)
        doctor = await db.get(User, log.doctor_id) if log.doctor_id else None
        items.append({
            "id": log.id,
            "patient_id": log.patient_id,
            "patient_name": patient.full_name if patient else "Unknown",
            "patient_phone": patient.phone if patient else None,
            "doctor_name": doctor.full_name if doctor else None,
            "message_type": log.message_type,
            "message": log.message[:500] if log.message else "",
            "status": log.status,
            "sent_via": log.sent_via,
            "template_name": log.template_name,
            "sent_at": log.sent_at.isoformat() if log.sent_at else None,
            "created_at": log.created_at.isoformat(),
        })

    message_types = await db.execute(
        select(CommunicationLog.message_type, func.count().label("cnt"))
        .where(CommunicationLog.channel == "WHATSAPP", CommunicationLog.hospital_id == current_user.get("hospital_id"))
        .group_by(CommunicationLog.message_type)
    )
    type_breakdown = {row.message_type: row.cnt for row in message_types.all()}

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_count = await db.scalar(
        select(func.count()).where(
            CommunicationLog.channel == "WHATSAPP",
            CommunicationLog.hospital_id == current_user.get("hospital_id"),
            CommunicationLog.created_at >= today_start,
        )
    )

    week_start = today_start - __import__("datetime").timedelta(days=today_start.weekday())
    week_count = await db.scalar(
        select(func.count()).where(
            CommunicationLog.channel == "WHATSAPP",
            CommunicationLog.hospital_id == current_user.get("hospital_id"),
            CommunicationLog.created_at >= week_start,
        )
    )

    failed_count = await db.scalar(
        select(func.count()).where(
            CommunicationLog.channel == "WHATSAPP",
            CommunicationLog.hospital_id == current_user.get("hospital_id"),
            CommunicationLog.status == CommunicationStatus.FAILED.value,
        )
    )

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "stats": {
            "today": today_count,
            "this_week": week_count,
            "failed": failed_count,
            "by_type": type_breakdown,
        },
    }


@router.get("/history/{message_id}")
async def get_message_detail(
    message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    log = await db.get(CommunicationLog, message_id)
    if not log or log.channel != "WHATSAPP":
        raise HTTPException(status_code=404, detail="Message not found")

    patient = await db.get(Patient, log.patient_id)
    doctor = await db.get(User, log.doctor_id) if log.doctor_id else None

    audit_result = await db.execute(
        select(MessageAudit).where(
            MessageAudit.communication_log_id == message_id
        ).order_by(MessageAudit.created_at.asc())
    )
    audit_trail = []
    for a in audit_result.scalars().all():
        audit_trail.append({
            "id": a.id,
            "action": a.action,
            "details": json.loads(a.details) if a.details else None,
            "created_by": a.created_by,
            "created_at": a.created_at.isoformat(),
        })

    return {
        "id": log.id,
        "patient": {
            "id": patient.id if patient else None,
            "name": patient.full_name if patient else "Unknown",
            "phone": patient.phone if patient else None,
        },
        "doctor_name": doctor.full_name if doctor else None,
        "channel": log.channel,
        "message_type": log.message_type,
        "message": log.message,
        "status": log.status,
        "sent_via": log.sent_via,
        "template_name": log.template_name,
        "rendered_variables": json.loads(log.rendered_variables) if log.rendered_variables else {},
        "sent_at": log.sent_at.isoformat() if log.sent_at else None,
        "created_at": log.created_at.isoformat(),
        "provider_response": log.provider_response,
        "audit_trail": audit_trail,
    }


@router.get("/message-types")
async def get_message_types():
    return {
        "types": [
            {"value": mt.value, "label": mt.name.replace("_", " ").title()}
            for mt in MessageType
        ],
        "variables": [
            {"variable": k, "description": v} for k, v in TEMPLATE_VARIABLES.items()
        ],
    }


@router.post("/confirm-delivery/{message_id}")
async def confirm_delivery(
    message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    log = await db.get(CommunicationLog, message_id)
    if not log or log.channel != "WHATSAPP":
        raise HTTPException(status_code=404, detail="Message not found")

    log.status = CommunicationStatus.DELIVERED.value
    audit_entry = MessageAudit(
        communication_log_id=log.id,
        patient_id=log.patient_id,
        hospital_id=log.hospital_id,
        action="delivered",
        created_by=current_user.get("id"),
    )
    db.add(audit_entry)
    await db.commit()
    return {"success": True, "status": "DELIVERED"}
