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
        appointment = None

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
                if treatments:
                    apr = await self.db.execute(
                        select(Appointment).where(
                            Appointment.treatment_plan_id == treatments[0].id,
                            Appointment.status != AppointmentStatus.CANCELLED
                        ).order_by(Appointment.appointment_date.asc()).limit(1)
                    )
                    appointment = apr.scalar_one_or_none()

        pdf = FPDF()
        pdf.add_page()
        pdf.set_auto_page_break(auto=True, margin=18)

        page_w = pdf.w - 20
        margin_left = 10

        # ---------- HEADER ----------
        pdf.set_font("Helvetica", "B", 18)
        pdf.set_text_color(30, 30, 30)
        header_name = hospital.name if hospital else "Hospital"
        pdf.cell(0, 10, header_name, align="L")
        if hospital and hospital.registration_number:
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(100, 100, 100)
            pdf.cell(0, 5, f"Reg No: {hospital.registration_number}", align="R")
        pdf.ln(7)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(90, 90, 90)
        if hospital:
            if hospital.address:
                pdf.cell(0, 5, hospital.address, align="L")
                pdf.ln(5)
            phone_email = ""
            if hospital.phone:
                phone_email += f"Phone: {hospital.phone}"
            if hospital.email:
                phone_email += f"  |  Email: {hospital.email}" if phone_email else f"Email: {hospital.email}"
            if phone_email:
                pdf.cell(0, 5, phone_email, align="L")
                pdf.ln(5)
            if hospital.gst_number:
                pdf.cell(0, 5, f"GST: {hospital.gst_number}", align="L")
                pdf.ln(5)
        pdf.ln(3)

        # Separator line
        pdf.set_draw_color(0, 120, 180)
        pdf.set_line_width(0.6)
        pdf.line(margin_left, pdf.get_y(), margin_left + page_w, pdf.get_y())
        pdf.ln(5)

        # Invoice title + number
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(0, 120, 180)
        inv_number = billing.invoice_number or str(billing.id)[:8].upper()
        pdf.cell(95, 8, "TAX INVOICE", align="L")
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(60, 60, 60)
        pdf.cell(95, 8, f"Invoice #: {inv_number}", align="R")
        pdf.ln(7)
        try:
            inv_date_str = billing.created_at.strftime('%d-%m-%Y')
        except Exception:
            inv_date_str = datetime.now(timezone.utc).strftime('%d-%m-%Y')
        pdf.cell(95, 8, "", align="L")
        pdf.cell(95, 8, f"Date: {inv_date_str}", align="R")
        pdf.ln(10)

        # ---------- PATIENT DETAILS ----------
        pdf.set_fill_color(0, 120, 180)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 7, "  PATIENT DETAILS", fill=True, align="L")
        pdf.ln(7)
        pdf.set_text_color(40, 40, 40)
        pdf.set_font("Helvetica", "", 9)
        if patient:
            fields = [
                ("Patient ID", str(patient.id)[:8] if patient.id else "-"),
                ("Name", patient.full_name or "-"),
                ("Phone", patient.phone or "-"),
                ("Email", patient.email or "-"),
                ("Gender", patient.gender or "-"),
                ("Age", str(patient.age) if patient.age else "-"),
                ("Address", (patient.address or "-")[:80]),
            ]
        else:
            fields = [("Patient ID", "-"), ("Name", "-")]
        for i, (label, val) in enumerate(fields):
            col = margin_left + (95 if i % 2 == 1 else 0)
            pdf.set_xy(col, pdf.get_y())
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(30, 5, label, align="L")
            pdf.set_font("Helvetica", "", 9)
            pdf.cell(65, 5, val, align="L")
            if i % 2 == 1:
                pdf.ln(5)
        if len(fields) % 2 == 1:
            pdf.ln(5)
        pdf.ln(2)
        if doctor:
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(30, 5, "Doctor:", align="L")
            pdf.set_font("Helvetica", "", 9)
            pdf.cell(65, 5, doctor.full_name or "-", align="L")
            pdf.ln(5)
        if case:
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(30, 5, "Case No:", align="L")
            pdf.set_font("Helvetica", "", 9)
            pdf.cell(65, 5, str(case.id)[:8], align="L")
            pdf.ln(5)
        if treatments:
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(30, 5, "Treatment:", align="L")
            pdf.set_font("Helvetica", "", 9)
            pdf.cell(65, 5, (treatments[0].treatment_name or "-")[:60], align="L")
            pdf.ln(5)
        pdf.ln(3)

        # ---------- TREATMENT DETAILS ----------
        if treatments:
            pdf.set_fill_color(0, 120, 180)
            pdf.set_text_color(255, 255, 255)
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(0, 7, "  TREATMENT DETAILS", fill=True, align="L")
            pdf.ln(7)
            pdf.set_text_color(40, 40, 40)
            pdf.set_font("Helvetica", "", 9)
            tp = treatments[0]
            t_fields = [
                ("Name", tp.treatment_name or "-"),
                ("Category", tp.category or "-"),
                ("Total Sittings", str(tp.total_sittings or "-")),
                ("Remaining", str(tp.remaining_sittings or "-")),
                ("Status", str(tp.status.value if hasattr(tp.status, 'value') else (tp.status or "-"))),
                ("Start Date", tp.start_date.strftime('%d-%m-%Y') if tp.start_date else "-"),
            ]
            for i, (label, val) in enumerate(t_fields):
                col = margin_left + (95 if i % 2 == 1 else 0)
                pdf.set_xy(col, pdf.get_y())
                pdf.set_font("Helvetica", "B", 9)
                pdf.cell(30, 5, label, align="L")
                pdf.set_font("Helvetica", "", 9)
                pdf.cell(65, 5, val, align="L")
                if i % 2 == 1:
                    pdf.ln(5)
            if len(t_fields) % 2 == 1:
                pdf.ln(5)
            if appointment:
                pdf.set_font("Helvetica", "B", 9)
                pdf.cell(30, 5, "Next Appt:", align="L")
                pdf.set_font("Helvetica", "", 9)
                apt_str = f"{appointment.appointment_date.strftime('%d-%m-%Y')} at {appointment.appointment_time or '-'}"
                pdf.cell(65, 5, apt_str, align="L")
                pdf.ln(5)
            pdf.ln(3)

        # ---------- BILLING DETAILS ----------
        pdf.set_fill_color(0, 120, 180)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 7, "  BILLING DETAILS", fill=True, align="L")
        pdf.ln(8)

        # Table header
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(230, 240, 250)
        pdf.set_text_color(40, 40, 40)
        pdf.cell(90, 7, "  Description", border=1, fill=True, align="L")
        pdf.cell(40, 7, "Amount (Rs.)", border=1, fill=True, align="C")
        pdf.ln()

        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(40, 40, 40)

        def add_row(label, amount, color=None):
            if color:
                pdf.set_text_color(*color)
            pdf.cell(90, 7, f"  {label}", border=1, align="L")
            pdf.cell(40, 7, f"{amount:,.2f}", border=1, align="R")
            pdf.ln()
            if color:
                pdf.set_text_color(40, 40, 40)

        orig_amt = float(billing.original_amount or 0)
        if orig_amt > 0 and orig_amt != float(billing.total_amount or 0):
            add_row("Original Amount", orig_amt)
        discount_amt = float(billing.discount_amount or 0)
        if discount_amt > 0:
            dt_label = "Percentage" if billing.discount_type == "PERCENTAGE" else "Fixed"
            dv = float(billing.discount_percent or 0)
            if billing.discount_type == "PERCENTAGE":
                add_row(f"Discount ({dt_label}: {dv:.0f}%)", -discount_amt, (40, 140, 40))
            else:
                add_row(f"Discount ({dt_label})", -discount_amt, (40, 140, 40))
        add_row("Final Amount", float(billing.total_amount or 0), (0, 100, 180))
        add_row("Paid Amount", float(billing.paid_amount or 0))
        pending = float(billing.pending_amount or 0)
        add_row("Balance Amount", pending, (200, 50, 50) if pending > 0 else (40, 40, 40))
        pdf.ln(3)

        # Payment info line
        pdf.set_font("Helvetica", "", 9)
        ps = str(billing.payment_status) if billing.payment_status else "DRAFT"
        pdf.cell(0, 5, f"Payment Status: {ps}   |   Method: {billing.payment_method or '-'}", align="L")
        pdf.ln(5)
        if billing.notes:
            pdf.set_font("Helvetica", "I", 8)
            pdf.set_text_color(100, 100, 100)
            pdf.multi_cell(0, 4, f"Notes: {billing.notes}", align="L")
            pdf.ln(2)

        pdf.set_text_color(40, 40, 40)
        pdf.ln(3)

        # ---------- FOOTER ----------
        pdf.set_draw_color(0, 120, 180)
        pdf.set_line_width(0.4)
        pdf.line(margin_left, pdf.get_y(), margin_left + page_w, pdf.get_y())
        pdf.ln(4)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(120, 120, 120)
        gen_by = "System"
        h_name = hospital.name if hospital else "Hospital"
        today_str = datetime.now(timezone.utc).strftime('%d-%m-%Y')
        pdf.cell(0, 4, f"Generated by: {gen_by}  |  {h_name}  |  {today_str}", align="C")
        pdf.ln(4)
        if hospital and (hospital.phone or hospital.email):
            contact = ""
            if hospital.phone:
                contact += f"Phone: {hospital.phone}"
            if hospital.email:
                contact += f"  |  Email: {hospital.email}" if contact else f"Email: {hospital.email}"
            pdf.cell(0, 4, contact, align="C")

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
        return billing

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
