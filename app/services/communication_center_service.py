import asyncio
import os
import tempfile
import zipfile
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException
from sqlalchemy import select, func, union_all, case, or_, cast, String, DateTime, literal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from starlette.background import BackgroundTask
from starlette.responses import FileResponse, StreamingResponse

from app.core.permissions import Role
from app.models.communication_log import CommunicationLog, MessageAudit
from app.models.lead import Lead, LeadCommunication
from app.models.consent_form import ConsentForm
from app.models.notification import Notification
from app.models.lab_case_event import LabCaseEvent
from app.models.lab_case import LabCase
from app.models.treatment_plan import TreatmentPlan
from app.models.case import Case as CaseModel
from app.models.patient import Patient
from app.models.hospital import Hospital
from app.models.user import User
from app.models.communication_center_activity import CommunicationCenterActivity
from app.services.export_service import _generate_excel, _generate_pdf, _stream_csv, _hospital_info, EXPORT_DIR

LOG_SOURCES = {
    "Appointments", "Billing", "CRM", "WhatsApp", "Email",
    "Invoices / Receipts", "Treatments", "Automation", "Notifications",
}
LEAD_SOURCE = "Leads"
DOC_SOURCE = "Consent Forms"
LAB_SOURCE = "Laboratory"
ALL_SOURCES = sorted(LOG_SOURCES | {LEAD_SOURCE, DOC_SOURCE, LAB_SOURCE})

ALL_CHANNELS = ["WHATSAPP", "EMAIL", "SMS", "PRINTED_DOCUMENT", "DOWNLOADED_DOCUMENT", "MANUAL"]
ALL_STATUSES = ["PENDING", "QUEUED", "SENDING", "SENT", "DELIVERED", "READ", "FAILED", "CANCELLED", "SIGNED"]

COLUMN_NAMES = [
    "source_module", "source_id", "patient_id", "patient_name", "op_number", "phone",
    "lead_id", "lead_name", "hospital_id", "hospital_name", "doctor_id", "doctor_name",
    "sent_by", "sent_by_name", "channel", "communication_type", "subject", "message",
    "message_preview", "status", "delivery_status", "provider_response", "sent_at",
    "delivered_at", "created_at", "attachment_url", "template_name", "sent_via",
]

SORT_COLUMNS = {"created_at", "sent_at", "patient_name", "hospital_name", "channel", "status", "source_module"}


def _ns():
    return cast(None, String(255))


def _nd():
    return cast(None, DateTime(timezone=True))


def _iso(v):
    return v.isoformat() if v else None


def _source_module_for(cl_message_type, cl_channel):
    appointment = ["APPOINTMENT_CONFIRMATION", "APPOINTMENT_REMINDER"]
    return case(
        (cl_message_type.in_(appointment), "Appointments"),
        (cl_message_type == "PAYMENT_REMINDER", "Billing"),
        (cl_message_type == "INVOICE", "Invoices / Receipts"),
        (cl_message_type == "TREATMENT_PLAN", "Treatments"),
        (cl_message_type == "DENTAL_RECALL", "Automation"),
        (cl_channel == "EMAIL", "Email"),
        else_="WhatsApp",
    )


class CommunicationCenterService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------ scope
    async def _resolve_hospital_scope(self, current_user, requested_hospital_id=None):
        role = current_user.get("role")
        if role == Role.SUPER_ADMIN.value:
            if requested_hospital_id:
                row = (await self.db.execute(
                    select(Hospital.id).where(Hospital.id == requested_hospital_id))).one_or_none()
                if not row:
                    raise HTTPException(status_code=403, detail="HOSPITAL_CONTEXT_DENIED")
                return [requested_hospital_id]
            return None
        if role == Role.GROUP_ADMIN.value:
            agid = current_user.get("admin_group_id")
            if not agid:
                raise HTTPException(status_code=403, detail="Access denied: no admin group")
            if requested_hospital_id:
                row = (await self.db.execute(select(Hospital.id).where(
                    Hospital.id == requested_hospital_id,
                    Hospital.admin_group_id == agid))).one_or_none()
                if not row:
                    raise HTTPException(status_code=403, detail="HOSPITAL_CONTEXT_DENIED")
                return [requested_hospital_id]
            rows = await self.db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))
            return [r[0] for r in rows.all()]
        if role == Role.HOSPITAL_ADMIN.value:
            own = current_user.get("hospital_id")
            if requested_hospital_id and own and str(requested_hospital_id) != str(own):
                raise HTTPException(status_code=403, detail="HOSPITAL_CONTEXT_DENIED")
            return [own] if own else []
        raise HTTPException(status_code=403, detail="Access denied")

    # ------------------------------------------------------------------ query
    def _sub(self):
        cl = CommunicationLog
        p = Patient
        h = Hospital
        doc_u = aliased(User)
        apr = aliased(User)

        s1 = select(
            _source_module_for(cl.message_type, cl.channel).label("source_module"),
            cl.id.label("source_id"),
            cl.patient_id.label("patient_id"),
            p.full_name.label("patient_name"),
            p.op_no.label("op_number"),
            p.phone.label("phone"),
            _ns().label("lead_id"),
            _ns().label("lead_name"),
            cl.hospital_id.label("hospital_id"),
            h.name.label("hospital_name"),
            cl.doctor_id.label("doctor_id"),
            doc_u.full_name.label("doctor_name"),
            cl.approved_by.label("sent_by"),
            apr.full_name.label("sent_by_name"),
            cl.channel.label("channel"),
            cl.message_type.label("communication_type"),
            cl.subject.label("subject"),
            cl.message.label("message"),
            cl.message.label("message_preview"),
            cl.status.label("status"),
            _ns().label("delivery_status"),
            cl.provider_response.label("provider_response"),
            cl.sent_at.label("sent_at"),
            case((cl.status.in_(["DELIVERED", "READ"]), cl.sent_at), else_=_nd()).label("delivered_at"),
            cl.created_at.label("created_at"),
            cl.attachment_url.label("attachment_url"),
            cl.template_name.label("template_name"),
            cl.sent_via.label("sent_via"),
        ).join(p, cl.patient_id == p.id, isouter=True) \
         .join(h, cl.hospital_id == h.id, isouter=True) \
         .join(doc_u, cl.doctor_id == doc_u.id, isouter=True) \
         .join(apr, cl.approved_by == apr.id, isouter=True)

        lc = LeadCommunication
        ld = Lead
        h2 = Hospital
        s2 = select(
            literal("Leads").label("source_module"),
            lc.id.label("source_id"),
            _ns().label("patient_id"),
            _ns().label("patient_name"),
            _ns().label("op_number"),
            ld.mobile.label("phone"),
            lc.lead_id.label("lead_id"),
            ld.lead_name.label("lead_name"),
            lc.hospital_id.label("hospital_id"),
            h2.name.label("hospital_name"),
            _ns().label("doctor_id"),
            _ns().label("doctor_name"),
            lc.sent_by.label("sent_by"),
            lc.sent_by_name.label("sent_by_name"),
            lc.channel.label("channel"),
            lc.message_type.label("communication_type"),
            _ns().label("subject"),
            lc.message.label("message"),
            lc.message_preview.label("message_preview"),
            case((lc.delivery_status.isnot(None), lc.delivery_status), else_=lc.status).label("status"),
            lc.delivery_status.label("delivery_status"),
            lc.provider_response.label("provider_response"),
            lc.sent_at.label("sent_at"),
            case((lc.delivery_status.in_(["DELIVERED", "READ"]), lc.sent_at), else_=_nd()).label("delivered_at"),
            lc.created_at.label("created_at"),
            _ns().label("attachment_url"),
            lc.template_name.label("template_name"),
            _ns().label("sent_via"),
        ).join(ld, lc.lead_id == ld.id) \
         .join(h2, lc.hospital_id == h2.id, isouter=True)

        cf = ConsentForm
        h3 = Hospital
        up3 = aliased(User)
        doc3 = aliased(User)
        s3 = select(
            literal("Consent Forms").label("source_module"),
            cf.id.label("source_id"),
            cf.patient_id.label("patient_id"),
            cf.patient_name.label("patient_name"),
            cf.op_number.label("op_number"),
            cf.phone.label("phone"),
            _ns().label("lead_id"),
            _ns().label("lead_name"),
            cf.hospital_id.label("hospital_id"),
            h3.name.label("hospital_name"),
            cf.doctor_id.label("doctor_id"),
            doc3.full_name.label("doctor_name"),
            cf.uploaded_by.label("sent_by"),
            up3.full_name.label("sent_by_name"),
            literal("PRINTED_DOCUMENT").label("channel"),
            cf.consent_type.label("communication_type"),
            cf.consent_type.label("subject"),
            cf.remarks.label("message"),
            cf.remarks.label("message_preview"),
            literal("SIGNED").label("status"),
            _ns().label("delivery_status"),
            _ns().label("provider_response"),
            cf.created_at.label("sent_at"),
            _nd().label("delivered_at"),
            cf.created_at.label("created_at"),
            cf.pdf_path.label("attachment_url"),
            literal("Consent Form").label("template_name"),
            _ns().label("sent_via"),
        ).where(cf.is_deleted.is_(False)) \
         .join(h3, cf.hospital_id == h3.id, isouter=True) \
         .join(up3, cf.uploaded_by == up3.id, isouter=True) \
         .join(doc3, cf.doctor_id == doc3.id, isouter=True)

        n = Notification
        h4 = Hospital
        u4 = User
        s4 = select(
            literal("Notifications").label("source_module"),
            n.id.label("source_id"),
            _ns().label("patient_id"),
            _ns().label("patient_name"),
            _ns().label("op_number"),
            _ns().label("phone"),
            _ns().label("lead_id"),
            _ns().label("lead_name"),
            n.hospital_id.label("hospital_id"),
            h4.name.label("hospital_name"),
            _ns().label("doctor_id"),
            _ns().label("doctor_name"),
            n.user_id.label("sent_by"),
            u4.full_name.label("sent_by_name"),
            literal("MANUAL").label("channel"),
            n.type.label("communication_type"),
            n.title.label("subject"),
            func.coalesce(n.description, n.title).label("message"),
            n.title.label("message_preview"),
            literal("SENT").label("status"),
            _ns().label("delivery_status"),
            _ns().label("provider_response"),
            n.created_at.label("sent_at"),
            _nd().label("delivered_at"),
            n.created_at.label("created_at"),
            _ns().label("attachment_url"),
            _ns().label("template_name"),
            _ns().label("sent_via"),
        ).join(h4, n.hospital_id == h4.id, isouter=True) \
         .join(u4, n.user_id == u4.id, isouter=True)

        e = LabCaseEvent
        lab = LabCase
        tp = TreatmentPlan
        cm = CaseModel
        pat = Patient
        h5 = Hospital
        u5 = User
        s5 = select(
            literal("Laboratory").label("source_module"),
            e.id.label("source_id"),
            cm.patient_id.label("patient_id"),
            pat.full_name.label("patient_name"),
            pat.op_no.label("op_number"),
            pat.phone.label("phone"),
            _ns().label("lead_id"),
            _ns().label("lead_name"),
            pat.hospital_id.label("hospital_id"),
            h5.name.label("hospital_name"),
            _ns().label("doctor_id"),
            _ns().label("doctor_name"),
            e.actor_id.label("sent_by"),
            u5.full_name.label("sent_by_name"),
            literal("WHATSAPP").label("channel"),
            literal("LAB_WHATSAPP").label("communication_type"),
            literal("Laboratory WhatsApp").label("subject"),
            e.note.label("message"),
            e.note.label("message_preview"),
            literal("SENT").label("status"),
            _ns().label("delivery_status"),
            _ns().label("provider_response"),
            e.created_at.label("sent_at"),
            _nd().label("delivered_at"),
            e.created_at.label("created_at"),
            _ns().label("attachment_url"),
            _ns().label("template_name"),
            _ns().label("sent_via"),
        ).join(lab, e.lab_case_id == lab.id) \
         .join(tp, lab.treatment_plan_id == tp.id) \
         .join(cm, tp.case_id == cm.id) \
         .join(pat, cm.patient_id == pat.id, isouter=True) \
         .join(h5, pat.hospital_id == h5.id, isouter=True) \
         .join(u5, e.actor_id == u5.id, isouter=True) \
         .where(e.event_type == "WHATSAPP")

        union = union_all(s1, s2, s3, s4, s5)
        return union.subquery("cc")

    def _conditions(self, sub, hospital_ids=None, search=None, source_module=None,
                    channel=None, status=None, communication_type=None, doctor_id=None,
                    date_from=None, date_to=None, patient_id=None, lead_id=None):
        conds = []
        if hospital_ids is not None:
            conds.append(sub.c.hospital_id.in_(hospital_ids))
        if search:
            s = search.lower()
            conds.append(or_(
                func.lower(func.coalesce(sub.c.patient_name, "")).contains(s),
                func.lower(func.coalesce(sub.c.op_number, "")).contains(s),
                func.lower(func.coalesce(sub.c.phone, "")).contains(s),
                func.lower(func.coalesce(sub.c.lead_name, "")).contains(s),
                func.lower(func.coalesce(sub.c.subject, "")).contains(s),
                func.lower(func.coalesce(sub.c.message, "")).contains(s),
            ))
        if source_module:
            conds.append(sub.c.source_module == source_module)
        if channel:
            conds.append(sub.c.channel == channel)
        if status:
            conds.append(sub.c.status == status)
        if communication_type:
            conds.append(sub.c.communication_type == communication_type)
        if doctor_id:
            conds.append(sub.c.doctor_id == doctor_id)
        if date_from:
            conds.append(sub.c.created_at >= date_from)
        if date_to:
            conds.append(sub.c.created_at < date_to + timedelta(days=1))
        if patient_id:
            conds.append(sub.c.patient_id == patient_id)
        if lead_id:
            conds.append(sub.c.lead_id == lead_id)
        return conds

    def _order_by(self, sub, sort_by="created_at", descending=True):
        if sort_by not in SORT_COLUMNS:
            sort_by = "created_at"
        col = sub.c[sort_by]
        expr = col.desc() if descending else col.asc()
        if sort_by in ("created_at", "sent_at"):
            return [expr.nullslast()]
        return [expr.nullslast()]

    async def _run_page(self, current_user, params, hospital_ids, extra_conds=None):
        sub = self._sub()
        conds = self._conditions(
            sub,
            hospital_ids=hospital_ids,
            search=params.get("search"),
            source_module=params.get("source_module"),
            channel=params.get("channel"),
            status=params.get("status"),
            communication_type=params.get("communication_type"),
            doctor_id=params.get("doctor_id"),
            date_from=params.get("date_from"),
            date_to=params.get("date_to"),
        ) + (extra_conds or [])
        page = int(params.get("page", 1))
        page_size = int(params.get("page_size", 20))
        sort_by = params.get("sort_by", "created_at")
        descending = params.get("sort_dir", "desc") != "asc"
        outer_cols = [sub.c[name] for name in COLUMN_NAMES]

        count_stmt = select(func.count()).select_from(sub).where(*conds)
        total = (await self.db.execute(count_stmt)).scalar() or 0

        stmt = select(*outer_cols).select_from(sub).where(*conds) \
            .order_by(*self._order_by(sub, sort_by, descending)) \
            .limit(page_size).offset((page - 1) * page_size)
        rows = (await self.db.execute(stmt)).all()
        items = [self._serialize(r) for r in rows]
        pages = (total + page_size - 1) // page_size if total > 0 else 0
        return {"items": items, "total": total, "page": page, "size": page_size, "pages": pages}

    @staticmethod
    def _serialize(row):
        return {
            "source_module": row.source_module,
            "source_id": row.source_id,
            "patient_id": row.patient_id,
            "patient_name": row.patient_name,
            "op_number": row.op_number,
            "phone": row.phone,
            "lead_id": row.lead_id,
            "lead_name": row.lead_name,
            "hospital_id": row.hospital_id,
            "hospital_name": row.hospital_name,
            "doctor_id": row.doctor_id,
            "doctor_name": row.doctor_name,
            "sent_by": row.sent_by,
            "sent_by_name": row.sent_by_name,
            "channel": row.channel,
            "communication_type": row.communication_type,
            "subject": row.subject,
            "message": row.message,
            "message_preview": row.message_preview,
            "status": row.status,
            "delivery_status": row.delivery_status,
            "provider_response": row.provider_response,
            "sent_at": _iso(row.sent_at),
            "delivered_at": _iso(row.delivered_at),
            "created_at": _iso(row.created_at),
            "attachment_url": row.attachment_url,
            "template_name": row.template_name,
            "sent_via": row.sent_via,
            "can_resend": row.source_module in LOG_SOURCES or row.source_module == LEAD_SOURCE,
            "can_download": row.source_module == DOC_SOURCE or bool(row.attachment_url),
        }

    # ------------------------------------------------------------------- APIs
    async def list_communications(self, current_user, params: dict):
        hospital_ids = await self._resolve_hospital_scope(
            current_user, params.get("hospital_id"))
        return await self._run_page(current_user, params, hospital_ids)

    async def get_communication(self, current_user, source_module, source_id):
        hospital_ids = await self._resolve_hospital_scope(current_user)
        sub = self._sub()
        outer_cols = [sub.c[name] for name in COLUMN_NAMES]
        stmt = select(*outer_cols).select_from(sub).where(
            sub.c.source_module == source_module,
            sub.c.source_id == source_id,
        )
        row = (await self.db.execute(stmt)).one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Communication not found")
        if hospital_ids is not None and row.hospital_id and row.hospital_id not in hospital_ids:
            raise HTTPException(status_code=403, detail="Access denied")
        item = self._serialize(row)
        item["audit"] = await self._audit_events(source_module, source_id)
        return item

    async def _audit_events(self, source_module, source_id):
        events = []
        if source_id:
            rows = await self.db.execute(
                select(MessageAudit).where(MessageAudit.communication_log_id == source_id)
                .order_by(MessageAudit.created_at.asc()))
            for a in rows.scalars():
                events.append({
                    "id": a.id, "action": a.action, "details": a.details,
                    "created_by": a.created_by, "created_at": _iso(a.created_at),
                    "channel": None, "source": "message_audit",
                })
            acts = await self.db.execute(
                select(CommunicationCenterActivity).where(
                    CommunicationCenterActivity.communication_id == source_id)
                .order_by(CommunicationCenterActivity.created_at.asc()))
            for a in acts.scalars():
                events.append({
                    "id": a.id, "action": a.action, "details": a.details,
                    "created_by": a.created_by, "created_at": _iso(a.created_at),
                    "channel": a.channel, "source": "communication_center",
                })
        names = await self._user_names([e["created_by"] for e in events if e.get("created_by")])
        for e in events:
            e["created_by_name"] = names.get(e.get("created_by"))
        events.sort(key=lambda e: e["created_at"] or "")
        return events

    async def _user_names(self, user_ids):
        ids = list({u for u in user_ids if u})
        if not ids:
            return {}
        rows = await self.db.execute(select(User.id, User.full_name).where(User.id.in_(ids)))
        return {str(r[0]): r[1] for r in rows.all()}

    async def patient_timeline(self, current_user, patient_id):
        hospital_ids = await self._resolve_hospital_scope(current_user)
        sub = self._sub()
        conds = self._conditions(sub, hospital_ids=hospital_ids, patient_id=patient_id)
        outer_cols = [sub.c[name] for name in COLUMN_NAMES]
        stmt = select(*outer_cols).select_from(sub).where(*conds) \
            .order_by(sub.c.created_at.asc())
        rows = (await self.db.execute(stmt)).all()
        return [self._serialize(r) for r in rows]

    async def stats(self, current_user, params: dict):
        hospital_ids = await self._resolve_hospital_scope(
            current_user, params.get("hospital_id"))
        sub = self._sub()
        conds = self._conditions(
            sub,
            hospital_ids=hospital_ids,
            search=params.get("search"),
            source_module=params.get("source_module"),
            channel=params.get("channel"),
            status=params.get("status"),
            communication_type=params.get("communication_type"),
            doctor_id=params.get("doctor_id"),
            date_from=params.get("date_from"),
            date_to=params.get("date_to"),
        )
        total = (await self.db.execute(select(func.count()).select_from(sub).where(*conds))).scalar() or 0

        now = datetime.now(timezone.utc)
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        start_of_week = start_of_day - timedelta(days=start_of_day.weekday())
        today = (await self.db.execute(
            select(func.count()).select_from(sub).where(*conds, sub.c.created_at >= start_of_day))).scalar() or 0
        week = (await self.db.execute(
            select(func.count()).select_from(sub).where(*conds, sub.c.created_at >= start_of_week))).scalar() or 0

        async def _group(col):
            stmt = select(col, func.count()).select_from(sub).where(*conds).group_by(col)
            rows = (await self.db.execute(stmt)).all()
            return {str(r[0]): r[1] for r in rows}

        return {
            "total": total,
            "today": today,
            "this_week": week,
            "by_channel": await _group(sub.c.channel),
            "by_status": await _group(sub.c.status),
            "by_source_module": await _group(sub.c.source_module),
            "by_hospital": await _group(sub.c.hospital_name),
        }

    # ---------------------------------------------------------------- preview
    async def _load_source(self, source_module, source_id):
        if source_module in LOG_SOURCES:
            return ("log", await self.db.get(CommunicationLog, source_id))
        if source_module == LEAD_SOURCE:
            return ("lead", await self.db.get(LeadCommunication, source_id))
        if source_module == DOC_SOURCE:
            return ("doc", await self.db.get(ConsentForm, source_id))
        if source_module == LAB_SOURCE:
            return ("lab", await self.db.get(LabCaseEvent, source_id))
        return (None, None)

    async def _build_context(self, source_module, source):
        if source_module in LOG_SOURCES:
            from app.routers.whatsapp_messaging import resolve_variables
            if source.patient_id:
                try:
                    ctx = await resolve_variables(self.db, source.patient_id, source.hospital_id)
                    resolved = dict(ctx["resolved"])
                    unresolved = list(ctx["unresolved"])
                    phone = resolved.get("patient_phone")
                    return resolved, unresolved, phone
                except HTTPException:
                    pass
            return {}, [], None
        if source_module == LEAD_SOURCE:
            lead = await self.db.get(Lead, source.lead_id)
            resolved = {}
            unresolved = []
            phone = None
            if lead:
                if lead.lead_name:
                    resolved["lead_name"] = lead.lead_name
                else:
                    unresolved.append("{{lead_name}}")
                phone = lead.mobile
            if source.hospital_id:
                hospital = await self.db.get(Hospital, source.hospital_id)
                if hospital and hospital.name:
                    resolved["hospital_name"] = hospital.name
                else:
                    unresolved.append("{{hospital_name}}")
            return resolved, unresolved, phone
        return {}, [], None

    async def preview(self, current_user, source_module, source_id):
        kind, source = await self._load_source(source_module, source_id)
        if not source:
            raise HTTPException(status_code=404, detail="Communication not found")
        if kind not in ("log", "lead"):
            raise HTTPException(status_code=400, detail="Preview is only available for resendable messages")
        from app.routers.whatsapp_messaging import render_message, unresolved_in_message
        resolved, unresolved, phone = await self._build_context(source_module, source)
        body = source.message or ""
        rendered = render_message(body, resolved)
        used = unresolved_in_message(rendered, resolved)
        all_unresolved = list(dict.fromkeys(unresolved + used))
        return {
            "source_module": source_module,
            "source_id": source_id,
            "channel": getattr(source, "channel", "WHATSAPP") or "WHATSAPP",
            "recipient": phone,
            "template": body,
            "rendered": rendered,
            "resolved": {k: v for k, v in resolved.items() if v},
            "unresolved": all_unresolved,
            "missing_variables": used,
            "can_send": len(used) == 0,
        }

    async def resend(self, current_user, source_module, source_id, message_override=None):
        kind, source = await self._load_source(source_module, source_id)
        if not source:
            raise HTTPException(status_code=404, detail="Communication not found")
        if kind not in ("log", "lead"):
            raise HTTPException(status_code=400, detail="This communication cannot be resent")
        from app.routers.whatsapp_messaging import render_message, unresolved_in_message
        resolved, unresolved, phone = await self._build_context(source_module, source)
        body = message_override or source.message or ""
        rendered = render_message(body, resolved)
        used = unresolved_in_message(rendered, resolved)
        if used:
            raise HTTPException(
                status_code=422,
                detail=f"Cannot send: unresolved variables {', '.join(used)}. Resolve or remove them before sending.",
            )
        if not phone:
            raise HTTPException(status_code=422, detail="Cannot send: recipient phone number is missing.")

        channel = (getattr(source, "channel", "WHATSAPP") or "WHATSAPP")
        user_id = current_user.get("sub")
        now = datetime.now(timezone.utc)
        new_id = None

        if channel == "EMAIL":
            status_val = "SENT"
            provider_response = "Email queued (no SMTP engine)"
        else:
            from app.utils.whatsapp import whatsapp_provider
            sent = await whatsapp_provider.send_message(phone, rendered)
            status_val = "SENT" if sent else "FAILED"
            provider_response = None

        if kind == "log":
            log = CommunicationLog(
                patient_id=source.patient_id,
                hospital_id=source.hospital_id,
                doctor_id=source.doctor_id,
                channel=channel,
                message_type=source.message_type or "GENERAL",
                subject=source.subject,
                message=rendered,
                status=status_val,
                provider_response=provider_response,
                sent_at=now,
                attachment_url=source.attachment_url,
                template_id=source.template_id,
                template_name=source.template_name,
                rendered_variables=str({k: v for k, v in resolved.items() if v}),
                sent_via="communication_center",
                approved_by=user_id,
                approved_at=now,
            )
            self.db.add(log)
            await self.db.flush()
            new_id = log.id
            self.db.add(MessageAudit(
                communication_log_id=log.id,
                patient_id=log.patient_id,
                hospital_id=log.hospital_id,
                action="RESEND",
                details=f"Resent from Communication Center (original {source_id})",
                created_by=user_id,
                created_at=now,
            ))
        else:
            comm = LeadCommunication(
                lead_id=source.lead_id,
                hospital_id=source.hospital_id,
                sent_by=user_id,
                sent_by_name=current_user.get("full_name"),
                channel=channel,
                message_type=source.message_type or "GENERAL",
                template_name=source.template_name,
                message=rendered,
                status=status_val,
                delivery_status=status_val,
                sent_at=now,
                created_at=now,
            )
            self.db.add(comm)
            await self.db.flush()
            new_id = comm.id

        self.db.add(CommunicationCenterActivity(
            communication_id=source_id,
            source_module=source_module,
            patient_id=getattr(source, "patient_id", None),
            lead_id=getattr(source, "lead_id", None),
            hospital_id=getattr(source, "hospital_id", None),
            action="RESEND",
            channel=channel,
            details=f"Resent to {phone}. New record: {new_id}",
            created_by=user_id,
            created_at=now,
        ))
        await self.db.commit()

        deep_link = None
        if channel != "EMAIL":
            from app.utils.whatsapp import whatsapp_provider
            deep_link = whatsapp_provider.generate_deep_link(phone, rendered)["wa_link"]
        return {
            "success": status_val == "SENT",
            "status": status_val,
            "channel": channel,
            "recipient": phone,
            "new_source_id": new_id,
            "rendered": rendered,
            "deep_link": deep_link,
        }

    # ---------------------------------------------------------------- download
    async def download(self, current_user, source_module, source_id, action="DOWNLOAD"):
        filepath = None
        patient_id = None
        lead_id = None
        hospital_id = None
        channel = None
        if source_module == DOC_SOURCE:
            cf = await self.db.get(ConsentForm, source_id)
            if not cf or cf.is_deleted:
                raise HTTPException(status_code=404, detail="Consent form not found")
            filepath = cf.pdf_path
            patient_id = cf.patient_id
            hospital_id = cf.hospital_id
            channel = "PRINTED_DOCUMENT"
        elif source_module in LOG_SOURCES:
            log = await self.db.get(CommunicationLog, source_id)
            if not log:
                raise HTTPException(status_code=404, detail="Communication not found")
            if log.attachment_url and os.path.exists(log.attachment_url):
                filepath = log.attachment_url
            patient_id = log.patient_id
            lead_id = None
            hospital_id = log.hospital_id
            channel = log.channel
        else:
            raise HTTPException(status_code=404, detail="No downloadable artifact for this communication")

        if not filepath or not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="Artifact file not found")

        filename = os.path.basename(filepath)
        ext = os.path.splitext(filename)[1].lower()
        media_type = "application/pdf" if ext == ".pdf" else "application/octet-stream"

        self.db.add(CommunicationCenterActivity(
            communication_id=source_id,
            source_module=source_module,
            patient_id=patient_id,
            lead_id=lead_id,
            hospital_id=hospital_id,
            action=action,
            channel=channel,
            details=f"{action.title()} {filename}",
            created_by=current_user.get("sub"),
        ))
        await self.db.commit()
        return FileResponse(
            filepath,
            media_type=media_type,
            filename=filename,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # ----------------------------------------------------------------- export
    async def export_communications(self, current_user, params: dict, fmt: str):
        hospital_ids = await self._resolve_hospital_scope(
            current_user, params.get("hospital_id"))
        sub = self._sub()
        conds = self._conditions(
            sub,
            hospital_ids=hospital_ids,
            search=params.get("search"),
            source_module=params.get("source_module"),
            channel=params.get("channel"),
            status=params.get("status"),
            communication_type=params.get("communication_type"),
            doctor_id=params.get("doctor_id"),
            date_from=params.get("date_from"),
            date_to=params.get("date_to"),
        )
        outer_cols = [sub.c[name] for name in COLUMN_NAMES]
        stmt = select(*outer_cols).select_from(sub).where(*conds) \
            .order_by(sub.c.created_at.desc())
        rows = (await self.db.execute(stmt)).all()
        items = [self._serialize(r) for r in rows]

        headers = ["Patient Name", "OP Number", "Hospital", "Communication Type",
                   "Source Module", "Subject", "Channel", "Status", "Sent By",
                   "Sent Date", "Delivered Date"]
        data = []
        for it in items:
            data.append([
                it["patient_name"] or it["lead_name"] or "",
                it["op_number"] or "",
                it["hospital_name"] or "",
                it["communication_type"] or "",
                it["source_module"],
                it["subject"] or "",
                it["channel"],
                it["status"],
                it["sent_by_name"] or "",
                it["sent_at"] or "",
                it["delivered_at"] or "",
            ])

        date_str = datetime.now(timezone.utc).strftime("%Y_%m_%d")
        label = f"Communication Center Export {date_str}"
        hid = current_user.get("hospital_id") or (hospital_ids[0] if hospital_ids else None)
        info = await _hospital_info(self.db, hid)

        self.db.add(CommunicationCenterActivity(
            communication_id="export",
            source_module="Communication Center",
            hospital_id=hid,
            action="EXPORT",
            channel=None,
            details=f"Exported {len(items)} communications as {fmt}",
            created_by=current_user.get("sub"),
        ))
        await self.db.commit()

        if fmt == "csv":
            return _stream_csv(data, headers, f"communications_{date_str}.csv")
        if fmt == "excel":
            filename = f"communications_{date_str}.xlsx"
            fd, tmp = tempfile.mkstemp(suffix=".xlsx", dir=EXPORT_DIR)
            os.close(fd)
            filepath = await asyncio.to_thread(_generate_excel, data, headers, filename, filepath=tmp)
            return FileResponse(filepath, filename=filename,
                                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                background=BackgroundTask(os.remove, filepath))
        if fmt == "pdf":
            filename = f"communications_{date_str}.pdf"
            fd, tmp = tempfile.mkstemp(suffix=".pdf", dir=EXPORT_DIR)
            os.close(fd)
            filepath = await _generate_pdf(label, headers, data, filename, info=info, filepath=tmp)
            return FileResponse(filepath, filename=filename, media_type="application/pdf",
                                background=BackgroundTask(os.remove, filepath))
        if fmt == "zip":
            filename = f"communications_{date_str}.zip"
            fd, tmp = tempfile.mkstemp(suffix=".zip", dir=EXPORT_DIR)
            os.close(fd)
            os.remove(tmp)
            with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zf:
                added = set()
                for it in items:
                    path = None
                    if it["source_module"] == DOC_SOURCE:
                        cf = await self.db.get(ConsentForm, it["source_id"])
                        path = cf.pdf_path if cf and not cf.is_deleted else None
                    elif it["attachment_url"] and os.path.exists(it["attachment_url"]):
                        path = it["attachment_url"]
                    if path and os.path.exists(path) and path not in added:
                        added.add(path)
                        zf.write(path, arcname=f"{it['source_module']}/{os.path.basename(path)}")
            return FileResponse(tmp, filename=filename, media_type="application/zip")

        raise HTTPException(status_code=400, detail=f"Unknown format: {fmt}")

    # -------------------------------------------------------------- activities
    async def list_activities(self, current_user, params: dict):
        hospital_ids = await self._resolve_hospital_scope(
            current_user, params.get("hospital_id"))
        page = int(params.get("page", 1))
        page_size = int(params.get("page_size", 20))
        conds = []
        if hospital_ids is not None:
            if len(hospital_ids) > 1:
                conds.append(or_(
                    CommunicationCenterActivity.hospital_id.in_(hospital_ids),
                    CommunicationCenterActivity.hospital_id.is_(None),
                ))
            else:
                conds.append(CommunicationCenterActivity.hospital_id.in_(hospital_ids))
        if params.get("action"):
            conds.append(CommunicationCenterActivity.action == params.get("action"))
        if params.get("source_module"):
            conds.append(CommunicationCenterActivity.source_module == params.get("source_module"))
        if params.get("communication_id"):
            conds.append(CommunicationCenterActivity.communication_id == params.get("communication_id"))
        if params.get("date_from"):
            conds.append(CommunicationCenterActivity.created_at >= params.get("date_from"))
        if params.get("date_to"):
            conds.append(CommunicationCenterActivity.created_at < params.get("date_to") + timedelta(days=1))

        total = (await self.db.execute(
            select(func.count()).select_from(CommunicationCenterActivity).where(*conds))).scalar() or 0
        stmt = select(CommunicationCenterActivity).where(*conds) \
            .order_by(CommunicationCenterActivity.created_at.desc()) \
            .limit(page_size).offset((page - 1) * page_size)
        rows = (await self.db.execute(stmt)).scalars().all()
        names = await self._user_names([a.created_by for a in rows])
        items = [{
            "id": a.id,
            "communication_id": a.communication_id,
            "source_module": a.source_module,
            "patient_id": a.patient_id,
            "lead_id": a.lead_id,
            "hospital_id": a.hospital_id,
            "action": a.action,
            "channel": a.channel,
            "details": a.details,
            "created_by": a.created_by,
            "created_by_name": names.get(a.created_by),
            "created_at": _iso(a.created_at),
        } for a in rows]
        pages = (total + page_size - 1) // page_size if total > 0 else 0
        return {"items": items, "total": total, "page": page, "size": page_size, "pages": pages}
