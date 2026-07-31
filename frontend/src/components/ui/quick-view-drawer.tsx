import { useState, useEffect, useMemo, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Building2, Stethoscope, Users, DollarSign, Activity, Calendar, Award, FolderOpen, TrendingUp, Loader2, ExternalLink, IndianRupee, PieChart, RotateCcw, ZoomIn, ZoomOut, Download, Maximize, Minimize } from "lucide-react"
import { dashboardApi } from "@/services/endpoints"
import { formatIndianRupees, formatIndianNumber } from "@/lib/currency"
import DateFilterBar from "@/components/ui/date-filter-bar"
import { Badge } from "@/components/ui/badge"

import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet"
import {
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui/dialog"
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

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  if (!data) return <div className="text-center py-12 text-gray-500">No data available</div>

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
        <button onClick={() => { onClose(); navigate("/admin/hospitals") }} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline px-3 py-2">
          <Building2 className="h-3 w-3" /> View Hospitals <ExternalLink className="h-3 w-3" />
        </button>
        <button onClick={() => { onClose(); navigate("/admin/doctors") }} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline px-3 py-2">
          <Stethoscope className="h-3 w-3" /> View Doctors <ExternalLink className="h-3 w-3" />
        </button>
      </div>
      {data.top_doctors.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Top Doctors</h3>
          <div className="space-y-2">
            {data.top_doctors.map((d, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-gray-700">{d.name}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{formatIndianRupees(d.value)}</span>
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

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  if (!data) return <div className="text-center py-12 text-gray-500">No data available</div>

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
        <div className="rounded-xl bg-danger-soft px-4 py-3 flex items-center gap-3">
          <DollarSign className="h-5 w-5 text-danger" />
          <div>
            <p className="text-sm font-medium text-danger">Pending Amount</p>
            <p className="text-lg font-bold text-danger">{formatIndianRupees(data.total_pending)}</p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { onClose(); navigate("/admin/doctors") }} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline px-3 py-2">
          <Stethoscope className="h-3 w-3" /> View Doctors <ExternalLink className="h-3 w-3" />
        </button>
        <button onClick={() => { onClose(); navigate("/patients") }} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline px-3 py-2">
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

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  if (!data) return <div className="text-center py-12 text-gray-500">No data available</div>

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
        <button onClick={() => { onClose(); navigate("/patients") }} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline px-3 py-2">
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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b shrink-0">
        <DialogTitle className="text-sm">Image Preview</DialogTitle>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-2">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(z + 0.25, 5))} className="p-1.5 rounded-md hover:bg-gray-100"><ZoomIn className="h-4 w-4" /></button>
          <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))} className="p-1.5 rounded-md hover:bg-gray-100"><ZoomOut className="h-4 w-4" /></button>
          <button onClick={() => setZoom(1)} className="p-1.5 rounded-md hover:bg-gray-100"><RotateCcw className="h-4 w-4" /></button>
          <button onClick={() => setFullscreen(!fullscreen)} className="p-1.5 rounded-md hover:bg-gray-100 ml-1">
            {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div
        className="flex-1 flex items-center justify-center overflow-auto bg-gray-100 cursor-grab active:cursor-grabbing select-none p-4"
        onWheel={(e) => { e.preventDefault(); setZoom(z => Math.max(0.25, Math.min(5, z + (e.deltaY > 0 ? -0.1 : 0.1)))) }}
        onDoubleClick={() => setZoom(z => z === 1 ? 2 : 1)}
      >
        <img src={url} alt="Preview" className="transition-transform duration-200 max-w-full max-h-full object-contain" style={{ transform: `scale(${zoom})` }} draggable={false} loading="lazy" />
      </div>
      <div className="flex justify-center gap-2 p-3 border-t shrink-0">
        <a href={url} download className="flex items-center gap-1 text-xs font-medium text-primary hover:underline px-3 py-1.5 rounded-md hover:bg-primary-soft">
          <Download className="h-3.5 w-3.5" /> Download
        </a>
        <button onClick={() => { window.open(url, "_blank") }} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline px-3 py-1.5 rounded-md hover:bg-primary-soft">
          <ExternalLink className="h-3.5 w-3.5" /> Open
        </button>
      </div>
    </div>
  )

  if (fullscreen) {
    return (
      <Dialog open={true} onOpenChange={() => { onClose(); setZoom(1); setFullscreen(false) }}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-[95vw] h-[95vh] p-0">
          {content}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={true} onOpenChange={() => { onClose(); setZoom(1) }}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] h-[80vh] p-0">
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
      <p className="text-xs font-medium text-gray-500 mb-2">{label} ({photos.length})</p>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((url, i) => (
          <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200">
            <img src={url} alt={`${label} ${i + 1}`} className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewUrl(url)} loading="lazy" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
              <button onClick={(e) => { e.stopPropagation(); window.open(url, "_blank") }} className="p-1.5 bg-white/90 rounded-full"><ExternalLink className="h-3.5 w-3.5" /></button>
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

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  if (!data) return <div className="text-center py-12 text-gray-500">No data available</div>

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
    <div className="flex flex-col h-full">
      <div className="flex gap-1 flex-wrap border-b pb-2 mb-4 shrink-0 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`text-xs font-medium px-2.5 py-1.5 rounded-md whitespace-nowrap transition-colors ${
              activeTab === t.key ? "bg-primary text-primary-foreground" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1 scroll-smooth">
        {activeTab === "overview" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <MetricCard icon={FolderOpen} label="Cases" value={formatIndianNumber(data.total_cases)} color="info" />
              <MetricCard icon={Activity} label="Treatments" value={formatIndianNumber(data.total_treatments)} color="primary" />
              <MetricCard icon={Calendar} label="Appointments" value={formatIndianNumber(data.total_appointments)} color="warning" />
              <MetricCard icon={RotateCcw} label="Follow-Ups" value={formatIndianNumber(data.total_follow_ups)} color="warning" />
            </div>

            {data.next_follow_up && (
              <div className="rounded-xl border border-warning bg-warning-soft p-3">
                <p className="text-xs font-medium text-warning mb-1">Next Follow-Up</p>
                <p className="text-sm font-bold text-gray-900">{new Date(data.next_follow_up.date).toLocaleDateString("en-IN")}</p>
                {data.next_follow_up.time && <p className="text-xs text-gray-500">Time: {data.next_follow_up.time}</p>}
                <Badge variant="warning" className="mt-1">{data.next_follow_up.status}</Badge>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 rounded-xl bg-gray-50 p-3">
              <div className="text-center">
                <p className="text-xs text-gray-500">Total Billed</p>
                <p className="text-sm font-bold text-gray-900">{formatIndianRupees(data.total_billed)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">Paid</p>
                <p className="text-sm font-bold text-success">{formatIndianRupees(data.total_paid)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">Pending</p>
                <p className="text-sm font-bold text-danger">{formatIndianRupees(data.total_pending)}</p>
              </div>
            </div>

            {progress.total > 0 && (
              <div className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500">Treatment Progress</p>
                  <span className="text-sm font-bold text-primary">{progressPct}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                  <div className="bg-primary h-2.5 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
                </div>
                <p className="text-xs text-gray-500">{progress.completed} / {progress.total} Sittings Completed</p>
                {progress.total - progress.completed > 0 && (
                  <p className="text-xs text-gray-400">Remaining: {progress.total - progress.completed}</p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button onClick={() => { onClose(); navigate(`/patients/${id}`) }} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline px-3 py-2">
                <ExternalLink className="h-3 w-3" /> View Full Profile
              </button>
            </div>
          </>
        )}

        {activeTab === "cases" && (
          <div className="space-y-2">
            {data.cases.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No cases</p>
            ) : (
              data.cases.map((c) => (
                <div key={c.id} className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700 truncate">{c.chief_complaint}</p>
                    <Badge variant={c.status === "COMPLETED" ? "success" : c.status === "CANCELLED" ? "danger" : "warning"} className="shrink-0 ml-2">{c.status}</Badge>
                  </div>
                  {c.diagnosis && <p className="text-xs text-gray-400 mt-1 truncate">{c.diagnosis}</p>}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "treatments" && (
          <div className="space-y-2">
            {data.treatments.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No treatments</p>
            ) : (
              data.treatments.map((t) => (
                <div key={t.id} className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700 truncate">{t.treatment_name}</p>
                    <Badge variant={t.status === "COMPLETED" ? "success" : "warning"} className="shrink-0 ml-2">{t.status}</Badge>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{formatIndianRupees(t.cost)}</p>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "billing" && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-gray-50 p-3">
              <div className="text-center">
                <p className="text-xs text-gray-500">Total Billed</p>
                <p className="text-sm font-bold text-gray-900">{formatIndianRupees(data.total_billed)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">Paid</p>
                <p className="text-sm font-bold text-success">{formatIndianRupees(data.total_paid)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">Pending</p>
                <p className="text-sm font-bold text-danger">{formatIndianRupees(data.total_pending)}</p>
              </div>
            </div>
            {data.timeline.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No billing activity</p>
            ) : (
              data.timeline.map((t, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl bg-gray-50 px-3 py-2">
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">{new Date(t.date).toLocaleDateString("en-IN")}</p>
                    <p className="text-sm text-gray-700">{t.event}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "followups" && (
          <div className="space-y-2">
            {data.follow_up_history.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No follow-ups</p>
            ) : (
              data.follow_up_history.map((f) => (
                <div key={f.id} className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">{new Date(f.date).toLocaleDateString("en-IN")}</p>
                    <Badge variant={f.status === "COMPLETED" ? "success" : f.status === "SCHEDULED" ? "warning" : "default"} className="shrink-0">{f.status}</Badge>
                  </div>
                  {f.time && <p className="text-xs text-gray-400 mt-1">Time: {f.time}</p>}
                  {f.notes && <p className="text-xs text-gray-400 mt-1">{f.notes}</p>}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "preop" && (
          <div className="space-y-4">
            {preOpPhotos.length === 0 && preOpXrays.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No Pre-Op images</p>
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
              <p className="text-sm text-gray-400 text-center py-8">No Post-Op images</p>
            ) : (
              <PhotoGrid photos={postOpPhotos} label="Post-Op Photos" />
            )}
          </div>
        )}

        {activeTab === "timeline" && (
          <div className="space-y-2">
            {data.timeline.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No timeline events</p>
            ) : (
              data.timeline.map((t, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl bg-gray-50 px-3 py-2">
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">{new Date(t.date).toLocaleDateString("en-IN")}</p>
                    <p className="text-sm text-gray-700">{t.event}</p>
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
    primary: "bg-primary-soft text-primary",
    info: "bg-info-soft text-info",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  }
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <div className={`flex h-6 w-6 items-center justify-center rounded-lg ${colorMap[color] || colorMap.primary}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-sm font-bold text-gray-900">{value}</p>
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

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [query])
  return matches
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
          "border-l border-gray-200 shadow-xl",
          isDesktop ? "sm:max-w-[560px] w-full" : ""
        )}
      >
        <SheetHeader className="border-b border-gray-100 pb-3 mb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              {entityName || "Quick View"}
            </SheetTitle>
          </div>
          <SheetDescription className="text-xs text-text-secondary">
            {type === "admin-group" && "Admin Group performance details"}
            {type === "hospital" && "Hospital performance details"}
            {type === "doctor" && "Doctor performance details"}
            {type === "patient" && "Patient full timeline and details"}
          </SheetDescription>
        </SheetHeader>
        {type !== "patient" && filterBar}
        <div className="overflow-y-auto pr-1 scroll-smooth" style={{ maxHeight: "calc(100vh - 220px)" }}>
          {Content ? <Content id={entityId} onClose={onClose} period={period} startDate={startDate} endDate={endDate} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
