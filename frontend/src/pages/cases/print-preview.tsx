import { useParams, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Loader2, Printer, ArrowLeft, Download } from "lucide-react"
import { format } from "date-fns"
import { casesApi } from "@/services/endpoints"
import { Button } from "@/components/ui/button"
import ProfessionalOdontogram from "@/components/toothchart/ProfessionalOdontogram"
import type { ToothFinding, ToothSurface, ToothCondition } from "@/components/toothchart/types"

const TYPE_TO_VISUAL: Record<string, ToothCondition> = {
  'Dental Caries': 'Decayed', 'Composite Filling': 'Restored',
  'Amalgam': 'Restored', 'RCT Completed': 'Restored',
  'RCT Required': 'Decayed', 'Calculus': 'Defective',
  'Crown': 'Restored', 'Bridge': 'Bridge', 'Implant': 'Implant',
  'Fracture': 'Defective', 'Mobility': 'Defective',
  'Tenderness': 'Decayed', 'Missing Tooth': 'Missing',
  'Root Stump': 'Defective', 'Impacted': 'Impacted',
  'Erupting': 'Erupt', 'Denture': 'Denture', 'Impaction': 'Impacted',
  'Decayed': 'Decayed', 'Restored': 'Restored',
  'Defective': 'Defective', 'Missing': 'Missing',
}

const CODE_TO_SURFACE: Record<string, ToothSurface> = {
  'M': 'Mesial', 'D': 'Distal', 'B': 'Buccal', 'L': 'Lingual',
  'O': 'Occlusal', 'I': 'Incisal', 'La': 'Labial',
}

function apiToFinding(api: any): ToothFinding {
  const surfaces = api.surface
    ? api.surface.split(',').map((s: string) => CODE_TO_SURFACE[s.trim()]).filter(Boolean) as ToothSurface[]
    : []
  return {
    id: api.id || `api-${Date.now()}`,
    toothNumber: parseInt(api.tooth_number) || 0,
    condition: TYPE_TO_VISUAL[api.finding_type] || 'Decayed',
    surfaces: surfaces.length > 0 ? surfaces : undefined,
    description: api.notes || undefined,
    date: (api.created_at || new Date().toISOString()).split('T')[0],
    findingType: api.finding_type,
    dentitionType: api.dentition_type || undefined,
    severity: api.severity || undefined,
  }
}

function surfaceDisplay(f: any): string {
  if (f.surface) return f.surface.replace(/,/g, ', ')
  if (f.notes) {
    const m = f.notes.match(/\[S:([^\]]+)\]/)
    if (m) return m[1]
  }
  return "—"
}

function remarkDisplay(f: any): string {
  if (f.notes) {
    let s = f.notes
    s = s.replace(/^\[S:[^\]]*\]\s*/g, "")
    s = s.replace(/^\[M:[^\]]*\]\s*/g, "")
    return s || "—"
  }
  return "—"
}

export default function CasePrintPreview() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data: c, isFetching } = useQuery({
    queryKey: ["case", id],
    queryFn: () => casesApi.get(id!),
    enabled: !!id,
  })

  if (isFetching) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }
  if (!c) {
    return <div className="py-20 text-center text-muted-foreground">Case history not found</div>
  }

  const findings = c.findings || []

  const handlePrint = () => window.print()

  const handleDownloadPdf = async () => {
    if (!id) return
    try {
      const blob = await casesApi.getPdfBlob(id!)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `case_history_${id!.slice(0, 8)}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      alert("PDF download failed: " + (err?.response?.data?.detail || err.message))
    }
  }

  const h = c.patient?.hospital
  const hospitalName = h?.name || "Hospital"
  const hospitalAddress = h?.address || ""
  const hospitalPhone = h?.phone || ""
  const hospitalEmail = h?.email || ""
  const hospitalRegNo = h?.registration_number || ""
  const hospitalGst = h?.gst_number || ""
  const logoUrl = h?.logo_url || ""

  const patient = c.patient
  const doctor = c.doctor

  const visitDate = c.appointment_date
    ? format(new Date(c.appointment_date), "dd MMM yyyy")
    : c.created_at
      ? format(new Date(c.created_at), "dd MMM yyyy")
      : "—"

  const doctorName = c.doctor_name || doctor?.full_name || "—"
  const doctorRegNo = c.doctor_registration_number || doctor?.license_number || ""
  const doctorSpec = c.doctor_specialization || doctor?.specialization || ""
  const doctorPhone = doctor?.phone || ""

  const caseNum = c.case_number || c.id.slice(0, 8).toUpperCase()

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Toolbar */}
      <div className="print:hidden sticky top-0 z-50 bg-white border-b shadow-sm px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/cases/${id}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <span className="text-sm font-medium text-muted-foreground">Print Preview</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:inline">Case #{caseNum}</span>
          <Button size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
            <Download className="h-4 w-4 mr-1" /> Download PDF
          </Button>
        </div>
      </div>

      {/* PRINT AREA */}
      <div
        id="print-area"
        className="max-w-[210mm] mx-auto bg-white shadow-lg my-4 print:shadow-none print:my-0"
        style={{ fontFamily: "'Inter', 'Roboto', system-ui, sans-serif" }}
      >
        <style>{`
          @page { size: A4; margin: 22mm 25mm; }
          @media print {
            html, body { font-family: 'Inter', 'Roboto', system-ui, sans-serif; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-break { page-break-inside: avoid; }
            .keep-with-next { page-break-after: avoid; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            thead { display: table-header-group; }
            tfoot { display: table-footer-group; }
            .no-print { display: none !important; }
          }
        `}</style>

        {/* ─── LETTERHEAD ─── */}
        <div className="no-break" style={{ padding: '0 8px' }}>
          {/* Logo + Hospital Info */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 0 }}>
            <div>
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 6 }} />
              ) : (
                <div style={{ width: 72, height: 72, background: '#f3f4f6', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 10 }}>Logo</div>
              )}
            </div>
            <div style={{ textAlign: 'right', flex: 1, marginLeft: 20 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1B3A5C', lineHeight: 1.2 }}>{hospitalName}</div>
              {hospitalAddress && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, lineHeight: 1.5 }}>{hospitalAddress}</div>}
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, lineHeight: 1.5 }}>
                {[hospitalPhone && `Tel: ${hospitalPhone}`, hospitalEmail && hospitalEmail].filter(Boolean).join(" | ")}
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1, lineHeight: 1.5 }}>
                {[hospitalRegNo && `Reg: ${hospitalRegNo}`, hospitalGst && `GST: ${hospitalGst}`].filter(Boolean).join(" | ")}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: '3px solid #1B3A5C', margin: '14px 0 0' }} />
          <div style={{ borderTop: '1px solid #e5e7eb', margin: '2px 0 14px' }} />

          {/* Title */}
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1B3A5C', textAlign: 'center', margin: 0, lineHeight: 1.3, letterSpacing: '0.02em' }}>
            DENTAL CASE HISTORY REPORT
          </h1>

          {/* Case Info Line */}
          <div style={{ textAlign: 'center', fontSize: 10.5, color: '#6b7280', marginTop: 8, lineHeight: 1.6 }}>
            Case #: {caseNum} &nbsp;|&nbsp; Visit Date: {visitDate} &nbsp;|&nbsp; Doctor: Dr. {doctorName} &nbsp;|&nbsp; Hospital: {hospitalName}
          </div>
          <div style={{ borderTop: '1px solid #e5e7eb', margin: '10px 0 14px' }} />
        </div>

        {/* ─── PATIENT INFORMATION ─── */}
        <div className="no-break keep-with-next" style={{ padding: '0 8px' }}>
          <div className="section-title">PATIENT INFORMATION</div>
          <div style={{ border: '1px solid #e5e7eb', borderTop: 'none', padding: '12px 16px' }}>
            <div className="info-grid-2col">
              <div className="info-row">
                <span className="info-label">Patient Name :</span>
                <span className="info-value">{patient?.full_name || c.patient_name || "—"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">OP Number :</span>
                <span className="info-value">{patient?.op_no || "—"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">ABHA ID :</span>
                <span className="info-value">{patient?.abha_id || "—"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Age :</span>
                <span className="info-value">{patient?.age ? `${patient.age} Years` : "—"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Gender :</span>
                <span className="info-value">{patient?.gender || "—"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Date of Birth :</span>
                <span className="info-value">{patient?.date_of_birth ? format(new Date(patient.date_of_birth), "dd MMM yyyy") : "—"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Mobile :</span>
                <span className="info-value">{patient?.phone || "—"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Email :</span>
                <span className="info-value">{patient?.email || "—"}</span>
              </div>
              <div className="info-row info-row-full">
                <span className="info-label">Address :</span>
                <span className="info-value">{patient?.address || "—"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Emergency Contact :</span>
                <span className="info-value">{patient?.emergency_contact || "—"}</span>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #e5e7eb', margin: '8px 0', paddingTop: 8 }}>
              <div className="info-row info-row-full" style={{ marginBottom: 4 }}>
                <span className="info-label">Doctor :</span>
                <span className="info-value">
                  Dr. {doctorName}
                  {doctorRegNo ? ` | Reg: ${doctorRegNo}` : ""}
                  {doctorSpec ? ` | ${doctorSpec}` : ""}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Visit Date :</span>
                <span className="info-value">{visitDate}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── CLINICAL DETAILS SECTIONS ─── */}
        {[
          { title: "Chief Complaint", content: c.chief_complaint, extra: (
            (c.chief_complaint_duration || c.chief_complaint_severity || c.chief_complaint_associated_symptoms) ? (
              <div style={{ fontSize: 10.5, color: '#6b7280', lineHeight: 1.5, padding: '0 0 6px' }}>
                {c.chief_complaint_duration && <>Duration: {c.chief_complaint_duration} | </>}
                {c.chief_complaint_severity && <>Severity: {c.chief_complaint_severity} | </>}
                {c.chief_complaint_associated_symptoms && <>Associated Symptoms: {c.chief_complaint_associated_symptoms}</>}
              </div>
            ) : null
          )},
          { title: "History of Present Illness", content: c.hpi },
          { title: "Medical History", content: c.medical_history },
          { title: "Dental History", content: c.dental_history },
          { title: "Personal History", content: c.personal_history },
          { title: "Family History", content: c.family_history },
          { title: "Extra Oral Examination", content: c.extra_oral_examination },
          { title: "Intra Oral Examination", content: c.intra_oral_examination },
          { title: "Periodontal Examination", content: c.periodontal_examination },
          { title: "Investigations", content: c.investigations },
        ].map((sec) =>
          sec.content ? (
            <div key={sec.title} className="no-break" style={{ padding: '0 8px', marginTop: 14 }}>
              <div className="section-title">{sec.title.toUpperCase()}</div>
              <div style={{ border: '1px solid #e5e7eb', borderTop: 'none', padding: '10px 16px' }}>
                <div style={{ fontSize: 11, lineHeight: 1.6, color: '#1f2937', whiteSpace: 'pre-wrap' }}>{sec.content}</div>
                {sec.extra}
              </div>
            </div>
          ) : null
        )}

        {/* ─── CLINICAL FINDINGS ─── */}
        {(findings.length > 0 || c.clinical_findings_summary) && (
          <div style={{ padding: '0 8px', marginTop: 14 }}>
            <div className="section-title keep-with-next">CLINICAL FINDINGS</div>
            <div style={{ border: '1px solid #e5e7eb', borderTop: 'none' }}>
              {findings.length > 0 && (
                <div className="no-break" style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1B3A5C', marginBottom: 10 }}>Tooth Chart</div>
                  <ProfessionalOdontogram
                    findings={(findings || []).map(apiToFinding)}
                    onFindingsChange={() => {}}
                    readonly
                    patientDateOfBirth={c?.patient?.date_of_birth ?? undefined}
                  />
                </div>
              )}

              {findings.length > 0 && (
                <div className="no-break" style={{ padding: '0 16px 14px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1B3A5C', marginBottom: 8 }}>Clinical Findings Summary</div>
                  <table className="findings-table">
                    <thead>
                      <tr>
                        <th>Tooth</th>
                        <th>Finding</th>
                        <th>Surface</th>
                        <th>Severity</th>
                        <th>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {findings.map((f: any, i: number) => (
                        <tr key={f.id || i}>
                          <td style={{ fontWeight: 600, textAlign: 'center' }}>{f.tooth_number || "—"}</td>
                          <td>{f.finding_type || "—"}</td>
                          <td>{surfaceDisplay(f)}</td>
                          <td>{f.severity || "—"}</td>
                          <td>{remarkDisplay(f)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {c.clinical_findings_summary && (
                <div style={{ padding: '0 16px 14px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1B3A5C', marginBottom: 4 }}>Summary Notes</div>
                  <div style={{ fontSize: 11, lineHeight: 1.6, color: '#1f2937', whiteSpace: 'pre-wrap' }}>{c.clinical_findings_summary}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── DIAGNOSIS ─── */}
        {(c.provisional_diagnosis || c.final_diagnosis) && (
          <div style={{ padding: '0 8px', marginTop: 14 }}>
            <div className="section-title keep-with-next">DIAGNOSIS</div>
            <div style={{ border: '1px solid #e5e7eb', borderTop: 'none' }}>
              {c.provisional_diagnosis && (
                <div className="no-break" style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1B3A5C', marginBottom: 4 }}>Provisional Diagnosis</div>
                  <div style={{ fontSize: 11, lineHeight: 1.6, color: '#1f2937', whiteSpace: 'pre-wrap' }}>{c.provisional_diagnosis}</div>
                </div>
              )}
              {c.final_diagnosis && (
                <div className="no-break" style={{ margin: '0 12px 12px', border: '1.5px solid #dc2626', background: '#fef2f2', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 12px' }}>FINAL DIAGNOSIS</div>
                  <div style={{ padding: '10px 12px', fontSize: 11, color: '#991b1b', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{c.final_diagnosis}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TREATMENT PLAN ─── */}
        {(c.treatment_plans && c.treatment_plans.length > 0) && (
          <div className="no-break" style={{ padding: '0 8px', marginTop: 14 }}>
            <div className="section-title">TREATMENT PLAN</div>
            <div style={{ border: '1px solid #e5e7eb', borderTop: 'none', padding: '12px 16px' }}>
              <table className="findings-table">
                <thead>
                  <tr>
                    <th>Procedure</th>
                    <th>Visits</th>
                    <th>Priority</th>
                    <th>Est. Cost</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {c.treatment_plans.map((tp: any, i: number) => (
                    <tr key={tp.id || i}>
                      <td style={{ fontWeight: 600 }}>{tp.treatment_name || "—"}</td>
                      <td style={{ textAlign: 'center' }}>{tp.total_sittings || "-"}</td>
                      <td style={{ textAlign: 'center' }}>{tp.status || "-"}</td>
                      <td style={{ textAlign: 'right' }}>{tp.cost ? `₹${Number(tp.cost).toLocaleString("en-IN")}` : "-"}</td>
                      <td>{tp.notes || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(c.treatment_plan_estimated_visits || c.treatment_plan_estimated_cost) && (
                <div style={{ display: 'flex', gap: 24, fontSize: 11, color: '#374151', marginTop: 8 }}>
                  {c.treatment_plan_estimated_visits && <div><span style={{ fontWeight: 600, color: '#6b7280' }}>Estimated Visits:</span> {c.treatment_plan_estimated_visits}</div>}
                  {c.treatment_plan_estimated_cost && <div><span style={{ fontWeight: 600, color: '#6b7280' }}>Estimated Cost:</span> ₹{Number(c.treatment_plan_estimated_cost).toLocaleString("en-IN")}</div>}
                </div>
              )}
            </div>
          </div>
        )}

        {c.initial_treatment_plan && (
          <div className="no-break" style={{ padding: '0 8px', marginTop: 14 }}>
            <div className="section-title">TREATMENT NOTES</div>
            <div style={{ border: '1px solid #e5e7eb', borderTop: 'none', padding: '10px 16px' }}>
              <div style={{ fontSize: 11, lineHeight: 1.6, color: '#1f2937', whiteSpace: 'pre-wrap' }}>{c.initial_treatment_plan}</div>
            </div>
          </div>
        )}

        {/* ─── MEDICINES PRESCRIBED ─── */}
        {c.medicines_prescribed && (
          <div className="no-break" style={{ padding: '0 8px', marginTop: 14 }}>
            <div className="section-title">MEDICINES PRESCRIBED</div>
            <div style={{ border: '1px solid #e5e7eb', borderTop: 'none', padding: '10px 16px' }}>
              <div style={{ fontSize: 11, lineHeight: 1.6, color: '#1f2937', whiteSpace: 'pre-wrap' }}>{c.medicines_prescribed}</div>
            </div>
          </div>
        )}

        {/* ─── PATIENT INSTRUCTIONS ─── */}
        {c.patient_instructions && (
          <div className="no-break" style={{ padding: '0 8px', marginTop: 14 }}>
            <div className="section-title">PATIENT INSTRUCTIONS</div>
            <div style={{ border: '1px solid #e5e7eb', borderTop: 'none', padding: '10px 16px' }}>
              <div style={{ fontSize: 11, lineHeight: 1.6, color: '#1f2937', whiteSpace: 'pre-wrap' }}>{c.patient_instructions}</div>
            </div>
          </div>
        )}

        {/* ─── FOLLOW-UP ─── */}
        {(c.follow_up_instructions || c.next_review_date) && (
          <div className="no-break" style={{ padding: '0 8px', marginTop: 14 }}>
            <div className="section-title">FOLLOW-UP</div>
            <div style={{ border: '1px solid #e5e7eb', borderTop: 'none', padding: '12px 16px' }}>
              {c.follow_up_instructions && (
                <div style={{ fontSize: 11, lineHeight: 1.6, color: '#1f2937', whiteSpace: 'pre-wrap', marginBottom: 10 }}>{c.follow_up_instructions}</div>
              )}
              <div className="info-grid-2col">
                {c.next_review_date && (
                  <div className="info-row">
                    <span className="info-label">Next Visit :</span>
                    <span className="info-value" style={{ fontWeight: 600, color: '#1B3A5C' }}>
                      {format(new Date(c.next_review_date), "dd MMM yyyy")}
                    </span>
                  </div>
                )}
                <div className="info-row">
                  <span className="info-label">Doctor :</span>
                  <span className="info-value">Dr. {doctorName}</span>
                </div>
                <div className="info-row info-row-full">
                  <span className="info-label">Hospital :</span>
                  <span className="info-value">
                    {[hospitalName, hospitalPhone, hospitalEmail].filter(Boolean).join(" | ")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── DOCTOR DETAILS ─── */}
        <div className="no-break" style={{ padding: '0 8px', marginTop: 14 }}>
          <div className="section-title">DOCTOR DETAILS</div>
          <div style={{ border: '1px solid #e5e7eb', borderTop: 'none', padding: '12px 16px' }}>
            <div className="info-grid-2col">
              <div className="info-row">
                <span className="info-label">Doctor Name :</span>
                <span className="info-value">Dr. {doctorName}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Qualification :</span>
                <span className="info-value">{doctorSpec || doctor?.specialization || "—"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Specialization :</span>
                <span className="info-value">{doctorSpec || "—"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Registration No :</span>
                <span className="info-value">{doctorRegNo || "—"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Mobile :</span>
                <span className="info-value">{doctorPhone || "—"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Hospital :</span>
                <span className="info-value">{hospitalName}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── SIGNATURE ─── */}
        <div className="no-break" style={{ padding: '0 8px', marginTop: 18 }}>
          <div className="section-title">SIGNATURE</div>
          <div style={{ border: '1px solid #e5e7eb', borderTop: 'none', padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, marginBottom: 20, fontStyle: 'italic' }}>
              I acknowledge that I have been explained the diagnosis, treatment plan, risks, benefits, and alternatives. I consent to the proposed treatment.
            </div>

            {/* Signature lines */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              {["Doctor Signature", "Patient Signature", "Hospital Seal"].map((label) => (
                <div key={label} style={{ textAlign: 'center', width: '30%' }}>
                  <div className="sig-line" />
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>{label}</div>
                  {label === "Hospital Seal" && (
                    <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>{hospitalName}</div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {["Date", "Witness", "Place"].map((label) => (
                <div key={label} style={{ textAlign: 'center', width: '30%' }}>
                  <div className="sig-line" />
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── FOOTER ─── */}
        <div style={{ padding: '16px 8px 0' }}>
          <div style={{ borderTop: '1px solid #e5e7eb', marginBottom: 6 }} />
          <div style={{ fontSize: 9, color: '#9ca3af', lineHeight: 1.5, textAlign: 'center' }}>
            This is a confidential medical record intended only for the patient.
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#9ca3af', marginTop: 4 }}>
            <span>{hospitalName}</span>
            <span>Page {'{page}'} of {'{pages}'}</span>
          </div>
        </div>

        {/* Padding at bottom for print */}
        <div style={{ height: 20 }} />
      </div>

      {/* ─── GLOBAL STYLES ─── */}
      <style>{`
        .section-title {
          background: #1B3A5C;
          color: #fff;
          font-size: 14px;
          font-weight: 700;
          padding: 6px 16px;
          letter-spacing: 0.02em;
          line-height: 1.5;
        }
        .info-grid-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px 20px;
        }
        .info-row {
          display: flex;
          align-items: baseline;
          gap: 6px;
          line-height: 1.6;
        }
        .info-row .info-label {
          font-size: 11px;
          font-weight: 600;
          color: #6b7280;
          white-space: nowrap;
          min-width: 120px;
        }
        .info-row .info-value {
          font-size: 11px;
          font-weight: 400;
          color: #1f2937;
        }
        .info-row-full {
          grid-column: 1 / -1;
        }
        .info-row-full .info-label {
          min-width: 120px;
        }
        .findings-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 10.5px;
          line-height: 1.5;
        }
        .findings-table th {
          background: #1B3A5C;
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          padding: 7px 10px;
          border: 1px solid #d1d5db;
          text-align: left;
        }
        .findings-table td {
          padding: 5px 10px;
          border: 1px solid #d1d5db;
          vertical-align: top;
        }
        .findings-table tr:nth-child(even) {
          background: #f9fafb;
        }
        .sig-line {
          border-bottom: 1px solid #9ca3af;
          width: 100%;
          height: 0;
          margin-bottom: 4px;
        }
        @media print {
          .section-title {
            background: #1B3A5C !important;
            color: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .findings-table th {
            background: #1B3A5C !important;
            color: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .findings-table tr:nth-child(even) {
            background: #f9fafb !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  )
}
