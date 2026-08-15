import re
from datetime import datetime
from typing import Optional


MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _fmt_date(dt) -> str:
    if dt is None:
        return "\u2014"
    dt = dt if isinstance(dt, datetime) else datetime.combine(dt, datetime.min.time())
    return f"{dt.day:02d} {MONTHS[dt.month-1]} {dt.year}"


def _fmt_dt(dt) -> str:
    if dt is None:
        return "\u2014"
    dt = dt if isinstance(dt, datetime) else datetime.combine(dt, datetime.min.time())
    hour = dt.hour % 12 or 12
    ampm = "AM" if dt.hour < 12 else "PM"
    return f"{dt.day:02d} {MONTHS[dt.month-1]} {dt.year}, {hour:02d}:{dt.minute:02d} {ampm}"


def _sf(finding) -> str:
    s = getattr(finding, "surface", None)
    if s:
        return s.replace(",", ", ")
    notes = getattr(finding, "notes", "") or ""
    m = re.search(r'\[S:([^\]]+)\]', notes)
    if m:
        return m.group(1)
    return "\u2014"


def _rm(finding) -> str:
    notes = getattr(finding, "notes", "") or ""
    if not notes:
        return "\u2014"
    s = notes
    s = re.sub(r'^\[S:[^\]]*\]\s*', "", s)
    s = re.sub(r'^\[M:[^\]]*\]\s*', "", s)
    return s or "\u2014"


def _chk(*vals) -> bool:
    return any(v is not None and v != "" for v in vals)


def _esc(val: Optional[str]) -> str:
    """HTML-escape a string value."""
    if val is None:
        return ""
    return (str(val)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;"))


def render_case_to_html(case) -> str:
    findings = list(getattr(case, "findings", None) or [])
    h = getattr(case, "hospital", None) or {}
    hn = _esc(getattr(h, "name", None) or "")
    ha = _esc(getattr(h, "address", None) or "")
    hp = _esc(getattr(h, "phone", None) or "")
    he = _esc(getattr(h, "email", None) or "")
    hr = _esc(getattr(h, "registration_number", None) or "")

    p = getattr(case, "patient", None) or {}
    d = getattr(case, "doctor", None) or {}
    pn = _esc(getattr(p, "full_name", None) or "")
    opno = _esc(getattr(p, "op_no", None) or "")
    age = getattr(p, "age", None)
    gender = _esc(getattr(p, "gender", None) or "")
    phone = _esc(getattr(p, "phone", None) or "")
    email = _esc(getattr(p, "email", None) or "")
    abha = _esc(getattr(p, "abha_id", None) or "")
    addr = _esc(getattr(p, "address", None) or "")

    vd = case_d = getattr(case, "appointment_date", None)
    if vd is None:
        vd = getattr(case, "created_at", None)
    visit_date = _fmt_date(vd) if vd else "\u2014"

    dn = _esc(getattr(case, "doctor_name", None) or "")
    if not dn:
        dn = _esc(getattr(d, "full_name", None) or "\u2014")
    dq = _esc(getattr(case, "doctor_qualification", None) or "")
    if not dq:
        dq = _esc(getattr(d, "qualification", None) or "")
    ds = _esc(getattr(case, "doctor_specialization", None) or "")
    if not ds:
        ds = _esc(getattr(d, "specialization", None) or "")
    dr_val = _esc(getattr(case, "doctor_registration_number", None) or "")
    if not dr_val:
        dr_val = _esc(getattr(d, "license_number", None) or "")
    dp_val = _esc(getattr(d, "phone", None) or "")

    case_id_val = getattr(case, "id", "") or ""
    cn = _esc(getattr(case, "case_number", None) or case_id_val[:8].upper())
    gd = _fmt_dt(datetime.now())

    text_sections = [
        ("Chief Complaint", _esc(getattr(case, "chief_complaint", None) or ""),
         "cc_detail", "cc_detail"),
        ("History of Present Illness", _esc(getattr(case, "hpi", None) or ""),
         None, None),
        ("Medical History", _esc(getattr(case, "medical_history", None) or ""),
         None, None),
        ("Dental History", _esc(getattr(case, "dental_history", None) or ""),
         None, None),
        ("Personal History", _esc(getattr(case, "personal_history", None) or ""),
         None, None),
        ("Family History", _esc(getattr(case, "family_history", None) or ""),
         None, None),
        ("Extra Oral Examination", _esc(getattr(case, "extra_oral_examination", None) or ""),
         None, None),
        ("Intra Oral Examination", _esc(getattr(case, "intra_oral_examination", None) or ""),
         None, None),
        ("Periodontal Examination", _esc(getattr(case, "periodontal_examination", None) or ""),
         None, None),
        ("Investigations", _esc(getattr(case, "investigations", None) or ""),
         None, None),
    ]

    cc_dur = _esc(getattr(case, "chief_complaint_duration", None) or "")
    cc_sev = _esc(getattr(case, "chief_complaint_severity", None) or "")
    cc_asym = _esc(getattr(case, "chief_complaint_associated_symptoms", None) or "")
    has_cc_detail = bool(cc_dur or cc_sev or cc_asym)

    clin_summary = _esc(getattr(case, "clinical_findings_summary", None) or "")
    has_clin = _chk(len(findings) > 0, clin_summary)

    prov_dx = _esc(getattr(case, "provisional_diagnosis", None) or "")
    final_dx = _esc(getattr(case, "final_diagnosis", None) or "")
    has_dx = bool(prov_dx or final_dx)

    tps = list(getattr(case, "treatment_plans", None) or [])
    has_tp = len(tps) > 0
    tp_visits = getattr(case, "treatment_plan_estimated_visits", None)
    tp_cost = getattr(case, "treatment_plan_estimated_cost", None)

    tx_notes = _esc(getattr(case, "initial_treatment_plan", None) or "")
    meds = _esc(getattr(case, "medicines_prescribed", None) or "")
    structured_meds = list(getattr(case, "medication_prescriptions", None) or [])
    pt_inst = _esc(getattr(case, "patient_instructions", None) or "")
    fu_inst = _esc(getattr(case, "follow_up_instructions", None) or "")
    next_review = getattr(case, "next_review_date", None)
    has_fu = bool(fu_inst or next_review)

    css = r"""#crp{font-family:'Inter','Roboto',system-ui,sans-serif;width:210mm;margin:0 auto;background:#fff;color:#1f2937;font-size:10px;line-height:1.4}
#crp .st{font-size:14px;font-weight:700;color:#1E3A5F;border-bottom:1px solid #d1d5db;padding-bottom:1px;margin-bottom:3px;margin-top:8px}
#crp .sc{font-size:10px;line-height:1.5;color:#1f2937;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;padding:2px 0}
#crp .info-table{width:100%;border-collapse:collapse}
#crp .info-table td{font-size:10px;padding:1px 0;vertical-align:top}
#crp .info-table td.l{font-weight:600;color:#6b7280;white-space:nowrap;padding-right:8px}
#crp .info-table td.v{font-weight:400;color:#1f2937;word-break:break-word;overflow-wrap:break-word}
#crp .info-table td.vr{font-weight:400;color:#1f2937;word-break:break-word;overflow-wrap:break-word;padding-right:8px}
#crp .ft{width:100%;border-collapse:collapse;font-size:9.5px;line-height:1.4}
#crp .ft th{background:#1E3A5F;color:#fff;font-size:10px;font-weight:700;padding:4px 6px;border:1px solid #d1d5db;text-align:center}
#crp .ft td{padding:3px 6px;border:1px solid #d1d5db;vertical-align:middle;word-break:break-word;overflow-wrap:break-word;font-size:9.5px;text-align:center}
#crp .ft td:first-child{font-weight:600;text-align:left}
#crp .ft td:last-child{text-align:left}
#crp .ft tr:nth-child(even){background:#f9fafb}
#crp .tp-table{width:100%;border-collapse:collapse;font-size:9.5px;line-height:1.4}
#crp .tp-table thead{display:table-header-group}
#crp .tp-table th{background:#1E3A5F;color:#fff;font-size:10px;font-weight:700;padding:5px 6px;border:1px solid #d1d5db;text-align:center}
#crp .tp-table td{padding:4px 6px;border:1px solid #d1d5db;vertical-align:middle;font-size:9.5px;text-align:center}
#crp .tp-row{page-break-inside:avoid;break-inside:avoid}
#crp .tp-table tbody tr:nth-child(even){background:#f9fafb}
#crp .sig-line{border-bottom:1px solid #9ca3af;width:100%;height:0}
#crp .plp{display:inline}
#crp .pls{display:none}
@page{size:A4 portrait;margin:0}
@media print{body *{visibility:hidden}#crp,#crp *{visibility:visible}#crp{position:absolute;left:0;top:0;width:100%;max-width:100%;margin:0;box-shadow:none}.nop{display:none!important}.np{break-inside:avoid;page-break-inside:avoid}#crp .plp{display:none!important}#crp .pls{display:inline!important}#crp .pls::after{content:"Page " counter(page) " of " counter(pages)}}"""

    def tb(v):
        return f'<td class="v">{v}</td>'
    def tbl(v):
        return f'<td class="l">{v}</td>'
    def tvr(v):
        return f'<td class="vr">{v}</td>'

    lines = []
    a = lines.append
    a('<!DOCTYPE html>')
    a('<html lang="en">')
    a('<head><meta charset="utf-8">')
    a('<link rel="preconnect" href="https://fonts.googleapis.com">')
    a('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>')
    a('<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">')
    a(f'<style>{css}</style>')
    a('</head><body>')

    a('<div id="crp"><div style="padding:12mm">')

    # ── HEADER ──
    if hn:
        a(f'<div class="np" style="text-align:center;margin-bottom:4px">')
        a(f'<div style="font-size:26px;font-weight:700;color:#1E3A5C;line-height:1.2">{hn}</div>')
        if ha:
            a(f'<div style="font-size:10px;color:#4b5563;margin-top:2px;line-height:1.4;word-break:break-word">{ha}</div>')
        a('<div style="margin-top:3px">')
        if hp:
            a(f'<div style="font-size:9px;color:#6b7280;line-height:1.5">Phone: {hp}</div>')
        if he:
            a(f'<div style="font-size:9px;color:#6b7280;line-height:1.5">Email: {he}</div>')
        if hr:
            a(f'<div style="font-size:9px;color:#6b7280;line-height:1.5">Reg No: {hr}</div>')
        a('</div>')
        a('<div style="border-top:2px solid #1E3A5C;margin:6px 0 2px"></div>')
        a('<div style="border-top:1px solid #e5e7eb;margin:0 0 6px"></div>')
        a(f'<div style="font-size:18px;font-weight:700;color:#1E3A5C;letter-spacing:0.04em;line-height:1.3">DENTAL CASE REPORT</div>')
        a(f'<div style="font-size:9px;color:#6b7280;margin-top:3px;line-height:1.5">Case #: {cn} &nbsp;|&nbsp; Visit: {visit_date}</div>')
        a('<div style="border-top:1px solid #e5e7eb;margin:6px 0 0"></div>')
        a('</div>')
    else:
        a('<div class="np" style="text-align:center;margin-bottom:4px">')
        a('<div style="border-top:2px solid #1E3A5C;margin:0 0 2px"></div>')
        a('<div style="border-top:1px solid #e5e7eb;margin:0 0 6px"></div>')
        a(f'<div style="font-size:18px;font-weight:700;color:#1E3A5C;letter-spacing:0.04em;line-height:1.3">DENTAL CASE REPORT</div>')
        a(f'<div style="font-size:9px;color:#6b7280;margin-top:3px;line-height:1.5">Case #: {cn} &nbsp;|&nbsp; Visit: {visit_date}</div>')
        a('<div style="border-top:1px solid #e5e7eb;margin:6px 0 0"></div>')
        a('</div>')

    # ── Patient Information ──
    a('<div class="np">')
    a('<div class="st">Patient Information</div>')
    a('<div style="padding:3px 0">')
    a('<table class="info-table"><tbody>')
    patient_name = pn or _esc(getattr(case, "patient_name", None) or "\u2014")
    tr_1 = f'<tr>{tbl("Patient Name")}{tvr(patient_name)}{tbl("OP Number")}{tb(opno or "\u2014")}</tr>'
    a(tr_1)
    if age is not None:
        tr_2 = f'<tr>{tbl("Age / Gender")}{tvr(f"{age}Y / {gender or "--"}")}{tbl("Mobile")}{tb(phone or "\u2014")}</tr>'
    else:
        tr_2 = f'<tr>{tbl("Gender")}{tvr(gender or "\u2014")}{tbl("Mobile")}{tb(phone or "\u2014")}</tr>'
    a(tr_2)
    a(f'<tr>{tbl("ABHA ID")}<td class="v" colspan="3">{abha or "\u2014"}</td></tr>')
    a('</tbody></table>')
    a('<div style="border-top:1px dashed #e5e7eb;margin:4px 0;padding-top:4px">')
    a('<table class="info-table"><tbody>')
    a(f'<tr>{tbl("Address")}<td class="v" colspan="3">{addr or "\u2014"}</td></tr>')
    a(f'<tr>{tbl("Doctor")}<td class="v" colspan="3">Dr. {dn}{" | Reg: " + dr_val if dr_val else ""}</td></tr>')
    a(f'<tr>{tbl("Visit Date")}{tb(visit_date)}{tbl("Case Number")}{tb(cn)}</tr>')
    a('</tbody></table></div></div></div>')

    # ── Text Sections ──
    for title, content, _, _ in text_sections:
        if content:
            a(f'<div class="st">{title}</div><div class="sc">{content}</div>')
            if title == "Chief Complaint" and has_cc_detail:
                parts = []
                if cc_dur:
                    parts.append(f"Duration: {cc_dur}")
                if cc_sev:
                    parts.append(f"Severity: {cc_sev}")
                if cc_asym:
                    parts.append(f"Associated: {cc_asym}")
                a(f'<div class="sc" style="color:#6b7280;padding-top:0">{" &nbsp;|&nbsp; ".join(parts)}</div>')

    # ── Clinical Findings ──
    if has_clin:
        a('<div class="np"><div class="st">Clinical Findings Summary</div>')
        if findings:
            a('<table class="ft" style="margin-top:3px"><thead><tr><th>Tooth</th><th>Finding</th><th>Surface</th><th>Remarks</th></tr></thead><tbody>')
            for fi in findings:
                fid = getattr(fi, "id", "") or ""
                f_type = _esc(getattr(fi, "finding_type", None) or "\u2014")
                f_tooth = _esc(getattr(fi, "tooth_number", None) or "\u2014")
                f_surf = _sf(fi)
                f_rem = _rm(fi)
                a(f'<tr><td>{f_tooth}</td><td>{f_type}</td><td>{f_surf}</td><td>{f_rem}</td></tr>')
            a('</tbody></table>')
        if clin_summary:
            mt = "margin-top:4px" if findings else ""
            a(f'<div class="sc" style="{mt}"><span style="font-weight:600;color:#1E3A5F">Summary Notes: </span>{clin_summary}</div>')
        a('</div>')

    # ── Diagnosis ──
    if has_dx:
        a('<div class="np"><div class="st">Diagnosis</div>')
        if prov_dx:
            a(f'<div class="sc"><span style="font-weight:600;color:#1E3A5F">Provisional: </span>{prov_dx}</div>')
        if final_dx:
            a(f'<div class="sc"><span style="font-weight:600;color:#dc2626">Final: </span>{final_dx}</div>')
        a('</div>')

    # ── Treatment Plan ──
    items = []
    # Try to parse structured JSON data from initial_treatment_plan (new form)
    raw_tp = getattr(case, "initial_treatment_plan", None) or ""
    if raw_tp and raw_tp.startswith("_JSON_"):
        try:
            import json
            parsed = json.loads(raw_tp[6:])
            if isinstance(parsed, list) and len(parsed) > 0:
                items = parsed
        except Exception:
            pass
    # Fall back to DB treatment_plans relationship
    if not items and has_tp:
        for tp in tps:
            items.append({
                "name": _esc(getattr(tp, "treatment_name", None) or "\u2014"),
                "toothNumbers": [],
                "estimatedVisits": str(getattr(tp, "total_sittings", "") or ""),
                "estimatedCost": str(getattr(tp, "cost", "") or ""),
                "remarks": _esc(getattr(tp, "notes", None) or ""),
            })
    if items:
        total_procedures = len(items)
        all_teeth = set()
        total_visits = sum(int(it.get("estimatedVisits", 0) or 0) for it in items)
        total_cost = sum(float(it.get("estimatedCost", 0) or 0) for it in items)
        for it in items:
            for t in (it.get("toothNumbers") or []):
                all_teeth.add(str(t))
        a('<div><div class="st">Treatment Plan</div>')
        a('<table class="tp-table" style="margin-top:3px">')
        a('<thead><tr>')
        a('<th style="width:25%;text-align:left">Procedure</th>')
        a('<th style="width:15%">Teeth</th>')
        a('<th style="width:10%">Visits</th>')
        a('<th style="width:15%;text-align:right">Est. Cost</th>')
        a('<th style="width:20%;text-align:left">Remarks</th>')
        a('</tr></thead><tbody>')
        for it in items:
            tp_name = it.get("name", "\u2014")
            tp_teeth = it.get("toothNumbers", [])
            tp_teeth_str = ", ".join(str(t) for t in tp_teeth) if tp_teeth else "\u2014"
            tp_sit = it.get("estimatedVisits", "")
            tp_sit_str = str(tp_sit) if tp_sit != "" and tp_sit is not None else "-"
            tp_cost_val = it.get("estimatedCost", "")
            try:
                tp_cost_str = f"\u20B9{float(tp_cost_val):,.0f}" if tp_cost_val != "" and tp_cost_val is not None else "-"
            except (ValueError, TypeError):
                tp_cost_str = "-"
            tp_notes = it.get("remarks", "") or "-"
            a(f'<tr class="tp-row"><td style="text-align:left;font-weight:600">{tp_name}</td><td>{tp_teeth_str}</td><td>{tp_sit_str}</td><td style="text-align:right">{tp_cost_str}</td><td style="text-align:left;font-size:9px">{tp_notes}</td></tr>')
        a('</tbody></table>')
        summary_parts = [f'<span><span style="font-weight:600;color:#1E3A5F">Total Procedures:</span> {total_procedures}</span>']
        if all_teeth:
            summary_parts.append(f'<span><span style="font-weight:600;color:#1E3A5F">Teeth Involved:</span> {len(all_teeth)}</span>')
        summary_parts.append(f'<span><span style="font-weight:600;color:#1E3A5F">Estimated Visits:</span> {total_visits}</span>')
        summary_parts.append(f'<span><span style="font-weight:600;color:#1E3A5F">Estimated Cost:</span> \u20B9{total_cost:,.0f}</span>')
        a(f'<div style="margin-top:6px;padding:4px 6px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:10px;flex-wrap:wrap;gap:4px">')
        a(" ".join(summary_parts))
        a('</div></div>')

    # ── Medicines Prescribed ──
    if structured_meds or meds:
        a('<div class="np"><div class="st">Medicines Prescribed</div>')
        if structured_meds:
            a('<table class="ft" style="margin-top:3px"><thead><tr><th>Medicine</th><th>Dosage</th><th>Frequency</th><th>Duration</th><th>Instructions</th></tr></thead><tbody>')
            for m in structured_meds:
                m_name = _esc(getattr(m, "medication_name", None) or "\u2014")
                m_dosage = _esc(getattr(m, "dosage", None)) or "\u2014"
                m_freq = _esc(getattr(m, "frequency", None)) or "\u2014"
                m_dur = _esc(getattr(m, "duration", None)) or "\u2014"
                m_inst = _esc(getattr(m, "instructions", None)) or "\u2014"
                a(f'<tr><td>{m_name}</td><td>{m_dosage}</td><td>{m_freq}</td><td>{m_dur}</td><td style="font-size:9px">{m_inst}</td></tr>')
            a('</tbody></table>')
        if meds:
            mt = "margin-top:4px" if structured_meds else ""
            a(f'<div class="sc" style="{mt}"><span style="font-weight:600;color:#1E3A5F">Legacy Notes: </span>{meds}</div>')
        a('</div>')

    # ── Patient Instructions ──
    if pt_inst:
        a(f'<div class="st">Patient Instructions</div><div class="sc">{pt_inst}</div>')

    # ── Follow-Up ──
    if has_fu:
        a('<div class="st">Follow-Up</div>')
        if fu_inst:
            a(f'<div class="sc">{fu_inst}</div>')
        fu_parts = []
        pt = "padding-top:0" if fu_inst else "padding-top:2px"
        if next_review:
            fu_parts.append(f'<span style="font-weight:600;color:#1E3A5C">Next Visit: {_fmt_date(next_review)}</span>')
        fu_parts.append(f'<span style="font-weight:600;color:#1E3A5C">Doctor: Dr. {dn}</span>')
        a(f'<div class="sc" style="{pt}">{" <span>&nbsp;|&nbsp; </span>".join(fu_parts)}</div>')

    # ── Doctor Details ──
    a('<div class="np"><div class="st">Doctor Details</div>')
    a('<div class="sc">')
    dd_parts = [f'Dr. {dn}']
    if dq:
        dd_parts.append(f'<span style="font-weight:600;color:#6b7280">Qualification:</span> {dq}')
    if ds:
        dd_parts.append(f'<span style="font-weight:600;color:#6b7280">Specialization:</span> {ds}')
    if dr_val:
        dd_parts.append(f'<span style="font-weight:600;color:#6b7280">Reg No:</span> {dr_val}')
    if dp_val:
        dd_parts.append(f'<span style="font-weight:600;color:#6b7280">Mobile:</span> {dp_val}')
    a(' &nbsp;|&nbsp; '.join(dd_parts))
    a('</div></div>')

    # ── Consent & Signature ──
    a('<div class="np"><div class="st">Patient Consent & Signature</div>')
    a('<div class="sc" style="font-style:italic;color:#6b7280;margin-bottom:2px">I acknowledge that I have been explained the diagnosis, treatment plan, risks, benefits, and alternatives. I consent to the proposed treatment.</div>')
    a('<table style="width:100%;border-collapse:collapse;margin-top:8px"><tbody><tr>')
    for label in ["Doctor Signature", "Patient Signature", "Hospital Seal"]:
        a(f'<td style="width:33%;text-align:center"><div class="sig-line"></div><div style="font-size:9px;color:#6b7280;margin-top:2px">{label}</div></td>')
    a('</tr><tr>')
    for label in ["Date", "Witness", "Place"]:
        a(f'<td style="width:33%;text-align:center;padding-top:6px"><div class="sig-line"></div><div style="font-size:9px;color:#6b7280;margin-top:2px">{label}</div></td>')
    a('</tr></tbody></table></div>')

    # ── Footer ──
    a('<div class="np" style="border-top:1px solid #e5e7eb;margin-top:10px;padding-top:6px;text-align:center">')
    a('<div style="font-size:8px;color:#9ca3af;line-height:1.6">')
    if hn:
        a(f'<div style="font-weight:600;color:#6b7280">{hn}</div>')
    a('<div>Confidential Medical Record</div>')
    a('<div class="pn"><span class="plp">Page 1 of 1</span><span class="pls"></span></div>')
    a(f'<div>Generated on: {gd}</div>')
    a('</div></div></div></div>')

    a('</body></html>')
    return "\n".join(lines)
