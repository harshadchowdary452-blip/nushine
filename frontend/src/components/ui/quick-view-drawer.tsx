import { useState, useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { X, Building2, Stethoscope, Users, DollarSign, Activity, Calendar, Award, Clock, FolderOpen, TrendingUp, ArrowRight, Loader2, ExternalLink, IndianRupee, PieChart, RotateCcw } from "lucide-react"
import { dashboardApi } from "@/services/endpoints"
import { formatIndianRupees, formatIndianNumber } from "@/lib/currency"
import DateFilterBar from "@/components/ui/date-filter-bar"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose,
} from "@/components/ui/sheet"
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
  const params = { period, ...(period === "custom" ? { start_date: startDate, end_date: endDate } : {}) }
  const { data, isLoading } = useQuery<QuickViewAdminGroup>({
    queryKey: ["quick-view", "admin-group", id, params],
    queryFn: () => dashboardApi.quickViewAdminGroup(id, params),
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
        <button onClick={() => { onClose(); navigate("/admin/hospitals") }} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline touch-target px-3 py-2">
          <Building2 className="h-3 w-3" /> View Hospitals <ExternalLink className="h-3 w-3" />
        </button>
        <button onClick={() => { onClose(); navigate("/admin/doctors") }} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline touch-target px-3 py-2">
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
  const params = { period, ...(period === "custom" ? { start_date: startDate, end_date: endDate } : {}) }
  const { data, isLoading } = useQuery<QuickViewHospital>({
    queryKey: ["quick-view", "hospital", id, params],
    queryFn: () => dashboardApi.quickViewHospital(id, params),
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
        <button onClick={() => { onClose(); navigate("/admin/doctors") }} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline touch-target px-3 py-2">
          <Stethoscope className="h-3 w-3" /> View Doctors <ExternalLink className="h-3 w-3" />
        </button>
        <button onClick={() => { onClose(); navigate("/patients") }} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline touch-target px-3 py-2">
          <Users className="h-3 w-3" /> View Patients <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

function DoctorContent({ id, onClose, period, startDate, endDate }: { id: string; onClose: () => void; period: string; startDate?: string; endDate?: string }) {
  const navigate = useNavigate()
  const params = { period, ...(period === "custom" ? { start_date: startDate, end_date: endDate } : {}) }
  const { data, isLoading } = useQuery<QuickViewDoctor>({
    queryKey: ["quick-view", "doctor", id, params],
    queryFn: () => dashboardApi.quickViewDoctor(id, params),
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
        <button onClick={() => { onClose(); navigate("/patients") }} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline touch-target px-3 py-2">
          <Users className="h-3 w-3" /> View Patients <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

function PatientContent({ id, onClose }: QuickViewContentProps) {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery<QuickViewPatient>({
    queryKey: ["quick-view", "patient", id],
    queryFn: () => dashboardApi.quickViewPatient(id),
    enabled: !!id,
  })

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  if (!data) return <div className="text-center py-12 text-gray-500">No data available</div>

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard icon={FolderOpen} label="Cases" value={formatIndianNumber(data.total_cases)} color="info" />
        <MetricCard icon={Activity} label="Treatments" value={formatIndianNumber(data.total_treatments)} color="primary" />
        <MetricCard icon={Calendar} label="Appointments" value={formatIndianNumber(data.total_appointments)} color="warning" />
        <MetricCard icon={RotateCcw} label="Follow-Ups" value={formatIndianNumber(data.total_follow_ups)} color="warning" />
      </div>
      {data.next_follow_up && (
        <div className="rounded-xl border border-warning bg-warning-soft p-3">
          <p className="text-xs font-medium text-warning mb-1">Next Follow-Up</p>
          <p className="text-sm font-bold text-gray-900">{new Date(data.next_follow_up.date).toLocaleDateString()}</p>
          {data.next_follow_up.time && <p className="text-xs text-gray-500">Time: {data.next_follow_up.time}</p>}
          <Badge variant="warning">{data.next_follow_up.status}</Badge>
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
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { onClose(); navigate(`/patients/${id}`) }} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline touch-target px-3 py-2">
          <ExternalLink className="h-3 w-3" /> View Full Profile
        </button>
      </div>
      {data.timeline.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Timeline</h3>
          <div className="space-y-2">
            {data.timeline.map((t, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl bg-gray-50 px-3 py-2">
                <div className="mt-0.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">{new Date(t.date).toLocaleDateString()}</p>
                  <p className="text-sm text-gray-700">{t.event}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.cases.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Cases</h3>
          <div className="space-y-2">
            {data.cases.map((c) => (
              <div key={c.id} className="rounded-xl bg-gray-50 px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700 truncate">{c.chief_complaint}</p>
                  <Badge variant={c.status === "COMPLETED" ? "success" : c.status === "CANCELLED" ? "danger" : "warning"}>{c.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
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
  const isDesktop = useMediaQuery("(min-width: 640px)")
  const [period, setPeriod] = useState("this_month")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const filterBar = useMemo(() => (
    <div className="mb-4">
      <DateFilterBar
        period={period}
        onPeriodChange={setPeriod}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
      />
    </div>
  ), [period, startDate, endDate])

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent side={isDesktop ? "right" : "bottom"} className={isDesktop ? "sm:max-w-[560px] w-full" : ""}>
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2 text-xl">
            {entityName || "Quick View"}
          </SheetTitle>
          <SheetDescription>
            {type === "admin-group" && "Admin Group performance details"}
            {type === "hospital" && "Hospital performance details"}
            {type === "doctor" && "Doctor performance details"}
            {type === "patient" && "Patient full timeline and details"}
          </SheetDescription>
        </SheetHeader>
        {type !== "patient" && filterBar}
        <ScrollArea className="h-[calc(100vh-220px)] sm:h-[calc(100vh-160px)] pr-4">
          {Content ? <Content id={entityId} onClose={onClose} period={period} startDate={startDate} endDate={endDate} /> : null}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
