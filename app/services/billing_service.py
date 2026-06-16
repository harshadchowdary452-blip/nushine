import json, logging, os
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.repositories.billing_repository import BillingRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.billing_history_repository import BillingHistoryRepository
from app.models.billing import Billing, PaymentStatus, DiscountType
from app.models.billing_history import BillingHistory
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
        self.history_repo = BillingHistoryRepository(db)
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

    async def _record_history(self, billing_id: str, action: str, previous_data: dict = None, new_data: dict = None, changes_summary: str = None, user_id: str = None):
        try:
            await self.history_repo.create(
                billing_id=billing_id,
                action=action,
                previous_data=json.dumps(previous_data) if previous_data else None,
                new_data=json.dumps(new_data) if new_data else None,
                changes_summary=changes_summary,
                performed_by=user_id,
            )
        except Exception as e:
            logger.warning("BILLING_HISTORY - Failed to record %s for billing %s: %s", action, billing_id, str(e))

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
        pdf.set_auto_page_break(auto=True, margin=25)

        ml = 15
        pw = pdf.w - ml * 2
        primary = (41, 65, 132)
        accent = (20, 100, 180)
        dark = (50, 50, 50)
        muted = (120, 120, 120)
        white = (255, 255, 255)
        light_gray = (245, 246, 250)
        border_gray = (220, 225, 235)
        green_c = (40, 160, 80)
        red_c = (200, 60, 60)
        blue_c = (0, 100, 200)

        def section_bar(title):
            pdf.set_fill_color(*primary)
            pdf.set_text_color(*white)
            pdf.set_font("Helvetica", "B", 10)
            x0 = pdf.get_x()
            pdf.cell(pw, 7, f"  {title}", fill=True, align="L")
            pdf.set_font("Helvetica", "", 9)
            pdf.ln(9)

        def info_row(label, value, w1=35, w2=55):
            if value is None or value == "":
                return
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(*muted)
            pdf.cell(w1, 5.5, label)
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(*dark)
            pdf.cell(w2, 5.5, str(value))
            pdf.ln(5.5)

        def table_header(cols, widths):
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_fill_color(235, 240, 250)
            pdf.set_text_color(*dark)
            for i, (col, w) in enumerate(zip(cols, widths)):
                align = "L" if i == 0 else "R"
                pdf.cell(w, 8, f"  {col}" if i == 0 else f"{col}  ", border=1, fill=True, align=align)
            pdf.ln()

        def table_row(cols, widths, bold=False, color=None):
            pdf.set_font("Helvetica", "B" if bold else "", 9)
            if color:
                pdf.set_text_color(*color)
            else:
                pdf.set_text_color(*dark)
            for i, (col, w) in enumerate(zip(cols, widths)):
                align = "L" if i == 0 else "R"
                txt = f"  {col}" if i == 0 else f"{col}  "
                pdf.cell(w, 7, txt, border=1, align=align)
            pdf.ln()

        # =============================================
        # HEADER: Logo left, Hospital name/address right
        # =============================================
        logo_h = 0
        logo_y_start = pdf.get_y()
        if hospital and hospital.logo_url:
            lpath = hospital.logo_url
            if os.path.exists(lpath):
                try:
                    pdf.image(lpath, x=ml, y=logo_y_start, w=28)
                    logo_h = 18
                except Exception:
                    pass

        rh_y = logo_y_start + 2
        rh_x = ml + 95
        if hospital:
            pdf.set_xy(rh_x, rh_y)
            pdf.set_font("Helvetica", "B", 15)
            pdf.set_text_color(*primary)
            pdf.cell(pw - 95, 7, hospital.name or "Hospital", align="R")
            pdf.set_xy(rh_x, pdf.get_y() + 6)
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(*muted)
            addr = hospital.address or ""
            pdf.multi_cell(pw - 95, 4, addr, align="R")
            contact_parts = []
            if hospital.phone:
                contact_parts.append(f"Tel: {hospital.phone}")
            if hospital.email:
                contact_parts.append(hospital.email)
            if contact_parts:
                pdf.set_x(rh_x)
                pdf.set_font("Helvetica", "", 7.5)
                pdf.multi_cell(pw - 95, 4, " | ".join(contact_parts), align="R")
            reg_lines = []
            if hospital.registration_number:
                reg_lines.append(f"Reg: {hospital.registration_number}")
            if hospital.gst_number:
                reg_lines.append(f"GST: {hospital.gst_number}")
            if reg_lines:
                pdf.set_x(rh_x)
                pdf.set_font("Helvetica", "", 7)
                pdf.multi_cell(pw - 95, 3.5, " | ".join(reg_lines), align="R")
        else:
            pdf.set_xy(rh_x, rh_y)
            pdf.set_font("Helvetica", "B", 15)
            pdf.set_text_color(*primary)
            pdf.cell(pw - 95, 7, "Hospital", align="R")

        header_bottom = max(pdf.get_y(), logo_y_start + max(logo_h, 22)) + 4

        # ---- Accent divider ----
        pdf.set_y(header_bottom)
        pdf.set_draw_color(*accent)
        pdf.set_line_width(0.6)
        pdf.line(ml, pdf.get_y(), ml + pw, pdf.get_y())
        pdf.ln(6)

        # =============================================
        # INVOICE TITLE
        # =============================================
        pdf.set_font("Helvetica", "B", 16)
        pdf.set_text_color(*primary)
        pdf.cell(pw * 0.5, 8, "TAX INVOICE")
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*dark)
        inv_no = billing.invoice_number or str(billing.id)[:8].upper()
        pdf.cell(pw * 0.5, 8, f"Invoice #: {inv_no}", align="R")
        pdf.ln(6)
        inv_date_str = billing.created_at.strftime('%d-%m-%Y') if billing.created_at else datetime.now(timezone.utc).strftime('%d-%m-%Y')
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*muted)
        pdf.cell(pw * 0.5, 5, "")
        pdf.cell(pw * 0.5, 5, f"Date: {inv_date_str}", align="R")
        pdf.ln(9)

        # =============================================
        # PATIENT DETAILS CARD
        # =============================================
        section_bar("PATIENT & CASE DETAILS")
        box_y0 = pdf.get_y()
        pdf.set_fill_color(*light_gray)
        pdf.set_draw_color(*border_gray)
        pdf.rect(ml, box_y0, pw, 32, style="D")

        def card_field(label, value, x, y, w1=22, w2=60):
            if value is None or value == "":
                return
            pdf.set_xy(x, y)
            pdf.set_font("Helvetica", "", 8.5)
            pdf.set_text_color(*muted)
            pdf.cell(w1, 5.5, label)
            pdf.set_font("Helvetica", "", 8.5)
            pdf.set_text_color(*dark)
            pdf.cell(w2, 5.5, str(value))

        row1 = box_y0 + 2.5
        row2 = row1 + 6.5
        row3 = row2 + 6.5
        col1_x = ml + 4
        col2_x = ml + 95
        w1 = 22
        w2 = 65

        if patient:
            card_field("Name:", patient.full_name, col1_x, row1, w1, w2)
            card_field("Age:", str(patient.age) if patient.age else "-", col2_x, row1, w1, w2 - 10)
            card_field("Phone:", patient.phone or "-", col1_x, row2, w1, w2)
            card_field("Gender:", patient.gender or "-", col2_x, row2, w1, w2 - 10)
            if doctor:
                card_field("Doctor:", doctor.full_name, col1_x, row3, w1, w2)
            if case:
                card_field("Case No:", str(case.id)[:8], col2_x, row3, w1, w2 - 10)
        else:
            card_field("Patient:", "-", col1_x, row1, w1, w2)
        pdf.set_y(max(pdf.get_y(), box_y0 + 32) + 3)

        # =============================================
        # TREATMENT DETAILS (if any)
        # =============================================
        if treatments:
            section_bar("TREATMENT DETAILS")
            tp = treatments[0]
            box_t0 = pdf.get_y()
            pdf.set_fill_color(*light_gray)
            pdf.set_draw_color(*border_gray)
            pdf.rect(ml, box_t0, pw, 20, style="D")
            tr1 = box_t0 + 2.5
            tr2 = tr1 + 6.5
            card_field("Treatment:", tp.treatment_name or "-", col1_x, tr1, 22, 60)
            card_field("Status:", str(tp.status.value if hasattr(tp.status, 'value') else (tp.status or "-")), col2_x, tr1, 22, 50)
            card_field("Sittings:", f"{tp.completed_sittings}/{tp.total_sittings}", col1_x, tr2, 22, 60)
            card_field("Remaining:", str(tp.remaining_sittings), col2_x, tr2, 22, 50)
            pdf.set_y(max(pdf.get_y(), box_t0 + 20) + 3)

        # =============================================
        # BILLING TABLE
        # =============================================
        section_bar("BILLING DETAILS")

        col_w = [pw - 55, 55]
        table_header(["Description", "Amount (Rs.)"], col_w)

        orig_amt = float(billing.original_amount or 0)
        total_amt = float(billing.total_amount or 0)
        discount_amt = float(billing.discount_amount or 0)
        paid_amt = float(billing.paid_amount or 0)
        pending_amt = float(billing.pending_amount or 0)

        if orig_amt > 0 and orig_amt != total_amt:
            table_row(["Original Amount", f"{orig_amt:>10,.2f}"], col_w)

        if discount_amt > 0:
            dt_label = "Percentage" if billing.discount_type == "PERCENTAGE" else "Fixed"
            dv = float(billing.discount_percent or 0)
            label = f"Discount ({dt_label}: {dv:.0f}%)" if billing.discount_type == "PERCENTAGE" else f"Discount ({dt_label})"
            table_row([label, f"- {discount_amt:>8,.2f}"], col_w, color=green_c)

        table_row(["Final Amount", f"{total_amt:>10,.2f}"], col_w, bold=True, color=blue_c)
        table_row(["Paid Amount", f"{paid_amt:>10,.2f}"], col_w)
        pending_color = red_c if pending_amt > 0 else dark
        table_row(["Balance Amount", f"{pending_amt:>10,.2f}"], col_w, color=pending_color, bold=(pending_amt > 0))

        pdf.ln(3)

        # =============================================
        # FINANCIAL SUMMARY CARD (right-aligned)
        # =============================================
        sum_x = ml + pw - 70
        sum_w = 70
        sum_y0 = pdf.get_y()
        pdf.set_fill_color(240, 245, 255)
        pdf.set_draw_color(*border_gray)
        pdf.rect(sum_x, sum_y0, sum_w, 30, style="DF")

        row_h = 5.5
        cy = sum_y0 + 2
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(*primary)
        pdf.set_xy(sum_x + 3, cy)
        pdf.cell(sum_w - 6, 6, "FINANCIAL SUMMARY")
        cy += 7

        def sum_row(label, value, col, bold=False):
            nonlocal cy
            pdf.set_font("Helvetica", "B" if bold else "", 8)
            pdf.set_text_color(*col)
            pdf.set_xy(sum_x + 3, cy)
            pdf.cell(sum_w * 0.45, row_h, label)
            pdf.cell(sum_w * 0.45, row_h, value, align="R")
            cy += row_h

        sum_row("Total:", f"Rs. {total_amt:,.2f}", primary, bold=True)
        sum_row("Paid:", f"Rs. {paid_amt:,.2f}", green_c)
        if discount_amt > 0:
            sum_row("Discount:", f"- Rs. {discount_amt:,.2f}", green_c)
        bal_label = "Balance:" if pending_amt > 0 else "Cleared:"
        bal_color = red_c if pending_amt > 0 else green_c
        sum_row(bal_label, f"Rs. {pending_amt:,.2f}", bal_color, bold=True)

        pdf.set_y(max(pdf.get_y(), sum_y0 + 30) + 3)

        # =============================================
        # PAYMENT INFO
        # =============================================
        ps = str(billing.payment_status) if billing.payment_status else "DRAFT"
        pm = billing.payment_method or "-"
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*muted)
        pdf.cell(0, 5, f"Payment Status: {ps}    |    Method: {pm}")
        pdf.ln(5)
        if billing.payment_method:
            pdf.cell(0, 5, f"Payment Method: {billing.payment_method}")
            pdf.ln(5)
        if billing.notes:
            pdf.set_font("Helvetica", "I", 8)
            pdf.set_text_color(*muted)
            pdf.multi_cell(pw, 4, f"Notes: {billing.notes}")
            pdf.ln(1)
        pdf.ln(3)

        # =============================================
        # FOOTER
        # =============================================
        pdf.set_draw_color(*accent)
        pdf.set_line_width(0.4)
        pdf.line(ml, pdf.get_y(), ml + pw, pdf.get_y())
        pdf.ln(5)
        h_name = hospital.name if hospital else "Hospital"
        today_str = datetime.now(timezone.utc).strftime('%d-%m-%Y')
        pdf.set_font("Helvetica", "", 7)
        pdf.set_text_color(*muted)
        pdf.cell(0, 4, f"Generated on {today_str} by {h_name}", align="C")
        pdf.ln(4)
        if hospital and (hospital.phone or hospital.email):
            cp = ""
            if hospital.phone:
                cp += f"Tel: {hospital.phone}"
            if hospital.email:
                cp += f"  |  Email: {hospital.email}"
            pdf.cell(0, 4, cp, align="C")
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
            new_vals = {k: getattr(billing, k) for k in ("total_amount", "paid_amount", "pending_amount", "discount_amount", "discount_percent", "payment_status") if hasattr(billing, k)}
            await self._record_history(billing.id, "CREATE_BILLING", new_data=new_vals, changes_summary=f"Billing created for Rs. {total_after_discount:.2f}", user_id=user_id)
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
            prev_paid = billing.paid_amount
            prev_pending = billing.pending_amount
            prev_status = billing.payment_status.value if billing.payment_status else None
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
            prev_data = {"paid_amount": prev_paid, "pending_amount": prev_pending, "payment_status": prev_status}
            new_vals = {"paid_amount": billing.paid_amount, "pending_amount": billing.pending_amount, "payment_status": billing.payment_status.value if billing.payment_status else None}
            status_changed = prev_status != (billing.payment_status.value if billing.payment_status else None)
            summary = f"Payment of Rs. {paid_amount:.2f} received"
            if status_changed:
                summary += f" | Status: {prev_status} → {billing.payment_status.value}"
            await self._record_history(billing_id, "PAYMENT_UPDATE", previous_data=prev_data, new_data=new_vals, changes_summary=summary, user_id=user_id)
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
        prev_data = {"discount_type": billing.discount_type, "discount_percent": billing.discount_percent, "discount_amount": billing.discount_amount, "total_amount": billing.total_amount}
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
        new_vals = {"discount_type": billing.discount_type, "discount_percent": billing.discount_percent, "discount_amount": billing.discount_amount, "total_amount": billing.total_amount}
        await self._record_history(billing.id, "DISCOUNT_APPLIED", previous_data=prev_data, new_data=new_vals, changes_summary=f"Discount applied: {calc_discount_percent}% / Rs.{calc_discount_amount:.2f}", user_id=None)
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
                await self._record_history(billing_id, "DELETE_BILLING", changes_summary="Billing deleted", user_id=user_id)
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
