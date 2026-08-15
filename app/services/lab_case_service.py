import logging
from datetime import datetime, date, timezone, timedelta
from typing import Optional, List
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.repositories.lab_case_repository import LabCaseRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.lab_case import LabCase
from app.models.lab_case_event import LabCaseEvent
from app.models.laboratory import Laboratory
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.case import Case
from app.models.patient import Patient
from app.models.hospital import Hospital
from app.models.user import User
from app.core.permissions import verify_tenant_access

LAB_STATUSES = ["PENDING", "SENT", "RECEIVED", "CANCELLED", "RESENT"]

# Legacy statuses that may still exist in the database from before the
# workflow was simplified. They are accepted for reads/display so existing
# rows keep working, but are no longer offered when changing status.
LEGACY_LAB_STATUSES = {"IN_PROGRESS", "READY", "RETURNED"}

LAB_EVENT_STATUS_CHANGE = "STATUS_CHANGE"
LAB_EVENT_WHATSAPP = "WHATSAPP"
LAB_EVENT_CALL = "CALL"
LAB_EVENT_NOTE = "NOTE"
LAB_EVENT_CREATED = "CASE_CREATED"

RESPONSE_MARKER = "\n\n[Response]\n"


def _whatsapp_note(message: str, response: dict = None) -> str:
    if not response:
        return message
    try:
        import json
        return message + RESPONSE_MARKER + json.dumps(response, indent=2, default=str)
    except Exception:
        return message


def _message_from_note(note) -> str:
    if note and RESPONSE_MARKER in note:
        return note.split(RESPONSE_MARKER, 1)[0]
    return note or ""


class LabCaseService:
    def __init__(self, db: AsyncSession):
        self.repo = LabCaseRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def _hospital_scope(self, current_user: dict) -> Optional[List[str]]:
        role = current_user.get("role")
        if role == "SUPER_ADMIN":
            return None
        if role == "GROUP_ADMIN":
            agid = current_user.get("admin_group_id")
            if not agid:
                return []
            r = await self.db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))
            return [row[0] for row in r.all()]
        hid = current_user.get("hospital_id")
        return [hid] if hid else []

    async def _get_treatment_plan(self, plan_id: str) -> Optional[TreatmentPlan]:
        result = await self.db.execute(select(TreatmentPlan).where(TreatmentPlan.id == plan_id))
        return result.scalar_one_or_none()

    async def create_from_treatment(self, current_user: dict, plan_id: str, data: dict):
        """Create a lab requirement for a treatment, or update it if one already exists.

        Returns (lab_case, created: bool). Idempotent: re-submitting the same lab
        details updates the existing requirement in place instead of failing.
        """
        plan = await self._get_treatment_plan(plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="Treatment not found")
        await verify_tenant_access(current_user, plan, "treatment_plan", self.db)
        existing = await self.get_by_treatment(plan_id)
        user_id = current_user.get("sub")
        payload = {k: v for k, v in data.items() if v is not None and v != ""}
        if existing:
            updatable = ("laboratory_id", "order_number", "tooth_number", "material",
                         "sent_date", "due_date", "returned_date", "lab_cost", "remarks", "lab_status")
            updates = {k: v for k, v in payload.items() if k in updatable}
            if updates:
                await self.repo.update(existing.id, **updates)
                self.db.add(LabCaseEvent(lab_case_id=existing.id, event_type=LAB_EVENT_NOTE,
                                         note="Lab requirement updated", actor_id=user_id))
                await self._audit(existing.id, "UPDATE_LAB_CASE", "Lab requirement updated", user_id)
                await self.db.flush()
            return existing, False
        payload["treatment_plan_id"] = plan_id
        if user_id:
            payload["created_by"] = user_id
        if not payload.get("tooth_number") and plan.tooth_numbers:
            payload["tooth_number"] = plan.tooth_numbers
        if not payload.get("lab_status"):
            payload["lab_status"] = "SENT" if payload.get("sent_date") else "PENDING"
        lab_case = await self.repo.create(**payload)
        event = LabCaseEvent(lab_case_id=lab_case.id, event_type=LAB_EVENT_CREATED, note="Lab case created", actor_id=user_id)
        self.db.add(event)
        await self._audit(lab_case.id, "CREATE_LAB_CASE", f"Lab case created for '{plan.treatment_name}'", user_id)
        await self.db.flush()
        return lab_case, True

    async def get_by_treatment(self, plan_id: str) -> Optional[LabCase]:
        result = await self.db.execute(select(LabCase).where(LabCase.treatment_plan_id == plan_id))
        return result.scalar_one_or_none()

    async def get(self, lab_case_id: str) -> Optional[LabCase]:
        lab_case = await self.repo.get(lab_case_id)
        if lab_case:
            await self._enrich_many([lab_case])
        return lab_case

    def _base_query(self):
        return (
            select(LabCase)
            .join(TreatmentPlan, LabCase.treatment_plan_id == TreatmentPlan.id)
            .join(Case, TreatmentPlan.case_id == Case.id)
            .join(Patient, Case.patient_id == Patient.id)
        )

    async def _apply_scope(self, query, current_user: dict):
        hospital_ids = await self._hospital_scope(current_user)
        if hospital_ids is None:
            return query
        return query.where(Patient.hospital_id.in_(hospital_ids))

    async def get_all(self, current_user: dict, filters: dict = None, skip: int = 0, limit: int = 100, order_by: str = None, descending: bool = False) -> List[LabCase]:
        query = self._base_query()
        if filters:
            for key, value in filters.items():
                if value is None:
                    continue
                if key == "lab_status":
                    query = query.where(LabCase.lab_status == value)
                elif key == "laboratory_id":
                    query = query.where(LabCase.laboratory_id == value)
                elif key == "hospital_id":
                    query = query.where(Patient.hospital_id == value)
                elif key == "overdue_only":
                    query = query.where(LabCase.returned_date.is_(None), LabCase.due_date.isnot(None), LabCase.due_date < date.today())
                elif key == "search":
                    like = f"%{value}%"
                    query = query.where(
                        or_(Patient.full_name.ilike(like), TreatmentPlan.treatment_name.ilike(like), LabCase.order_number.ilike(like), LabCase.tooth_number.ilike(like))
                    )
        query = await self._apply_scope(query, current_user)
        if order_by and hasattr(LabCase, order_by):
            col = getattr(LabCase, order_by)
            query = query.order_by(col.desc() if descending else col)
        else:
            query = query.order_by(LabCase.updated_at.desc())
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        lab_cases = list(result.scalars().all())
        if lab_cases:
            await self._enrich_many(lab_cases)
        return lab_cases

    async def count(self, current_user: dict, filters: dict = None) -> int:
        query = select(func.count(LabCase.id)).join(TreatmentPlan, LabCase.treatment_plan_id == TreatmentPlan.id).join(Case, TreatmentPlan.case_id == Case.id).join(Patient, Case.patient_id == Patient.id)
        if filters:
            for key, value in filters.items():
                if value is None:
                    continue
                if key == "lab_status":
                    query = query.where(LabCase.lab_status == value)
                elif key == "laboratory_id":
                    query = query.where(LabCase.laboratory_id == value)
                elif key == "hospital_id":
                    query = query.where(Patient.hospital_id == value)
                elif key == "overdue_only":
                    query = query.where(LabCase.returned_date.is_(None), LabCase.due_date.isnot(None), LabCase.due_date < date.today())
                elif key == "search":
                    like = f"%{value}%"
                    query = query.where(
                        or_(Patient.full_name.ilike(like), TreatmentPlan.treatment_name.ilike(like), LabCase.order_number.ilike(like), LabCase.tooth_number.ilike(like))
                    )
        query = await self._apply_scope(query, current_user)
        result = await self.db.execute(query)
        return result.scalar() or 0

    async def candidates(self, current_user: dict, search: str = None) -> List[dict]:
        query = (
            select(TreatmentPlan)
            .outerjoin(LabCase, LabCase.treatment_plan_id == TreatmentPlan.id)
            .join(Case, TreatmentPlan.case_id == Case.id)
            .join(Patient, Case.patient_id == Patient.id)
            .where(TreatmentPlan.status == "WAITING_LAB")
        )
        query = await self._apply_scope(query, current_user)
        if search:
            query = query.where(Patient.full_name.ilike(f"%{search}%") | TreatmentPlan.treatment_name.ilike(f"%{search}%"))
        query = query.order_by(TreatmentPlan.updated_at.desc()).limit(200)
        result = await self.db.execute(query)
        plans = list(result.scalars().unique().all())
        return await self._enrich_candidates(plans)

    async def _enrich_candidates(self, plans: List[TreatmentPlan]) -> List[dict]:
        if not plans:
            return []
        case_ids = [p.case_id for p in plans if p.case_id]
        cases = {}
        patients = {}
        doctors = {}
        hospitals = {}
        if case_ids:
            cr = await self.db.execute(select(Case.id, Case.patient_id, Case.doctor_id, Case.case_number).where(Case.id.in_(case_ids)))
            for row in cr.all():
                cases[row[0]] = row
            pat_ids = {r[1] for r in cases.values() if r[1]}
            if pat_ids:
                pr = await self.db.execute(select(Patient.id, Patient.full_name, Patient.op_no, Patient.phone, Patient.hospital_id).where(Patient.id.in_(pat_ids)))
                for row in pr.all():
                    patients[row[0]] = row
            doc_ids = {r[2] for r in cases.values() if r[2]}
            if doc_ids:
                dr = await self.db.execute(select(User.id, User.full_name).where(User.id.in_(doc_ids)))
                doctors = {row[0]: row[1] for row in dr.all()}
            hosp_ids = {r[4] for r in patients.values() if r[4]}
            if hosp_ids:
                hr = await self.db.execute(select(Hospital.id, Hospital.name).where(Hospital.id.in_(hosp_ids)))
                hospitals = {row[0]: row[1] for row in hr.all()}
        out = []
        lab_case_map = {}
        if plans:
            lab_r = await self.db.execute(
                select(LabCase.id, LabCase.treatment_plan_id)
                .where(LabCase.treatment_plan_id.in_([p.id for p in plans]))
            )
            for row in lab_r.all():
                lab_case_map[row[1]] = row[0]
        for p in plans:
            c = cases.get(p.case_id)
            pat = patients.get(c[1]) if c else None
            out.append({
                "treatment_plan_id": p.id,
                "lab_case_id": lab_case_map.get(p.id),
                "treatment_number": p.treatment_number,
                "treatment_name": p.treatment_name,
                "patient_id": pat[0] if pat else None,
                "patient_name": pat[1] if pat else None,
                "op_number": pat[2] if pat else None,
                "patient_phone": pat[3] if pat else None,
                "hospital_id": pat[4] if pat else None,
                "hospital_name": hospitals.get(pat[4]) if pat and pat[4] else None,
                "doctor_name": doctors.get(c[2]) if c else None,
                "case_id": p.case_id,
                "case_number": c[3] if c else None,
                "tooth_number": p.tooth_numbers,
                "lab_hint": p.overdue_reason,
            })
        return out

    async def _enrich_many(self, lab_cases: List[LabCase]):
        if not lab_cases:
            return
        plan_map = {}
        for lc in lab_cases:
            if lc.treatment_plan:
                plan_map[lc.treatment_plan_id] = lc.treatment_plan
        case_ids = [p.case_id for p in plan_map.values() if p.case_id]
        cases = {}
        if case_ids:
            cr = await self.db.execute(select(Case.id, Case.patient_id, Case.doctor_id, Case.case_number).where(Case.id.in_(case_ids)))
            for row in cr.all():
                cases[row[0]] = row
        pat_ids = {r[1] for r in cases.values() if r[1]}
        patients = {}
        if pat_ids:
            pr = await self.db.execute(select(Patient.id, Patient.full_name, Patient.op_no, Patient.phone, Patient.hospital_id).where(Patient.id.in_(pat_ids)))
            for row in pr.all():
                patients[row[0]] = row
        hosp_ids = {r[4] for r in patients.values() if r[4]}
        hospitals = {}
        if hosp_ids:
            hr = await self.db.execute(select(Hospital.id, Hospital.name).where(Hospital.id.in_(hosp_ids)))
            hospitals = {row[0]: row[1] for row in hr.all()}
        doc_ids = {r[2] for r in cases.values() if r[2]}
        doctors = {}
        if doc_ids:
            dr = await self.db.execute(select(User.id, User.full_name).where(User.id.in_(doc_ids)))
            doctors = {row[0]: row[1] for row in dr.all()}
        actor_ids = set()
        for lc in lab_cases:
            for e in lc.events:
                if e.actor_id:
                    actor_ids.add(e.actor_id)
        actors = {}
        if actor_ids:
            ar = await self.db.execute(select(User.id, User.full_name).where(User.id.in_(actor_ids)))
            actors = {row[0]: row[1] for row in ar.all()}
        for lc in lab_cases:
            plan = lc.treatment_plan
            c = cases.get(plan.case_id) if plan else None
            pat = patients.get(c[1]) if c else None
            lc.patient_id = pat[0] if pat else None
            lc.patient_name = pat[1] if pat else None
            lc.op_number = pat[2] if pat else None
            lc.patient_phone = pat[3] if pat else None
            lc.hospital_id = pat[4] if pat else None
            lc.hospital_name = hospitals.get(pat[4]) if pat and pat[4] else None
            lc.doctor_name = doctors.get(c[2]) if c else None
            lc.case_id = plan.case_id if plan else None
            lc.case_number = c[3] if c else None
            lc.treatment_name = plan.treatment_name if plan else None
            lc.treatment_number = plan.treatment_number if plan else None
            lc.tooth_numbers = plan.tooth_numbers if plan else None
            lab = lc.laboratory
            lc.laboratory_name = lab.name if lab else None
            lc.laboratory_phone = lab.phone if lab else None
            lc.laboratory_whatsapp_number = lab.whatsapp_number if lab else None
            for e in lc.events:
                e.actor_name = actors.get(e.actor_id)
        return lab_cases

    async def update(self, lab_case_id: str, data: dict, current_user: dict = None) -> Optional[LabCase]:
        lab_case = await self.repo.get(lab_case_id)
        if not lab_case:
            return None
        user_id = (current_user or {}).get("sub")
        clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
        new_status = clean_data.pop("lab_status", None)
        if new_status and new_status != lab_case.lab_status:
            self.db.add(LabCaseEvent(lab_case_id=lab_case_id, event_type=LAB_EVENT_STATUS_CHANGE, from_status=lab_case.lab_status, to_status=new_status, note=clean_data.pop("status_note", None), actor_id=user_id))
        if clean_data:
            lab_case = await self.repo.update(lab_case_id, **clean_data)
        await self._audit(lab_case_id, "UPDATE_LAB_CASE", "Lab case updated", user_id)
        await self.db.flush()
        return await self.get(lab_case_id)

    async def set_status(self, lab_case_id: str, new_status: str, note: str = None, current_user: dict = None) -> Optional[LabCase]:
        valid = set(LAB_STATUSES) | LEGACY_LAB_STATUSES
        if new_status not in valid:
            raise HTTPException(status_code=400, detail=f"status must be one of {LAB_STATUSES}")
        lab_case = await self.repo.get(lab_case_id)
        if not lab_case:
            return None
        user_id = (current_user or {}).get("sub")
        if new_status != lab_case.lab_status:
            old_status = lab_case.lab_status
            if new_status == "SENT" and not lab_case.sent_date:
                lab_case.sent_date = date.today()
            if new_status == "RESENT":
                lab_case.sent_date = date.today()
                lab_case.returned_date = None
            if new_status in ("RECEIVED", "RETURNED") and not lab_case.returned_date:
                lab_case.returned_date = date.today()
            lab_case.lab_status = new_status
            self.db.add(LabCaseEvent(lab_case_id=lab_case_id, event_type=LAB_EVENT_STATUS_CHANGE, from_status=old_status, to_status=new_status, note=note, actor_id=user_id))
            await self._audit(lab_case_id, "UPDATE_LAB_CASE_STATUS", f"Status changed to {new_status}", user_id)
            await self.db.flush()
            if new_status == "RESENT":
                await self._set_treatment_waiting_lab(lab_case.treatment_plan_id, current_user,
                                                       reason="lab item re-sent to laboratory")
            elif new_status in ("RECEIVED", "RETURNED", "CANCELLED"):
                await self._resume_treatment_if_waiting(lab_case.treatment_plan_id, current_user,
                                                        reason="lab item received back" if new_status in ("RECEIVED", "RETURNED") else "lab requirement cancelled")
        return await self.get(lab_case_id)

    async def _set_treatment_waiting_lab(self, plan_id: str, current_user: dict = None, reason: str = "lab item re-sent to laboratory"):
        """When an item is re-sent to the laboratory (RESENT), a treatment that
        was resumed (IN_PROGRESS) goes back to WAITING_LAB so it is tracked again."""
        try:
            plan = await self._get_treatment_plan(plan_id)
            if not plan:
                return
            current_status = plan.status.value if hasattr(plan.status, "value") else str(plan.status)
            if current_status == TreatmentPlanStatus.WAITING_LAB.value:
                return
            from app.services.status_automation import StatusAutomationService
            await StatusAutomationService(self.db).update_treatment_status(plan_id, TreatmentPlanStatus.WAITING_LAB)
            await self.db.flush()
            try:
                case_result = await self.db.execute(
                    select(Case.patient_id).where(Case.id == plan.case_id)
                )
                patient_row = case_result.one_or_none()
                if patient_row and patient_row[0]:
                    from app.services.timeline_helper import record_timeline_event
                    await record_timeline_event(
                        db=self.db,
                        current_user=current_user,
                        patient_id=patient_row[0],
                        action="Treatment Set to Waiting Lab",
                        description=f"{reason.capitalize()} for '{plan.treatment_name}' - treatment set to waiting lab",
                        module="Treatments",
                    )
            except Exception:
                logging.getLogger(__name__).exception("LAB_RETURN_WAITING_TIMELINE - failed plan=%s", plan_id)
        except Exception:
            logging.getLogger(__name__).exception("LAB_SET_WAITING - failed plan=%s", plan_id)

    async def _resume_treatment_if_waiting(self, plan_id: str, current_user: dict = None, reason: str = "lab item received back"):
        """When a lab item is received back (RETURNED) or cancelled, a treatment that
        is merely waiting on that lab resumes to IN_PROGRESS. It is never auto-completed."""
        try:
            plan = await self._get_treatment_plan(plan_id)
            if not plan:
                return
            current_status = plan.status.value if hasattr(plan.status, "value") else str(plan.status)
            if current_status != TreatmentPlanStatus.WAITING_LAB.value:
                return
            from app.services.status_automation import StatusAutomationService
            await StatusAutomationService(self.db).update_treatment_status(plan_id, TreatmentPlanStatus.IN_PROGRESS)
            await self.db.flush()
            try:
                case_result = await self.db.execute(
                    select(Case.patient_id).where(Case.id == plan.case_id)
                )
                patient_row = case_result.one_or_none()
                if patient_row and patient_row[0]:
                    from app.services.timeline_helper import record_timeline_event
                    await record_timeline_event(
                        db=self.db,
                        current_user=current_user,
                        patient_id=patient_row[0],
                        action="Treatment Resumed",
                        description=f"{reason.capitalize()} for '{plan.treatment_name}' - treatment resumed",
                        module="Treatments",
                    )
            except Exception:
                logging.getLogger(__name__).exception("LAB_RESUME_TIMELINE - failed plan=%s", plan_id)
        except Exception:
            logging.getLogger(__name__).exception("LAB_RESUME_TREATMENT - failed plan=%s", plan_id)

    async def add_event(self, lab_case_id: str, event_type: str, note: str = None, current_user: dict = None) -> LabCaseEvent:
        lab_case = await self.repo.get(lab_case_id)
        if not lab_case:
            raise HTTPException(status_code=404, detail="Lab case not found")
        user_id = (current_user or {}).get("sub")
        event = LabCaseEvent(lab_case_id=lab_case_id, event_type=event_type, note=note, actor_id=user_id)
        self.db.add(event)
        await self.db.flush()
        return event

    async def whatsapp(self, lab_case_id: str, message: str, phone: str = None, current_user: dict = None) -> dict:
        from app.utils.whatsapp import whatsapp_provider
        lab_case = await self.get(lab_case_id)
        if not lab_case:
            raise HTTPException(status_code=404, detail="Lab case not found")
        target = phone or lab_case.laboratory_whatsapp_number or lab_case.laboratory_phone
        if not target:
            raise HTTPException(status_code=400, detail="No WhatsApp / phone number available for this laboratory")
        links = whatsapp_provider.generate_deep_link(target, message)
        user_id = (current_user or {}).get("sub")
        recent = await self.db.execute(
            select(LabCaseEvent).where(
                LabCaseEvent.lab_case_id == lab_case_id,
                LabCaseEvent.event_type == LAB_EVENT_WHATSAPP,
                LabCaseEvent.created_at >= datetime.now(timezone.utc) - timedelta(seconds=45),
            ).order_by(LabCaseEvent.created_at.desc()).limit(1)
        )
        duplicate = recent.scalar_one_or_none()
        if duplicate and _message_from_note(duplicate.note) == message:
            logger = logging.getLogger(__name__)
            logger.info("Duplicate WhatsApp to lab case %s skipped (sent %s ago)",
                        lab_case_id, datetime.now(timezone.utc) - duplicate.created_at)
            return {"success": True, "phone": links["phone"], "deep_link": links["wa_link"], "message": message, "duplicate_skipped": True}
        sent = await whatsapp_provider.send_message(target, message)
        response = {"success": sent, "phone": links["phone"], "deep_link": links["wa_link"], "provider": "whatsapp"}
        note = _whatsapp_note(message, response)
        self.db.add(LabCaseEvent(lab_case_id=lab_case_id, event_type=LAB_EVENT_WHATSAPP, note=note, actor_id=user_id))
        await self._audit(lab_case_id, "LAB_CASE_WHATSAPP", "WhatsApp sent to laboratory", user_id)
        if sent:
            await self._mark_sent_after_whatsapp(lab_case, current_user)
        await self.db.flush()
        return {"success": sent, "phone": links["phone"], "deep_link": links["wa_link"], "message": message}

    async def _mark_sent_after_whatsapp(self, lab_case: LabCase, current_user: dict = None):
        """After a WhatsApp message is actually sent to the laboratory, promote the
        lab case to SENT (first time) or RESENT (when it was received/cancelled and
        is being sent to the lab once again)."""
        current = lab_case.lab_status
        if current == "RECEIVED" or current == "CANCELLED":
            lab_case.lab_status = "RESENT"
            lab_case.sent_date = date.today()
            lab_case.returned_date = None
            await self.db.flush()
            await self._set_treatment_waiting_lab(lab_case.treatment_plan_id, current_user)
        elif current == "PENDING":
            lab_case.lab_status = "SENT"
            lab_case.sent_date = date.today()
            await self.db.flush()

    async def batch_send(self, current_user: dict, payload: dict) -> dict:
        """Send one WhatsApp message to a laboratory covering several treatments.

        Creates (or reuses) a PENDING lab case for each treatment, groups them
        into a single WhatsApp message that includes the expected return date,
        records the sent message + provider response on every lab case and marks
        them SENT.
        """
        from app.utils.whatsapp import whatsapp_provider
        from app.services.laboratory_service import LaboratoryService

        plan_ids = payload.get("treatment_plan_ids") or []
        laboratory_id = payload.get("laboratory_id")
        due_date = payload.get("due_date")
        phone = payload.get("phone")
        order_number = payload.get("order_number")
        custom_message = payload.get("message")

        if not plan_ids:
            raise HTTPException(status_code=400, detail="No treatments selected")
        if not laboratory_id:
            raise HTTPException(status_code=400, detail="laboratory_id is required")

        lab_result = await self.db.execute(select(Laboratory).where(Laboratory.id == laboratory_id))
        laboratory = lab_result.scalar_one_or_none()
        if not laboratory:
            raise HTTPException(status_code=404, detail="Laboratory not found")
        await LaboratoryService(self.db)._ensure_access(current_user, laboratory)

        user_id = current_user.get("sub")
        lab_cases = []
        resend_flags = {}
        for plan_id in plan_ids:
            plan = await self._get_treatment_plan(plan_id)
            if not plan:
                raise HTTPException(status_code=404, detail=f"Treatment {plan_id} not found")
            await verify_tenant_access(current_user, plan, "treatment_plan", self.db)
            existing = await self.get_by_treatment(plan_id)
            was_resend = existing is not None and existing.lab_status in ("RECEIVED", "CANCELLED")
            updates = {"laboratory_id": laboratory_id, "lab_status": "PENDING"}
            if due_date:
                updates["due_date"] = due_date
            if order_number:
                updates["order_number"] = order_number
            if existing:
                await self.repo.update(existing.id, **updates)
                resend_flags[existing.id] = was_resend
                lab_cases.append(existing)
            else:
                create_data = {
                    "treatment_plan_id": plan.id,
                    "laboratory_id": laboratory_id,
                    "lab_status": "PENDING",
                    "created_by": user_id,
                }
                if due_date:
                    create_data["due_date"] = due_date
                if order_number:
                    create_data["order_number"] = order_number
                create_data["order_number"] = f"LAB-{plan.id[:8].upper()}"
                created = await self.repo.create(**create_data)
                self.db.add(LabCaseEvent(lab_case_id=created.id, event_type=LAB_EVENT_CREATED, note="Lab case created", actor_id=user_id))
                lab_cases.append(created)
        await self.db.flush()
        await self._enrich_many(lab_cases)

        hospital_name = lab_cases[0].hospital_name if lab_cases and lab_cases[0].hospital_name else "Dental Clinic"
        message = custom_message if (custom_message and custom_message.strip()) else self._build_batch_message(
            laboratory_name=laboratory.name,
            lab_cases=lab_cases,
            due_date=due_date,
            hospital_name=hospital_name,
        )

        target = phone or laboratory.whatsapp_number or laboratory.phone
        if not target:
            raise HTTPException(status_code=400, detail="No WhatsApp / phone number available for this laboratory")
        links = whatsapp_provider.generate_deep_link(target, message)
        sent = await whatsapp_provider.send_message(target, message)
        response = {"success": sent, "phone": links["phone"], "deep_link": links["wa_link"], "provider": "whatsapp", "lab_cases": [lc.id for lc in lab_cases]}
        note = _whatsapp_note(message, response)

        today = date.today()
        for lc in lab_cases:
            was_received_or_cancelled = lc.lab_status in ("RECEIVED", "CANCELLED")
            lc.lab_status = "RESENT" if was_received_or_cancelled else "SENT"
            lc.sent_date = today
            if was_received_or_cancelled:
                lc.returned_date = None
            self.db.add(LabCaseEvent(lab_case_id=lc.id, event_type=LAB_EVENT_WHATSAPP, note=note, actor_id=user_id))
            await self._audit(lc.id, "LAB_CASE_WHATSAPP", f"Batch WhatsApp sent to {laboratory.name}", user_id)
        await self.db.flush()

        if sent and lab_cases:
            await self._set_treatment_waiting_lab(lab_cases[0].treatment_plan_id, current_user)

        return {
            "success": sent,
            "phone": links["phone"],
            "deep_link": links["wa_link"],
            "message": message,
            "lab_case_ids": [lc.id for lc in lab_cases],
        }

    def _build_batch_message(self, laboratory_name: str, lab_cases: List[LabCase], due_date=None, hospital_name: str = None) -> str:
        lines = [f"Hello {laboratory_name} Team,", "", "Please process the following dental laboratory work:"]
        for idx, lc in enumerate(lab_cases, start=1):
            parts = []
            if lc.patient_name:
                parts.append(f"Patient: {lc.patient_name}")
            if lc.op_number:
                parts.append(f"OP: {lc.op_number}")
            if lc.treatment_name:
                parts.append(f"Treatment: {lc.treatment_name}")
            if lc.tooth_number or lc.tooth_numbers:
                parts.append(f"Tooth: {lc.tooth_number or lc.tooth_numbers}")
            if lc.order_number:
                parts.append(f"Order: {lc.order_number}")
            if lc.material:
                parts.append(f"Material: {lc.material}")
            if lc.remarks:
                parts.append(f"Note: {lc.remarks}")
            lines.append(f"{idx}) {' | '.join(parts)}")
        if due_date:
            lines.append("")
            lines.append(f"Expected return date: {due_date}")
        lines.append("")
        lines.append(f"Regards,{chr(10)}{hospital_name or 'Dental Clinic'}")
        return "\n".join(lines)

    async def call(self, lab_case_id: str, note: str = None, duration_seconds: int = None, current_user: dict = None) -> LabCaseEvent:
        lab_case = await self.repo.get(lab_case_id)
        if not lab_case:
            raise HTTPException(status_code=404, detail="Lab case not found")
        user_id = (current_user or {}).get("sub")
        call_note = note
        if duration_seconds:
            mins = round(duration_seconds / 60, 1)
            call_note = f"{note or 'Phone call'} ({mins} min)".strip()
        event = LabCaseEvent(lab_case_id=lab_case_id, event_type=LAB_EVENT_CALL, note=call_note, actor_id=user_id)
        self.db.add(event)
        await self._audit(lab_case_id, "LAB_CASE_CALL", "Call logged to laboratory", user_id)
        await self.db.flush()
        return event

    async def monthly_report(self, current_user: dict, month: str):
        try:
            year, mon = int(month[:4]), int(month[5:7])
            if mon < 1 or mon > 12:
                raise ValueError
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail="month must be in YYYY-MM format")
        month_start = date(year, mon, 1)
        month_end = date(year + 1, 1, 1) if mon == 12 else date(year, mon + 1, 1)
        lab_cases = await self._report_cases(current_user, month_start, month_end)
        await self._enrich_many(lab_cases)
        rows = []
        status_breakdown = {s: 0 for s in LAB_STATUSES}
        lab_totals = {}
        total_cost = 0.0
        for lc in lab_cases:
            status_breakdown[lc.lab_status] = status_breakdown.get(lc.lab_status, 0) + 1
            cost = float(lc.lab_cost or 0)
            total_cost += cost
            lab_name = lc.laboratory_name or "Unassigned"
            lab_totals.setdefault(lab_name, {"laboratory_id": lc.laboratory_id, "cases": 0, "total_cost": 0.0})
            lab_totals[lab_name]["cases"] += 1
            lab_totals[lab_name]["total_cost"] += cost
            sent = lc.sent_date
            ref = lc.returned_date or date.today()
            days = (ref - sent).days if sent else None
            rows.append([
                lc.order_number or "",
                lc.patient_name or "",
                lc.op_number or "",
                lc.treatment_name or "",
                lc.tooth_number or (lc.tooth_numbers or ""),
                lc.material or "",
                lab_name,
                str(lc.sent_date) if lc.sent_date else "",
                str(lc.due_date) if lc.due_date else "",
                str(lc.returned_date) if lc.returned_date else "",
                days if days is not None else "",
                lc.lab_status,
                round(cost, 2),
            ])
        lab_breakdown = [
            {"laboratory_id": v["laboratory_id"], "laboratory_name": k, "cases": v["cases"], "total_cost": round(v["total_cost"], 2)}
            for k, v in sorted(lab_totals.items(), key=lambda x: -x[1]["total_cost"])
        ]
        headers = ["Order", "Patient", "OP", "Treatment", "Tooth", "Material", "Laboratory", "Sent", "Due", "Returned", "Days", "Status", "Cost"]
        summary = [
            {"label": "Total Cases", "value": len(lab_cases)},
            {"label": "Total Lab Cost", "value": f"\u20B9{round(total_cost, 2):,.2f}"},
            {"label": "Returned", "value": status_breakdown.get("RECEIVED", 0) + status_breakdown.get("RETURNED", 0)},
            {"label": "In Lab", "value": status_breakdown.get("IN_PROGRESS", 0) + status_breakdown.get("SENT", 0) + status_breakdown.get("RESENT", 0)},
            {"label": "Pending", "value": status_breakdown.get("PENDING", 0)},
        ]
        return {
            "month": month,
            "headers": headers,
            "rows": rows,
            "summary": summary,
            "total_cases": len(lab_cases),
            "total_cost": round(total_cost, 2),
            "status_breakdown": status_breakdown,
            "lab_breakdown": lab_breakdown,
        }

    async def _report_cases(self, current_user: dict, month_start: date, month_end: date) -> List[LabCase]:
        query = (
            select(LabCase)
            .join(TreatmentPlan, LabCase.treatment_plan_id == TreatmentPlan.id)
            .join(Case, TreatmentPlan.case_id == Case.id)
            .join(Patient, Case.patient_id == Patient.id)
            .where(
                or_(
                    LabCase.sent_date.isnot(None) & (LabCase.sent_date >= month_start) & (LabCase.sent_date < month_end),
                    LabCase.sent_date.is_(None) & (LabCase.created_at >= datetime(month_start.year, month_start.month, month_start.day, tzinfo=timezone.utc)) & (LabCase.created_at < datetime(month_end.year, month_end.month, month_end.day, tzinfo=timezone.utc)),
                )
            )
        )
        query = await self._apply_scope(query, current_user)
        query = query.order_by(LabCase.sent_date.is_(None), LabCase.sent_date, LabCase.created_at)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def _audit(self, lab_case_id: str, action: str, details: str, user_id: str = None):
        try:
            await self.audit_log_repo.create(user_id=user_id, action=action, entity_type="LAB_CASE", entity_id=lab_case_id, details=details)
        except Exception:
            logging.getLogger(__name__).exception("LAB_CASE_AUDIT - failed action=%s", action)

    @staticmethod
    def parse_tooth_numbers(value):
        import json
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if isinstance(parsed, list):
                    return ", ".join(str(t) for t in parsed)
            except (json.JSONDecodeError, TypeError):
                pass
        return value
