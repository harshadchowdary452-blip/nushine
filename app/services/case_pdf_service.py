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
from app.models.appointment import Appointment

logger = logging.getLogger(__name__)

PRIMARY = (27, 58, 92)
ACCENT = (22, 100, 180)
DARK = (31, 41, 55)
MUTED = (107, 114, 128)
LIGHT = (156, 163, 175)
WHITE = (255, 255, 255)
BG = (249, 250, 251)
BORDER = (229, 231, 235)
TABLE_ALT = (245, 247, 250)
RED_CLR = (220, 38, 38)
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
        .replace("\u2022", "-")
    )
    return result.encode("latin-1", "replace").decode("latin-1")


def s(val) -> str:
    if val is None:
        return "—"
    return str(val)


def fmt_date(d) -> str:
    if d is None:
        return "—"
    if hasattr(d, 'strftime'):
        return d.strftime("%d %b %Y")
    return str(d)


def fmt_datetime(d) -> str:
    if d is None:
        return "—"
    if hasattr(d, 'strftime'):
        return d.strftime("%d %b %Y %I:%M %p")
    return str(d)


class CasePDF(FPDF):

    def __init__(self, hospital: Optional[Hospital] = None):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.set_left_margin(ML)
        self.set_right_margin(ML)
        self.hospital = hospital

    def _sanitize_cell(self, w=None, h=None, text="", align="", border=0, fill=False, new_x="LMARGIN", new_y="NEXT", **kwargs):
        return super().cell(w=w, h=h, text=sanitize(text), align=align, border=border,
                            fill=fill, new_x=new_x, new_y=new_y, **kwargs)

    def _sanitize_mc(self, w=None, h=None, text="", align="", border=0, fill=False, new_x="LMARGIN", new_y="NEXT",
                     max_line_height=None, **kwargs):
        return super().multi_cell(w=w, h=h, text=sanitize(text), align=align, border=border,
                                  fill=fill, new_x=new_x, new_y=new_y, max_line_height=max_line_height, **kwargs)

    def header(self):
        if self.page_no() == 1:
            self._first_page_header()
        else:
            self._subsequent_header()

    def footer(self):
        self.set_y(-22)
        self.set_draw_color(*BORDER)

        if self.page_no() > 0:
            self.set_draw_color(*BORDER)
            self.line(ML, self.get_y(), ML + PW, self.get_y())
            self.ln(2)

            hname = self.hospital.name if self.hospital else "Hospital"
            self.set_font("Helvetica", "", 6.5)
            self.set_text_color(*LIGHT)
            self._sanitize_cell(PW, 3.5, "This is a confidential medical record intended only for the patient.", align="C")
            self.ln(3)
            self._sanitize_cell(PW // 2, 3, f"{hname}", align="L")
            self._sanitize_cell(PW // 2, 3, f"Page {self.page_no()}/{{nb}}", align="R")

    def _first_page_header(self):
        ml = ML
        pw = PW
        y = self.get_y()

        # Logo on the left
        logo_w = 22
        if self.hospital and self.hospital.logo_url:
            lpath = self.hospital.logo_url
            if os.path.exists(lpath):
                try:
                    self.image(lpath, x=ml, y=y, w=logo_w)
                except Exception:
                    pass

        # Hospital info on the right, aligned right
        info_x = ml + 28
        info_w = pw - 28
        if self.hospital:
            self.set_xy(info_x, y)
            self.set_font("Helvetica", "B", 16)
            self.set_text_color(*PRIMARY)
            self._sanitize_cell(info_w, 7, self.hospital.name or "Hospital", align="R")

            lines = []
            if self.hospital.address:
                lines.append(self.hospital.address)
            parts = []
            if self.hospital.phone:
                parts.append(f"Tel: {self.hospital.phone}")
            if self.hospital.email:
                parts.append(self.hospital.email)
            if self.hospital.registration_number:
                parts.append(f"Reg: {self.hospital.registration_number}")
            if self.hospital.gst_number:
                parts.append(f"GST: {self.hospital.gst_number}")
            if parts:
                lines.append(" | ".join(parts))
            for i, line in enumerate(lines):
                self.set_xy(info_x, y + 7.5 + i * 3.8)
                self.set_font("Helvetica", "", 7)
                self.set_text_color(*MUTED)
                self._sanitize_cell(info_w, 3.5, line, align="R")

        header_bottom = y + 20
        self.set_y(header_bottom)

        # Double line separator
        self.set_draw_color(*PRIMARY)
        self.set_line_width(0.6)
        self.line(ml, self.get_y(), ml + pw, self.get_y())
        self.ln(0.6)
        self.set_draw_color(*PRIMARY)
        self.set_line_width(0.2)
        self.line(ml, self.get_y(), ml + pw, self.get_y())
        self.ln(3)

        # Title
        self.set_font("Helvetica", "B", 12)
        self.set_text_color(*PRIMARY)
        self._sanitize_cell(pw, 6, "DENTAL CASE HISTORY REPORT", align="C")
        self.ln(5)

    def _subsequent_header(self):
        ml = ML
        pw = PW

        hname = self.hospital.name if self.hospital else "Hospital"
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(*PRIMARY)
        self._sanitize_cell(pw, 4, f"{hname}  |  Dental Case History Report (continued)", align="L")
        self.ln(5)
        self.set_draw_color(*BORDER)
        self.set_line_width(0.3)
        self.line(ml, self.get_y(), ml + pw, self.get_y())
        self.ln(4)

    def _ensure_space(self, needed_mm: float):
        if self.get_y() + needed_mm > self.h - self.b_margin:
            self.add_page()

    def section_title(self, title: str):
        self._ensure_space(16)
        self.set_fill_color(*PRIMARY)
        self.set_text_color(*WHITE)
        self.set_font("Helvetica", "B", 10)
        self._sanitize_cell(PW, 6.5, f"  {title}", fill=True)
        self.ln(8)

    def body_text(self, text: str):
        if not text:
            return
        self.set_x(ML)
        self.set_font("Helvetica", "", 8.5)
        self.set_text_color(*DARK)
        self._sanitize_mc(PW, 4.8, text)
        self.ln(3)

    # ── Information grid helpers ──

    def info_grid_2col(self, items: List[tuple], col1_x: float = 0, col2_x: float = 85):
        """items: list of (label, value) tuples alternating left/right"""
        x1 = ML + 3 if col1_x == 0 else col1_x
        x2 = ML + 83 if col2_x == 85 else col2_x
        lw = 28   # label width
        vw = 52   # value width

        box_y = self.get_y()
        row_h = 5.2
        total = len(items)
        left_count = (total + 1) // 2
        rows = max(left_count, total - left_count)

        def draw_pair(label, value, x, y):
            if not value:
                value = "—"
            self.set_xy(x, y)
            self.set_font("Helvetica", "", 7.5)
            self.set_text_color(*MUTED)
            self._sanitize_cell(lw, row_h, label)
            self.set_font("Helvetica", "", 8)
            self.set_text_color(*DARK)
            self._sanitize_cell(vw, row_h, s(value))

        y_start = box_y
        for i in range(rows):
            row_y = y_start + i * (row_h + 0.3)
            # Left item
            if i < left_count:
                label, value = items[i * 2]
                draw_pair(label, value, x1, row_y)
            # Right item
            right_idx = i + left_count
            if right_idx < total:
                label, value = items[right_idx]
                draw_pair(label, value, x2, row_y)

        self.set_y(box_y + rows * (row_h + 0.3) + 2)

    def address_field(self, label: str, value: str):
        if not value:
            return
        x1 = ML + 3
        self.set_x(x1)
        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(*MUTED)
        self._sanitize_cell(28, 5, label)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*DARK)
        self._sanitize_mc(PW - 34, 5, s(value))
        self.ln(1)

    # ── Table helpers ──

    def check_page_break_table(self, row_count: int, row_h: float, header_h: float = 7):
        needed = header_h + 1 + row_count * (row_h + 0.5) + 5
        if self.get_y() + needed > self.h - self.b_margin:
            self.add_page()

    def table_section(self, title: str, headers: List[str], col_widths: List[int],
                      rows_data: List[List[str]], row_h: float = 6):
        if not rows_data:
            return

        self._ensure_space(14)
        # Section subtitle
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*PRIMARY)
        self._sanitize_cell(PW, 5, title)
        self.ln(6)

        # Check if we need a page break for the table
        total_h = 7 + len(rows_data) * (row_h + 0.5) + 4
        if self.get_y() + total_h > self.h - self.b_margin:
            self.add_page()

        # Header
        self.set_font("Helvetica", "B", 7.5)
        self.set_fill_color(*PRIMARY)
        self.set_text_color(*WHITE)
        self.set_draw_color(*BORDER)
        for i, h in enumerate(headers):
            self._sanitize_cell(col_widths[i], 7, f"  {h}", border=1, fill=True)
        self.ln()

        # Rows
        self.set_font("Helvetica", "", 7)
        self.set_text_color(*DARK)
        for idx, row in enumerate(rows_data):
            if idx % 2 == 1:
                self.set_fill_color(*TABLE_ALT)
            else:
                self.set_fill_color(*WHITE)
            for i, cell in enumerate(row):
                align = "L" if i == 0 else "L"
                txt = f"  {cell}" if i == 0 else (cell or "-")
                # Check for page break within table
                if self.get_y() + row_h > self.h - self.b_margin:
                    # Repeat header
                    self.add_page()
                    self.set_font("Helvetica", "B", 7.5)
                    self.set_fill_color(*PRIMARY)
                    self.set_text_color(*WHITE)
                    self.set_draw_color(*BORDER)
                    for ii, hh in enumerate(headers):
                        self._sanitize_cell(col_widths[ii], 7, f"  {hh}", border=1, fill=True)
                    self.ln()
                    self.set_font("Helvetica", "", 7)
                    self.set_text_color(*DARK)
                    if idx % 2 == 1:
                        self.set_fill_color(*TABLE_ALT)
                    else:
                        self.set_fill_color(*WHITE)
                self.set_draw_color(*BORDER)
                # estimate cell content height
                self._sanitize_cell(col_widths[i], row_h, txt, border=1, fill=True, align=align)
            self.ln()

        self.ln(4)

    # ── Main generation ──

    def generate(self, case: Case) -> str:
        patient = case.patient
        doctor = case.doctor
        hospital = patient.hospital if patient else None
        self.hospital = hospital
        findings = case.findings or []
        treatment_plans = case.treatment_plans or []

        pdf_dir = os.path.join(settings.UPLOAD_DIR, "case_reports")
        os.makedirs(pdf_dir, exist_ok=True)
        pdf_path = os.path.join(pdf_dir, f"case_{case.id}.pdf")

        self.alias_nb_pages()
        self.set_auto_page_break(auto=True, margin=28)
        self.add_page()

        ml = ML
        pw = PW

        # ── Case Info Line ──
        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(*MUTED)

        case_num = case.case_number or case.id[:8].upper()
        if case.appointment and case.appointment.appointment_date:
            visit_str = case.appointment.appointment_date.strftime("%d %b %Y")
        else:
            visit_str = case.created_at.strftime("%d %b %Y") if case.created_at else "—"
        doc_name_display = f"Dr. {doctor.full_name}" if doctor else "—"
        hname = hospital.name if hospital else "Hospital"

        info_parts = [
            f"Case #: {case_num}",
            f"Visit Date: {visit_str}",
            f"Doctor: {doc_name_display}",
            f"Hospital: {hname}",
        ]
        self._sanitize_cell(pw, 4, "  |  ".join(info_parts), align="C")
        self.ln(6)

        # ============================================================
        # PATIENT INFORMATION
        # ============================================================
        self.section_title("PATIENT INFORMATION")

        pat = patient
        if pat:
            box_y = self.get_y()
            lw = 26
            row_h = 5.5
            gap = 0.5
            cx1 = ml + 3
            cx2 = ml + 87
            cw = 68

            pairs = [
                ("Patient Name :", pat.full_name, "OP Number :", pat.op_no),
                ("ABHA ID :", pat.abha_id, "Mobile :", pat.phone),
                ("Age :", f"{pat.age} Years" if pat.age else None, "Email :", pat.email),
                ("Gender :", pat.gender, "Emergency Contact :", pat.emergency_contact),
                ("Date of Birth :", fmt_date(pat.date_of_birth), "", ""),
            ]
            for i, (l1, v1, l2, v2) in enumerate(pairs):
                ry = box_y + 1 + i * (row_h + gap)
                self.set_xy(cx1, ry)
                self.set_font("Helvetica", "", 7)
                self.set_text_color(*MUTED)
                self._sanitize_cell(lw, row_h, l1)
                self.set_x(cx1 + lw)
                self.set_font("Helvetica", "", 8)
                self.set_text_color(*DARK)
                self._sanitize_cell(cw - lw, row_h, s(v1))
                if l2:
                    self.set_xy(cx2, ry)
                    self.set_font("Helvetica", "", 7)
                    self.set_text_color(*MUTED)
                    self._sanitize_cell(lw, row_h, l2)
                    self.set_x(cx2 + lw)
                    self.set_font("Helvetica", "", 8)
                    self.set_text_color(*DARK)
                    self._sanitize_cell(cw - lw, row_h, s(v2))

            addr_y = box_y + 1 + len(pairs) * (row_h + gap)
            if pat.address:
                self.set_xy(cx1, addr_y)
                self.set_font("Helvetica", "", 7)
                self.set_text_color(*MUTED)
                self._sanitize_cell(lw, row_h, "Address :")
                self.set_x(cx1 + lw)
                self.set_font("Helvetica", "", 8)
                self.set_text_color(*DARK)
                self._sanitize_mc(PW - 34, row_h, pat.address)
                addr_y = self.get_y() + 0.5
            else:
                addr_y = addr_y + 0.5

            sep_y = addr_y + 1
            self.set_draw_color(*BORDER)
            self.line(ml + 3, sep_y, ml + pw - 3, sep_y)

            doc_y = sep_y + 2.5
            doc_label = f"Dr. {doctor.full_name}" if doctor else "—"
            doc_reg = case.doctor_registration_number or (doctor.license_number if doctor else None)
            doc_str = doc_label
            if doc_reg:
                doc_str += f"  |  Reg: {doc_reg}"
            if doctor and doctor.specialization:
                doc_str += f"  |  {doctor.specialization}"
            self.set_xy(cx1, doc_y)
            self.set_font("Helvetica", "", 7)
            self.set_text_color(*MUTED)
            self._sanitize_cell(lw, row_h, "Doctor :")
            self.set_x(cx1 + lw)
            self.set_font("Helvetica", "", 8)
            self.set_text_color(*DARK)
            self._sanitize_cell(cw - lw, row_h, doc_str)

            self.set_xy(cx2, doc_y)
            self.set_font("Helvetica", "", 7)
            self.set_text_color(*MUTED)
            self._sanitize_cell(lw, row_h, "Visit Date :")
            self.set_x(cx2 + lw)
            self.set_font("Helvetica", "", 8)
            self.set_text_color(*DARK)
            self._sanitize_cell(cw - lw, row_h, visit_str)

            self.set_y(max(self.get_y(), doc_y + row_h) + 4)
        else:
            self.body_text("Patient information not available.")

        # ============================================================
        # CHIEF COMPLAINT
        # ============================================================
        if case.chief_complaint:
            self.section_title("Chief Complaint")
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
            self.body_text(cc_text)
            self.ln(2)

        # ============================================================
        # CLINICAL DETAILS (individual cards)
        # ============================================================
        clinical_sections = [
            ("History of Present Illness", case.hpi),
            ("Medical History", case.medical_history),
            ("Dental History", case.dental_history),
            ("Personal History", case.personal_history),
            ("Family History", case.family_history),
            ("Extra Oral Examination", case.extra_oral_examination),
            ("Intra Oral Examination", case.intra_oral_examination),
            ("Periodontal Examination", case.periodontal_examination),
            ("Investigations", case.investigations),
        ]
        for title, content in clinical_sections:
            if content:
                self.section_title(title)
                self.body_text(content)
                self.ln(1)

        # ============================================================
        # CLINICAL FINDINGS
        # ============================================================
        has_findings_section = any([
            findings,
            case.clinical_findings_summary,
        ])
        if has_findings_section:
            self.section_title("Clinical Findings")

            if findings:
                # Findings summary table
                col_w = [18, 32, 22, 18, 70]
                headers = ["Tooth", "Finding", "Surface", "Severity", "Remarks"]
                rows_data = []
                for f in findings:
                    tooth = str(f.tooth_number) if f.tooth_number else "-"
                    ftype = f.finding_type or "-"
                    severity = f.severity or "-"
                    notes = f.notes or ""
                    # Surface from dedicated column with backward compat
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
                    rows_data.append([tooth, ftype, surface or "-", severity, remark or "-"])

                self.table_section("Tooth Chart / Clinical Findings Summary",
                                   headers, col_w, rows_data, row_h=5.5)

            if case.clinical_findings_summary:
                self.set_font("Helvetica", "B", 9)
                self.set_text_color(*PRIMARY)
                self._sanitize_cell(PW, 5, "Summary Notes")
                self.ln(6)
                self.body_text(case.clinical_findings_summary)
                self.ln(2)

        # ============================================================
        # DIAGNOSIS
        # ============================================================
        if case.provisional_diagnosis or case.final_diagnosis:
            self.section_title("Diagnosis")

            if case.provisional_diagnosis:
                self.set_font("Helvetica", "B", 9)
                self.set_text_color(*PRIMARY)
                self._sanitize_cell(PW, 5, "Provisional Diagnosis")
                self.ln(6)
                self.body_text(case.provisional_diagnosis)
                self.ln(2)

            if case.final_diagnosis:
                self._ensure_space(24)
                box_top = self.get_y()
                pad = 2
                diag_w = PW
                # Compute text height first
                self.set_x(ml + pad)
                self.set_font("Helvetica", "", 8)
                text_lines = self.multi_cell(diag_w - pad * 2, 4.5, sanitize(case.final_diagnosis), dry_run=True, output="LINES")
                text_h = len(text_lines) * 4.5 if text_lines else 4.5
                content_h = 6 + 2 + text_h + 3 + 1
                box_h = content_h + 2
                # Draw red border box
                self.set_draw_color(*RED_CLR)
                self.set_fill_color(*RED_BG)
                self.set_line_width(0.4)
                self.rect(ml, box_top, diag_w, box_h, style="DF")
                # Title bar
                self.set_fill_color(*RED_CLR)
                self.set_text_color(*WHITE)
                self.set_font("Helvetica", "B", 9)
                self.set_xy(ml, box_top)
                self._sanitize_cell(diag_w, 6, "  FINAL DIAGNOSIS", fill=True)
                # Body text
                self.set_xy(ml + pad, box_top + 8)
                self.set_font("Helvetica", "", 8)
                self.set_text_color(153, 27, 27)
                self._sanitize_mc(diag_w - pad * 2, 4.5, case.final_diagnosis)
                self.set_y(box_top + box_h + 5)

        # ============================================================
        # TREATMENT PLAN
        # ============================================================
        if treatment_plans:
            self.section_title("Treatment Plan")

            tp_w = [38, 24, 24, 28, 46]
            headers = ["Procedure", "Visits", "Priority", "Est. Cost", "Remarks"]
            rows_data = []
            for tp in treatment_plans:
                proc = (tp.treatment_name or "-")[:40]
                visits = str(tp.total_sittings) if tp.total_sittings else "-"
                priority = str(tp.status.value) if hasattr(tp.status, 'value') else (tp.status or "-")
                cost = f"Rs. {tp.cost:,.0f}" if tp.cost else "-"
                notes = (tp.notes or "-")[:48]
                rows_data.append([proc, visits, priority, cost, notes])

            self.table_section("Treatment Plan Details", headers, tp_w, rows_data, row_h=6)

        if case.initial_treatment_plan:
            if not treatment_plans:
                self.section_title("Treatment Plan")
            self.set_font("Helvetica", "B", 9)
            self.set_text_color(*PRIMARY)
            self._sanitize_cell(PW, 5, "Treatment Notes")
            self.ln(6)
            self.body_text(case.initial_treatment_plan)
            self.ln(2)

            plan_items = []
            if case.treatment_plan_estimated_visits:
                plan_items.append(f"Estimated Visits: {case.treatment_plan_estimated_visits}")
            if case.treatment_plan_estimated_cost:
                plan_items.append(f"Estimated Cost: Rs. {case.treatment_plan_estimated_cost:,.2f}")
            if plan_items:
                self.set_font("Helvetica", "", 8)
                self.set_text_color(*DARK)
                for item in plan_items:
                    self._sanitize_cell(PW, 5, item)
                    self.ln(5)
                self.ln(1)

        # ============================================================
        # MEDICINES PRESCRIBED
        # ============================================================
        if case.medicines_prescribed:
            self.section_title("Medicines Prescribed")
            self.body_text(case.medicines_prescribed)
            self.ln(2)

        # ============================================================
        # PATIENT INSTRUCTIONS
        # ============================================================
        if case.patient_instructions:
            self.section_title("Patient Instructions")
            self.set_font("Helvetica", "", 9)
            self.set_text_color(*DARK)
            self._sanitize_mc(PW, 5.5, case.patient_instructions)
            self.ln(3)

        # ============================================================
        # FOLLOW-UP
        # ============================================================
        if case.follow_up_instructions or case.next_review_date or doctor:
            self.section_title("Follow-Up")

            if case.follow_up_instructions:
                self.set_font("Helvetica", "", 8.5)
                self.set_text_color(*DARK)
                self._sanitize_mc(PW, 4.8, case.follow_up_instructions)
                self.ln(3)

            fuy = self.get_y()

            if case.next_review_date:
                self.set_xy(ml + 3, fuy)
                self.set_font("Helvetica", "", 7.5)
                self.set_text_color(*MUTED)
                self._sanitize_cell(30, 5, "Next Visit :")
                self.set_x(ml + 33)
                self.set_font("Helvetica", "", 8)
                self.set_text_color(*DARK)
                self._sanitize_cell(50, 5, fmt_date(case.next_review_date))
                fuy = self.get_y()

            if doctor:
                if case.next_review_date:
                    self.set_xy(ml + 88, fuy)
                    doc_label_x = ml + 88 + 30
                else:
                    self.set_xy(ml + 3, fuy)
                    doc_label_x = ml + 33
                self.set_font("Helvetica", "", 7.5)
                self.set_text_color(*MUTED)
                self._sanitize_cell(30, 5, "Doctor :")
                self.set_x(doc_label_x)
                self.set_font("Helvetica", "", 8)
                self.set_text_color(*DARK)
                self._sanitize_cell(50, 5, f"Dr. {doctor.full_name}" if doctor else "—")
                fuy = self.get_y()

            self.ln(3)

            if hospital:
                self.set_xy(ml + 3, self.get_y())
                self.set_font("Helvetica", "", 7.5)
                self.set_text_color(*MUTED)
                self._sanitize_cell(30, 5, "Hospital :")
                self.set_x(ml + 33)
                self.set_font("Helvetica", "", 8)
                self.set_text_color(*DARK)
                contact_parts = [hname]
                if hospital.phone:
                    contact_parts.append(hospital.phone)
                if hospital.email:
                    contact_parts.append(hospital.email)
                self._sanitize_cell(PW - 34, 5, " | ".join(contact_parts))
                self.ln(4)

        # ============================================================
        # DOCTOR DETAILS
        # ============================================================
        self.section_title("Doctor Details")

        doc_box_y = self.get_y()
        self.set_draw_color(*BORDER)
        row_h = 5.2
        x1 = ml + 3
        x2 = ml + 85
        lw = 30
        vw = 45

        dr = doctor
        doc_full_name = f"Dr. {dr.full_name}" if dr else "—"
        reg_no_display = case.doctor_registration_number or (dr.license_number if dr else None)
        spec = dr.specialization if dr else None
        phone_display = dr.phone if dr else None
        hname_display = hospital.name if hospital else "Hospital"

        ry = doc_box_y + 1.5

        def draw_lv(x, y, label, value):
            self.set_xy(x, y)
            self.set_font("Helvetica", "", 7.5)
            self.set_text_color(*MUTED)
            self._sanitize_cell(lw, row_h, label)
            self.set_x(x + lw)
            self.set_font("Helvetica", "", 8)
            self.set_text_color(*DARK)
            self._sanitize_cell(vw, row_h, value)

        draw_lv(x1, ry, "Doctor Name :", doc_full_name)
        if spec:
            draw_lv(x2, ry, "Qualification :", spec)
        if reg_no_display:
            draw_lv(x1, ry + row_h + 0.3, "Registration No :", reg_no_display)
        if phone_display:
            draw_lv(x2, ry + row_h + 0.3, "Mobile :", phone_display)

        draw_lv(x1, ry + (row_h + 0.3) * 2, "Hospital :", hname_display)

        self.set_y(ry + (row_h + 0.3) * 3 + 3)

        # ============================================================
        # SIGNATURE
        # ============================================================
        self._ensure_space(40)
        self.section_title("Signature")

        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(*MUTED)
        self._sanitize_mc(PW, 4.5,
            "I acknowledge that I have been explained the diagnosis, treatment plan, risks, "
            "benefits, and alternatives. I consent to the proposed treatment.")
        self.ln(8)

        y1 = self.get_y()
        sig_w = 42
        gap = 10
        total_used = sig_w * 3 + gap * 2
        start_x = ml + (pw - total_used) / 2

        self.set_draw_color(*DARK)
        labels = ["Doctor Signature", "Patient Signature", "Hospital Seal"]
        for i, lbl in enumerate(labels):
            x = start_x + i * (sig_w + gap)
            self.line(x, y1, x + sig_w, y1)
            self.set_xy(x, y1 + 1.5)
            self.set_font("Helvetica", "", 7)
            self.set_text_color(*MUTED)
            self._sanitize_cell(sig_w, 4, lbl, align="C")
            if lbl == "Hospital Seal":
                self.set_xy(x, y1 + 5)
                self.set_font("Helvetica", "", 6)
                self.set_text_color(*LIGHT)
                self._sanitize_cell(sig_w, 3, hname, align="C")

        self.ln(16)

        y2 = self.get_y()
        labels2 = ["Date", "Witness", "Place"]
        for i, lbl in enumerate(labels2):
            x = start_x + i * (sig_w + gap)
            self.line(x, y2, x + sig_w, y2)
            self.set_xy(x, y2 + 1.5)
            self.set_font("Helvetica", "", 7)
            self.set_text_color(*MUTED)
            self._sanitize_cell(sig_w, 4, lbl, align="C")

        self.ln(12)

        # ============================================================
        # OUTPUT
        # ============================================================
        self.output(pdf_path)
        return pdf_path


async def generate_case_pdf(case_id: str, db: AsyncSession) -> str:
    """Standalone function: loads case, generates PDF, returns file path."""
    result = await db.execute(
        select(Case).where(Case.id == case_id).options(
            selectinload(Case.patient).selectinload(Patient.hospital),
            selectinload(Case.doctor),
            selectinload(Case.appointment),
            selectinload(Case.findings),
            selectinload(Case.treatment_plans),
        )
    )
    case = result.scalar_one_or_none()
    if not case:
        raise ValueError("Case not found")

    hospital = case.patient.hospital if case.patient else None
    pdf = CasePDF(hospital=hospital)
    return pdf.generate(case)
