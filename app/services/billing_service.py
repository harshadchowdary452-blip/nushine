import logging, os
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.repositories.billing_repository import BillingRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.billing import Billing, PaymentStatus, DiscountType
from app.models.case import Case
from app.models.patient import Patient
from app.models.hospital import Hospital
from app.models.user import User
from app.models.treatment_plan import TreatmentPlan
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType
from app.config import settings

logger = logging.getLogger(__name__)


class BillingService:
    def __init__(self, db: AsyncSession):
        self.repo = BillingRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def _enrich(self, billing: Billing):
        if billing.case_id:
            case_result = await self.db.execute(select(Case).where(Case.id == billing.case_id))
            c = case_result.scalar_one_or_none()
            if c:
                billing.case_chief_complaint = c.chief_complaint
                p_result = await self.db.execute(select(Patient).where(Patient.id == c.patient_id))
                p = p_result.scalar_one_or_none()
                if p:
                    billing.patient_name = p.full_name
        return billing

    async def _generate_invoice_pdf(self, billing: Billing) -> str:
        from fpdf import FPDF

        pdf_dir = os.path.join(settings.UPLOAD_DIR, "invoices")
        os.makedirs(pdf_dir, exist_ok=True)
        pdf_path = os.path.join(pdf_dir, f"invoice_{billing.id}.pdf")

        case = None
        patient = None
        doctor = None
        hospital = None
        treatments = []

        if billing.case_id:
            cr = await self.db.execute(select(Case).where(Case.id == billing.case_id))
            case = cr.scalar_one_or_none()
            if case:
                pr = await self.db.execute(select(Patient).where(Patient.id == case.patient_id))
                patient = pr.scalar_one_or_none()
                if case.doctor_id:
                    dr = await self.db.execute(select(User).where(User.id == case.doctor_id))
                    doctor = dr.scalar_one_or_none()
                if patient and patient.hospital_id:
                    hr = await self.db.execute(select(Hospital).where(Hospital.id == patient.hospital_id))
                    hospital = hr.scalar_one_or_none()
                tpr = await self.db.execute(
                    select(TreatmentPlan).where(TreatmentPlan.case_id == case.id)
                )
                treatments = tpr.scalars().all()

        pdf = FPDF(orientation="P", unit="mm", format="A4")
        pdf.add_page()
        pdf.set_auto_page_break(auto=True, margin=20)

        ml = 15
        pw = pdf.w - ml * 2
        primary = (41, 65, 132)
        accent = (0, 120, 180)
        dark = (50, 50, 50)
        muted = (130, 130, 130)
        light_bg = (245, 247, 250)

        def section_header(title):
            pdf.set_fill_color(*primary)
            pdf.set_text_color(255, 255, 255)
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(pw, 7, f"  {title}", fill=True, align="L")
            pdf.ln(8)

        def keyval(label, value, bold_label=True):
            pdf.set_font("Helvetica", "B" if bold_label else "", 9)
            pdf.set_text_color(*dark)
            pdf.cell(30, 5, label)
            pdf.set_font("Helvetica", "", 9)
            pdf.cell(55, 5, str(value or "-"))
            pdf.ln(5)

        # ---- HEADER: Logo + Hospital Info (split layout) ----
        logo_y = pdf.get_y()
        if hospital and hospital.logo_url:
            logo_path = hospital.logo_url
            if os.path.exists(logo_path):
                try:
                    pdf.image(logo_path, x=ml, y=logo_y, w=30)
                except Exception:
                    pass

        right_x = ml + 90
        pdf.set_xy(right_x, logo_y)
        pdf.set_font("Helvetica", "B", 16)
        pdf.set_text_color(*primary)
        pdf.cell(pw - 90, 8, hospital.name if hospital else "Hospital", align="R")
        pdf.set_xy(right_x, pdf.get_y() + 8)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*muted)
        if hospital:
            lines = []
            if hospital.address:
                lines.append(hospital.address)
            contact_parts = []
            if hospital.phone:
                contact_parts.append(f"Phone: {hospital.phone}")
            if hospital.email:
                contact_parts.append(f"Email: {hospital.email}")
            if contact_parts:
                lines.append(" | ".join(contact_parts))
            if hospital.registration_number:
                lines.append(f"Reg No: {hospital.registration_number}")
            if hospital.gst_number:
                lines.append(f"GST: {hospital.gst_number}")
            for idx, line in enumerate(lines):
                pdf.set_xy(right_x, pdf.get_y() - 1)
                pdf.multi_cell(pw - 90, 4, line, align="R")
                pdf.set_xy(right_x, pdf.get_y())
        pdf.ln(6)

        if pdf.get_y() < logo_y + 35:
            pdf.set_y(logo_y + 35)

        # ---- Thin accent divider ----
        pdf.set_draw_color(*accent)
        pdf.set_line_width(0.8)
        pdf.line(ml, pdf.get_y(), ml + pw, pdf.get_y())
        pdf.ln(5)

        # ---- INVOICE TITLE + META ----
        pdf.set_font("Helvetica", "B", 18)
        pdf.set_text_color(*primary)
        pdf.cell(pw * 0.5, 9, "TAX INVOICE")
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*dark)
        inv_number = billing.invoice_number or str(billing.id)[:8].upper()
        pdf.cell(pw * 0.5, 9, f"Invoice #: {inv_number}", align="R")
        pdf.ln(6)
        try:
            inv_date_str = billing.created_at.strftime('%d-%m-%Y')
        except Exception:
            inv_date_str = datetime.now(timezone.utc).strftime('%d-%m-%Y')
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*muted)
        pdf.cell(pw * 0.5, 5, "")
        pdf.cell(pw * 0.5, 5, f"Date: {inv_date_str}", align="R")
        pdf.ln(8)

        # ---- PATIENT DETAILS ----
        section_header("PATIENT DETAILS")
        y0 = pdf.get_y()
        if patient:
            keyval("Patient ID", patient.id[:8])
            keyval("Name", patient.full_name)
            keyval("Phone", patient.phone, bold_label=False)
            keyval("Email", patient.email, bold_label=False)
        else:
            keyval("Patient ID", "-")
            keyval("Name", "-")
        y1 = pdf.get_y()
        pdf.set_xy(ml + 95, y0)
        if patient:
            keyval("Gender", patient.gender or "-")
            keyval("Age", str(patient.age) if patient.age else "-")
            keyval("Address", (patient.address or "-")[:80], bold_label=False)
        else:
            keyval("Gender", "-")
            keyval("Age", "-")
        pdf.set_y(max(y1, pdf.get_y()) + 2)
        if doctor:
            keyval("Doctor", doctor.full_name)
        if case:
            keyval("Case No", str(case.id)[:8])
        if treatments:
            keyval("Treatment", (treatments[0].treatment_name or "-")[:60])
        pdf.ln(3)

        # ---- TREATMENT DETAILS ----
        if treatments:
            section_header("TREATMENT DETAILS")
            y0 = pdf.get_y()
            tp = treatments[0]
            keyval("Name", tp.treatment_name)
            keyval("Total Sittings", str(tp.total_sittings))
            keyval("Completed", str(tp.completed_sittings))
            y1 = pdf.get_y()
            pdf.set_xy(ml + 95, y0)
            keyval("Remaining", str(tp.remaining_sittings))
            status_val = str(tp.status.value if hasattr(tp.status, 'value') else (tp.status or "-"))
            keyval("Status", status_val)
            keyval("Start Date", tp.start_date.strftime('%d-%m-%Y') if tp.start_date else "-")
            pdf.set_y(max(y1, pdf.get_y()) + 3)

        # ---- BILLING DETAILS TABLE ----
        section_header("BILLING DETAILS")

        def table_header():
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_fill_color(230, 240, 250)
            pdf.set_text_color(*dark)
            pdf.cell(100, 8, "  Description", border=1, fill=True, align="L")
            pdf.cell(30, 8, "Amount (Rs.)", border=1, fill=True, align="C")
            pdf.ln()

        def table_row(label, amount, color=None, bold=False):
            pdf.set_font("Helvetica", "B" if bold else "", 9)
            if color:
                pdf.set_text_color(*color)
            else:
                pdf.set_text_color(*dark)
            pdf.cell(100, 7, f"  {label}", border=1, align="L")
            pdf.cell(30, 7, f"{amount:>9,.2f}" if amount != 0 else "     0.00", border=1, align="R")
            pdf.ln()

        table_header()

        orig_amt = float(billing.original_amount or 0)
        if orig_amt > 0 and orig_amt != float(billing.total_amount or 0):
            table_row("Original Amount", orig_amt)

        discount_amt = float(billing.discount_amount or 0)
        if discount_amt > 0:
            dt_label = "Percentage" if billing.discount_type == "PERCENTAGE" else "Fixed"
            dv = float(billing.discount_percent or 0)
            label = f"Discount ({dt_label}: {dv:.0f}%)" if billing.discount_type == "PERCENTAGE" else f"Discount ({dt_label})"
            table_row(label, -discount_amt, color=(40, 140, 40))

        table_row("Final Amount", float(billing.total_amount or 0), bold=True, color=(0, 100, 180))
        table_row("Paid Amount", float(billing.paid_amount or 0))

        pending = float(billing.pending_amount or 0)
        table_row("Balance Amount", pending, color=(200, 50, 50) if pending > 0 else (40, 40, 40))

        pdf.ln(3)

        # ---- PAYMENT INFO ----
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*muted)
        ps = str(billing.payment_status) if billing.payment_status else "DRAFT"
        pdf.cell(0, 5, f"Payment Status: {ps}   |   Method: {billing.payment_method or '-'}")
        pdf.ln(6)
        if billing.notes:
            pdf.set_font("Helvetica", "I", 8)
            pdf.set_text_color(*muted)
            pdf.multi_cell(pw, 4, f"Notes: {billing.notes}")
            pdf.ln(2)

        pdf.set_text_color(*dark)
        pdf.ln(2)

        # ---- FOOTER DIVIDER ----
        pdf.set_draw_color(*accent)
        pdf.set_line_width(0.4)
        pdf.line(ml, pdf.get_y(), ml + pw, pdf.get_y())
        pdf.ln(4)

        h_name = hospital.name if hospital else "Hospital"
        today_str = datetime.now(timezone.utc).strftime('%d-%m-%Y')
        pdf.set_font("Helvetica", "", 7)
        pdf.set_text_color(*muted)
        pdf.cell(0, 4, f"Generated on {today_str} by {h_name}", align="C")
        pdf.ln(4)
        if hospital and (hospital.phone or hospital.email):
            contact = ""
            if hospital.phone:
                contact += f"Phone: {hospital.phone}"
            if hospital.email:
                contact += f"  |  Email: {hospital.email}" if contact else f"Email: {hospital.email}"
            pdf.cell(0, 4, contact, align="C")
        pdf.ln(4)
        pdf.cell(0, 4, "This is a computer-generated invoice and does not require a physical signature.", align="C")

        pdf.output(pdf_path)
        return pdf_path

    async def create(self, data: dict, user_id: str = None) -> Billing:
        try:
            case_id = data.get("case_id")
            if not case_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="case_id is required")

            case_result = await self.db.execute(select(Case).where(Case.id == case_id))
            case = case_result.scalar_one_or_none()
            if not case:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Case with id {case_id} not found")

            gross_amount = data.get("total_amount", 0)
            if gross_amount <= 0:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="total_amount must be greater than 0")

            data["original_amount"] = gross_amount

            discount_type = data.get("discount_type", DiscountType.PERCENTAGE.value)
            if discount_type == DiscountType.FIXED_AMOUNT.value:
                discount_amount = data.get("discount_amount", 0)
                discount_percent = round(discount_amount / gross_amount * 100, 2) if gross_amount > 0 else 0
                data["discount_percent"] = discount_percent
                data["discount_amount"] = discount_amount
            else:
                discount_percent = data.get("discount_percent", 0) or 0
                discount_amount = round(gross_amount * discount_percent / 100, 2) if discount_percent > 0 else 0
                data["discount_percent"] = discount_percent
                data["discount_amount"] = discount_amount

            if discount_amount > 0 and discount_amount < gross_amount:
                data["total_amount"] = round(gross_amount - discount_amount, 2)
            else:
                data["total_amount"] = gross_amount

            paid_amount = data.get("paid_amount", 0)
            total_after_discount = data["total_amount"]
            pending_amount = total_after_discount - paid_amount
            if pending_amount <= 0:
                data["payment_status"] = PaymentStatus.PAID.value
                data["paid_at"] = datetime.now(timezone.utc)
            elif paid_amount > 0:
                data["payment_status"] = PaymentStatus.PARTIAL.value
            else:
                data["payment_status"] = PaymentStatus.DRAFT.value

            data["pending_amount"] = pending_amount

            billing = await self.repo.create(**data)
            await self.audit_log_repo.create(user_id=user_id, action="CREATE_BILLING", entity_type="BILLING", entity_id=str(billing.id), details="Billing created")
            await self._sync_treatment_plan_paid_amounts(billing.case_id)

            # Auto-generate PDF
            try:
                pdf_path = await self._generate_invoice_pdf(billing)
                billing = await self.repo.update(billing.id, pdf_path=pdf_path)
                logger.info("INVOICE_PDF generated for billing %s", billing.id)
            except Exception as e:
                logger.warning("INVOICE_PDF generation failed for billing %s: %s", billing.id, str(e))

            return billing
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("CREATE_BILLING - Unexpected error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create billing: {str(e)}")

    async def _attach_names(self, billing: Billing):
        if billing.case_id:
            case_result = await self.db.execute(select(Case).where(Case.id == billing.case_id))
            c = case_result.scalar_one_or_none()
            if c:
                billing.case_chief_complaint = c.chief_complaint
                p_result = await self.db.execute(select(Patient).where(Patient.id == c.patient_id))
                p = p_result.scalar_one_or_none()
                if p:
                    billing.patient_name = p.full_name
        return billing

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None) -> List[Billing]:
        billings = await self.repo.get_all(skip=skip, limit=limit, filters=filters)
        for b in billings:
            await self._attach_names(b)
        return billings

    async def get(self, billing_id: str) -> Optional[Billing]:
        billing = await self.repo.get(billing_id)
        if billing:
            await self._attach_names(billing)
        return billing

    async def get_by_case(self, case_id: str) -> List[Billing]:
        return await self.repo.get_all(filters={"case_id": case_id})

    async def update_payment(self, billing_id: str, paid_amount: float, payment_method: Optional[str] = None, notes: Optional[str] = None, user_id: str = None) -> Optional[Billing]:
        try:
            billing = await self.repo.get(billing_id)
            if not billing:
                return None
            was_paid_before = billing.payment_status == PaymentStatus.PAID
            billing.paid_amount += paid_amount
            billing.pending_amount = billing.total_amount - billing.paid_amount
            if billing.pending_amount <= 0:
                billing.payment_status = PaymentStatus.PAID
                billing.paid_at = datetime.now(timezone.utc)
            elif billing.paid_amount > 0:
                billing.payment_status = PaymentStatus.PARTIAL
            else:
                billing.payment_status = PaymentStatus.DRAFT
            if payment_method:
                billing.payment_method = payment_method
            from app.models.payment_transaction import PaymentTransaction
            txn_notes = notes or f"Payment of Rs. {paid_amount:.2f} received"
            txn = PaymentTransaction(
                billing_id=billing_id,
                amount=paid_amount,
                payment_method=payment_method,
                notes=txn_notes,
            )
            self.db.add(txn)
            await self.db.flush()
            await self.db.refresh(billing)
            await self.audit_log_repo.create(user_id=user_id, action="UPDATE_BILLING_PAYMENT", entity_type="BILLING", entity_id=billing_id, details=f"Payment of {paid_amount} received")
            if billing.payment_status == PaymentStatus.PAID and not was_paid_before:
                case_result = await self.db.execute(select(Case).where(Case.id == billing.case_id))
                case = case_result.scalar_one_or_none()
                if case and case.patient_id:
                    from app.services.patient_service import PatientService
                    patient_svc = PatientService(self.db)
                    await patient_svc.auto_update_patient_status(case.patient_id, user_id=user_id)
            try:
                pdf_path = await self._generate_invoice_pdf(billing)
                billing = await self.repo.update(billing.id, pdf_path=pdf_path)
            except Exception as e:
                logger.warning("INVOICE_PDF regeneration failed: %s", str(e))
            await self._sync_treatment_plan_paid_amounts(billing.case_id)
            return billing
        except Exception as e:
            logger.exception("UPDATE_BILLING_PAYMENT - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update payment: {str(e)}")

    async def apply_discount(self, billing_id: str, discount_type: str, discount_percent: float, discount_amount: float, discount_reason: Optional[str] = None) -> Optional[Billing]:
        billing = await self.repo.get(billing_id)
        if not billing:
            return None
        original_amount = billing.original_amount or billing.total_amount
        if discount_type == DiscountType.FIXED_AMOUNT.value:
            if discount_amount >= original_amount:
                raise HTTPException(status_code=400, detail="Discount amount cannot exceed original amount")
            calc_discount_amount = discount_amount
            calc_discount_percent = round(discount_amount / original_amount * 100, 2)
        else:
            if discount_percent > 100:
                raise HTTPException(status_code=400, detail="Discount percent cannot exceed 100")
            calc_discount_amount = round(original_amount * discount_percent / 100, 2)
            calc_discount_percent = discount_percent
        billing.discount_type = discount_type
        billing.discount_percent = calc_discount_percent
        billing.discount_amount = calc_discount_amount
        billing.discount_reason = discount_reason
        billing.original_amount = original_amount
        billing.total_amount = round(original_amount - calc_discount_amount, 2)
        billing.pending_amount = round(billing.total_amount - billing.paid_amount, 2)
        if billing.pending_amount <= 0 and billing.paid_amount > 0:
            billing.payment_status = PaymentStatus.PAID
        await self.db.flush()
        await self.db.refresh(billing)
        await self._attach_names(billing)
        await self._sync_treatment_plan_paid_amounts(billing.case_id)
        return billing

    async def _sync_treatment_plan_paid_amounts(self, case_id: str):
        try:
            tps = await self.db.execute(
                select(TreatmentPlan).where(TreatmentPlan.case_id == case_id)
            )
            treatment_plans = tps.scalars().all()
            if not treatment_plans:
                return
            billings = await self.repo.get_all(filters={"case_id": case_id})
            total_cost = sum(tp.cost or 0 for tp in treatment_plans)
            for tp in treatment_plans:
                tp_paid = 0
                direct_billings = [b for b in billings if b.treatment_plan_id == tp.id]
                for b in direct_billings:
                    tp_paid += b.paid_amount or 0
                if not direct_billings and total_cost > 0:
                    indirect_paid = sum(b.paid_amount or 0 for b in billings if not b.treatment_plan_id)
                    tp_paid += round(indirect_paid * (tp.cost or 0) / total_cost, 2)
                tp.paid_amount = tp_paid
            await self.db.flush()
        except Exception as e:
            logger.warning("Failed to sync treatment plan paid amounts: %s", e)

    async def get_revenue(self, hospital_id: str = None) -> Dict[str, Any]:
        filters = {}
        if hospital_id:
            patient_result = await self.db.execute(select(Patient.id).where(Patient.hospital_id == hospital_id))
            patient_ids = [row[0] for row in patient_result.all()]
            if patient_ids:
                case_result = await self.db.execute(select(Case.id).where(Case.patient_id.in_(patient_ids)))
                case_ids = [row[0] for row in case_result.all()]
                if case_ids:
                    filters["case_id__in"] = case_ids
                else:
                    return {"total_revenue": 0, "total_pending": 0, "total_billings": 0}
            else:
                return {"total_revenue": 0, "total_pending": 0, "total_billings": 0}
        billings = await self.repo.get_all(filters=filters or None)
        return {"total_revenue": sum(b.paid_amount for b in billings), "total_pending": sum(b.pending_amount for b in billings), "total_billings": len(billings)}

    async def get_payment_history(self, billing_id: str) -> list:
        from app.models.payment_transaction import PaymentTransaction
        r = await self.db.execute(
            select(PaymentTransaction).where(PaymentTransaction.billing_id == billing_id).order_by(PaymentTransaction.created_at.asc())
        )
        return r.scalars().all()

    async def get_pdf_path(self, billing_id: str) -> tuple:
        billing = await self.repo.get(billing_id)
        if not billing:
            return None, "Billing not found"
        if billing.pdf_path and os.path.exists(billing.pdf_path):
            return billing.pdf_path, None
        await self._enrich(billing)
        try:
            pdf_path = await self._generate_invoice_pdf(billing)
            try:
                await self.repo.update(billing.id, pdf_path=pdf_path)
            except Exception as db_err:
                logger.warning("PDF path DB update failed: %s", db_err)
            return pdf_path, None
        except Exception as e:
            logger.exception("Failed to generate PDF for billing %s", billing_id)
            return None, str(e)

    async def delete(self, billing_id: str, user_id: str = None) -> bool:
        try:
            result = await self.repo.delete(billing_id)
            if result:
                await self.audit_log_repo.create(user_id=user_id, action="DELETE_BILLING", entity_type="BILLING", entity_id=billing_id, details="Billing deleted")
            return result
        except Exception as e:
            logger.exception("DELETE_BILLING - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to delete billing: {str(e)}")

    async def regenerate_pdf(self, billing_id: str) -> tuple:
        billing = await self.repo.get(billing_id)
        if not billing:
            return None, "Billing not found"
        await self._enrich(billing)
        try:
            pdf_path = await self._generate_invoice_pdf(billing)
            try:
                await self.repo.update(billing.id, pdf_path=pdf_path)
            except Exception as db_err:
                logger.warning("PDF path DB update failed: %s", db_err)
            return pdf_path, None
        except Exception as e:
            logger.exception("Failed to regenerate PDF for billing %s", billing_id)
            return None, str(e)
