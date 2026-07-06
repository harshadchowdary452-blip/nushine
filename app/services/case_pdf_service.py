import os
import io
import logging
from typing import Optional, List
from datetime import datetime, timezone
from fpdf import FPDF
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.config import settings
from app.models.case import Case, ClinicalFinding
from app.models.patient import Patient
from app.models.hospital import Hospital
from app.models.user import User
from app.models.pre_op import PreOp
from app.models.post_op import PostOp

logger = logging.getLogger(__name__)

PRIMARY = (41, 65, 132)
ACCENT = (20, 100, 180)
DARK = (31, 41, 55)
MUTED = (107, 114, 128)
LIGHT_MUTED = (156, 163, 175)
WHITE = (255, 255, 255)
BG_STRIP = (249, 250, 251)
BORDER_CLR = (209, 213, 219)
RED = (220, 38, 38)
RED_BG = (254, 242, 242)

ML = 25
PW = 160


def sanitize(text: Optional[str]) -> str:
    if not text:
        return ""
    result = (text
        .replace("\u2014", "--").replace("\u2013", "-")
        .replace("\u2018", "'").replace("\u2019", "'")
        .replace("\u201c", '"').replace("\u201d", '"')
        .replace("\u2026", "...").replace("\u20B9", "Rs.")
        .replace("\u2192", "->").replace("\u00A0", " ")
    )
    return result.encode("latin-1", "replace").decode("latin-1")


def s(val) -> str:
    """Convert optional value to string with fallback."""
    if val is None:
        return "—"
    return str(val)


class CasePDF(FPDF):
    def __init__(self, hospital: Optional[Hospital] = None):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.hospital = hospital
        self.page_count = 0

    def cell(self, w=None, h=None, text="", align="", border=0, fill=False, new_x="LMARGIN", new_y="NEXT", **kwargs):
        return super().cell(w=w, h=h, text=sanitize(text), align=align, border=border,
                            fill=fill, new_x=new_x, new_y=new_y, **kwargs)

    def multi_cell(self, w=None, h=None, text="", align="", border=0, fill=False, new_x="LMARGIN", new_y="NEXT",
                   max_line_height=None, **kwargs):
        return super().multi_cell(w=w, h=h, text=sanitize(text), align=align, border=border,
                                  fill=fill, new_x=new_x, new_y=new_y, max_line_height=max_line_height, **kwargs)

    def header(self):
        self.page_count += 1
        if self.page_no() == 1:
            self._render_first_page_header()
        else:
            self._render_subsequent_header()

    def footer(self):
        self.set_y(-22)
        self.set_draw_color(*BORDER_CLR)
        self.line(ML, self.get_y(), ML + PW, self.get_y())
        self.ln(2)
        hname = self.hospital.name if self.hospital else "Hospital"
        self.set_font("Helvetica", "", 7)
        self.set_text_color(*LIGHT_MUTED)
        self.cell(PW // 3, 3.5, f"Confidential Medical Record — {hname}", align="L")
        self.cell(PW // 3, 3.5, "This document contains confidential medical information.", align="C")
        self.cell(PW // 3, 3.5, f"Page {self.page_no()}/{{nb}}", align="R")

    def _render_first_page_header(self):
        ml = ML
        pw = PW
        y = self.get_y()

        logo_x = ml
        logo_y = y
        logo_w = 22
        logo_h = 0

        if self.hospital and self.hospital.logo_url:
            lpath = self.hospital.logo_url
            if os.path.exists(lpath):
                try:
                    self.image(lpath, x=logo_x, y=logo_y, w=logo_w)
                    logo_h = 10
                except Exception:
                    pass

        rh_x = ml + 90
        rh_y = logo_y + 1
        if self.hospital:
            self.set_xy(rh_x, rh_y)
            self.set_font("Helvetica", "B", 16)
            self.set_text_color(*PRIMARY)
            self.cell(pw - 80, 8, self.hospital.name or "Hospital", align="R")
            cy = self.get_y() + 6
            info_lines = []
            if self.hospital.address:
                info_lines.append(self.hospital.address)
            contact_parts = []
            if self.hospital.phone:
                contact_parts.append(f"Tel: {self.hospital.phone}")
            if self.hospital.email:
                contact_parts.append(self.hospital.email)
            if contact_parts:
                info_lines.append(" | ".join(contact_parts))
            reg_parts = []
            if self.hospital.registration_number:
                reg_parts.append(f"Reg: {self.hospital.registration_number}")
            if self.hospital.gst_number:
                reg_parts.append(f"GST: {self.hospital.gst_number}")
            if reg_parts:
                info_lines.append(" | ".join(reg_parts))
            for line in info_lines:
                self.set_xy(rh_x, cy)
                self.set_font("Helvetica", "", 7.5)
                self.set_text_color(*MUTED)
                self.multi_cell(pw - 80, 3.5, line, align="R")
                cy = self.get_y() + 0.8
        else:
            self.set_xy(rh_x, rh_y)
            self.set_font("Helvetica", "B", 16)
            self.set_text_color(*PRIMARY)
            self.cell(pw - 80, 8, "Hospital", align="R")

        hdr_end = max(self.get_y(), logo_y + max(logo_h, 12)) + 3
        self.set_y(hdr_end)
        self.set_draw_color(*PRIMARY)
        self.set_line_width(0.7)
        self.line(ml, self.get_y(), ml + pw, self.get_y())
        self.ln(5)

        self.set_font("Helvetica", "B", 13)
        self.set_text_color(*PRIMARY)
        self.cell(pw, 7, "DENTAL CASE HISTORY REPORT", align="C")
        self.ln(5)
        self.set_draw_color(*BORDER_CLR)
        self.set_line_width(0.3)
        self.line(ml, self.get_y(), ml + pw, self.get_y())
        self.ln(6)

    def _render_subsequent_header(self):
        self.set_draw_color(*PRIMARY)
        self.set_line_width(0.5)
        self.line(ML, self.get_y(), ML + PW, self.get_y())
        self.ln(3)
        hname = self.hospital.name if self.hospital else "Hospital"
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(*PRIMARY)
        self.cell(w=60, h=4, text=hname, align="L")
        self.cell(w=40, h=4, text="Dental Case History Report (continued)", align="C")
        self.cell(w=50, h=4, text="", align="R")
        self.ln(3)
        self.set_draw_color(*BORDER_CLR)
        self.line(ML, self.get_y(), ML + PW, self.get_y())
        self.ln(4)

    # ── Layout helpers ──

    def section_bar(self, title: str):
        self.set_fill_color(*PRIMARY)
        self.set_text_color(*WHITE)
        self.set_font("Helvetica", "B", 10)
        self.cell(PW, 7, f"  {title}", fill=True)
        self.ln(8.5)

    def body_text(self, text: str, indent: float = 0):
        if not text:
            return
        self.set_x(ML + indent)
        self.set_font("Helvetica", "", 8.5)
        self.set_text_color(*DARK)
        self.multi_cell(PW - indent, 4.8, text)

    def field_block(self, items: List[tuple], col1_w: int = 32, col2_w: int = 48):
        for label, value in items:
            if not value:
                continue
            self.set_font("Helvetica", "", 7.5)
            self.set_text_color(*MUTED)
            self.cell(col1_w, 5, label)
            self.set_font("Helvetica", "", 8)
            self.set_text_color(*DARK)
            self.cell(col2_w, 5, s(value))
            self.ln(5)

    def table_header(self, cols: List[str], widths: List[int]):
        self.set_font("Helvetica", "B", 8)
        self.set_fill_color(*PRIMARY)
        self.set_text_color(*WHITE)
        self.set_draw_color(*BORDER_CLR)
        for col, w in zip(cols, widths):
            self.cell(w, 6.5, f"  {col}", border=1, fill=True)
        self.ln()

    def table_row(self, cols: List[str], widths: List[int]):
        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(*DARK)
        self.set_draw_color(*BORDER_CLR)
        for i, (col, w) in enumerate(zip(cols, widths)):
            align = "L" if i == 0 else "C"
            txt = f"  {col}" if i == 0 else (col or "-")
            self.cell(w, 6, txt, border=1, align=align)
        self.ln()

    def highlight_box(self, title: str, body: str):
        y = self.get_y()
        self.set_fill_color(*RED_BG)
        self.set_draw_color(*RED)
        self.rect(ML, y, PW, 4, style="DF")
        self.set_xy(ML + 2, y + 0.2)
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(*RED)
        self.cell(PW - 4, 4, title)
        self.ln(6)
        self.set_x(ML + 3)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(153, 27, 27)
        self.multi_cell(PW - 6, 4.5, body)
        self.ln(2)


async def generate_case_pdf(case_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(Case).where(Case.id == case_id).options(
            selectinload(Case.patient).selectinload(Patient.hospital),
            selectinload(Case.doctor),
            selectinload(Case.created_by),
            selectinload(Case.updated_by),
            selectinload(Case.appointment),
            selectinload(Case.findings),
            selectinload(Case.treatment_plans),
        )
    )
    case = result.scalar_one_or_none()
    if not case:
        raise ValueError("Case not found")

    patient = case.patient
    doctor = case.doctor
    hospital = patient.hospital if patient else None
    findings = case.findings or []
    treatment_plans = case.treatment_plans or []

    pdf_dir = os.path.join(settings.UPLOAD_DIR, "case_reports")
    os.makedirs(pdf_dir, exist_ok=True)
    pdf_path = os.path.join(pdf_dir, f"case_{case_id}.pdf")

    pdf = CasePDF(hospital=hospital)
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=28)
    pdf.add_page()

    ml = ML
    pw = PW

    # ────────────────────────────────────────────────────
    # PATIENT INFORMATION
    # ────────────────────────────────────────────────────
    pdf.section_bar("PATIENT INFORMATION")

    box_y = pdf.get_y()
    pdf.set_draw_color(*BORDER_CLR)
    pdf.set_fill_color(*BG_STRIP)
    pdf.rect(ml, box_y, pw, 44, style="D")

    def info_pair(label, value, x, y, w1=30, w2=48):
        if not value:
            return
        pdf.set_xy(x, y)
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(*MUTED)
        pdf.cell(w1, 4.5, label)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*DARK)
        pdf.cell(w2, 4.5, s(value))

    r1 = box_y + 2.5
    r2 = r1 + 5.5
    r3 = r2 + 5.5
    r4 = r3 + 5.5
    r5 = r4 + 5.5
    r6 = r5 + 5.5
    r7 = r6 + 5.5
    c1 = ml + 3
    c2 = ml + 85
    lw = 28
    vw = 52

    pat = patient
    if pat:
        info_pair("Patient Name :", pat.full_name, c1, r1, lw, 54)
        info_pair("OP Number :", pat.op_no or "-", c2, r1, lw, 48)
        info_pair("Age :", str(pat.age) + " Years" if pat.age else "-", c1, r2, lw, vw)
        info_pair("Gender :", pat.gender or "-", c2, r2, lw, vw)
        info_pair("Date of Birth :", pat.date_of_birth.strftime("%d %b %Y") if pat.date_of_birth else "-", c1, r3, lw, 54)
        info_pair("ABHA ID :", pat.abha_id or "-", c2, r3, lw, vw)
        info_pair("Mobile :", pat.phone or "-", c1, r4, lw, vw)
        info_pair("Email :", pat.email or "-", c2, r4, lw, vw)
        addr = (pat.address or "-")[:64]
        info_pair("Address :", addr, c1, r5, lw, pw - 34)
        info_pair("Emergency Contact :", pat.emergency_contact or "-", c1, r6, lw, vw)
    else:
        info_pair("Patient Name :", "Not available", c1, r1, lw, vw)

    # Doctor & Visit on separator row
    doc_visit_y = box_y + 44.5
    pdf.set_draw_color(*BORDER_CLR)
    pdf.line(ml + 2, doc_visit_y, ml + pw - 2, doc_visit_y)
    doc_visit_y += 1.5

    doctor_name = f"Dr. {doctor.full_name}" if doctor else "Not assigned"
    if case.appointment and case.appointment.appointment_date:
        visit_str = case.appointment.appointment_date.strftime("%d %b %Y")
    else:
        visit_str = case.created_at.strftime("%d %b %Y") if case.created_at else "-"
    doc_info = f"Doctor :  {doctor_name}"
    if doctor and doctor.specialization:
        doc_info += f"  |  {doctor.specialization}"
    reg_no = case.doctor_registration_number or (doctor.license_number if doctor else None)
    if reg_no:
        doc_info += f"  |  Reg: {reg_no}"
    pdf.set_xy(c1, doc_visit_y)
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(*MUTED)
    pdf.cell(22, 4.5, "Doctor :")
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*DARK)
    pdf.cell(pw - 25, 4.5, doc_info)

    pdf.set_xy(c2, doc_visit_y + 5.5)
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(*MUTED)
    pdf.cell(28, 4.5, "Visit Date :")
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*DARK)
    pdf.cell(48, 4.5, visit_str)

    pdf.set_y(box_y + 54)

    # ────────────────────────────────────────────────────
    # CHIEF COMPLAINT
    # ────────────────────────────────────────────────────
    if case.chief_complaint:
        pdf.section_bar("Chief Complaint")
        cc_text = case.chief_complaint
        parts = []
        if case.chief_complaint_duration:
            parts.append(f"Duration: {case.chief_complaint_duration}")
        if case.chief_complaint_severity:
            parts.append(f"Severity: {case.chief_complaint_severity}")
        if case.chief_complaint_associated_symptoms:
            parts.append(f"Associated Symptoms: {case.chief_complaint_associated_symptoms}")
        if parts:
            cc_text += "\n" + " | ".join(parts)
        pdf.body_text(cc_text)
        pdf.ln(4)

    # ────────────────────────────────────────────────────
    # HISTORY OF PRESENT ILLNESS
    # ────────────────────────────────────────────────────
    if case.hpi:
        pdf.section_bar("History of Present Illness")
        pdf.body_text(case.hpi)
        pdf.ln(4)

    # ────────────────────────────────────────────────────
    # MEDICAL HISTORY
    # ────────────────────────────────────────────────────
    if case.medical_history:
        pdf.section_bar("Medical History")
        pdf.body_text(case.medical_history)
        pdf.ln(4)

    # ────────────────────────────────────────────────────
    # DENTAL HISTORY
    # ────────────────────────────────────────────────────
    if case.dental_history:
        pdf.section_bar("Dental History")
        pdf.body_text(case.dental_history)
        pdf.ln(4)

    # ────────────────────────────────────────────────────
    # CLINICAL FINDINGS
    # ────────────────────────────────────────────────────
    has_clinical = any([
        case.extra_oral_examination, case.intra_oral_examination,
        case.periodontal_examination, case.notes,
        findings, case.clinical_findings_summary,
    ])
    if has_clinical:
        pdf.section_bar("Clinical Findings")

        for label, content in [
            ("Extra Oral Examination", case.extra_oral_examination),
            ("Intra Oral Examination", case.intra_oral_examination),
            ("Periodontal Examination", case.periodontal_examination),
            ("Clinical Notes", case.notes),
        ]:
            if content:
                pdf.set_font("Helvetica", "B", 8.5)
                pdf.set_text_color(*PRIMARY)
                pdf.cell(pw, 4.5, label)
                pdf.ln(5.5)
                pdf.body_text(content)
                pdf.ln(2)

        if findings:
            pdf.ln(1)
            pdf.set_font("Helvetica", "B", 8.5)
            pdf.set_text_color(*PRIMARY)
            pdf.cell(pw, 4.5, "Tooth Chart")
            pdf.ln(5.5)
            # Render findings table
            col_w = [26, 40, 30, 30, 34]
            pdf.table_header(["Tooth", "Finding", "Surface", "Severity", "Remarks"], col_w)
            for f in findings:
                tooth = str(f.tooth_number) if f.tooth_number else "-"
                ftype = f.finding_type or "-"
                severity = f.severity or "-"
                notes = f.notes or ""
                # Surface: prefer dedicated column; fallback to old [S:...] encoding in notes
                surface = (f.surface or "").replace(",", ", ") if f.surface else ""
                remark = notes
                if not surface and notes.startswith("[S:"):
                    end = notes.find("]")
                    if end > 3:
                        surface = notes[3:end].replace(",", ", ")
                        remark = notes[end + 1:].strip()
                        if remark.startswith("[M:"):
                            mend = remark.find("]")
                            if mend > 3:
                                remark = remark[mend + 1:].strip()
                pdf.table_row([tooth, ftype, surface or "-", severity, remark or "-"], col_w)
            pdf.ln(3)

            pdf.set_font("Helvetica", "B", 8.5)
            pdf.set_text_color(*PRIMARY)
            pdf.cell(pw, 4.5, "Clinical Findings Summary")
            pdf.ln(5.5)
            col_w2 = [26, 40, 30, 30, 34]
            pdf.table_header(["Tooth", "Finding", "Surface", "Severity", "Remarks"], col_w2)
            for f in findings:
                tooth = str(f.tooth_number) if f.tooth_number else "-"
                ftype = f.finding_type or "-"
                severity = f.severity or "-"
                notes = f.notes or ""
                surface = (f.surface or "").replace(",", ", ") if f.surface else ""
                remark = notes
                if not surface and notes.startswith("[S:"):
                    end = notes.find("]")
                    if end > 3:
                        surface = notes[3:end].replace(",", ", ")
                        remark = notes[end + 1:].strip()
                        if remark.startswith("[M:"):
                            mend = remark.find("]")
                            if mend > 3:
                                remark = remark[mend + 1:].strip()
                pdf.table_row([tooth, ftype, surface or "-", severity, remark or "-"], col_w2)
            pdf.ln(3)

        if case.clinical_findings_summary:
            pdf.set_font("Helvetica", "B", 8.5)
            pdf.set_text_color(*PRIMARY)
            pdf.cell(pw, 4.5, "Summary Notes")
            pdf.ln(5.5)
            pdf.body_text(case.clinical_findings_summary)
            pdf.ln(2)

    # ────────────────────────────────────────────────────
    # INVESTIGATIONS
    # ────────────────────────────────────────────────────
    if case.investigations:
        pdf.section_bar("Investigations")
        pdf.body_text(case.investigations)
        pdf.ln(4)

    # ────────────────────────────────────────────────────
    # DIAGNOSIS
    # ────────────────────────────────────────────────────
    if case.provisional_diagnosis or case.final_diagnosis or case.diagnosis:
        pdf.section_bar("Diagnosis")
        if case.provisional_diagnosis:
            pdf.set_font("Helvetica", "B", 8.5)
            pdf.set_text_color(*PRIMARY)
            pdf.cell(pw, 4.5, "Provisional Diagnosis")
            pdf.ln(5.5)
            pdf.body_text(case.provisional_diagnosis)
            pdf.ln(2)
        if case.final_diagnosis:
            pdf.highlight_box("FINAL DIAGNOSIS", case.final_diagnosis)
        if case.diagnosis and not case.final_diagnosis:
            pdf.set_font("Helvetica", "B", 8.5)
            pdf.set_text_color(*PRIMARY)
            pdf.cell(pw, 4.5, "Diagnosis")
            pdf.ln(5.5)
            pdf.body_text(case.diagnosis)
            pdf.ln(2)

    # ────────────────────────────────────────────────────
    # TREATMENT PLAN
    # ────────────────────────────────────────────────────
    if case.initial_treatment_plan or treatment_plans:
        pdf.section_bar("Treatment Plan")
        if case.initial_treatment_plan:
            pdf.body_text(case.initial_treatment_plan)
            pdf.ln(2)

        plan_items = []
        if case.treatment_plan_estimated_visits:
            plan_items.append(f"Estimated Visits: {case.treatment_plan_estimated_visits}")
        if case.treatment_plan_estimated_cost:
            plan_items.append(f"Estimated Cost: Rs.{case.treatment_plan_estimated_cost:,.2f}")
        if plan_items:
            pdf.set_font("Helvetica", "", 8.5)
            pdf.set_text_color(*DARK)
            for item in plan_items:
                pdf.cell(pw, 5, item)
                pdf.ln(5)
            pdf.ln(1)

        if treatment_plans:
            tp_w = [38, 20, 22, 22, 24, 34]
            pdf.table_header(
                ["Procedure", "Visits", "Status", "Duration", "Est. Cost", "Remarks"],
                tp_w,
            )
            for tp in treatment_plans:
                dur = f"{tp.duration_minutes}m" if tp.duration_minutes else "-"
                cost = f"Rs.{tp.cost:,.0f}" if tp.cost else "-"
                pdf.table_row(
                    [
                        (tp.treatment_name or "-")[:32],
                        str(tp.total_sittings or "-"),
                        str(tp.status.value if hasattr(tp.status, 'value') else (tp.status or "-")),
                        dur,
                        cost,
                        "",
                    ],
                    tp_w,
                )
            pdf.ln(3)

    # ────────────────────────────────────────────────────
    # MEDICINES PRESCRIBED
    # ────────────────────────────────────────────────────
    if case.medicines_prescribed:
        pdf.section_bar("Medicines Prescribed")
        pdf.body_text(case.medicines_prescribed)
        pdf.ln(4)

    # ────────────────────────────────────────────────────
    # PATIENT INSTRUCTIONS
    # ────────────────────────────────────────────────────
    if case.patient_instructions:
        pdf.section_bar("Patient Instructions")
        pdf.body_text(case.patient_instructions)
        pdf.ln(4)

    # ────────────────────────────────────────────────────
    # FOLLOW-UP
    # ────────────────────────────────────────────────────
    if case.follow_up_instructions or case.next_review_date:
        pdf.section_bar("Follow-Up")
        if case.follow_up_instructions:
            pdf.body_text(case.follow_up_instructions)
            pdf.ln(1)
        if case.next_review_date:
            review_str = case.next_review_date.strftime("%d %b %Y") if hasattr(case.next_review_date, 'strftime') else str(case.next_review_date)
            pdf.set_font("Helvetica", "B", 8.5)
            pdf.set_text_color(*ACCENT)
            pdf.cell(pw, 5, f"Next Review Date: {review_str}")
            pdf.ln(5)

    # ────────────────────────────────────────────────────
    # PERSONAL HISTORY
    # ────────────────────────────────────────────────────
    if case.personal_history:
        pdf.section_bar("Personal History")
        pdf.body_text(case.personal_history)
        pdf.ln(4)

    # ────────────────────────────────────────────────────
    # FAMILY HISTORY
    # ────────────────────────────────────────────────────
    if case.family_history:
        pdf.section_bar("Family History")
        pdf.body_text(case.family_history)
        pdf.ln(4)

    # ────────────────────────────────────────────────────
    # DOCTOR DETAILS
    # ────────────────────────────────────────────────────
    pdf.section_bar("Doctor Details")

    doc_box_y = pdf.get_y()
    pdf.set_draw_color(*BORDER_CLR)
    pdf.set_fill_color(*BG_STRIP)
    pdf.rect(ml, doc_box_y, pw, 24, style="D")

    dr = doctor
    reg_no = case.doctor_registration_number or (dr.license_number if dr else None)
    doc_name = f"Dr. {(case.doctor_name or dr.full_name) if dr else 'Not assigned'}"
    doc_mobile = dr.phone if dr else None

    ry = doc_box_y + 2.5
    pdf.set_xy(ml + 3, ry)
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(*MUTED)
    pdf.cell(30, 4.5, "Doctor Name :")
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*DARK)
    pdf.cell(48, 4.5, doc_name)

    qual = dr.specialization if dr else None
    if qual:
        pdf.set_xy(ml + 85, ry)
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(*MUTED)
        pdf.cell(30, 4.5, "Qualification :")
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*DARK)
        pdf.cell(48, 4.5, qual)

    if reg_no:
        pdf.set_xy(ml + 3, ry + 5.5)
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(*MUTED)
        pdf.cell(30, 4.5, "Registration No :")
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*DARK)
        pdf.cell(48, 4.5, reg_no)

    hname = hospital.name if hospital else "Hospital"
    pdf.set_xy(ml + 85, ry + 5.5)
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(*MUTED)
    pdf.cell(30, 4.5, "Hospital :")
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*DARK)
    pdf.cell(48, 4.5, hname)

    if doc_mobile:
        pdf.set_xy(ml + 3, ry + 11)
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(*MUTED)
        pdf.cell(30, 4.5, "Mobile :")
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*DARK)
        pdf.cell(48, 4.5, doc_mobile)

    pdf.set_xy(ml + 85, ry + 11)
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(*MUTED)
    pdf.cell(30, 4.5, "Visit Date :")
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*DARK)
    pdf.cell(48, 4.5, visit_str)

    pdf.set_y(doc_box_y + 27)

    # ────────────────────────────────────────────────────
    # AUDIT INFO
    # ────────────────────────────────────────────────────
    pdf.section_bar("Audit Information")
    audit_box_y = pdf.get_y()
    pdf.set_draw_color(*BORDER_CLR)
    pdf.set_fill_color(*BG_STRIP)
    pdf.rect(ml, audit_box_y, pw, 18, style="D")
    audit_ry = audit_box_y + 2.5
    created_by_name = case.created_by.full_name if case.created_by else "—"
    updated_by_name = case.updated_by.full_name if case.updated_by else "—"
    created_at_str = case.created_at.strftime("%d %b %Y %I:%M %p") if case.created_at else "—"
    updated_at_str = case.updated_at.strftime("%d %b %Y %I:%M %p") if case.updated_at else "—"

    pdf.set_xy(ml + 3, audit_ry)
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(*MUTED)
    pdf.cell(30, 4.5, "Created By :")
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*DARK)
    pdf.cell(48, 4.5, created_by_name)

    pdf.set_xy(ml + 85, audit_ry)
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(*MUTED)
    pdf.cell(30, 4.5, "Updated By :")
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*DARK)
    pdf.cell(48, 4.5, updated_by_name)

    pdf.set_xy(ml + 3, audit_ry + 5.5)
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(*MUTED)
    pdf.cell(30, 4.5, "Created :")
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*DARK)
    pdf.cell(48, 4.5, created_at_str)

    pdf.set_xy(ml + 85, audit_ry + 5.5)
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(*MUTED)
    pdf.cell(30, 4.5, "Updated :")
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*DARK)
    pdf.cell(48, 4.5, updated_at_str)

    pdf.set_y(audit_box_y + 21)
    pdf.ln(4)

    # ────────────────────────────────────────────────────
    # SIGNATURE
    # ────────────────────────────────────────────────────
    pdf.section_bar("Signature")
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(pw, 4.5, "I acknowledge that I have been explained the diagnosis, treatment plan, risks, benefits, and alternatives. I consent to the proposed treatment.")
    pdf.ln(6)

    y1 = pdf.get_y()
    pdf.set_draw_color(*BORDER_CLR)
    col_w = 48
    gap = 8
    total_used = col_w * 3 + gap * 2
    start_x = ml + (pw - total_used) / 2

    for i, label in enumerate(["Patient Signature", "Doctor Signature", "Hospital Seal"]):
        x = start_x + i * (col_w + gap)
        pdf.line(x, y1, x + col_w, y1)
        pdf.set_xy(x, y1 + 1)
        pdf.set_font("Helvetica", "", 7)
        pdf.set_text_color(*MUTED)
        pdf.cell(col_w, 4, label, align="C")

    pdf.ln(10)

    y2 = pdf.get_y()
    for i, label in enumerate(["Date", "Witness", hname]):
        x = start_x + i * (col_w + gap)
        pdf.line(x, y2, x + col_w, y2)
        pdf.set_xy(x, y2 + 1)
        pdf.set_font("Helvetica", "", 7)
        pdf.set_text_color(*MUTED)
        pdf.cell(col_w, 4, label, align="C")

    pdf.ln(12)

    pdf.output(pdf_path)
    return pdf_path
