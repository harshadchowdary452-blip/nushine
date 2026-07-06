import { useParams, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Loader2, Printer, Download, ArrowLeft } from "lucide-react"
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
  // backward compat: old records had surfaces encoded in notes as [S:M,O,D]
  if (f.notes) {
    const m = f.notes.match(/\[S:([^\]]+)\]/)
    if (m) return m[1]
  }
  return "—"
}

function remarkDisplay(f: any): string {
  if (f.notes) {
    // backward compat: strip old [S:...] / [M:...] encoding
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
      const blob = await casesApi.getPdfBlob(id)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `case_history_${id.slice(0, 8)}.pdf`
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

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="print:hidden sticky top-0 z-50 bg-white border-b shadow-sm px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/cases/${id}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <span className="text-sm font-medium text-muted-foreground">Print Preview</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:inline">Case #{c.case_number || c.id.slice(0, 8)}</span>
          <Button size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
            <Download className="h-4 w-4 mr-1" /> Download PDF
          </Button>
        </div>
      </div>

      <div className="max-w-[210mm] mx-auto bg-white shadow-lg my-4 print:shadow-none print:my-0" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
        <style>{`
          @page { size: A4; margin: 20mm; }
          @media print {
            html, body { font-family: Inter, system-ui, sans-serif; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-break { page-break-inside: avoid; }
            .keep-with-next { page-break-after: avoid; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            thead { display: table-header-group; }
            tfoot { display: table-footer-group; }
            .print-hide { display: none; }
          }
          .sec-title {
            background: #294184; color: #fff; font-size: 16px; font-weight: 700;
            padding: 8px 20px; letter-spacing: 0.02em; line-height: 1.5;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px 24px;
            padding: 16px 20px;
          }
          .info-row {
            display: flex;
            align-items: baseline;
            gap: 8px;
            line-height: 1.5;
          }
          .info-row .label {
            font-size: 11px; font-weight: 600; color: #6b7280;
            white-space: nowrap; min-width: 120px;
          }
          .info-row .value {
            font-size: 11px; font-weight: 400; color: #1f2937;
          }
          .info-row-full {
            grid-column: 1 / -1;
          }
          .content-box {
            padding: 12px 20px;
            font-size: 11px; line-height: 1.6; color: #1f2937;
            white-space: pre-wrap;
          }
          .data-table {
            width: 100%; border-collapse: collapse;
            font-size: 10.5px; line-height: 1.5;
          }
          .data-table th {
            background: #294184; color: #fff; font-size: 11px; font-weight: 700;
            padding: 8px 10px; border: 1px solid #d1d5db; text-align: left;
          }
          .data-table td {
            padding: 6px 10px; border: 1px solid #d1d5db; vertical-align: top;
          }
          .data-table tr:nth-child(even) { background: #f9fafb; }
          .sig-line {
            border-bottom: 1px solid #9ca3af; width: 180px; height: 0;
            margin-bottom: 4px;
          }
        `}</style>

        {/* ── PRINT-ONLY HEADER (repeated on each page) ── */}
        <table className="print-hide" style={{ display: 'none' }} />

        {/* ── LETTERHEAD ── */}
        <div className="no-break" style={{ padding: '28px 28px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" style={{ width: 80, height: 80, objectFit: 'contain' }} />
              ) : (
                <div style={{ width: 80, height: 80, background: '#f3f4f6', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 10 }}>Logo</div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#294184', lineHeight: 1.2 }}>{hospitalName}</div>
              {hospitalAddress && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, lineHeight: 1.5 }}>{hospitalAddress}</div>}
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, lineHeight: 1.5 }}>
                {[hospitalPhone && `Tel: ${hospitalPhone}`, hospitalEmail && hospitalEmail].filter(Boolean).join(" | ")}
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, lineHeight: 1.5 }}>
                {[hospitalRegNo && `Reg: ${hospitalRegNo}`, hospitalGst && `GST: ${hospitalGst}`].filter(Boolean).join(" | ")}
              </div>
            </div>
          </div>
          <hr style={{ border: 'none', borderTop: '3px solid #294184', margin: '16px 0 14px' }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#294184', textAlign: 'center', margin: 0, lineHeight: 1.3 }}>DENTAL CASE HISTORY REPORT</h1>
          <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '14px 0 18px' }} />
        </div>

        {/* ── PATIENT INFORMATION ── */}
        <div className="no-break keep-with-next" style={{ padding: '0 28px' }}>
          <div className="sec-title">PATIENT INFORMATION</div>
          <div style={{ border: '1px solid #e5e7eb', borderTop: 'none' }}>
            <div className="info-grid">
              <div className="info-row">
                <span className="label">Patient Name :</span>
                <span className="value">{c.patient?.full_name || c.patient_name || "—"}</span>
              </div>
              <div className="info-row">
                <span className="label">OP Number :</span>
                <span className="value">{c.patient?.op_no || "—"}</span>
              </div>
              <div className="info-row">
                <span className="label">Age :</span>
                <span className="value">{c.patient?.age ? `${c.patient.age} Years` : "—"}</span>
              </div>
              <div className="info-row">
                <span className="label">Gender :</span>
                <span className="value">{c.patient?.gender || "—"}</span>
              </div>
              <div className="info-row">
                <span className="label">Date of Birth :</span>
                <span className="value">{c.patient?.date_of_birth ? format(new Date(c.patient.date_of_birth), "dd MMM yyyy") : "—"}</span>
              </div>
              <div className="info-row">
                <span className="label">ABHA ID :</span>
                <span className="value">{c.patient?.abha_id || "—"}</span>
              </div>
              <div className="info-row">
                <span className="label">Mobile :</span>
                <span className="value">{c.patient?.phone || "—"}</span>
              </div>
              <div className="info-row">
                <span className="label">Email :</span>
                <span className="value">{c.patient?.email || "—"}</span>
              </div>
              <div className="info-row info-row-full">
                <span className="label">Address :</span>
                <span className="value">{c.patient?.address || "—"}</span>
              </div>
              <div className="info-row info-row-full" style={{ borderTop: '1px solid #f3f4f6', paddingTop: 10, marginTop: 4 }}>
                <span className="label">Doctor :</span>
                <span className="value">Dr. {c.doctor_name || c.doctor?.full_name || "—"} {c.doctor_specialization || c.doctor?.specialization ? <>| {c.doctor_specialization || c.doctor?.specialization}</> : ""} {c.doctor_registration_number || c.doctor?.license_number ? <>| Reg: {c.doctor_registration_number || c.doctor?.license_number}</> : ""}</span>
              </div>
              <div className="info-row">
                <span className="label">Visit Date :</span>
                <span className="value">{c.appointment_date ? format(new Date(c.appointment_date), "dd MMM yyyy") : c.created_at ? format(new Date(c.created_at), "dd MMM yyyy") : "—"}</span>
              </div>
              <div className="info-row">
                <span className="label">Emergency Contact :</span>
                <span className="value">{c.patient?.emergency_contact || "—"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── CHIEF COMPLAINT ── */}
        {c.chief_complaint && (
          <div className="no-break" style={{ padding: '0 28px', marginTop: 18 }}>
            <div className="sec-title">Chief Complaint</div>
            <div style={{ border: '1px solid #e5e7eb', borderTop: 'none' }}>
              <div className="content-box">{c.chief_complaint}</div>
              {(c.chief_complaint_duration || c.chief_complaint_severity || c.chief_complaint_associated_symptoms) && (
                <div style={{ padding: '0 20px 10px', fontSize: 10.5, color: '#6b7280', lineHeight: 1.5 }}>
                  {c.chief_complaint_duration && <>Duration: {c.chief_complaint_duration} | </>}
                  {c.chief_complaint_severity && <>Severity: {c.chief_complaint_severity} | </>}
                  {c.chief_complaint_associated_symptoms && <>Associated Symptoms: {c.chief_complaint_associated_symptoms}</>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── HISTORY OF PRESENT ILLNESS ── */}
        {c.hpi && (
          <div className="no-break" style={{ padding: '0 28px', marginTop: 18 }}>
            <div className="sec-title">History of Present Illness</div>
            <div style={{ border: '1px solid #e5e7eb', borderTop: 'none' }}>
              <div className="content-box">{c.hpi}</div>
            </div>
          </div>
        )}

        {/* ── MEDICAL HISTORY ── */}
        {c.medical_history && (
          <div className="no-break" style={{ padding: '0 28px', marginTop: 18 }}>
            <div className="sec-title">Medical History</div>
            <div style={{ border: '1px solid #e5e7eb', borderTop: 'none' }}>
              <div className="content-box">{c.medical_history}</div>
            </div>
          </div>
        )}

        {/* ── DENTAL HISTORY ── */}
        {c.dental_history && (
          <div className="no-break" style={{ padding: '0 28px', marginTop: 18 }}>
            <div className="sec-title">Dental History</div>
            <div style={{ border: '1px solid #e5e7eb', borderTop: 'none' }}>
              <div className="content-box">{c.dental_history}</div>
            </div>
          </div>
        )}

        {/* ── CLINICAL FINDINGS (TOOTH CHART) ── */}
        {(findings.length > 0 || c.clinical_findings_summary || c.extra_oral_examination || c.intra_oral_examination || c.periodontal_examination || c.notes) && (
          <div style={{ padding: '0 28px', marginTop: 18 }}>
            <div className="sec-title keep-with-next">Clinical Findings</div>
            <div style={{ border: '1px solid #e5e7eb', borderTop: 'none' }}>
              {c.extra_oral_examination && (
                <div style={{ padding: '0 20px', marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#294184', marginBottom: 4 }}>Extra Oral Examination</div>
                  <div className="content-box" style={{ padding: '0 0 10px' }}>{c.extra_oral_examination}</div>
                </div>
              )}
              {c.intra_oral_examination && (
                <div style={{ padding: '0 20px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#294184', marginBottom: 4 }}>Intra Oral Examination</div>
                  <div className="content-box" style={{ padding: '0 0 10px' }}>{c.intra_oral_examination}</div>
                </div>
              )}
              {c.periodontal_examination && (
                <div style={{ padding: '0 20px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#294184', marginBottom: 4 }}>Periodontal Examination</div>
                  <div className="content-box" style={{ padding: '0 0 10px' }}>{c.periodontal_examination}</div>
                </div>
              )}
              {c.notes && (
                <div style={{ padding: '0 20px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#294184', marginBottom: 4 }}>Clinical Notes</div>
                  <div className="content-box" style={{ padding: '0 0 10px' }}>{c.notes}</div>
                </div>
              )}
              {findings.length > 0 && (
                <div className="no-break" style={{ padding: '0 20px 14px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#294184', marginBottom: 8 }}>Tooth Chart</div>
                  <ProfessionalOdontogram
                    findings={(findings || []).map(apiToFinding)}
                    onFindingsChange={() => {}}
                    readonly
                    patientDateOfBirth={c?.patient?.date_of_birth ?? undefined}
                  />
                </div>
              )}
              {findings.length > 0 && (
                <div className="no-break" style={{ padding: '0 20px 14px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#294184', marginBottom: 8 }}>Clinical Findings Summary</div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: '14%' }}>Tooth</th>
                        <th style={{ width: '26%' }}>Finding</th>
                        <th style={{ width: '18%' }}>Surface</th>
                        <th style={{ width: '18%' }}>Severity</th>
                        <th style={{ width: '24%' }}>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {findings.map((f: any, i: number) => (
                        <tr key={f.id || i}>
                          <td style={{ fontWeight: 600 }}>{f.tooth_number || "—"}</td>
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
                <div style={{ padding: '0 20px 14px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#294184', marginBottom: 4 }}>Summary Notes</div>
                  <div className="content-box" style={{ padding: '0 0 10px' }}>{c.clinical_findings_summary}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── INVESTIGATIONS ── */}
        {c.investigations && (
          <div className="no-break" style={{ padding: '0 28px', marginTop: 18 }}>
            <div className="sec-title">Investigations</div>
            <div style={{ border: '1px solid #e5e7eb', borderTop: 'none' }}>
              <div className="content-box">{c.investigations}</div>
            </div>
          </div>
        )}

        {/* ── DIAGNOSIS ── */}
        {(c.provisional_diagnosis || c.final_diagnosis || c.diagnosis) && (
          <div style={{ padding: '0 28px', marginTop: 18 }}>
            <div className="sec-title keep-with-next">Diagnosis</div>
            <div style={{ border: '1px solid #e5e7eb', borderTop: 'none' }}>
              {c.provisional_diagnosis && (
                <div style={{ padding: '12px 20px 0' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#294184', marginBottom: 4 }}>Provisional Diagnosis</div>
                  <div className="content-box" style={{ padding: '0 0 10px' }}>{c.provisional_diagnosis}</div>
                </div>
              )}
              {c.final_diagnosis && (
                <div className="no-break" style={{ padding: '10px 20px', margin: '0 20px 12px', border: '1px solid #fca5a5', background: '#fef2f2', borderRadius: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>FINAL DIAGNOSIS</div>
                  <div style={{ fontSize: 11, color: '#991b1b', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{c.final_diagnosis}</div>
                </div>
              )}
              {c.diagnosis && !c.final_diagnosis && (
                <div style={{ padding: '12px 20px' }}>
                  <div className="content-box" style={{ padding: 0 }}>{c.diagnosis}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TREATMENT PLAN ── */}
        {(c.initial_treatment_plan || c.treatment_plan_estimated_visits || c.treatment_plan_estimated_cost) && (
          <div className="no-break" style={{ padding: '0 28px', marginTop: 18 }}>
            <div className="sec-title">Treatment Plan</div>
            <div style={{ border: '1px solid #e5e7eb', borderTop: 'none' }}>
              <div style={{ padding: '12px 20px' }}>
                {c.initial_treatment_plan && (
                  <div style={{ fontSize: 11, lineHeight: 1.6, color: '#1f2937', whiteSpace: 'pre-wrap', marginBottom: 12 }}>{c.initial_treatment_plan}</div>
                )}
                {(c.treatment_plan_estimated_visits || c.treatment_plan_estimated_cost) && (
                  <div style={{ display: 'flex', gap: 24, fontSize: 11, color: '#374151' }}>
                    {c.treatment_plan_estimated_visits && <div><span style={{ fontWeight: 600, color: '#6b7280' }}>Estimated Visits:</span> {c.treatment_plan_estimated_visits}</div>}
                    {c.treatment_plan_estimated_cost && <div><span style={{ fontWeight: 600, color: '#6b7280' }}>Estimated Cost:</span> ₹{Number(c.treatment_plan_estimated_cost).toLocaleString("en-IN")}</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── MEDICINES ── */}
        {c.medicines_prescribed && (
          <div className="no-break" style={{ padding: '0 28px', marginTop: 18 }}>
            <div className="sec-title">Medicines Prescribed</div>
            <div style={{ border: '1px solid #e5e7eb', borderTop: 'none' }}>
              <div className="content-box">{c.medicines_prescribed}</div>
            </div>
          </div>
        )}

        {/* ── PATIENT INSTRUCTIONS ── */}
        {c.patient_instructions && (
          <div className="no-break" style={{ padding: '0 28px', marginTop: 18 }}>
            <div className="sec-title">Patient Instructions</div>
            <div style={{ border: '1px solid #e5e7eb', borderTop: 'none' }}>
              <div className="content-box">{c.patient_instructions}</div>
            </div>
          </div>
        )}

        {/* ── FOLLOW-UP ── */}
        {(c.follow_up_instructions || c.next_review_date) && (
          <div className="no-break" style={{ padding: '0 28px', marginTop: 18 }}>
            <div className="sec-title">Follow-Up</div>
            <div style={{ border: '1px solid #e5e7eb', borderTop: 'none' }}>
              <div style={{ padding: '12px 20px' }}>
                {c.follow_up_instructions && <div style={{ fontSize: 11, lineHeight: 1.6, color: '#1f2937', whiteSpace: 'pre-wrap', marginBottom: 8 }}>{c.follow_up_instructions}</div>}
                {c.next_review_date && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb' }}>
                    Next Review Date: {format(new Date(c.next_review_date), "dd MMM yyyy")}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── PERSONAL HISTORY ── */}
        {c.personal_history && (
          <div className="no-break" style={{ padding: '0 28px', marginTop: 18 }}>
            <div className="sec-title">Personal History</div>
            <div style={{ border: '1px solid #e5e7eb', borderTop: 'none' }}>
              <div className="content-box">{c.personal_history}</div>
            </div>
          </div>
        )}

        {/* ── FAMILY HISTORY ── */}
        {c.family_history && (
          <div className="no-break" style={{ padding: '0 28px', marginTop: 18 }}>
            <div className="sec-title">Family History</div>
            <div style={{ border: '1px solid #e5e7eb', borderTop: 'none' }}>
              <div className="content-box">{c.family_history}</div>
            </div>
          </div>
        )}

        {/* ── DOCTOR DETAILS ── */}
        <div className="no-break" style={{ padding: '0 28px', marginTop: 18 }}>
          <div className="sec-title">Doctor Details</div>
          <div style={{ border: '1px solid #e5e7eb', borderTop: 'none' }}>
            <div className="info-grid">
              <div className="info-row">
                <span className="label">Doctor Name :</span>
                <span className="value">Dr. {c.doctor_name || c.doctor?.full_name || "—"}</span>
              </div>
              <div className="info-row">
                <span className="label">Qualification :</span>
                <span className="value">{c.doctor?.specialization || c.doctor_specialization || "—"}</span>
              </div>
              <div className="info-row">
                <span className="label">Specialization :</span>
                <span className="value">{c.doctor_specialization || c.doctor?.specialization || "—"}</span>
              </div>
              <div className="info-row">
                <span className="label">Registration No :</span>
                <span className="value">{c.doctor_registration_number || c.doctor?.license_number || "—"}</span>
              </div>
              <div className="info-row">
                <span className="label">Mobile :</span>
                <span className="value">{c.doctor?.phone || "—"}</span>
              </div>
              <div className="info-row">
                <span className="label">Hospital :</span>
                <span className="value">{hospitalName}</span>
              </div>
              <div className="info-row info-row-full" style={{ borderTop: '1px solid #f3f4f6', paddingTop: 10, marginTop: 4 }}>
                <span className="label">Visit Date :</span>
                <span className="value">{c.appointment_date ? format(new Date(c.appointment_date), "dd MMM yyyy") : c.created_at ? format(new Date(c.created_at), "dd MMM yyyy") : "—"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── AUDIT INFO ── */}
        <div className="no-break" style={{ padding: '0 28px', marginTop: 18 }}>
          <div className="sec-title">Audit Information</div>
          <div style={{ border: '1px solid #e5e7eb', borderTop: 'none' }}>
            <div className="info-grid">
              <div className="info-row">
                <span className="label">Created By :</span>
                <span className="value">{c.created_by?.full_name || "—"}</span>
              </div>
              <div className="info-row">
                <span className="label">Updated By :</span>
                <span className="value">{c.updated_by?.full_name || "—"}</span>
              </div>
              <div className="info-row">
                <span className="label">Created :</span>
                <span className="value">{c.created_at ? format(new Date(c.created_at), "dd MMM yyyy hh:mm a") : "—"}</span>
              </div>
              <div className="info-row">
                <span className="label">Updated :</span>
                <span className="value">{c.updated_at ? format(new Date(c.updated_at), "dd MMM yyyy hh:mm a") : "—"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── SIGNATURE ── */}
        <div className="no-break" style={{ padding: '0 28px', marginTop: 18 }}>
          <div className="sec-title">Signature</div>
          <div style={{ border: '1px solid #e5e7eb', borderTop: 'none' }}>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, marginBottom: 20, fontStyle: 'italic' }}>
                I acknowledge that I have been explained the diagnosis, treatment plan, risks, benefits, and alternatives. I consent to the proposed treatment.
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
                <div style={{ textAlign: 'center' }}>
                  <div className="sig-line" />
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>Patient Signature</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div className="sig-line" />
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>Doctor Signature</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div className="sig-line" />
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>Hospital Seal</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ textAlign: 'center' }}>
                  <div className="sig-line" />
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>Date</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div className="sig-line" />
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>Witness</div>
                </div>
                <div style={{ textAlign: 'center', width: 180 }}>
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 16 }}>
                    {hospitalName}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div style={{ padding: '20px 28px 28px' }}>
          <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', marginBottom: 8 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#9ca3af', lineHeight: 1.5 }}>
            <span>Confidential Medical Record — {hospitalName}</span>
            <span>Page {'{page}'} of {'{pages}'}</span>
          </div>
          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2, lineHeight: 1.4, textAlign: 'center' }}>
            This document contains confidential medical information intended only for the patient.
            If you are not the intended recipient, please notify the sender immediately.
          </div>
        </div>
      </div>
    </div>
  )
}
