import logging, os
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.repositories.billing_repository import BillingRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.billing import Billing, PaymentStatus
from app.models.case import Case
from app.models.patient import Patient
from app.models.hospital import Hospital
from app.models.user import User
from app.models.treatment_plan import TreatmentPlan
from app.models.payment_transaction import PaymentTransaction
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

        # Fetch related data
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

        pdf = FPDF()
        pdf.add_page()
        pdf.set_auto_page_break(auto=True, margin=15)

        # Branding
        pdf.set_font("Helvetica", "B", 20)
        pdf.set_text_color(0, 120, 180)
        pdf.cell(0, 12, "NuShine Dental", align="L")
        pdf.ln(4)
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, 6, "Modern Dental Practice Management Platform", align="L")
        pdf.ln(10)

        # Line
        pdf.set_draw_color(0, 120, 180)
        pdf.set_line_width(0.5)
        pdf.line(10, pdf.get_y(), 200, pdf.get_y())
        pdf.ln(6)

        # Invoice header
        pdf.set_font("Helvetica", "B", 16)
        pdf.set_text_color(40, 40, 40)
        pdf.cell(0, 10, f"Invoice #{str(billing.id)[:8].upper()}", align="R")
        pdf.ln(8)
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(80, 80, 80)
        try:
            inv_date = billing.created_at.strftime('%d %B %Y')
        except Exception:
            inv_date = datetime.now(timezone.utc).strftime('%d %B %Y')
        pdf.cell(0, 6, f"Invoice Date: {inv_date}", align="R")
        pdf.ln(6)
        pdf_status = str(billing.payment_status) if billing.payment_status else "PENDING"
        pdf.cell(0, 6, f"Payment Status: {pdf_status}", align="R")
        pdf.ln(12)

        # Hospital information
        if hospital:
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(0, 120, 180)
            pdf.cell(0, 8, "Hospital Information", align="L")
            pdf.ln(7)
            pdf.set_font("Helvetica", "", 10)
            pdf.set_text_color(40, 40, 40)
            pdf.cell(0, 6, str(hospital.name or ""), align="L")
            pdf.ln(6)
            if hospital.address:
                pdf.cell(0, 6, f"Address: {hospital.address}", align="L")
                pdf.ln(6)
            if hospital.phone:
                pdf.cell(0, 6, f"Phone: {hospital.phone}", align="L")
                pdf.ln(6)
            if hospital.email:
                pdf.cell(0, 6, f"Email: {hospital.email}", align="L")
                pdf.ln(6)
            pdf.ln(4)

        # Patient and Doctor info
        if patient or doctor:
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(0, 120, 180)
            pdf.cell(0, 8, "Patient & Doctor Information", align="L")
            pdf.ln(7)
            pdf.set_font("Helvetica", "", 10)
            pdf.set_text_color(40, 40, 40)
            if patient:
                pdf.cell(0, 6, f"Patient: {patient.full_name}", align="L")
                pdf.ln(6)
                if patient.phone:
                    pdf.cell(0, 6, f"Phone: {patient.phone}", align="L")
                    pdf.ln(6)
            if doctor:
                pdf.cell(0, 6, f"Doctor: {doctor.full_name}", align="L")
                pdf.ln(6)
                if doctor.specialization:
                    pdf.cell(0, 6, f"Specialization: {doctor.specialization}", align="L")
                    pdf.ln(6)
            pdf.ln(4)

        # Treatment information
        if treatments:
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(0, 120, 180)
            pdf.cell(0, 8, "Treatment Information", align="L")
            pdf.ln(7)
            pdf.set_font("Helvetica", "", 10)
            pdf.set_text_color(40, 40, 40)
            for tp in treatments:
                tname = str(tp.treatment_name) if tp.treatment_name else "Treatment"
                tcost = float(tp.cost) if tp.cost else 0
                pdf.cell(0, 6, f"- {tname} (Cost: Rs. {tcost:.2f})", align="L")
                pdf.ln(6)

        if case and case.chief_complaint:
            pdf.ln(2)
            pdf.cell(0, 6, f"Chief Complaint: {case.chief_complaint[:100]}", align="L")
            pdf.ln(6)
            if case.diagnosis:
                pdf.cell(0, 6, f"Diagnosis: {case.diagnosis[:100]}", align="L")
                pdf.ln(6)
        pdf.ln(6)

        # Billing Amount table
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(0, 120, 180)
        pdf.cell(0, 8, "Billing Details", align="L")
        pdf.ln(8)

        # Table header
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_fill_color(0, 120, 180)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(90, 8, "Description", border=1, fill=True, align="C")
        pdf.cell(40, 8, "Amount (Rs.)", border=1, fill=True, align="C")
        pdf.ln()

        # Table rows
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(40, 40, 40)

        def add_row(label, amount, bold=False):
            if bold:
                pdf.set_font("Helvetica", "B", 10)
            else:
                pdf.set_font("Helvetica", "", 10)
            pdf.cell(90, 8, label, border=1, align="L")
            pdf.cell(40, 8, f"{amount:.2f}", border=1, align="R")
            pdf.ln()

        add_row("Total Amount", float(billing.total_amount or 0))
        add_row("Paid Amount", float(billing.paid_amount or 0))

        pending = float(billing.pending_amount or 0)
        if pending > 0:
            pdf.set_text_color(200, 50, 50)
        else:
            pdf.set_text_color(40, 40, 40)
        add_row("Pending Amount", pending)

        # GST (future ready)
        pdf.ln(4)
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(120, 120, 120)
        pdf.cell(0, 6, "GST: (Will be applicable as per government regulations)", align="L")
        pdf.ln(6)

        # Total
        pdf.set_draw_color(0, 120, 180)
        pdf.line(10, pdf.get_y(), 200, pdf.get_y())
        pdf.ln(4)
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(0, 120, 180)
        pdf.cell(0, 10, f"Total: Rs. {float(billing.total_amount or 0):.2f}", align="R")
        pdf.ln(10)

        # Payment History
        if billing.payment_status:
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(40, 40, 40)
            pdf.cell(0, 6, f"Payment Status: {str(billing.payment_status)}", align="L")
            pdf.ln(6)
            if billing.payment_method:
                pdf.cell(0, 6, f"Payment Method: {billing.payment_method}", align="L")
                pdf.ln(6)
            pdf.ln(4)

        # Footer
        pdf.ln(10)
        pdf.set_draw_color(0, 120, 180)
        pdf.set_line_width(0.3)
        pdf.line(10, pdf.get_y(), 200, pdf.get_y())
        pdf.ln(4)
        pdf.set_font("Helvetica", "I", 8)
        pdf.set_text_color(150, 150, 150)
        pdf.cell(0, 4, "NuShine Dental - Thank you for your trust!", align="C")

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

            total_amount = data.get("total_amount", 0)
            if total_amount <= 0:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="total_amount must be greater than 0")

            paid_amount = data.get("paid_amount", 0)
            pending_amount = total_amount - paid_amount
            if pending_amount <= 0:
                data["payment_status"] = PaymentStatus.PAID.value
            elif paid_amount > 0:
                data["payment_status"] = PaymentStatus.PARTIAL.value
            else:
                data["payment_status"] = PaymentStatus.PENDING.value

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

    async def update_payment(self, billing_id: str, paid_amount: float, user_id: str = None) -> Optional[Billing]:
        try:
            billing = await self.repo.get(billing_id)
            if not billing:
                return None
            billing.paid_amount += paid_amount
            billing.pending_amount = billing.total_amount - billing.paid_amount
            if billing.pending_amount <= 0:
                billing.payment_status = PaymentStatus.PAID
            else:
                billing.payment_status = PaymentStatus.PARTIAL
            from app.models.payment_transaction import PaymentTransaction
            txn = PaymentTransaction(
                billing_id=billing_id,
                amount=paid_amount,
                notes=f"Payment of Rs. {paid_amount:.2f} received"
            )
            self.db.add(txn)
            await self.db.flush()
            await self.db.refresh(billing)
            await self.audit_log_repo.create(user_id=user_id, action="UPDATE_BILLING_PAYMENT", entity_type="BILLING", entity_id=billing_id, details=f"Payment of {paid_amount} received")
            if billing.payment_status == PaymentStatus.PAID:
                case_result = await self.db.execute(select(Case).where(Case.id == billing.case_id))
                case = case_result.scalar_one_or_none()
                if case and case.patient_id:
                    from app.services.patient_service import PatientService
                    patient_svc = PatientService(self.db)
                    await patient_svc.auto_update_patient_status(case.patient_id, user_id=user_id)
            # Regenerate PDF after payment update
            try:
                pdf_path = await self._generate_invoice_pdf(billing)
                billing = await self.repo.update(billing.id, pdf_path=pdf_path)
            except Exception as e:
                logger.warning("INVOICE_PDF regeneration failed: %s", str(e))
            return billing
        except Exception as e:
            logger.exception("UPDATE_BILLING_PAYMENT - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update payment: {str(e)}")

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
        """Returns (pdf_path, error_message)."""
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

    async def regenerate_pdf(self, billing_id: str) -> tuple:
        """Returns (pdf_path, error_message)."""
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
