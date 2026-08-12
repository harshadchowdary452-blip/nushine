import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.services.lead_service import LeadService
from app.services.timeline_helper import record_timeline_event
from app.schemas.lead import LeadCreate, LeadUpdate, LeadResponse, LeadStatusUpdate, LeadConvertCreate, LeadFollowUpCreate, LeadAppointmentCreate, LeadCallCreate, LeadCallResponse, LeadCommunicationCreate, LeadCommunicationResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/leads", tags=["Leads"])


async def _verify_lead_access(service, lead_id: str, current_user: dict):
    """Fetch lead and verify tenant isolation. Raises 404/403 if inaccessible."""
    lead = await service.get(lead_id)
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    role = current_user.get("role")
    if role in ("HOSPITAL_ADMIN", "DOCTOR") and lead.hospital_id != current_user.get("hospital_id"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: lead belongs to another hospital")
    if role == "GROUP_ADMIN":
        from app.models.hospital import Hospital
        from sqlalchemy import select
        agid = current_user.get("admin_group_id")
        if not agid:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: no admin group scope")
        hospital_result = await service.db.execute(
            select(Hospital.admin_group_id).where(Hospital.id == lead.hospital_id)
        )
        row = hospital_result.scalar_one_or_none()
        if not row or row != agid:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: lead belongs to another hospital group")
    return lead


async def _recalc_lead_score(db: AsyncSession, lead):
    score = 0
    if lead.mobile:
        score += 10
    if lead.email:
        score += 10
    if lead.interested_treatment:
        score += 10
    if lead.status in ("INTERESTED",):
        score += 20
    if lead.status == "APPOINTMENT_BOOKED":
        score += 30
    if lead.status == "VISITED":
        score += 20
    if lead.status == "CONVERTED":
        score += 15
    lead.lead_score = min(score, 100)


def _conversion_probability(status: str) -> int:
    return {
        "NEW": 20,
        "CONTACTED": 30,
        "INTERESTED": 60,
        "FOLLOW_UP_REQUIRED": 50,
        "APPOINTMENT_BOOKED": 80,
        "VISITED": 95,
        "CONVERTED": 100,
    }.get(status, 20)


@router.post("/", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
async def create_lead(data: LeadCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    service = LeadService(db)
    data_dict = data.model_dump(exclude_none=True)
    role = current_user.get("role")
    if role in ("HOSPITAL_ADMIN", "DOCTOR"):
        data_dict["hospital_id"] = current_user.get("hospital_id")
    elif not data_dict.get("hospital_id") and current_user.get("hospital_id"):
        data_dict["hospital_id"] = current_user.get("hospital_id")
    if not data_dict.get("hospital_id"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hospital_id is required")
    lead = await service.create(data_dict, user_id=current_user.get("sub"))
    await _recalc_lead_score(db, lead)
    await db.flush()
    try:
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        await publish_event(
            event_type=EventType.LEAD_CREATED,
            source_module=EventSource.LEAD,
            entity_type="LEAD",
            entity_id=lead.id,
            hospital_id=getattr(lead, 'hospital_id', None),
            payload={"lead_id": lead.id, "lead_name": getattr(lead, 'lead_name', None)},
            db=db,
        )
    except Exception as e:
        logger.error("Failed to publish LEAD_CREATED event: %s", str(e), exc_info=True)
    return lead


@router.get("/")
async def get_leads(
    skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200),
    status_filter: Optional[str] = Query(None, alias="status"),
    source: Optional[str] = Query(None),
    assigned_staff_id: Optional[str] = Query(None),
    hospital_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)
):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    service = LeadService(db)
    filters = {}
    if status_filter:
        filters["status"] = status_filter
    if source:
        filters["source"] = source
    if assigned_staff_id:
        filters["assigned_staff_id"] = assigned_staff_id
    if date_from:
        filters["created_at__ge"] = date_from
    if date_to:
        filters["created_at__lt"] = (datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)).isoformat()
    role = current_user.get("role")
    if role in ("HOSPITAL_ADMIN", "DOCTOR"):
        if current_user.get("hospital_id"):
            filters["hospital_id"] = current_user.get("hospital_id")
    elif role == "GROUP_ADMIN":
        from app.models.hospital import Hospital
        from sqlalchemy import select
        agid = current_user.get("admin_group_id")
        hids = []
        if agid:
            hospital_result = await db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))
            hids = [row[0] for row in hospital_result.all()]
        if not hids:
            return {
                "items": [],
                "total": 0,
                "page": (skip // limit) + 1 if limit else 1,
                "page_size": limit,
            }
        filters["hospital_id__in"] = hids
    else:
        if hospital_id:
            filters["hospital_id"] = hospital_id
    filters_arg = filters or None
    items = await service.get_all(skip=skip, limit=limit, filters=filters_arg)
    total = await service.repo.count(filters=filters_arg)
    return {
        "items": items,
        "total": total,
        "page": (skip // limit) + 1 if limit else 1,
        "page_size": limit,
    }


@router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead(lead_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    service = LeadService(db)
    return await _verify_lead_access(service, lead_id, current_user)


@router.put("/{lead_id}", response_model=LeadResponse)
async def update_lead(lead_id: str, data: LeadUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    service = LeadService(db)
    old = await _verify_lead_access(service, lead_id, current_user)
    data_dict = data.model_dump(exclude_none=True)
    if old.converted_patient_id and data_dict.get("status") not in (None, "CONVERTED"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status of a converted lead cannot be changed",
        )
    result = await service.update(lead_id, data_dict, user_id=current_user.get("sub"))
    if result and result.converted_patient_id:
        await record_timeline_event(
            db, current_user=current_user, patient_id=result.converted_patient_id,
            action="Lead Updated",
            description=f"Lead '{result.lead_name}' updated",
            module="CRM",
        )
    return result


@router.put("/{lead_id}/status", response_model=LeadResponse)
async def update_lead_status(lead_id: str, data: LeadStatusUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    service = LeadService(db)
    old = await _verify_lead_access(service, lead_id, current_user)
    old_status = old.status
    if old.converted_patient_id and data.status != "CONVERTED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status of a converted lead cannot be changed",
        )
    result = await service.update_status(lead_id, data.status, user_id=current_user.get("sub"))
    if result:
        await _recalc_lead_score(db, result)
        await db.flush()
        if result.converted_patient_id:
            await record_timeline_event(
                db, current_user=current_user, patient_id=result.converted_patient_id,
                action="Lead Status Changed",
                description=f"Lead '{result.lead_name}' status changed from {old_status} to {result.status}",
                module="CRM",
            )
    try:
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        if result:
            if result.status == "NOT_INTERESTED":
                await publish_event(
                    event_type=EventType.LEAD_NOT_INTERESTED,
                    source_module=EventSource.LEAD,
                    entity_type="LEAD",
                    entity_id=lead_id,
                    hospital_id=getattr(result, 'hospital_id', None),
                    lead_id=lead_id,
                    payload={"status": result.status, "lead_id": lead_id},
                    db=db,
                )
            elif result.status in ("LOST", "NO_RESPONSE"):
                await publish_event(
                    event_type=EventType.LEAD_LOST,
                    source_module=EventSource.LEAD,
                    entity_type="LEAD",
                    entity_id=lead_id,
                    hospital_id=getattr(result, 'hospital_id', None),
                    lead_id=lead_id,
                    payload={"status": result.status, "lead_id": lead_id},
                    db=db,
                )
    except Exception:
        logger.warning("Failed to publish CRM lead event", exc_info=True)
    return result


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead(lead_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    service = LeadService(db)
    lead = await _verify_lead_access(service, lead_id, current_user)
    if lead.converted_patient_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Lead cannot be deleted because it was converted to patient {lead.converted_patient_id}",
        )
    await service.delete(lead_id, user_id=current_user.get("sub"))


@router.get("/{lead_id}/communications")
async def get_lead_communications(lead_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    service = LeadService(db)
    await _verify_lead_access(service, lead_id, current_user)
    return await service.get_communications(lead_id)


@router.post("/{lead_id}/communications", response_model=LeadCommunicationResponse, status_code=status.HTTP_201_CREATED)
async def add_lead_communication(lead_id: str, data: LeadCommunicationCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    service = LeadService(db)
    lead = await _verify_lead_access(service, lead_id, current_user)
    result = await service.add_communication(
        lead_id, data.model_dump(exclude_none=True),
        user_id=current_user.get("sub"),
        user_name=current_user.get("full_name") or current_user.get("username"),
    )
    await db.refresh(lead)
    if lead.converted_patient_id:
        await record_timeline_event(
            db, current_user=current_user, patient_id=lead.converted_patient_id,
            action="Communication Added",
            description=f"Communication added to lead '{lead.lead_name}'",
            module="CRM",
        )
    return result


@router.get("/{lead_id}/calls")
async def get_lead_calls(lead_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    service = LeadService(db)
    await _verify_lead_access(service, lead_id, current_user)
    return await service.get_calls(lead_id)


@router.post("/{lead_id}/calls", response_model=LeadCallResponse, status_code=status.HTTP_201_CREATED)
async def add_lead_call(lead_id: str, data: LeadCallCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    service = LeadService(db)
    lead = await _verify_lead_access(service, lead_id, current_user)
    result = await service.add_call(lead_id, data.model_dump(), user_id=current_user.get("sub"))
    if lead.converted_patient_id:
        await record_timeline_event(
            db, current_user=current_user, patient_id=lead.converted_patient_id,
            action="Call Added",
            description=f"Call added to lead '{lead.lead_name}'",
            module="CRM",
        )
    return result


@router.post("/{lead_id}/convert")
async def convert_lead(lead_id: str, data: LeadConvertCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    service = LeadService(db)
    await _verify_lead_access(service, lead_id, current_user)
    result = await service.convert(lead_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
    if "error" in result:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result["error"])
    lead = await service.repo.get(lead_id)
    if result.get("patient_id"):
        await record_timeline_event(
            db, current_user=current_user, patient_id=result["patient_id"],
            action="Lead Converted to Patient",
            description=f"Lead {lead_id} converted to patient",
            module="CRM",
        )
    try:
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        await publish_event(
            event_type=EventType.LEAD_CONVERTED,
            source_module=EventSource.LEAD,
            entity_type="LEAD",
            entity_id=lead_id,
            hospital_id=lead.hospital_id if lead else None,
            patient_id=result.get("patient_id"),
            payload={
                "lead_id": lead_id,
                "patient_id": result.get("patient_id"),
            },
            db=db,
        )
    except Exception:
        logger.warning("Failed to publish LEAD_CONVERTED event", exc_info=True)
    try:
        from app.models.generated_enquiry import GeneratedEnquiry
        from sqlalchemy import update
        await db.execute(
            update(GeneratedEnquiry)
            .where(
                GeneratedEnquiry.lead_id == lead_id,
                GeneratedEnquiry.enquiry_type == "LEAD_FOLLOW_UP",
                GeneratedEnquiry.status.in_(["PENDING", "NEW", "CONTACTED"]),
            )
            .values(status="CONVERTED")
        )
    except Exception:
        logger.warning("Failed to mark generated enquiries CONVERTED", exc_info=True)
    # Send welcome message on conversion
    if lead:
        try:
            hospital_name = lead.hospital.name if lead.hospital else "Our Hospital"
            patient_name = result.get("patient_name") or lead.lead_name
            welcome_msg = (
                f"Hello {patient_name},\n\n"
                f"Welcome to {hospital_name}.\n\n"
                f"Your registration has been successfully completed and your enquiry "
                f"has now been converted into a patient profile.\n\n"
                f"Our team will guide you through every step of your treatment journey. "
                f"You can contact us anytime if you require assistance.\n\n"
                f"Thank you for choosing {hospital_name}.\n\n"
                f"We look forward to providing you with exceptional dental care.\n\n"
                f"Warm Regards,\n"
                f"{hospital_name}\n"
                f"Patient Care Team"
            )
            await service.add_communication(
                lead_id=lead_id,
                data={
                    "channel": "WHATSAPP",
                    "message": welcome_msg,
                    "template_name": "LEAD_CONVERSION",
                },
                user_id=current_user.get("sub"),
                user_name=current_user.get("full_name") or current_user.get("username"),
            )
        except Exception:
            logger.warning("Failed to send lead conversion welcome message", exc_info=True)
    return result


@router.post("/{lead_id}/follow-ups")
async def create_lead_follow_up(lead_id: str, data: LeadFollowUpCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    service = LeadService(db)
    lead = await _verify_lead_access(service, lead_id, current_user)
    from datetime import date, time
    from app.models.follow_up import FollowUp, FollowUpStatus, FollowUpType
    from app.models.patient import Patient
    from sqlalchemy import select
    patient_id = lead.converted_patient_id
    if not patient_id:
        existing = (await db.execute(select(Patient).where(Patient.phone == lead.mobile, Patient.hospital_id == lead.hospital_id).limit(1))).scalar_one_or_none()
        if existing:
            patient_id = existing.id
        else:
            p = Patient(
                full_name=lead.lead_name, hospital_id=lead.hospital_id,
                age=lead.age, gender=lead.gender, phone=lead.mobile, email=lead.email,
                patient_source="Lead", original_source=lead.source,
            )
            db.add(p)
            await db.flush()
            patient_id = p.id
    follow_up_date = date.fromisoformat(data.follow_up_date)
    follow_up_time = time.fromisoformat(data.follow_up_time) if data.follow_up_time else time(9, 0)
    fu = FollowUp(
        patient_id=patient_id,
        hospital_id=lead.hospital_id,
        doctor_id=lead.assigned_doctor_id,
        case_id=None,
        treatment_id=None,
        follow_up_date=follow_up_date,
        follow_up_time=follow_up_time,
        follow_up_type=FollowUpType.MANUAL.value,
        status=FollowUpStatus.PENDING.value,
        notes=data.notes or data.reason or "",
    )
    db.add(fu)
    await db.flush()
    lead.next_follow_up_date = follow_up_date
    lead.last_contacted_at = datetime.now(timezone.utc)
    await db.flush()
    await service.audit_log_repo.create(user_id=current_user.get("sub"), action="LEAD_FOLLOW_UP", entity_type="LEAD", entity_id=lead_id, details=f"Follow-up scheduled for {follow_up_date}")
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Lead Follow-Up Created",
        description=f"Follow-up scheduled for lead on {follow_up_date}",
        module="CRM",
    )
    return {"message": "Follow-up created", "follow_up_id": fu.id, "follow_up_date": follow_up_date.isoformat()}


@router.post("/{lead_id}/appointments")
async def book_lead_appointment(lead_id: str, data: LeadAppointmentCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    service = LeadService(db)
    lead = await _verify_lead_access(service, lead_id, current_user)
    from datetime import date, time, datetime, timezone
    from app.models.appointment import Appointment, AppointmentStatus
    from app.models.patient import Patient
    from sqlalchemy import select

    patient = None
    if lead.converted_patient_id:
        patient = await db.get(Patient, lead.converted_patient_id)
    if not patient:
        existing = (await db.execute(select(Patient).where(Patient.phone == lead.mobile, Patient.hospital_id == lead.hospital_id).limit(1))).scalar_one_or_none()
        if existing:
            patient = existing
        else:
            patient = Patient(
                full_name=lead.lead_name,
                hospital_id=lead.hospital_id,
                age=lead.age,
                gender=lead.gender,
                phone=lead.mobile,
                email=lead.email,
                patient_source="Lead",
                original_source=lead.source,
            )
            db.add(patient)
            await db.flush()
        lead.converted_patient_id = patient.id

    doctor_id = data.doctor_id or lead.assigned_doctor_id
    if not doctor_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A doctor must be selected to book an appointment")
    appt_date = date.fromisoformat(data.appointment_date)
    appt_time = time.fromisoformat(data.appointment_time) if data.appointment_time else time(9, 0)
    from app.services.appointment_service import compute_end_time
    appt = Appointment(
        patient_id=patient.id,
        doctor_id=doctor_id,
        appointment_date=appt_date,
        appointment_time=appt_time,
        duration_minutes=30,
        end_time=compute_end_time(appt_time, 30),
        status=AppointmentStatus.SCHEDULED,
        notes=data.notes or f"Appointment for lead: {lead.lead_name}",
    )
    db.add(appt)
    await db.flush()
    lead.status = "APPOINTMENT_BOOKED"
    lead.last_contacted_at = datetime.now(timezone.utc)
    await _recalc_lead_score(db, lead)
    await db.flush()
    await service.audit_log_repo.create(user_id=current_user.get("sub"), action="LEAD_APPOINTMENT", entity_type="LEAD", entity_id=lead_id, details=f"Appointment booked for {appt_date}")
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient.id,
        action="Lead Appointment Booked",
        description=f"Appointment booked for lead on {appt_date}",
        module="CRM",
    )
    return {"message": "Appointment booked", "appointment_id": appt.id, "patient_id": patient.id, "appointment_date": appt_date.isoformat(), "appointment_time": appt_time.strftime("%H:%M")}


@router.get("/{lead_id}/follow-ups")
async def get_lead_follow_ups(lead_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    from app.models.follow_up import FollowUp
    from app.models.lead import Lead
    from sqlalchemy import select
    service = LeadService(db)
    lead = await _verify_lead_access(service, lead_id, current_user)
    r = await db.execute(select(FollowUp).where(FollowUp.treatment_id == lead_id).order_by(FollowUp.follow_up_date.desc()))
    return r.scalars().all()


@router.get("/analytics/summary")
async def get_lead_analytics(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    from sqlalchemy import select, func
    from app.models.lead import Lead, LeadStatus
    role = current_user.get("role")
    base = select(Lead)
    if role in ("HOSPITAL_ADMIN", "DOCTOR") and current_user.get("hospital_id"):
        base = base.where(Lead.hospital_id == current_user["hospital_id"])
    rows = (await db.execute(base)).scalars().all()
    total = len(rows)
    by_status = {}
    by_source = {}
    converted = 0
    lost = 0
    total_score = 0
    high_priority = 0
    follow_up_due_today = 0
    for r in rows:
        by_status[r.status] = by_status.get(r.status, 0) + 1
        by_source[r.source] = by_source.get(r.source, 0) + 1
        if r.status == LeadStatus.CONVERTED.value: converted += 1
        if r.status in (LeadStatus.LOST.value, LeadStatus.NOT_INTERESTED.value, LeadStatus.NO_RESPONSE.value): lost += 1
        total_score += r.lead_score or 0
        if r.priority == "HIGH": high_priority += 1
        if r.next_follow_up_date and r.next_follow_up_date <= func.current_date():
            follow_up_due_today += 1
    return {
        "total": total,
        "by_status": by_status,
        "by_source": by_source,
        "converted": converted,
        "lost": lost,
        "conversion_rate": round((converted / total * 100), 1) if total > 0 else 0,
        "avg_score": round(total_score / total, 1) if total > 0 else 0,
        "high_priority": high_priority,
        "follow_up_due_today": follow_up_due_today,
    }
