import logging
import json
from typing import Optional, List, Union
from datetime import datetime, timezone, date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_, or_, cast, Date
from fastapi import HTTPException, status
from app.models.campaign import Campaign, CampaignRecipient, CampaignStatus, CampaignTarget, CampaignRecipientStatus, CampaignChannel, CampaignType, CampaignResponse, CampaignTimeline
from app.models.patient import Patient, PatientStatus
from app.models.lead import Lead, LeadStatus, LeadSource
from app.models.appointment import Appointment, AppointmentStatus
from app.models.case import Case
from app.models.user import User
from app.models.hospital import Hospital
from app.models.doctor_availability import DoctorAvailability
from app.models.communication_log import CommunicationLog, CommunicationStatus, CommunicationChannel, MessageType
from app.utils.whatsapp import WhatsAppProvider
from app.utils.template_engine import TemplateEngine

logger = logging.getLogger(__name__)


class CampaignService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: dict, hospital_id: str, created_by: str) -> Campaign:
        campaign = Campaign(
            hospital_id=hospital_id,
            created_by=created_by,
            name=data["name"],
            description=data.get("description"),
            campaign_type=data.get("campaign_type", CampaignType.GENERAL.value),
            channel=data.get("channel", CampaignChannel.WHATSAPP.value),
            target=data.get("target", CampaignTarget.ALL.value),
            message=data["message"],
            start_date=data.get("start_date"),
            end_date=data.get("end_date"),
            scheduled_at=data.get("scheduled_at"),
            campaign_cost=data.get("campaign_cost", 0.0),
        )
        self.db.add(campaign)
        await self.db.flush()
        return campaign

    async def get(self, campaign_id: str) -> Optional[Campaign]:
        return await self.db.get(Campaign, campaign_id)

    async def get_all(self, hospital_id: Optional[str] = None, skip: int = 0, limit: int = 50, status: Optional[str] = None, campaign_type: Optional[str] = None) -> List[Campaign]:
        query = select(Campaign)
        if hospital_id:
            query = query.where(Campaign.hospital_id == hospital_id)
        if status:
            query = query.where(Campaign.status == status)
        if campaign_type:
            query = query.where(Campaign.campaign_type == campaign_type)
        query = query.order_by(desc(Campaign.created_at)).offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update(self, campaign_id: str, data: dict) -> Campaign:
        campaign = await self.db.get(Campaign, campaign_id)
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        for key, value in data.items():
            if value is not None and hasattr(campaign, key):
                setattr(campaign, key, value)
        await self.db.flush()
        return campaign

    async def delete(self, campaign_id: str) -> bool:
        campaign = await self.db.get(Campaign, campaign_id)
        if not campaign:
            return False
        await self.db.delete(campaign)
        await self.db.flush()
        return True

    async def duplicate(self, campaign_id: str, hospital_id: str, created_by: str) -> Campaign:
        original = await self.db.get(Campaign, campaign_id)
        if not original:
            raise HTTPException(status_code=404, detail="Campaign not found")
        new_campaign = Campaign(
            hospital_id=hospital_id,
            created_by=created_by,
            name=f"{original.name} (Copy)",
            description=original.description,
            campaign_type=original.campaign_type,
            channel=original.channel,
            target=original.target,
            message=original.message,
            campaign_cost=original.campaign_cost,
            status=CampaignStatus.DRAFT,
        )
        self.db.add(new_campaign)
        await self.db.flush()
        return new_campaign

    async def archive(self, campaign_id: str) -> Campaign:
        campaign = await self.db.get(Campaign, campaign_id)
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        campaign.is_active = False
        await self.db.flush()
        return campaign

    async def resend(self, campaign_id: str, hospital_id: str) -> dict:
        campaign = await self.db.get(Campaign, campaign_id)
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        if campaign.status not in (CampaignStatus.COMPLETED, CampaignStatus.CANCELLED, CampaignStatus.DRAFT):
            raise HTTPException(status_code=400, detail="Only completed, cancelled, or draft campaigns can be resent")
        campaign.status = CampaignStatus.DRAFT
        campaign.messages_sent = 0
        campaign.messages_delivered = 0
        campaign.messages_failed = 0
        campaign.patients_converted = 0
        campaign.revenue_generated = 0.0
        await self.db.flush()
        result = await self.launch(campaign_id, hospital_id)
        return result

    async def preview_audience(self, hospital_id: str, target: CampaignTarget, filters: dict = None) -> dict:
        filters = filters or {}
        audience = await self._resolve_target_audience(hospital_id, target, filters)
        sample = []
        for entity in audience[:10]:
            if isinstance(entity, Patient):
                sample.append({
                    "id": entity.id,
                    "name": entity.full_name,
                    "phone": entity.phone,
                    "status": entity.status.value if hasattr(entity.status, 'value') else entity.status,
                    "type": "patient",
                    "op_no": entity.op_no,
                })
            else:
                sample.append({
                    "id": entity.id,
                    "name": entity.lead_name,
                    "phone": entity.mobile,
                    "status": entity.status.value if hasattr(entity.status, 'value') else entity.status,
                    "type": "lead",
                })
        return {"total_count": len(audience), "sample": sample}

    async def _resolve_target_audience(self, hospital_id: str, target: CampaignTarget, filters: dict = None) -> List[Union[Patient, Lead]]:
        filters = filters or {}
        if target == CampaignTarget.LEAD:
            query = select(Lead).where(Lead.hospital_id == hospital_id)
            if filters.get("lead_status"):
                query = query.where(Lead.status == filters["lead_status"])
            if filters.get("source"):
                query = query.where(Lead.source == filters["source"])
            if filters.get("city"):
                query = query.where(Lead.city.ilike(f"%{filters['city']}%"))
            if filters.get("age_min") is not None:
                query = query.where(Lead.age >= filters["age_min"])
            if filters.get("age_max") is not None:
                query = query.where(Lead.age <= filters["age_max"])
            if filters.get("gender"):
                query = query.where(Lead.gender == filters["gender"])
            if filters.get("doctor_id"):
                query = query.where(Lead.assigned_doctor_id == filters["doctor_id"])
            result = await self.db.execute(query)
            return list(result.scalars().all())

        query = select(Patient).where(Patient.is_active == True, Patient.hospital_id == hospital_id)
        if target == CampaignTarget.ACTIVE:
            query = query.where(Patient.status == PatientStatus.ACTIVE.value)
        elif target == CampaignTarget.COMPLETED_TREATMENT:
            query = query.where(Patient.status == PatientStatus.COMPLETED.value)
        elif target == CampaignTarget.FOLLOW_UP:
            from app.models.follow_up import FollowUp
            subq = select(FollowUp.patient_id).where(FollowUp.hospital_id == hospital_id, FollowUp.status.in_(["SCHEDULED", "PENDING"]))
            query = query.where(Patient.id.in_(subq))
        elif target == CampaignTarget.NOT_VISITED_6M:
            six_months_ago = date.today() - timedelta(days=180)
            query = query.where(Patient.updated_at < six_months_ago)
        elif target == CampaignTarget.NOT_VISITED_1Y:
            one_year_ago = date.today() - timedelta(days=365)
            query = query.where(Patient.updated_at < one_year_ago)
        elif target == CampaignTarget.TREATMENT_SPECIFIC:
            treatment_type_id = filters.get("treatment_type_id")
            if treatment_type_id:
                from app.models.treatment_plan import TreatmentPlan
                subq = select(TreatmentPlan.patient_id).where(TreatmentPlan.treatment_type_id == treatment_type_id)
                query = query.where(Patient.id.in_(subq))
        elif target == CampaignTarget.CUSTOM:
            pass

        if filters.get("patient_status"):
            query = query.where(Patient.status == filters["patient_status"])
        if filters.get("treatment_type_id") and target != CampaignTarget.TREATMENT_SPECIFIC:
            from app.models.treatment_plan import TreatmentPlan
            subq = select(TreatmentPlan.patient_id).where(TreatmentPlan.treatment_type_id == filters["treatment_type_id"])
            query = query.where(Patient.id.in_(subq))
        if filters.get("last_visit_before"):
            query = query.where(Patient.updated_at < filters["last_visit_before"])
        if filters.get("age_min") is not None:
            query = query.where(Patient.age >= filters["age_min"])
        if filters.get("age_max") is not None:
            query = query.where(Patient.age <= filters["age_max"])
        if filters.get("gender"):
            query = query.where(Patient.gender == filters["gender"])
        if filters.get("source"):
            query = query.where(Patient.patient_source == filters["source"])
        if filters.get("hospital_id"):
            query = query.where(Patient.hospital_id == filters["hospital_id"])
        if filters.get("doctor_id"):
            query = query.where(Patient.doctor_id == filters["doctor_id"])
        if filters.get("city"):
            query = query.where(Patient.address.ilike(f"%{filters['city']}%"))
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def launch(self, campaign_id: str, hospital_id: str) -> dict:
        campaign = await self.db.get(Campaign, campaign_id)
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        if campaign.status != CampaignStatus.DRAFT:
            raise HTTPException(status_code=400, detail="Only draft campaigns can be launched")
        target = CampaignTarget(campaign.target) if hasattr(campaign.target, 'value') else CampaignTarget(campaign.target)
        audience = await self._resolve_target_audience(hospital_id, target, {})
        if not audience:
            raise HTTPException(status_code=400, detail="No patients or leads match the target criteria")
        campaign.patients_targeted = len(audience)
        campaign.status = CampaignStatus.ACTIVE
        campaign.start_date = date.today()
        hospital_obj = await self.db.get(Hospital, hospital_id)
        hospital_name = hospital_obj.name if hospital_obj else ""
        provider = WhatsAppProvider()
        sent_count = 0
        failed_count = 0
        for entity in audience:
            try:
                if isinstance(entity, Lead):
                    phone = entity.mobile
                    recipient_name = entity.lead_name
                    patient_id = None
                    lead_id = entity.id
                else:
                    phone = entity.phone
                    recipient_name = entity.full_name if hasattr(entity, 'full_name') else getattr(entity, 'lead_name', None)
                    if isinstance(entity, Patient):
                        patient_id = entity.id
                        lead_id = None
                    else:
                        patient_id = entity.id
                        lead_id = getattr(entity, 'id', None)
                if not phone:
                    continue
                recipient = CampaignRecipient(
                    campaign_id=campaign_id,
                    patient_id=patient_id,
                    lead_id=lead_id,
                    phone=phone,
                    recipient_name=recipient_name,
                    status=CampaignRecipientStatus.QUEUED,
                )
                self.db.add(recipient)
                await self.db.flush()
                variables = {}
                if patient_id:
                    if isinstance(entity, Patient) and entity.doctor_id:
                        doc = await self.db.get(User, entity.doctor_id)
                        if doc:
                            variables["doctor_name"] = doc.full_name
                    variables["patient_name"] = recipient_name or ""
                elif lead_id:
                    variables["lead_name"] = recipient_name or ""
                variables["hospital_name"] = hospital_name or ""
                rendered = TemplateEngine.render_template(campaign.message, variables)
                success = await provider.send_message(phone, rendered)
                if success:
                    recipient.status = CampaignRecipientStatus.SENT
                    recipient.delivered_at = datetime.now(timezone.utc)
                    sent_count += 1
                else:
                    recipient.status = CampaignRecipientStatus.FAILED
                    recipient.error_message = "Message send failed"
                    failed_count += 1
                await self.db.flush()
            except Exception as e:
                logger.error(f"Error sending to recipient {getattr(entity, 'id', 'unknown')}: {e}")
                failed_count += 1
                continue
        campaign.messages_sent = sent_count
        campaign.messages_failed = failed_count
        timeline = CampaignTimeline(
            campaign_id=campaign_id,
            event_type="LAUNCHED",
            description=f"Campaign launched with {len(audience)} recipients, {sent_count} sent successfully",
            metadata_json=json.dumps({"total_recipients": len(audience), "sent_count": sent_count, "failed_count": failed_count}),
        )
        self.db.add(timeline)
        await self.db.flush()
        return {
            "success": True,
            "campaign_id": campaign_id,
            "recipients_count": len(audience),
            "sent_count": sent_count,
            "message": f"Campaign launched with {sent_count} messages sent out of {len(audience)} recipients",
        }

    async def get_progress(self, campaign_id: str) -> dict:
        campaign = await self.db.get(Campaign, campaign_id)
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        result = await self.db.execute(
            select(CampaignRecipient.status, func.count(CampaignRecipient.id)).where(
                CampaignRecipient.campaign_id == campaign_id
            ).group_by(CampaignRecipient.status)
        )
        status_counts = {row[0]: row[1] for row in result.all()}
        total = sum(status_counts.values())
        sent = status_counts.get(CampaignRecipientStatus.SENT.value, 0)
        delivered = status_counts.get(CampaignRecipientStatus.DELIVERED.value, 0)
        failed = status_counts.get(CampaignRecipientStatus.FAILED.value, 0)
        queued = status_counts.get(CampaignRecipientStatus.QUEUED.value, 0)
        replied = status_counts.get(CampaignRecipientStatus.REPLIED.value, 0)
        read = status_counts.get(CampaignRecipientStatus.READ.value, 0)
        interested = status_counts.get(CampaignRecipientStatus.INTERESTED.value, 0)
        converted = status_counts.get(CampaignRecipientStatus.CONVERTED_TO_PATIENT.value, 0)
        processing = (queued + sent) > 0
        return {
            "campaign_id": campaign_id,
            "status": campaign.status.value if hasattr(campaign.status, 'value') else campaign.status,
            "total_recipients": total,
            "sent": sent,
            "delivered": delivered,
            "failed": failed,
            "pending": queued,
            "replied": replied,
            "read": read,
            "interested": interested,
            "converted": converted,
            "processing": processing,
        }

    async def handle_inbound_webhook(self, data: dict) -> dict:
        phone = data.get("from") or data.get("phone")
        message_body = data.get("message") or data.get("text") or data.get("body", "")
        message_type = data.get("message_type", "text")
        event_type = data.get("event_type", "message")
        if not phone:
            return {"processed": False, "event_type": "no_phone"}
        result = await self.db.execute(
            select(CampaignRecipient).where(CampaignRecipient.phone == phone).order_by(desc(CampaignRecipient.created_at))
        )
        recipient = result.scalars().first()
        if not recipient:
            return {"processed": False, "event_type": "no_recipient_found"}
        campaign = await self.db.get(Campaign, recipient.campaign_id)
        if not campaign:
            return {"processed": False, "event_type": "no_campaign"}
        if event_type == "delivery" or message_type == "delivery":
            recipient.status = CampaignRecipientStatus.DELIVERED
            recipient.delivered_at = datetime.now(timezone.utc)
            campaign.messages_delivered = (campaign.messages_delivered or 0) + 1
            timeline_event = "DELIVERED"
            desc = "Message delivered to recipient"
        elif event_type == "read" or message_type == "read":
            recipient.status = CampaignRecipientStatus.READ
            recipient.read_at = datetime.now(timezone.utc)
            campaign.messages_read = (campaign.messages_read or 0) + 1
            timeline_event = "READ"
            desc = "Message read by recipient"
        elif event_type == "failed" or message_type == "failed":
            recipient.status = CampaignRecipientStatus.FAILED
            recipient.error_message = data.get("error", "Delivery failed")
            campaign.messages_failed = (campaign.messages_failed or 0) + 1
            timeline_event = "FAILED"
            desc = "Message delivery failed"
        else:
            recipient.status = CampaignRecipientStatus.REPLIED
            recipient.response_message = message_body
            recipient.responded_at = datetime.now(timezone.utc)
            campaign.responses_count = (campaign.responses_count or 0) + 1
            is_lead = bool(recipient.lead_id)
            response = CampaignResponse(
                campaign_id=recipient.campaign_id,
                recipient_id=recipient.id,
                patient_id=recipient.patient_id,
                lead_id=recipient.lead_id,
                phone=phone,
                sender_name=recipient.recipient_name,
                message=message_body,
                message_type="INCOMING",
                is_lead=is_lead,
            )
            self.db.add(response)
            interest_keywords = ["interested", "yes", "appointment", "book", "price", "cost", "fees", "want", "procedure"]
            if any(kw in message_body.lower() for kw in interest_keywords):
                recipient.status = CampaignRecipientStatus.INTERESTED
                campaign.interested_count = (campaign.interested_count or 0) + 1
                timeline_event = "INTERESTED"
                desc = "Recipient expressed interest"
            else:
                timeline_event = "REPLIED"
                desc = f"Recipient replied: {message_body[:100]}"
            timeline = CampaignTimeline(
                campaign_id=recipient.campaign_id,
                patient_id=recipient.patient_id,
                lead_id=recipient.lead_id,
                recipient_id=recipient.id,
                event_type=timeline_event,
                description=desc,
                metadata_json=json.dumps({"message": message_body}),
            )
            self.db.add(timeline)
        await self.db.flush()
        return {"processed": True, "event_type": timeline_event}

    async def record_response(self, campaign_id: str, recipient_id: str, message: str, is_lead: bool = False) -> CampaignResponse:
        campaign = await self.db.get(Campaign, campaign_id)
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        recipient = await self.db.get(CampaignRecipient, recipient_id)
        if not recipient:
            raise HTTPException(status_code=404, detail="Campaign recipient not found")
        recipient.status = CampaignRecipientStatus.REPLIED
        recipient.response_message = message
        recipient.responded_at = datetime.now(timezone.utc)
        campaign.responses_count = (campaign.responses_count or 0) + 1
        response = CampaignResponse(
            campaign_id=campaign_id,
            recipient_id=recipient_id,
            patient_id=recipient.patient_id,
            lead_id=recipient.lead_id,
            phone=recipient.phone or "",
            sender_name=recipient.recipient_name,
            message=message,
            message_type="INCOMING",
            is_lead=is_lead,
        )
        self.db.add(response)
        await self.db.flush()
        return response

    async def convert_lead_to_patient(self, campaign_id: str, lead_id: str, patient_data: dict) -> dict:
        lead = await self.db.get(Lead, lead_id)
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        recipient_result = await self.db.execute(
            select(CampaignRecipient).where(
                CampaignRecipient.campaign_id == campaign_id,
                CampaignRecipient.lead_id == lead_id,
            )
        )
        recipient = recipient_result.scalars().first()
        count_result = await self.db.execute(select(func.count(Patient.id)))
        total_patients = count_result.scalar() or 0
        op_no = f"OP-{datetime.now(timezone.utc).strftime('%Y%m')}-{total_patients + 1:04d}"
        patient = Patient(
            hospital_id=lead.hospital_id,
            doctor_id=patient_data.get("doctor_id") or lead.assigned_doctor_id,
            full_name=patient_data.get("full_name", lead.lead_name),
            gender=patient_data.get("gender", lead.gender),
            age=patient_data.get("age", lead.age),
            phone=patient_data.get("phone", lead.mobile),
            city=lead.city,
            patient_source="CAMPAIGN",
            original_source=lead.source,
            source_campaign_id=campaign_id,
            op_no=op_no,
            status=PatientStatus.NEW,
            is_active=True,
        )
        self.db.add(patient)
        await self.db.flush()
        lead.converted_patient_id = patient.id
        lead.status = LeadStatus.CONVERTED.value
        if recipient:
            recipient.status = CampaignRecipientStatus.CONVERTED_TO_PATIENT
        campaign = await self.db.get(Campaign, campaign_id)
        if campaign:
            campaign.patients_converted = (campaign.patients_converted or 0) + 1
        case = Case(
            patient_id=patient.id,
            doctor_id=patient.doctor_id,
            chief_complaint=patient_data.get("chief_complaint", lead.notes or "Converted from campaign lead"),
            status="OPEN",
        )
        self.db.add(case)
        if campaign:
            timeline = CampaignTimeline(
                campaign_id=campaign_id,
                patient_id=patient.id,
                lead_id=lead_id,
                recipient_id=recipient.id if recipient else None,
                event_type="CONVERTED_TO_PATIENT",
                description=f"Lead {lead.lead_name} converted to patient (OP: {op_no})",
                metadata_json=json.dumps({"lead_name": lead.lead_name, "op_no": op_no, "patient_id": patient.id}),
            )
            self.db.add(timeline)
        await self.db.flush()
        return {
            "patient_id": patient.id,
            "op_no": op_no,
            "full_name": patient.full_name,
            "phone": patient.phone,
            "case_id": case.id,
        }

    async def create_appointment_from_campaign(self, campaign_id: str, patient_id: str, doctor_id: str, appointment_date: date, appointment_time: str, notes: str = None) -> Appointment:
        campaign = await self.db.get(Campaign, campaign_id)
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        patient = await self.db.get(Patient, patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        from datetime import time as time_type
        try:
            parts = appointment_time.split(":")
            if len(parts) == 2:
                parsed_time = time_type(int(parts[0]), int(parts[1]))
            elif len(parts) == 3:
                parsed_time = time_type(int(parts[0]), int(parts[1]), int(parts[2]))
            else:
                parsed_time = time_type(9, 0)
        except (ValueError, TypeError):
            parsed_time = time_type(9, 0)
        from datetime import timedelta as td
        end_hour = parsed_time.hour + 1 if parsed_time.hour < 23 else 23
        end_time = time_type(end_hour, parsed_time.minute)
        count_result = await self.db.execute(select(func.count(Appointment.id)))
        total_appts = count_result.scalar() or 0
        appt_number = f"APT-{datetime.now(timezone.utc).strftime('%Y%m')}-{total_appts + 1:04d}"
        appointment = Appointment(
            appointment_number=appt_number,
            patient_id=patient_id,
            doctor_id=doctor_id,
            appointment_date=appointment_date,
            appointment_time=parsed_time,
            duration_minutes=60,
            end_time=end_time,
            status=AppointmentStatus.SCHEDULED,
            appointment_type="CONSULTATION",
            notes=notes or "Campaign generated appointment",
        )
        self.db.add(appointment)
        await self.db.flush()
        campaign.appointments_generated = (campaign.appointments_generated or 0) + 1
        doctor = await self.db.get(User, doctor_id)
        timeline = CampaignTimeline(
            campaign_id=campaign_id,
            patient_id=patient_id,
            event_type="APPOINTMENT_CREATED",
            description=f"Appointment created for {patient.full_name} with {doctor.full_name if doctor else 'doctor'} on {appointment_date} at {appointment_time}",
            metadata_json=json.dumps({"appointment_id": appointment.id, "appointment_date": str(appointment_date), "appointment_time": appointment_time}),
        )
        self.db.add(timeline)
        await self.db.flush()
        return appointment

    async def get_available_doctors(self, hospital_id: str, date: date) -> List[dict]:
        doctors_query = select(User).where(
            User.hospital_id == hospital_id,
            User.role == "DOCTOR",
            User.is_active == True,
        )
        doctors_result = await self.db.execute(doctors_query)
        doctors = doctors_result.scalars().all()
        result = []
        for doc in doctors:
            avail_result = await self.db.execute(
                select(DoctorAvailability).where(
                    DoctorAvailability.doctor_id == doc.id,
                    DoctorAvailability.date == date,
                )
            )
            avail = avail_result.scalars().first()
            if avail and not avail.is_available:
                continue
            start = str(avail.start_time) if avail and avail.start_time else "09:00"
            end = str(avail.end_time) if avail and avail.end_time else "17:00"
            result.append({
                "id": doc.id,
                "name": doc.full_name,
                "specialization": doc.specialization,
                "available_slots": f"{start} - {end}",
            })
        return result

    async def get_campaign_responses(self, campaign_id: str = None, hospital_id: str = None, search: str = None, status: str = None, skip: int = 0, limit: int = 50) -> List[dict]:
        query = select(CampaignResponse, Campaign.name.label("campaign_name"))
        query = query.join(Campaign, CampaignResponse.campaign_id == Campaign.id)
        if campaign_id:
            query = query.where(CampaignResponse.campaign_id == campaign_id)
        if hospital_id:
            query = query.where(Campaign.hospital_id == hospital_id)
        if search:
            query = query.where(
                or_(
                    CampaignResponse.sender_name.ilike(f"%{search}%"),
                    CampaignResponse.phone.ilike(f"%{search}%"),
                )
            )
        query = query.order_by(desc(CampaignResponse.created_at)).offset(skip).limit(limit)
        result = await self.db.execute(query)
        rows = result.all()
        enriched = []
        for row in rows:
            response = row[0]
            campaign_name = row[1]
            patient_name = None
            lead_name = None
            if response.patient_id:
                pat = await self.db.get(Patient, response.patient_id)
                if pat:
                    patient_name = pat.full_name
            if response.lead_id:
                lead = await self.db.get(Lead, response.lead_id)
                if lead:
                    lead_name = lead.lead_name
            enriched.append({
                "id": response.id,
                "campaign_id": response.campaign_id,
                "campaign_name": campaign_name,
                "recipient_id": response.recipient_id,
                "patient_id": response.patient_id,
                "patient_name": patient_name,
                "lead_id": response.lead_id,
                "lead_name": lead_name,
                "phone": response.phone,
                "sender_name": response.sender_name,
                "message": response.message,
                "message_type": response.message_type,
                "is_read": response.is_read,
                "is_lead": response.is_lead,
                "converted_to_patient": response.converted_to_patient,
                "created_at": response.created_at.isoformat() if response.created_at else None,
            })
        return enriched

    async def get_analytics(self, hospital_id: Optional[str] = None) -> dict:
        base = select(Campaign)
        if hospital_id:
            base = base.where(Campaign.hospital_id == hospital_id)
        campaigns = (await self.db.execute(base)).scalars().all()
        total = len(campaigns)
        active = sum(1 for c in campaigns if (c.status.value if hasattr(c.status, 'value') else c.status) == CampaignStatus.ACTIVE.value)
        completed = sum(1 for c in campaigns if (c.status.value if hasattr(c.status, 'value') else c.status) == CampaignStatus.COMPLETED.value)
        total_recipients = sum(c.patients_targeted or 0 for c in campaigns)
        total_delivered = sum(c.messages_delivered or 0 for c in campaigns)
        total_responses = sum(c.responses_count or 0 for c in campaigns)
        total_interested = sum(c.interested_count or 0 for c in campaigns)
        total_converted = sum(c.patients_converted or 0 for c in campaigns)
        total_appointments = sum(c.appointments_generated or 0 for c in campaigns)
        total_revenue = sum(c.revenue_generated or 0 for c in campaigns)
        total_cost = sum(c.campaign_cost or 0 for c in campaigns)
        delivery_rate = round(total_delivered / total_recipients * 100, 1) if total_recipients else 0.0
        response_rate = round(total_responses / total_recipients * 100, 1) if total_recipients else 0.0
        interest_rate = round(total_interested / total_responses * 100, 1) if total_responses else 0.0
        conversion_rate = round(total_converted / total_interested * 100, 1) if total_interested else 0.0
        appointment_conversion_rate = round(total_appointments / total_responses * 100, 1) if total_responses else 0.0
        roi_percentage = round(((total_revenue - total_cost) / total_cost * 100), 1) if total_cost > 0 else 0.0
        return {
            "total_campaigns": total,
            "active_campaigns": active,
            "completed_campaigns": completed,
            "total_recipients": total_recipients,
            "total_delivered": total_delivered,
            "total_responses": total_responses,
            "total_interested": total_interested,
            "total_appointments": total_appointments,
            "total_converted": total_converted,
            "total_revenue": round(total_revenue, 2),
            "total_cost": round(total_cost, 2),
            "delivery_rate": delivery_rate,
            "response_rate": response_rate,
            "interest_rate": interest_rate,
            "conversion_rate": conversion_rate,
            "appointment_conversion_rate": appointment_conversion_rate,
            "roi_percentage": roi_percentage,
        }

    async def get_detailed_analytics(self, hospital_id: Optional[str] = None) -> dict:
        overview = await self.get_analytics(hospital_id)
        base = select(Campaign)
        if hospital_id:
            base = base.where(Campaign.hospital_id == hospital_id)
        campaigns = (await self.db.execute(base.order_by(desc(Campaign.revenue_generated)).limit(10))).scalars().all()
        top_campaigns = []
        for c in campaigns:
            top_campaigns.append({
                "id": c.id,
                "name": c.name,
                "sent": c.messages_sent or 0,
                "delivered": c.messages_delivered or 0,
                "responses": c.responses_count or 0,
                "revenue": c.revenue_generated or 0,
            })
        roi_data = []
        for c in campaigns:
            if c.campaign_cost and c.campaign_cost > 0:
                net_profit = (c.revenue_generated or 0) - c.campaign_cost
                roi_pct = round((net_profit / c.campaign_cost * 100), 1)
                roi_data.append({
                    "campaign_id": c.id,
                    "campaign_name": c.name,
                    "campaign_cost": c.campaign_cost,
                    "revenue_generated": c.revenue_generated or 0,
                    "net_profit": round(net_profit, 2),
                    "roi_percentage": roi_pct,
                    "patients_converted": c.patients_converted or 0,
                    "appointments_generated": c.appointments_generated or 0,
                    "cost_per_patient": round(c.campaign_cost / c.patients_converted, 2) if c.patients_converted else 0.0,
                    "revenue_per_patient": round((c.revenue_generated or 0) / c.patients_converted, 2) if c.patients_converted else 0.0,
                })
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        msg_query = select(
            cast(CampaignRecipient.created_at, Date).label("msg_date"),
            func.count(CampaignRecipient.id).label("msg_count"),
        )
        if hospital_id:
            msg_query = msg_query.join(Campaign, CampaignRecipient.campaign_id == Campaign.id).where(Campaign.hospital_id == hospital_id)
        msg_query = msg_query.where(CampaignRecipient.created_at >= thirty_days_ago)
        msg_query = msg_query.group_by(cast(CampaignRecipient.created_at, Date)).order_by(cast(CampaignRecipient.created_at, Date))
        msg_result = await self.db.execute(msg_query)
        messages_over_time = [{"date": str(row[0]), "count": row[1]} for row in msg_result.all()]
        template_query = select(
            CommunicationLog.template_name,
            func.count(CommunicationLog.id).label("tpl_count"),
        ).where(
            CommunicationLog.created_at >= thirty_days_ago,
            CommunicationLog.template_name.isnot(None),
        )
        if hospital_id:
            template_query = template_query.where(CommunicationLog.hospital_id == hospital_id)
        template_query = template_query.group_by(CommunicationLog.template_name).order_by(desc("tpl_count"))
        tpl_result = await self.db.execute(template_query)
        top_templates = [{"template": row[0] or "Unknown", "count": row[1]} for row in tpl_result.all()]
        source_query = select(
            Patient.patient_source,
            func.count(Patient.id).label("src_count"),
        ).where(
            Patient.source_campaign_id.isnot(None),
            Patient.patient_source.isnot(None),
        )
        if hospital_id:
            source_query = source_query.where(Patient.hospital_id == hospital_id)
        source_query = source_query.group_by(Patient.patient_source).order_by(desc("src_count"))
        src_result = await self.db.execute(source_query)
        top_sources = [{"source": row[0], "count": row[1]} for row in src_result.all()]
        total_sent = sum(c.messages_sent or 0 for c in campaigns)
        total_delivered = sum(c.messages_delivered or 0 for c in campaigns)
        total_responses = sum(c.responses_count or 0 for c in campaigns)
        total_interested = sum(c.interested_count or 0 for c in campaigns)
        total_appointments = sum(c.appointments_generated or 0 for c in campaigns)
        total_converted = sum(c.patients_converted or 0 for c in campaigns)
        total_revenue = sum(c.revenue_generated or 0 for c in campaigns)
        conversion_funnel = {
            "total_sent": total_sent,
            "total_delivered": total_delivered,
            "total_responses": total_responses,
            "total_interested": total_interested,
            "total_appointments": total_appointments,
            "total_converted": total_converted,
            "total_revenue": round(total_revenue, 2),
            "delivery_drop_off": round((1 - total_delivered / total_sent) * 100, 1) if total_sent else 0,
            "response_drop_off": round((1 - total_responses / total_delivered) * 100, 1) if total_delivered else 0,
            "interest_drop_off": round((1 - total_interested / total_responses) * 100, 1) if total_responses else 0,
            "appointment_drop_off": round((1 - total_appointments / total_interested) * 100, 1) if total_interested else 0,
            "conversion_drop_off": round((1 - total_converted / total_appointments) * 100, 1) if total_appointments else 0,
        }
        return {
            "overview": overview,
            "top_campaigns": top_campaigns,
            "roi_data": roi_data,
            "messages_over_time": messages_over_time,
            "top_templates": top_templates,
            "top_sources": top_sources,
            "conversion_funnel": conversion_funnel,
        }

    async def get_campaign_roi(self, campaign_id: str) -> dict:
        campaign = await self.db.get(Campaign, campaign_id)
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        cost = campaign.campaign_cost or 0
        revenue = campaign.revenue_generated or 0
        converted = campaign.patients_converted or 0
        appointments = campaign.appointments_generated or 0
        net_profit = revenue - cost
        roi_pct = round((net_profit / cost * 100), 1) if cost > 0 else 0.0
        cost_per_patient = round(cost / converted, 2) if converted > 0 else 0.0
        revenue_per_patient = round(revenue / converted, 2) if converted > 0 else 0.0
        return {
            "campaign_id": campaign_id,
            "campaign_name": campaign.name,
            "campaign_cost": cost,
            "revenue_generated": revenue,
            "net_profit": round(net_profit, 2),
            "roi_percentage": roi_pct,
            "patients_converted": converted,
            "appointments_generated": appointments,
            "cost_per_patient": cost_per_patient,
            "revenue_per_patient": revenue_per_patient,
        }

    async def get_dashboard_widgets(self, hospital_id: Optional[str] = None) -> dict:
        today_start = datetime.now(timezone.utc).date()
        base_recipients = select(CampaignRecipient)
        base_campaigns = select(Campaign)
        if hospital_id:
            base_recipients = base_recipients.join(Campaign, CampaignRecipient.campaign_id == Campaign.id).where(Campaign.hospital_id == hospital_id)
            base_campaigns = base_campaigns.where(Campaign.hospital_id == hospital_id)
        sent_today_q = base_recipients.where(
            CampaignRecipient.status == CampaignRecipientStatus.SENT.value,
            cast(CampaignRecipient.created_at, Date) == today_start,
        )
        sent_today_result = await self.db.execute(select(func.count()).select_from(sent_today_q.subquery()))
        messages_sent_today = sent_today_result.scalar() or 0
        replies_today_q = select(CampaignResponse).where(cast(CampaignResponse.created_at, Date) == today_start)
        if hospital_id:
            replies_today_q = replies_today_q.join(Campaign, CampaignResponse.campaign_id == Campaign.id).where(Campaign.hospital_id == hospital_id)
        replies_result = await self.db.execute(select(func.count()).select_from(replies_today_q.subquery()))
        replies_today = replies_result.scalar() or 0
        campaigns_result = await self.db.execute(base_campaigns)
        campaigns = campaigns_result.scalars().all()
        appointments_generated = sum(c.appointments_generated or 0 for c in campaigns)
        leads_converted = sum(c.patients_converted or 0 for c in campaigns)
        total_interested = sum(c.interested_count or 0 for c in campaigns)
        conversion_rate = round(leads_converted / total_interested * 100, 1) if total_interested > 0 else 0.0
        revenue_generated = round(sum(c.revenue_generated or 0 for c in campaigns), 2)
        top_campaign = max(campaigns, key=lambda c: c.revenue_generated or 0) if campaigns else None
        top_campaign_name = top_campaign.name if top_campaign else None
        active_count = sum(1 for c in campaigns if (c.status.value if hasattr(c.status, 'value') else c.status) == CampaignStatus.ACTIVE.value)
        return {
            "messages_sent_today": messages_sent_today,
            "replies_today": replies_today,
            "appointments_generated": appointments_generated,
            "leads_converted": leads_converted,
            "conversion_rate": conversion_rate,
            "revenue_generated": revenue_generated,
            "top_campaign": top_campaign_name,
            "active_campaigns_count": active_count,
        }

    async def get_patient_timeline(self, patient_id: str, campaign_id: str = None) -> List[dict]:
        query = select(CampaignTimeline, Campaign.name.label("campaign_name"))
        query = query.join(Campaign, CampaignTimeline.campaign_id == Campaign.id)
        query = query.where(CampaignTimeline.patient_id == patient_id)
        if campaign_id:
            query = query.where(CampaignTimeline.campaign_id == campaign_id)
        query = query.order_by(desc(CampaignTimeline.created_at))
        result = await self.db.execute(query)
        rows = result.all()
        enriched = []
        for row in rows:
            timeline = row[0]
            enriched.append({
                "id": timeline.id,
                "campaign_id": timeline.campaign_id,
                "campaign_name": row[1],
                "patient_id": timeline.patient_id,
                "lead_id": timeline.lead_id,
                "event_type": timeline.event_type,
                "description": timeline.description,
                "created_at": timeline.created_at.isoformat() if timeline.created_at else None,
            })
        return enriched
