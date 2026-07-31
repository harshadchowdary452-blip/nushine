import { useState, useMemo, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Building2, Stethoscope, Users, DollarSign, Activity, Calendar, Award, FolderOpen, TrendingUp, Loader2, ExternalLink, IndianRupee, PieChart, RotateCcw, ZoomIn, ZoomOut, Download, Maximize, Minimize } from "lucide-react"
import { dashboardApi } from "@/services/endpoints"
import { formatIndianRupees, formatIndianNumber } from "@/lib/currency"
import { useMediaQuery } from "@/lib/use-media-query"
import DateFilterBar from "./date-filter-bar"
import { Badge } from "./badge"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "./sheet"
import {
  Dialog, DialogContent, DialogTitle,
} from "./dialog"
import { cn } from "@/lib/utils"
import type { QuickViewAdminGroup, QuickViewHospital, QuickViewDoctor, QuickViewPatient } from "@/types"

interface QuickViewDrawerProps {
  open: boolean
  onClose: () => void
  type: "admin-group" | "hospital" | "doctor" | "patient"
  entityId: string
  entityName?: string
}

function AdminGroupContent({ id, onClose, period, startDate, endDate }: { id: string; onClose: () => void; period: string; startDate?: string; endDate?: string }) {
  const navigate = useNavigate()
  const qp = useMemo(() => ({ period, ...(period === "custom" ? { start_date: startDate, end_date: endDate } : {}) }), [period, startDate, endDate])
  const { data, isLoading } = useQuery<QuickViewAdminGroup>({
    queryKey: ["quick-view", "admin-group", id, period, startDate, endDate],
    queryFn: () => dashboardApi.quickViewAdminGroup(id, qp),
    enabled: !!id,
  })

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-[var(--ds-primary)]" /></div>
  if (!data) return <div className="py-12 text-center text-[var(--ds-text-tertiary)]">No data available</div>

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard icon={Building2} label="Hospitals" value={formatIndianNumber(data.total_hospitals)} color="primary" />
        <MetricCard icon={Stethoscope} label="Doctors" value={formatIndianNumber(data.total_doctors)} color="info" />
        <MetricCard icon={Users} label="Patients" value={formatIndianNumber(data.total_patients)} color="success" />
        <MetricCard icon={DollarSign} label="Revenue" value={formatIndianRupees(data.total_revenue)} color="warning" />
        <MetricCard icon={Activity} label="Active Cases" value={formatIndianNumber(data.total_active_cases)} color="danger" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <MetricCard icon={IndianRupee} label="Expenses" value={formatIndianRupees(data.total_expenses ?? 0)} color="danger" />
        <MetricCard icon={TrendingUp} label="Net Profit" value={formatIndianRupees(data.net_profit ?? 0)} color={(data.net_profit ?? 0) >= 0 ? "success" : "danger"} />
        <MetricCard icon={PieChart} label="Profit Margin" value={data.profit_margin != null ? `${data.profit_margin.toFixed(1)}%` : "0%"} color="primary" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { onClose(); navigate("/admin/hospitals") }} className="flex items-center gap-1 rounded-[var(--ds-radius-lg)] px-3 py-2 text-xs font-medium text-[var(--ds-primary)] hover:bg-[var(--ds-primary-subtle)]">
          <Building2 className="h-3 w-3" /> View Hospitals <ExternalLink className="h-3 w-3" />
        </button>
        <button onClick={() => { onClose(); navigate("/admin/doctors") }} className="flex items-center gap-1 rounded-[var(--ds-radius-lg)] px-3 py-2 text-xs font-medium text-[var(--ds-primary)] hover:bg-[var(--ds-primary-subtle)]">
          <Stethoscope className="h-3 w-3" /> View Doctors <ExternalLink className="h-3 w-3" />
        </button>
      </div>
      {data.top_doctors.length > 0 && (
        <div>
          <h3 className="ds-nav-label mb-3 uppercase tracking-wider text-[var(--ds-text-secondary)]">Top Doctors</h3>
          <div className="space-y-2">
            {data.top_doctors.map((d, i) => (
              <div key={i} className="flex items-center justify-between rounded-[var(--ds-radius-xl)] bg-[var(--ds-surface-secondary)] px-3 py-2">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-[var(--ds-primary)]" />
                  <span className="ds-body-sm font-medium text-[var(--ds-text-secondary)]">{d.name}</span>
                </div>
                <span className="ds-body-sm font-semibold text-[var(--ds-text)]">{formatIndianRupees(d.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function HospitalContent({ id, onClose, period, startDate, endDate }: { id: string; onClose: () => void; period: string; startDate?: string; endDate?: string }) {
  const navigate = useNavigate()
  const qp = useMemo(() => ({ period, ...(period === "custom" ? { start_date: startDate, end_date: endDate } : {}) }), [period, startDate, endDate])
  const { data, isLoading } = useQuery<QuickViewHospital>({
    queryKey: ["quick-view", "hospital", id, period, startDate, endDate],
    queryFn: () => dashboardApi.quickViewHospital(id, qp),
    enabled: !!id,
  })

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-[var(--ds-primary)]" /></div>
  if (!data) return <div className="py-12 text-center text-[var(--ds-text-tertiary)]">No data available</div>

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard icon={Stethoscope} label="Doctors" value={formatIndianNumber(data.total_doctors)} color="info" />
        <MetricCard icon={Users} label="Patients" value={formatIndianNumber(data.total_patients)} color="primary" />
        <MetricCard icon={DollarSign} label="Revenue" value={formatIndianRupees(data.total_revenue)} color="success" />
        <MetricCard icon={Activity} label="Active Cases" value={formatIndianNumber(data.total_active_cases)} color="danger" />
        <MetricCard icon={FolderOpen} label="Billings" value={formatIndianNumber(data.total_billings)} color="warning" />
        <MetricCard icon={Calendar} label="Today Appts" value={formatIndianNumber(data.today_appointments)} color="info" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <MetricCard icon={IndianRupee} label="Expenses" value={formatIndianRupees(data.total_expenses ?? 0)} color="danger" />
        <MetricCard icon={TrendingUp} label="Net Profit" value={formatIndianRupees(data.net_profit ?? 0)} color={(data.net_profit ?? 0) >= 0 ? "success" : "danger"} />
        <MetricCard icon={PieChart} label="Profit Margin" value={data.profit_margin != null ? `${data.profit_margin.toFixed(1)}%` : "0%"} color="primary" />
      </div>
      {data.total_pending > 0 && (
        <div className="flex items-center gap-3 rounded-[var(--ds-radius-xl)] bg-[var(--ds-danger-subtle)] px-4 py-3">
          <DollarSign className="h-5 w-5 text-[var(--ds-danger)]" />
          <div>
            <p className="ds-body-sm font-medium text-[var(--ds-danger)]">Pending Amount</p>
            <p className="ds-body-lg font-bold text-[var(--ds-danger)]">{formatIndianRupees(data.total_pending)}</p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { onClose(); navigate("/admin/doctors") }} className="flex items-center gap-1 rounded-[var(--ds-radius-lg)] px-3 py-2 text-xs font-medium text-[var(--ds-primary)] hover:bg-[var(--ds-primary-subtle)]">
          <Stethoscope className="h-3 w-3" /> View Doctors <ExternalLink className="h-3 w-3" />
        </button>
        <button onClick={() => { onClose(); navigate("/patients") }} className="flex items-center gap-1 rounded-[var(--ds-radius-lg)] px-3 py-2 text-xs font-medium text-[var(--ds-primary)] hover:bg-[var(--ds-primary-subtle)]">
          <Users className="h-3 w-3" /> View Patients <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

function DoctorContent({ id, onClose, period, startDate, endDate }: { id: string; onClose: () => void; period: string; startDate?: string; endDate?: string }) {
  const navigate = useNavigate()
  const qp = useMemo(() => ({ period, ...(period === "custom" ? { start_date: startDate, end_date: endDate } : {}) }), [period, startDate, endDate])
  const { data, isLoading } = useQuery<QuickViewDoctor>({
    queryKey: ["quick-view", "doctor", id, period, startDate, endDate],
    queryFn: () => dashboardApi.quickViewDoctor(id, qp),
    enabled: !!id,
  })

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-[var(--ds-primary)]" /></div>
  if (!data) return <div className="py-12 text-center text-[var(--ds-text-tertiary)]">No data available</div>

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard icon={Users} label="Patients" value={formatIndianNumber(data.total_patients)} color="primary" />
        <MetricCard icon={Calendar} label="Today Appts" value={formatIndianNumber(data.today_appointments)} color="warning" />
        <MetricCard icon={FolderOpen} label="Total Cases" value={formatIndianNumber(data.total_cases)} color="info" />
        <MetricCard icon={Activity} label="Active Cases" value={formatIndianNumber(data.active_cases)} color="danger" />
        <MetricCard icon={DollarSign} label="Revenue" value={formatIndianRupees(data.total_revenue)} color="success" />
        <MetricCard icon={TrendingUp} label="Completed" value={formatIndianNumber(data.completed_cases)} color="success" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MetricCard icon={TrendingUp} label="Period Revenue" value={formatIndianRupees(data.period_revenue ?? 0)} color="primary" />
        <MetricCard icon={PieChart} label="Contribution" value={data.contribution_to_profit != null ? `${data.contribution_to_profit.toFixed(1)}%` : "0%"} color="info" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="success">{data.active_patients} Active Patients</Badge>
        <Badge variant="info">{data.completed_patients} Completed</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { onClose(); navigate("/patients") }} className="flex items-center gap-1 rounded-[var(--ds-radius-lg)] px-3 py-2 text-xs font-medium text-[var(--ds-primary)] hover:bg-[var(--ds-primary-subtle)]">
          <Users className="h-3 w-3" /> View Patients <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

function ImagePreviewDialog({ url, onClose }: { url: string | null; onClose: () => void }) {
  const [zoom, setZoom] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)

  if (!url) return null

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--ds-border-light)] p-3">
        <DialogTitle className="ds-body font-medium">Image Preview</DialogTitle>
        <div className="flex items-center gap-1">
          <span className="ds-caption mr-2 text-[var(--ds-text-tertiary)]">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(z + 0.25, 5))} className="ds-focus-ring rounded-[var(--ds-radius-md)] p-1.5 hover:bg-[var(--ds-surface-hover)]"><ZoomIn className="h-4 w-4" /></button>
          <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))} className="ds-focus-ring rounded-[var(--ds-radius-md)] p-1.5 hover:bg-[var(--ds-surface-hover)]"><ZoomOut className="h-4 w-4" /></button>
          <button onClick={() => setZoom(1)} className="ds-focus-ring rounded-[var(--ds-radius-md)] p-1.5 hover:bg-[var(--ds-surface-hover)]"><RotateCcw className="h-4 w-4" /></button>
          <button onClick={() => setFullscreen(!fullscreen)} className="ds-focus-ring ml-1 rounded-[var(--ds-radius-md)] p-1.5 hover:bg-[var(--ds-surface-hover)]">
            {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div
        className="flex flex-1 cursor-grab select-none items-center justify-center overflow-auto bg-[var(--ds-background-subtle)] p-4 active:cursor-grabbing"
        onWheel={(e) => { e.preventDefault(); setZoom(z => Math.max(0.25, Math.min(5, z + (e.deltaY > 0 ? -0.1 : 0.1)))) }}
        onDoubleClick={() => setZoom(z => z === 1 ? 2 : 1)}
      >
        <img src={url} alt="Preview" className="max-h-full max-w-full object-contain transition-transform duration-200" style={{ transform: `scale(${zoom})` }} draggable={false} loading="lazy" />
      </div>
      <div className="flex shrink-0 justify-center gap-2 border-t border-[var(--ds-border-light)] p-3">
        <a href={url} download className="flex items-center gap-1 rounded-[var(--ds-radius-md)] px-3 py-1.5 text-xs font-medium text-[var(--ds-primary)] hover:bg-[var(--ds-primary-subtle)]">
          <Download className="h-3.5 w-3.5" /> Download
        </a>
        <button onClick={() => { window.open(url, "_blank") }} className="flex items-center gap-1 rounded-[var(--ds-radius-md)] px-3 py-1.5 text-xs font-medium text-[var(--ds-primary)] hover:bg-[var(--ds-primary-subtle)]">
          <ExternalLink className="h-3.5 w-3.5" /> Open
        </button>
      </div>
    </div>
  )

  if (fullscreen) {
    return (
      <Dialog open={true} onOpenChange={() => { onClose(); setZoom(1); setFullscreen(false) }}>
        <DialogContent className="h-[95vh] w-[95vw] max-h-[95vh] max-w-[95vw] p-0">
          {content}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={true} onOpenChange={() => { onClose(); setZoom(1) }}>
      <DialogContent className="h-[80vh] max-h-[90vh] p-0 sm:max-w-[90vw]">
        {content}
      </DialogContent>
    </Dialog>
  )
}

function PhotoGrid({ photos, label }: { photos: string[]; label: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  if (photos.length === 0) return null
  return (
    <div>
      <p className="ds-body-sm mb-2 font-medium text-[var(--ds-text-secondary)]">{label} ({photos.length})</p>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((url, i) => (
          <div key={i} className="group relative aspect-square overflow-hidden rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)]">
            <img src={url} alt={`${label} ${i + 1}`} className="h-full w-full cursor-pointer object-cover" onClick={() => setPreviewUrl(url)} loading="lazy" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-colors group-hover:bg-black/20 group-hover:opacity-100">
              <button onClick={(e) => { e.stopPropagation(); window.open(url, "_blank") }} className="rounded-full bg-[var(--ds-surface)] p-1.5"><ExternalLink className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
      <ImagePreviewDialog url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  )
}

function PatientContent({ id, onClose }: QuickViewContentProps) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState("overview")
  const { data, isLoading } = useQuery<QuickViewPatient>({
    queryKey: ["quick-view", "patient", id],
    queryFn: () => dashboardApi.quickViewPatient(id),
    enabled: !!id,
  })

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-[var(--ds-primary)]" /></div>
  if (!data) return <div className="py-12 text-center text-[var(--ds-text-tertiary)]">No data available</div>

  const preOpPhotos = data.pre_ops.flatMap(p => (p.photo_urls || "").split(",").filter(Boolean))
  const preOpXrays = data.pre_ops.flatMap(p => (p.xray_urls || "").split(",").filter(Boolean))
  const postOpPhotos = data.post_ops.flatMap(p => (p.photo_urls || "").split(",").filter(Boolean))
  const progress = data.treatment_progress
  const progressPct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "cases", label: `Cases (${data.total_cases})` },
    { key: "treatments", label: `Treatments (${data.total_treatments})` },
    { key: "billing", label: "Billing" },
    { key: "followups", label: "Follow-Ups" },
    { key: "preop", label: `Pre-Op (${preOpPhotos.length + preOpXrays.length})` },
    { key: "postop", label: `Post-Op (${postOpPhotos.length})` },
    { key: "timeline", label: "Timeline" },
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex shrink-0 flex-wrap gap-1 overflow-x-auto border-b border-[var(--ds-border-light)] pb-2">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`ds-body-sm whitespace-nowrap rounded-[var(--ds-radius-md)] px-2.5 py-1.5 font-medium transition-colors ${
              activeTab === t.key ? "bg-[var(--ds-primary)] text-white" : "text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-hover)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto pr-1 scroll-smooth">
        {activeTab === "overview" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <MetricCard icon={FolderOpen} label="Cases" value={formatIndianNumber(data.total_cases)} color="info" />
              <MetricCard icon={Activity} label="Treatments" value={formatIndianNumber(data.total_treatments)} color="primary" />
              <MetricCard icon={Calendar} label="Appointments" value={formatIndianNumber(data.total_appointments)} color="warning" />
              <MetricCard icon={RotateCcw} label="Follow-Ups" value={formatIndianNumber(data.total_follow_ups)} color="warning" />
            </div>

            {data.next_follow_up && (
              <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-warning)] bg-[var(--ds-warning-subtle)] p-3">
                <p className="ds-body-sm mb-1 font-medium text-[var(--ds-warning)]">Next Follow-Up</p>
                <p className="ds-body font-bold text-[var(--ds-text)]">{new Date(data.next_follow_up.date).toLocaleDateString("en-IN")}</p>
                {data.next_follow_up.time && <p className="ds-caption text-[var(--ds-text-secondary)]">Time: {data.next_follow_up.time}</p>}
                <Badge variant="warning" className="mt-1">{data.next_follow_up.status}</Badge>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 rounded-[var(--ds-radius-xl)] bg-[var(--ds-surface-secondary)] p-3">
              <div className="text-center">
                <p className="ds-caption text-[var(--ds-text-secondary)]">Total Billed</p>
                <p className="ds-body font-bold text-[var(--ds-text)]">{formatIndianRupees(data.total_billed)}</p>
              </div>
              <div className="text-center">
                <p className="ds-caption text-[var(--ds-text-secondary)]">Paid</p>
                <p className="ds-body font-bold text-[var(--ds-success)]">{formatIndianRupees(data.total_paid)}</p>
              </div>
              <div className="text-center">
                <p className="ds-caption text-[var(--ds-text-secondary)]">Pending</p>
                <p className="ds-body font-bold text-[var(--ds-danger)]">{formatIndianRupees(data.total_pending)}</p>
              </div>
            </div>

            {progress.total > 0 && (
              <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-border)] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="ds-body-sm font-medium text-[var(--ds-text-secondary)]">Treatment Progress</p>
                  <span className="ds-body font-bold text-[var(--ds-primary)]">{progressPct}%</span>
                </div>
                <div className="mb-2 h-2.5 w-full rounded-full bg-[var(--ds-surface-secondary)]">
                  <div className="h-2.5 rounded-full bg-[var(--ds-primary)] transition-all duration-500" style={{ width: `${progressPct}%` }} />
                </div>
                <p className="ds-caption text-[var(--ds-text-secondary)]">{progress.completed} / {progress.total} Sittings Completed</p>
                {progress.total - progress.completed > 0 && (
                  <p className="ds-caption text-[var(--ds-text-tertiary)]">Remaining: {progress.total - progress.completed}</p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button onClick={() => { onClose(); navigate(`/patients/${id}`) }} className="flex items-center gap-1 rounded-[var(--ds-radius-lg)] px-3 py-2 text-xs font-medium text-[var(--ds-primary)] hover:bg-[var(--ds-primary-subtle)]">
                <ExternalLink className="h-3 w-3" /> View Full Profile
              </button>
            </div>
          </>
        )}

        {activeTab === "cases" && (
          <div className="space-y-2">
            {data.cases.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--ds-text-tertiary)]">No cases</p>
            ) : (
              data.cases.map((c) => (
                <div key={c.id} className="rounded-[var(--ds-radius-xl)] bg-[var(--ds-surface-secondary)] px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <p className="ds-body-sm truncate font-medium text-[var(--ds-text-secondary)]">{c.chief_complaint}</p>
                    <Badge variant={c.status === "COMPLETED" ? "success" : c.status === "CANCELLED" ? "danger" : "warning"} className="ml-2 shrink-0">{c.status}</Badge>
                  </div>
                  {c.diagnosis && <p className="ds-caption mt-1 truncate text-[var(--ds-text-tertiary)]">{c.diagnosis}</p>}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "treatments" && (
          <div className="space-y-2">
            {data.treatments.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--ds-text-tertiary)]">No treatments</p>
            ) : (
              data.treatments.map((t) => (
                <div key={t.id} className="rounded-[var(--ds-radius-xl)] bg-[var(--ds-surface-secondary)] px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <p className="ds-body-sm truncate font-medium text-[var(--ds-text-secondary)]">{t.treatment_name}</p>
                    <Badge variant={t.status === "COMPLETED" ? "success" : "warning"} className="ml-2 shrink-0">{t.status}</Badge>
                  </div>
                  <p className="ds-caption mt-1 text-[var(--ds-text-tertiary)]">{formatIndianRupees(t.cost)}</p>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "billing" && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 rounded-[var(--ds-radius-xl)] bg-[var(--ds-surface-secondary)] p-3">
              <div className="text-center">
                <p className="ds-caption text-[var(--ds-text-secondary)]">Total Billed</p>
                <p className="ds-body font-bold text-[var(--ds-text)]">{formatIndianRupees(data.total_billed)}</p>
              </div>
              <div className="text-center">
                <p className="ds-caption text-[var(--ds-text-secondary)]">Paid</p>
                <p className="ds-body font-bold text-[var(--ds-success)]">{formatIndianRupees(data.total_paid)}</p>
              </div>
              <div className="text-center">
                <p className="ds-caption text-[var(--ds-text-secondary)]">Pending</p>
                <p className="ds-body font-bold text-[var(--ds-danger)]">{formatIndianRupees(data.total_pending)}</p>
              </div>
            </div>
            {data.timeline.length === 0 ? (
              <p className="py-4 text-center text-sm text-[var(--ds-text-tertiary)]">No billing activity</p>
            ) : (
              data.timeline.map((t, i) => (
                <div key={i} className="flex items-start gap-3 rounded-[var(--ds-radius-xl)] bg-[var(--ds-surface-secondary)] px-3 py-2">
                  <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[var(--ds-primary)]" />
                  <div>
                    <p className="ds-caption text-[var(--ds-text-tertiary)]">{new Date(t.date).toLocaleDateString("en-IN")}</p>
                    <p className="ds-body-sm text-[var(--ds-text-secondary)]">{t.event}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "followups" && (
          <div className="space-y-2">
            {data.follow_up_history.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--ds-text-tertiary)]">No follow-ups</p>
            ) : (
              data.follow_up_history.map((f) => (
                <div key={f.id} className="rounded-[var(--ds-radius-xl)] bg-[var(--ds-surface-secondary)] px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <p className="ds-body-sm font-medium text-[var(--ds-text-secondary)]">{new Date(f.date).toLocaleDateString("en-IN")}</p>
                    <Badge variant={f.status === "COMPLETED" ? "success" : f.status === "SCHEDULED" ? "warning" : "default"} className="shrink-0">{f.status}</Badge>
                  </div>
                  {f.time && <p className="ds-caption mt-1 text-[var(--ds-text-tertiary)]">Time: {f.time}</p>}
                  {f.notes && <p className="ds-caption mt-1 text-[var(--ds-text-tertiary)]">{f.notes}</p>}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "preop" && (
          <div className="space-y-4">
            {preOpPhotos.length === 0 && preOpXrays.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--ds-text-tertiary)]">No Pre-Op images</p>
            ) : (
              <>
                {preOpPhotos.length > 0 && <PhotoGrid photos={preOpPhotos} label="Pre-Op Photos" />}
                {preOpXrays.length > 0 && <PhotoGrid photos={preOpXrays} label="X-Rays" />}
              </>
            )}
          </div>
        )}

        {activeTab === "postop" && (
          <div className="space-y-4">
            {postOpPhotos.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--ds-text-tertiary)]">No Post-Op images</p>
            ) : (
              <PhotoGrid photos={postOpPhotos} label="Post-Op Photos" />
            )}
          </div>
        )}

        {activeTab === "timeline" && (
          <div className="space-y-2">
            {data.timeline.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--ds-text-tertiary)]">No timeline events</p>
            ) : (
              data.timeline.map((t, i) => (
                <div key={i} className="flex items-start gap-3 rounded-[var(--ds-radius-xl)] bg-[var(--ds-surface-secondary)] px-3 py-2">
                  <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[var(--ds-primary)]" />
                  <div>
                    <p className="ds-caption text-[var(--ds-text-tertiary)]">{new Date(t.date).toLocaleDateString("en-IN")}</p>
                    <p className="ds-body-sm text-[var(--ds-text-secondary)]">{t.event}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    primary: "bg-[var(--ds-primary-subtle)] text-[var(--ds-primary)]",
    info: "bg-[var(--ds-info-subtle)] text-[var(--ds-info)]",
    success: "bg-[var(--ds-success-subtle)] text-[var(--ds-success)]",
    warning: "bg-[var(--ds-warning-subtle)] text-[var(--ds-warning)]",
    danger: "bg-[var(--ds-danger-subtle)] text-[var(--ds-danger)]",
  }
  return (
    <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-border-light)] bg-[var(--ds-surface)] p-3 shadow-[var(--ds-shadow-card)]">
      <div className="mb-1 flex items-center gap-2">
        <div className={`flex h-6 w-6 items-center justify-center rounded-[var(--ds-radius-lg)] ${colorMap[color] || colorMap.primary}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="ds-caption text-[var(--ds-text-secondary)]">{label}</span>
      </div>
      <p className="ds-body font-bold text-[var(--ds-text)]">{value}</p>
    </div>
  )
}

type QuickViewContentProps = { id: string; onClose: () => void; period: string; startDate?: string; endDate?: string }

const contentMap: Record<string, React.FC<QuickViewContentProps>> = {
  "admin-group": AdminGroupContent as React.FC<QuickViewContentProps>,
  "hospital": HospitalContent as React.FC<QuickViewContentProps>,
  "doctor": DoctorContent as React.FC<QuickViewContentProps>,
  "patient": PatientContent as React.FC<QuickViewContentProps>,
}

export default function QuickViewDrawer({ open, onClose, type, entityId, entityName }: QuickViewDrawerProps) {
  const Content = contentMap[type]
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const [period, setPeriod] = useState("this_month")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const handlePeriodChange = useCallback((p: string) => {
    setPeriod(p)
    if (p !== "custom") {
      setStartDate("")
      setEndDate("")
    }
  }, [])

  const filterBar = useMemo(() => (
    <div className="mb-4">
      <DateFilterBar
        period={period}
        onPeriodChange={handlePeriodChange}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
      />
    </div>
  ), [period, startDate, endDate, handlePeriodChange])

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={cn(
          "border-l border-[var(--ds-border)] shadow-[var(--ds-shadow-card)]",
          isDesktop ? "w-full sm:max-w-[560px]" : ""
        )}
      >
        <SheetHeader className="mb-4 border-b border-[var(--ds-border-light)] pb-3">
          <div className="flex items-center justify-between">
            <SheetTitle className="ds-heading flex items-center gap-2 text-[var(--ds-text)]">
              {entityName || "Quick View"}
            </SheetTitle>
          </div>
          <SheetDescription className="ds-caption text-[var(--ds-text-secondary)]">
            {type === "admin-group" && "Admin Group performance details"}
            {type === "hospital" && "Hospital performance details"}
            {type === "doctor" && "Doctor performance details"}
            {type === "patient" && "Patient full timeline and details"}
          </SheetDescription>
        </SheetHeader>
        {type !== "patient" && filterBar}
        <div className="scroll-smooth overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 220px)" }}>
          {Content ? <Content id={entityId} onClose={onClose} period={period} startDate={startDate} endDate={endDate} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
