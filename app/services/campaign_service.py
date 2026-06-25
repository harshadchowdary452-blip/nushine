import logging
from typing import Optional, List
from datetime import datetime, timezone, date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from fastapi import HTTPException, status
from app.models.campaign import Campaign, CampaignRecipient, CampaignStatus, CampaignTarget, CampaignRecipientStatus, CampaignChannel
from app.models.patient import Patient
from app.models.appointment import Appointment, AppointmentStatus
from app.models.case import Case
from app.models.hospital import Hospital
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
            campaign_type=data.get("campaign_type", "GENERAL"),
            channel=data.get("channel", "WHATSAPP"),
            target=data.get("target", "ALL"),
            message=data["message"],
            start_date=data.get("start_date"),
            end_date=data.get("end_date"),
        )
        self.db.add(campaign)
        await self.db.flush()
        return campaign

    async def get(self, campaign_id: str) -> Optional[Campaign]:
        return await self.db.get(Campaign, campaign_id)

    async def get_all(self, hospital_id: Optional[str] = None, skip: int = 0, limit: int = 50) -> List[Campaign]:
        query = select(Campaign)
        if hospital_id:
            query = query.where(Campaign.hospital_id == hospital_id)
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

    async def _resolve_target_patients(self, hospital_id: str, target: CampaignTarget) -> List[Patient]:
        query = select(Patient).where(Patient.is_active == True, Patient.hospital_id == hospital_id)
        if target == CampaignTarget.ACTIVE:
            query = query.where(Patient.status == "ACTIVE")
        elif target == CampaignTarget.COMPLETED_TREATMENT:
            query = query.where(Patient.status == "COMPLETED")
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
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def launch(self, campaign_id: str, hospital_id: str) -> dict:
        campaign = await self.db.get(Campaign, campaign_id)
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        if campaign.status != CampaignStatus.DRAFT:
            raise HTTPException(status_code=400, detail="Only draft campaigns can be launched")
        patients = await self._resolve_target_patients(hospital_id, CampaignTarget(campaign.target))
        if not patients:
            raise HTTPException(status_code=400, detail="No patients match the target criteria")
        campaign.patients_targeted = len(patients)
        campaign.status = CampaignStatus.ACTIVE
        campaign.start_date = date.today()
        hospital_obj = await self.db.get(Hospital, hospital_id)
        hospital_name = hospital_obj.name if hospital_obj else None
        provider = WhatsAppProvider()
        sent_count = 0
        for patient in patients:
            if not patient.phone:
                continue
            variables = {}
            if patient.doctor_id:
                from app.models.user import User
                doc = await self.db.get(User, patient.doctor_id)
                if doc:
                    variables["doctor_name"] = doc.full_name
            variables["patient_name"] = patient.full_name
            variables["hospital_name"] = hospital_name or ""
            rendered = TemplateEngine.render_template(campaign.message, variables)
            success = await provider.send_message(patient.phone, rendered)
            status_val = CommunicationStatus.SENT.value if success else CommunicationStatus.FAILED.value
            recipient = CampaignRecipient(
                campaign_id=campaign_id,
                patient_id=patient.id,
                status=CampaignRecipientStatus.SENT.value if success else CampaignRecipientStatus.PENDING.value,
            )
            self.db.add(recipient)
            log = CommunicationLog(
                patient_id=patient.id, hospital_id=hospital_id,
                channel=CommunicationChannel.WHATSAPP.value,
                message_type=MessageType.CAMPAIGN.value,
                message=rendered, status=status_val,
                sent_at=datetime.now(timezone.utc) if success else None,
            )
            self.db.add(log)
            if success:
                sent_count += 1
        campaign.messages_sent = sent_count
        await self.db.flush()
        return {
            "success": True,
            "campaign_id": campaign_id,
            "recipients_count": len(patients),
            "sent_count": sent_count,
        }

    async def get_analytics(self, hospital_id: Optional[str] = None) -> dict:
        base = select(Campaign)
        if hospital_id:
            base = base.where(Campaign.hospital_id == hospital_id)
        campaigns = (await self.db.execute(base)).scalars().all()
        total = len(campaigns)
        active = sum(1 for c in campaigns if c.status == CampaignStatus.ACTIVE.value)
        completed = sum(1 for c in campaigns if c.status == CampaignStatus.COMPLETED.value)
        total_recipients = sum(c.patients_targeted for c in campaigns)
        total_delivered = sum(c.messages_delivered for c in campaigns)
        total_responses = sum(c.responses_count for c in campaigns)
        total_appointments = sum(c.appointments_generated for c in campaigns)
        total_revenue = sum(c.revenue_generated for c in campaigns)
        return {
            "total_campaigns": total,
            "active_campaigns": active,
            "completed_campaigns": completed,
            "total_recipients": total_recipients,
            "total_delivered": total_delivered,
            "total_responses": total_responses,
            "total_appointments": total_appointments,
            "total_revenue": round(total_revenue, 2),
            "delivery_rate": round(total_delivered / total_recipients * 100, 1) if total_recipients else 0,
            "response_rate": round(total_responses / total_recipients * 100, 1) if total_recipients else 0,
            "appointment_conversion_rate": round(total_appointments / total_responses * 100, 1) if total_responses else 0,
        }

    async def get_retention_analytics(self, hospital_id: Optional[str] = None) -> dict:
        base = select(Patient)
        if hospital_id:
            base = base.where(Patient.hospital_id == hospital_id)
        patients = (await self.db.execute(base)).scalars().all()
        total = len(patients)
        active = sum(1 for p in patients if p.status == "ACTIVE")
        completed = sum(1 for p in patients if p.status == "COMPLETED")
        six_months_ago = date.today() - timedelta(days=180)
        one_year_ago = date.today() - timedelta(days=365)
        no_visit_6m = sum(1 for p in patients if p.updated_at and p.updated_at.date() < six_months_ago)
        no_visit_1y = sum(1 for p in patients if p.updated_at and p.updated_at.date() < one_year_ago)
        from app.models.follow_up import FollowUp
        fq = select(FollowUp)
        if hospital_id:
            fq = fq.where(FollowUp.hospital_id == hospital_id)
        follow_ups = (await self.db.execute(fq)).scalars().all()
        scheduled_fu = sum(1 for f in follow_ups if f.status in ("SCHEDULED", "PENDING"))
        completed_fu = sum(1 for f in follow_ups if f.status == "COMPLETED")
        missed_fu = sum(1 for f in follow_ups if f.status == "LOST")
        return {
            "total_patients": total,
            "active_patients": active,
            "treatment_completed": completed,
            "retention_rate": round(active / total * 100, 1) if total else 0,
            "patients_no_visit_6m": no_visit_6m,
            "patients_no_visit_1y": no_visit_1y,
            "at_risk_rate": round(no_visit_6m / total * 100, 1) if total else 0,
            "follow_ups_scheduled": scheduled_fu,
            "follow_ups_completed": completed_fu,
            "follow_ups_missed": missed_fu,
            "follow_up_completion_rate": round(completed_fu / (completed_fu + missed_fu) * 100, 1) if (completed_fu + missed_fu) else 0,
        }

    async def get_follow_up_suggestions(self, hospital_id: Optional[str] = None) -> List[dict]:
        today = date.today()
        suggestions = []
        from app.models.follow_up import FollowUp
        overdue_q = select(FollowUp).where(FollowUp.follow_up_date < today, FollowUp.status == "SCHEDULED")
        if hospital_id:
            overdue_q = overdue_q.where(FollowUp.hospital_id == hospital_id)
        overdue = (await self.db.execute(overdue_q.order_by(FollowUp.follow_up_date.asc()).limit(20))).scalars().all()
        for fu in overdue:
            patient = await self.db.get(Patient, fu.patient_id)
            suggestions.append({
                "type": "overdue_follow_up",
                "priority": "high",
                "patient_id": fu.patient_id,
                "patient_name": patient.full_name if patient else "Unknown",
                "follow_up_id": fu.id,
                "follow_up_date": fu.follow_up_date.isoformat(),
                "notes": fu.notes,
                "days_overdue": (today - fu.follow_up_date).days,
            })
        if len(suggestions) < 10:
            completed_q = select(Patient).where(Patient.status == "COMPLETED")
            if hospital_id:
                completed_q = completed_q.where(Patient.hospital_id == hospital_id)
            completed_q = completed_q.order_by(desc(Patient.updated_at)).limit(10)
            completed_patients = (await self.db.execute(completed_q)).scalars().all()
            for p in completed_patients:
                from app.models.follow_up import FollowUp
                existing_q = select(FollowUp).where(FollowUp.patient_id == p.id, FollowUp.follow_up_date >= today)
                existing = (await self.db.execute(existing_q)).scalars().first()
                if not existing:
                    suggestions.append({
                        "type": "schedule_follow_up",
                        "priority": "medium",
                        "patient_id": p.id,
                        "patient_name": p.full_name,
                        "follow_up_id": None,
                        "last_visit": p.updated_at.isoformat() if p.updated_at else None,
                    })
        return suggestions[:20]

    async def get_follow_up_calendar(self, hospital_id: Optional[str], start_date: date, end_date: date) -> List[dict]:
        from app.models.follow_up import FollowUp
        from app.models.patient import Patient
        from app.models.user import User
        from app.models.billing import Billing
        q = select(FollowUp, Patient.full_name, Patient.phone).join(Patient, FollowUp.patient_id == Patient.id)
        if hospital_id:
            q = q.where(FollowUp.hospital_id == hospital_id)
        q = q.where(FollowUp.follow_up_date >= start_date, FollowUp.follow_up_date <= end_date)
        q = q.order_by(FollowUp.follow_up_date.asc(), FollowUp.follow_up_time.asc())
        result = await self.db.execute(q)
        rows = result.all()
        enriched = []
        for r in rows:
            fu = r[0]
            doctor = await self.db.get(User, fu.doctor_id) if fu.doctor_id else None
            invoice_number = None
            billing_id = fu.billing_id
            if not billing_id and fu.case_id:
                br = await self.db.execute(
                    select(Billing).where(Billing.case_id == fu.case_id).order_by(Billing.created_at.desc()).limit(1)
                )
                b = br.scalar_one_or_none()
                if b:
                    billing_id = str(b.id)
                    invoice_number = b.invoice_number
            elif billing_id:
                b = await self.db.get(Billing, billing_id)
                if b:
                    invoice_number = b.invoice_number
            enriched.append({
                "id": str(fu.id),
                "patient_id": str(fu.patient_id),
                "patient_name": r[1],
                "patient_phone": r[2],
                "doctor_name": doctor.full_name if doctor else None,
                "follow_up_date": fu.follow_up_date.isoformat(),
                "follow_up_time": str(fu.follow_up_time) if fu.follow_up_time else None,
                "follow_up_type": fu.follow_up_type,
                "treatment_name": fu.treatment_name,
                "status": fu.status,
                "billing_id": billing_id,
                "invoice_number": invoice_number,
                "notes": fu.notes,
                "created_at": fu.created_at.isoformat(),
            })
        return enriched

    async def get_patient_interactions(self, patient_id: str) -> List[dict]:
        interactions = []
        from app.models.communication_log import CommunicationLog
        logs = (await self.db.execute(
            select(CommunicationLog).where(CommunicationLog.patient_id == patient_id).order_by(desc(CommunicationLog.created_at)).limit(30)
        )).scalars().all()
        for log in logs:
            interactions.append({
                "type": "communication",
                "id": str(log.id),
                "channel": log.channel,
                "message_type": log.message_type,
                "message": log.message[:200] if log.message else None,
                "status": log.status,
                "created_at": log.created_at.isoformat(),
            })
        from app.models.follow_up import FollowUp
        fus = (await self.db.execute(
            select(FollowUp).where(FollowUp.patient_id == patient_id).order_by(desc(FollowUp.created_at)).limit(20)
        )).scalars().all()
        for fu in fus:
            interactions.append({
                "type": "follow_up",
                "id": str(fu.id),
                "follow_up_date": fu.follow_up_date.isoformat(),
                "status": fu.status,
                "notes": fu.notes,
                "created_at": fu.created_at.isoformat(),
            })
        from app.models.patient_feedback import PatientFeedback
        feedbacks = (await self.db.execute(
            select(PatientFeedback).where(PatientFeedback.patient_id == patient_id).order_by(desc(PatientFeedback.created_at)).limit(20)
        )).scalars().all()
        for fb in feedbacks:
            interactions.append({
                "type": "feedback",
                "id": str(fb.id),
                "rating": fb.rating,
                "review": fb.review,
                "created_at": fb.created_at.isoformat(),
            })
        interactions.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return interactions
