import { format } from "date-fns"

function sf(f: any): string {
  if (f.surface) return f.surface.replace(/,/g, ", ")
  if (f.notes) { const m = f.notes.match(/\[S:([^\]]+)\]/); if (m) return m[1] }
  return "\u2014"
}

function rm(f: any): string {
  if (f.notes) { let s = f.notes; s = s.replace(/^\[S:[^\]]*\]\s*/g, ""); s = s.replace(/^\[M:[^\]]*\]\s*/g, ""); return s || "\u2014" }
  return "\u2014"
}

function chk(...vals: any[]) {
  return vals.some(v => v !== null && v !== undefined && v !== "")
}

export default function CaseReportPrint({ c }: { c: any }) {
  const findings = c.findings || []
  const h = c.hospital
  const hn = h?.name, ha = h?.address || "", hp = h?.phone || "", he = h?.email || "", hr = h?.registration_number || ""
  const p = c.patient, d = c.doctor
  const vd = c.appointment_date ? format(new Date(c.appointment_date), "dd MMM yyyy") : c.created_at ? format(new Date(c.created_at), "dd MMM yyyy") : "\u2014"
  const dn = c.doctor_name || d?.full_name || "\u2014"
  const dq = c.doctor_qualification || d?.qualification || ""
  const ds = c.doctor_specialization || d?.specialization || ""
  const dr = c.doctor_registration_number || d?.license_number || ""
  const dp = d?.phone || ""
  const cn = c.case_number || c.id.slice(0, 8).toUpperCase()
  const gd = format(new Date(), "dd MMM yyyy, hh:mm a")

  const sections = [
    { t: "Chief Complaint", c: c.chief_complaint },
    { t: "History of Present Illness", c: c.hpi },
    { t: "Medical History", c: c.medical_history },
    { t: "Dental History", c: c.dental_history },
    { t: "Personal History", c: c.personal_history },
    { t: "Family History", c: c.family_history },
    { t: "Extra Oral Examination", c: c.extra_oral_examination },
    { t: "Intra Oral Examination", c: c.intra_oral_examination },
    { t: "Periodontal Examination", c: c.periodontal_examination },
    { t: "Investigations", c: c.investigations },
  ].filter(s => s.c)

  return (
    <div id="case-report-print" style={{ fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", width: "210mm", margin: "0 auto", background: "#fff", color: "#1f2937", fontSize: 10, lineHeight: 1.4 }}>
      <style>{`
        #case-report-print .st {
          font-size: 14px; font-weight: 700; color: #1E3A5F;
          border-bottom: 1px solid #d1d5db; padding-bottom: 1px;
          margin-bottom: 3px; margin-top: 8px;
        }
        #case-report-print .sc {
          font-size: 10px; line-height: 1.5; color: #1f2937;
          white-space: pre-wrap; word-break: break-word; overflow-wrap: break-word;
          padding: 2px 0;
        }
        #case-report-print .info-table { width: 100%; border-collapse: collapse; }
        #case-report-print .info-table td { font-size: 10px; padding: 1px 0; vertical-align: top; }
        #case-report-print .info-table td.l { font-weight: 600; color: #6b7280; white-space: nowrap; padding-right: 8px; }
        #case-report-print .info-table td.v { font-weight: 400; color: #1f2937; word-break: break-word; overflow-wrap: break-word; }
        #case-report-print .info-table td.vr { font-weight: 400; color: #1f2937; word-break: break-word; overflow-wrap: break-word; padding-right: 8px; }
        #case-report-print .findings-table {
          width: 100%; border-collapse: collapse; font-size: 9.5px; line-height: 1.4;
        }
        #case-report-print .findings-table th {
          background: #1E3A5F; color: #fff; font-size: 10px; font-weight: 700;
          padding: 4px 6px; border: 1px solid #d1d5db; text-align: center;
        }
        #case-report-print .findings-table td {
          padding: 3px 6px; border: 1px solid #d1d5db;
          vertical-align: middle; word-break: break-word; overflow-wrap: break-word;
          font-size: 9.5px; text-align: center;
        }
        #case-report-print .findings-table td:first-child { font-weight: 600; text-align: left; }
        #case-report-print .findings-table td:last-child { text-align: left; }
        #case-report-print .findings-table tr:nth-child(even) { background: #f9fafb; }
        #case-report-print .tp-table {
          width: 100%; border-collapse: collapse; font-size: 9.5px; line-height: 1.4;
        }
        #case-report-print .tp-table thead { display: table-header-group; }
        #case-report-print .tp-table th {
          background: #1E3A5F; color: #fff; font-size: 10px; font-weight: 700;
          padding: 5px 6px; border: 1px solid #d1d5db; text-align: center;
        }
        #case-report-print .tp-table td {
          padding: 4px 6px; border: 1px solid #d1d5db;
          vertical-align: middle; font-size: 9.5px; text-align: center;
        }
        #case-report-print .tp-row { page-break-inside: avoid; break-inside: avoid; }
        #case-report-print .tp-table tbody tr:nth-child(even) { background: #f9fafb; }
        #case-report-print .sig-line { border-bottom: 1px solid #9ca3af; width: 100%; height: 0; }

        #case-report-print .plp { display: inline; }
        #case-report-print .pls { display: none; }

        @page { size: A4 portrait; margin: 0; }
        @media print {
          body * { visibility: hidden; }
          #case-report-print, #case-report-print * { visibility: visible; }
          #case-report-print {
            position: absolute; left: 0; top: 0;
            width: 100%; max-width: 100%; margin: 0;
            box-shadow: none;
          }
          .nop { display: none !important; }
          .np { break-inside: avoid; page-break-inside: avoid; }
          #case-report-print .plp { display: none !important; }
          #case-report-print .pls { display: inline !important; }
          #case-report-print .pls::after { content: "Page " counter(page) " of " counter(pages); }
        }
      `}</style>

      <div style={{ padding: "12mm" }}>
        {/* ══════════ HEADER ══════════ */}
        {hn ? (
          <div className="np" style={{ textAlign: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#1E3A5C", lineHeight: 1.2 }}>{hn}</div>
            {ha && <div style={{ fontSize: 10, color: "#4b5563", marginTop: 2, lineHeight: 1.4, wordBreak: "break-word" }}>{ha}</div>}
            <div style={{ marginTop: 3 }}>
              {hp && <div style={{ fontSize: 9, color: "#6b7280", lineHeight: 1.5 }}>Phone: {hp}</div>}
              {he && <div style={{ fontSize: 9, color: "#6b7280", lineHeight: 1.5 }}>Email: {he}</div>}
              {hr && <div style={{ fontSize: 9, color: "#6b7280", lineHeight: 1.5 }}>Reg No: {hr}</div>}
            </div>
            <div style={{ borderTop: "2px solid #1E3A5C", margin: "6px 0 2px" }} />
            <div style={{ borderTop: "1px solid #e5e7eb", margin: "0 0 6px" }} />
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1E3A5C", letterSpacing: "0.04em", lineHeight: 1.3 }}>DENTAL CASE REPORT</div>
            <div style={{ fontSize: 9, color: "#6b7280", marginTop: 3, lineHeight: 1.5 }}>
              Case #: {cn} &nbsp;|&nbsp; Visit: {vd}
            </div>
            <div style={{ borderTop: "1px solid #e5e7eb", margin: "6px 0 0" }} />
          </div>
        ) : (
          <div className="np" style={{ textAlign: "center", marginBottom: 4 }}>
            <div style={{ borderTop: "2px solid #1E3A5C", margin: "0 0 2px" }} />
            <div style={{ borderTop: "1px solid #e5e7eb", margin: "0 0 6px" }} />
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1E3A5C", letterSpacing: "0.04em", lineHeight: 1.3 }}>DENTAL CASE REPORT</div>
            <div style={{ fontSize: 9, color: "#6b7280", marginTop: 3, lineHeight: 1.5 }}>Case #: {cn} &nbsp;|&nbsp; Visit: {vd}</div>
            <div style={{ borderTop: "1px solid #e5e7eb", margin: "6px 0 0" }} />
          </div>
        )}

        {/* Patient Information */}
        <div className="np">
          <div className="st">Patient Information</div>
          <div style={{ padding: "3px 0" }}>
            <table className="info-table">
              <tbody>
                <tr>
                  <td className="l">Patient Name</td>
                  <td className="vr">{p?.full_name || c.patient_name || "\u2014"}</td>
                  <td className="l">OP Number</td>
                  <td className="v">{p?.op_no || "\u2014"}</td>
                </tr>
                <tr>
                  {p?.age ? (
                    <><td className="l">Age / Gender</td><td className="vr">{p.age}Y / {p.gender || "--"}</td></>
                  ) : (
                    <><td className="l">Gender</td><td className="vr">{p?.gender || "\u2014"}</td></>
                  )}
                  <td className="l">Mobile</td>
                  <td className="v">{p?.phone || "\u2014"}</td>
                </tr>
                <tr>
                  <td className="l">ABHA ID</td>
                  <td className="vr">{p?.abha_id || "\u2014"}</td>
                  <td className="l">&nbsp;</td>
                  <td className="v">&nbsp;</td>
                </tr>
              </tbody>
            </table>
            <div style={{ borderTop: "1px dashed #e5e7eb", margin: "4px 0", paddingTop: 4 }}>
              <table className="info-table">
                <tbody>
                  <tr>
                    <td className="l">Address</td>
                    <td className="v" colSpan={3}>{p?.address || "\u2014"}</td>
                  </tr>
                  <tr>
                    <td className="l">Doctor</td>
                    <td className="v" colSpan={3}>Dr. {dn}{dr ? ` | Reg: ${dr}` : ""}</td>
                  </tr>
                  <tr>
                    <td className="l">Visit Date</td>
                    <td className="v">{vd}</td>
                    <td className="l">Case Number</td>
                    <td className="v">{cn}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Clinical Sections */}
        {sections.map(s => (
          <div key={s.t}>
            <div className="st">{s.t}</div>
            <div className="sc">{s.c}</div>
            {s.t === "Chief Complaint" && (c.chief_complaint_duration || c.chief_complaint_severity || c.chief_complaint_associated_symptoms) && (
              <div className="sc" style={{ color: "#6b7280", paddingTop: 0 }}>
                {c.chief_complaint_duration && <>Duration: {c.chief_complaint_duration}</>}
                {c.chief_complaint_duration && (c.chief_complaint_severity || c.chief_complaint_associated_symptoms) && <> &nbsp;|&nbsp; </>}
                {c.chief_complaint_severity && <>Severity: {c.chief_complaint_severity}</>}
                {(c.chief_complaint_duration || c.chief_complaint_severity) && c.chief_complaint_associated_symptoms && <> &nbsp;|&nbsp; </>}
                {c.chief_complaint_associated_symptoms && <>Associated: {c.chief_complaint_associated_symptoms}</>}
              </div>
            )}
          </div>
        ))}

        {/* Clinical Findings */}
        {chk(findings.length > 0, c.clinical_findings_summary) && (
          <div className="np">
            <div className="st">Clinical Findings Summary</div>
            {findings.length > 0 && (
              <table className="findings-table" style={{ marginTop: 3 }}>
                <thead>
                  <tr><th>Tooth</th><th>Finding</th><th>Surface</th><th>Remarks</th></tr>
                </thead>
                <tbody>
                  {findings.map((f: any, i: number) => (
                    <tr key={f.id || i}>
                      <td>{f.tooth_number || "\u2014"}</td>
                      <td>{f.finding_type || "\u2014"}</td>
                      <td>{sf(f)}</td>
                      <td>{rm(f)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {c.clinical_findings_summary && (
              <div className="sc" style={{ marginTop: findings.length > 0 ? 4 : 0 }}>
                {c.clinical_findings_summary}
              </div>
            )}
          </div>
        )}

        {/* Diagnosis */}
        {chk(c.provisional_diagnosis, c.final_diagnosis) && (
          <div className="np">
            <div className="st">Diagnosis</div>
            {c.provisional_diagnosis && (
              <div className="sc">
                <span style={{ fontWeight: 600, color: "#1E3A5F" }}>Provisional: </span>{c.provisional_diagnosis}
              </div>
            )}
            {c.final_diagnosis && (
              <div className="sc">
                <span style={{ fontWeight: 600, color: "#dc2626" }}>Final: </span>{c.final_diagnosis}
              </div>
            )}
          </div>
        )}

        {/* Treatment Plan */}
        {(() => {
          // Try to parse structured JSON data from initial_treatment_plan (new form)
          let items: any[] | null = null
          let isJson = false
          if (c.initial_treatment_plan && typeof c.initial_treatment_plan === "string" && c.initial_treatment_plan.startsWith("_JSON_")) {
            try {
              items = JSON.parse(c.initial_treatment_plan.slice(6))
              isJson = true
            } catch { items = null }
          }
          // Fall back to DB treatment_plans relationship
          if (!items || items.length === 0) {
            if (c.treatment_plans && c.treatment_plans.length > 0) {
              items = c.treatment_plans.map((tp: any) => ({
                name: tp.treatment_name || "\u2014",
                toothNumbers: [],
                estimatedVisits: tp.total_sittings || "",
                estimatedCost: tp.cost || "",
                remarks: tp.notes || "",
              }))
            }
          }
          if (!items || items.length === 0) return null

          // Compute summary
          const totalProcedures = items.length
          const allTeeth = new Set<string>()
          const totalVisits = items.reduce((s: number, it: any) => {
            const v = parseInt(it.estimatedVisits) || 0
            return s + v
          }, 0)
          const totalCost = items.reduce((s: number, it: any) => {
            const c = parseFloat(it.estimatedCost) || 0
            return s + c
          }, 0)
          items.forEach((it: any) => (it.toothNumbers || []).forEach((t: string) => allTeeth.add(t)))

          return (
            <div>
              <div className="st">Treatment Plan</div>
              <table className="tp-table" style={{ marginTop: 3 }}>
                <thead>
                  <tr>
                    <th style={{ width: "25%", textAlign: "left" }}>Procedure</th>
                    <th style={{ width: "15%" }}>Teeth</th>
                    <th style={{ width: "10%" }}>Visits</th>
                    <th style={{ width: "15%", textAlign: "right" }}>Est. Cost</th>
                    <th style={{ width: "20%", textAlign: "left" }}>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any, i: number) => (
                    <tr key={i} className="tp-row">
                      <td style={{ textAlign: "left", fontWeight: 600 }}>{it.name || "\u2014"}</td>
                      <td>{(it.toothNumbers && it.toothNumbers.length > 0) ? it.toothNumbers.join(", ") : "\u2014"}</td>
                      <td>{it.estimatedVisits || it.estimatedVisits === 0 ? String(it.estimatedVisits) : "-"}</td>
                      <td style={{ textAlign: "right" }}>{it.estimatedCost ? `\u20B9${Number(it.estimatedCost).toLocaleString("en-IN")}` : "-"}</td>
                      <td style={{ textAlign: "left", fontSize: 9, wordBreak: "break-word" }}>{it.remarks || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 6, padding: "4px 6px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", fontSize: 10, flexWrap: "wrap", gap: 4 }}>
                <span><span style={{ fontWeight: 600, color: "#1E3A5F" }}>Total Procedures:</span> {totalProcedures}</span>
                {allTeeth.size > 0 && <span><span style={{ fontWeight: 600, color: "#1E3A5F" }}>Teeth Involved:</span> {allTeeth.size}</span>}
                <span><span style={{ fontWeight: 600, color: "#1E3A5F" }}>Estimated Visits:</span> {totalVisits}</span>
                <span><span style={{ fontWeight: 600, color: "#1E3A5F" }}>Estimated Cost:</span> {"\u20B9"}{totalCost.toLocaleString("en-IN")}</span>
              </div>
            </div>
          )
        })()}

        {/* Medicines Prescribed */}
        {c.medicines_prescribed && (
          <div>
            <div className="st">Medicines Prescribed</div>
            <div className="sc">{c.medicines_prescribed}</div>
          </div>
        )}

        {/* Patient Instructions */}
        {c.patient_instructions && (
          <div>
            <div className="st">Patient Instructions</div>
            <div className="sc">{c.patient_instructions}</div>
          </div>
        )}

        {/* Follow-Up */}
        {chk(c.follow_up_instructions, c.next_review_date) && (
          <div>
            <div className="st">Follow-Up</div>
            {c.follow_up_instructions && <div className="sc">{c.follow_up_instructions}</div>}
            <div className="sc" style={{ paddingTop: c.follow_up_instructions ? 0 : 2 }}>
              {c.next_review_date && <span style={{ fontWeight: 600, color: "#1E3A5C" }}>Next Visit: {format(new Date(c.next_review_date), "dd MMM yyyy")}</span>}
              {c.next_review_date && <span> &nbsp;|&nbsp; </span>}
              <span style={{ fontWeight: 600, color: "#1E3A5C" }}>Doctor: Dr. {dn}</span>
            </div>
          </div>
        )}

        {/* Doctor Details */}
        <div className="np">
          <div className="st">Doctor Details</div>
          <div className="sc">
            <span>Dr. {dn}</span>
            {dq && <span> &nbsp;|&nbsp; <span style={{ fontWeight: 600, color: "#6b7280" }}>Qualification:</span> {dq}</span>}
            {ds && <span> &nbsp;|&nbsp; <span style={{ fontWeight: 600, color: "#6b7280" }}>Specialization:</span> {ds}</span>}
            {dr && <span> &nbsp;|&nbsp; <span style={{ fontWeight: 600, color: "#6b7280" }}>Reg No:</span> {dr}</span>}
            {dp && <span> &nbsp;|&nbsp; <span style={{ fontWeight: 600, color: "#6b7280" }}>Mobile:</span> {dp}</span>}
          </div>
        </div>

        {/* Consent + Signature */}
        <div className="np">
          <div className="st">Patient Consent & Signature</div>
          <div className="sc" style={{ fontStyle: "italic", color: "#6b7280", marginBottom: 2 }}>
            I acknowledge that I have been explained the diagnosis, treatment plan, risks, benefits, and alternatives. I consent to the proposed treatment.
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
            <tbody>
              <tr>
                <td style={{ width: "33%", textAlign: "center" }}>
                  <div className="sig-line" />
                  <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>Doctor Signature</div>
                </td>
                <td style={{ width: "33%", textAlign: "center" }}>
                  <div className="sig-line" />
                  <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>Patient Signature</div>
                </td>
                <td style={{ width: "33%", textAlign: "center" }}>
                  <div className="sig-line" />
                  <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>Hospital Seal</div>
                </td>
              </tr>
              <tr>
                <td style={{ width: "33%", textAlign: "center", paddingTop: 6 }}>
                  <div className="sig-line" />
                  <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>Date</div>
                </td>
                <td style={{ width: "33%", textAlign: "center", paddingTop: 6 }}>
                  <div className="sig-line" />
                  <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>Witness</div>
                </td>
                <td style={{ width: "33%", textAlign: "center", paddingTop: 6 }}>
                  <div className="sig-line" />
                  <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>Place</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="np" style={{ borderTop: "1px solid #e5e7eb", marginTop: 10, paddingTop: 6, textAlign: "center" }}>
          <div style={{ fontSize: 8, color: "#9ca3af", lineHeight: 1.6 }}>
            {hn && <div style={{ fontWeight: 600, color: "#6b7280" }}>{hn}</div>}
            <div>Confidential Medical Record</div>
            <div className="pn">
              <span className="plp">Page 1 of 1</span>
              <span className="pls" />
            </div>
            <div>Generated on: {gd}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
