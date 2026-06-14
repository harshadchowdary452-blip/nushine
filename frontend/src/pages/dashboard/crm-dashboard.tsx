import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import {
  TrendingUp, Users, Target,
  UserPlus, BarChart3, PieChart, IndianRupee, MapPin, X, Megaphone,
  CalendarDays, CheckCircle2, Clock, AlertTriangle, Send, MessageCircle,
} from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import { crmApi } from "@/services/endpoints"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PieChart as RePie, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts"
import { formatIndianRupees } from "@/lib/currency"
import KpiCard from "@/components/layout/kpi-card"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }

const SOURCE_COLORS = ["#0EA5E9", "#8B5CF6", "#F59E0B", "#10B981", "#EF4444", "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#84CC16", "#06B6D4", "#D946EF", "#FB923C", "#22C55E", "#E11D48", "#A855F7", "#64748B"]

export default function CrmDashboard() {
  const { user } = useAuthStore()
  const [analyticsOpen, setAnalyticsOpen] = useState(false)

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["crm", "dashboard"],
    queryFn: () => crmApi.dashboard(),
    staleTime: 30000,
    gcTime: 60000,
  })

  if (!user) return null

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-[130px] rounded-2xl" />)}
        </div>
      </div>
    )
  }

  const m = dashboard?.metrics || {}
  const sa = dashboard?.source_analytics || {}

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border border-border bg-white p-3 shadow-lg text-xs">
          <p className="font-semibold text-text-primary mb-1">{payload[0].name || label}</p>
          {payload.map((entry: any, idx: number) => (
            <p key={idx} style={{ color: entry.color }} className="font-medium">{entry.name}: {entry.value}</p>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="show">
      <div className="gradient-hero rounded-2xl p-6 md:p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-20" />
        <div className="relative z-10">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
              <Target className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">CRM Dashboard</h1>
              <p className="text-white/70 mt-1">Follow-up reminders & patient engagement</p>
            </div>
          </div>
        </div>
      </div>

      {/* Follow-Up Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard icon={CalendarDays} title="Today's Follow-Ups" value={m.todays_follow_ups_count ?? 0} color="primary" delay={0} />
        <KpiCard icon={Clock} title="Pending" value={m.pending_follow_ups ?? 0} color="warning" delay={0.05} />
        <KpiCard icon={CheckCircle2} title="Completed" value={m.completed_follow_ups ?? 0} color="success" delay={0.1} />
        <KpiCard icon={AlertTriangle} title="Overdue" value={m.overdue_follow_ups ?? 0} color="danger" delay={0.15} />
        <KpiCard icon={Send} title="WhatsApp Sent" value={m.whatsapp_messages_sent ?? 0} color="info" delay={0.2} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={CalendarDays} title="1-Day Follow-Ups Due" value={m.one_day_follow_ups_due ?? 0} color="primary" delay={0.25} />
        <KpiCard icon={Users} title="6-Month Recalls Due" value={m.six_month_recalls_due ?? 0} color="info" delay={0.3} />
        <KpiCard icon={TrendingUp} title="Response Rate" value={`${m.response_rate ?? 0}%`} color="success" delay={0.35} />
        <KpiCard icon={MessageCircle} title="WhatsApp Resp. Rate" value={`${m.whatsapp_response_rate ?? 0}%`} color="info" delay={0.4} />
      </div>

      {/* Patient Acquisition Analytics */}
      <Card className="border-border shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5 text-primary" />
            Patient Acquisition Analytics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Source KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <button onClick={() => setAnalyticsOpen(true)} className="text-left">
              <KpiCard icon={Users} title="Total Patients By Source" value={sa.total_patients_with_source ?? 0} color="primary" delay={0.45} />
            </button>
            <KpiCard icon={UserPlus} title="New Patients This Month" value={sa.new_patients_this_month ?? 0} color="success" delay={0.5} />
            <KpiCard icon={MapPin} title="Top Acquisition Source" value={sa.top_source || "N/A"} color="info" delay={0.55} />
            <KpiCard icon={Users} title="Top Referral Source" value={sa.top_referral_source || "N/A"} color="warning" delay={0.6} />
          </div>

          {/* Campaign KPIs */}
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard icon={Users} title="Campaign Patients" value={sa.campaign_patients ?? 0} color="info" delay={0.62} />
            <KpiCard icon={IndianRupee} title="Campaign Revenue" value={formatIndianRupees(sa.campaign_revenue ?? 0)} color="success" delay={0.64} />
            <KpiCard icon={TrendingUp} title="Campaign ROI" value={`${sa.campaign_roi ?? 0}%`} color="warning" delay={0.66} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Pie Chart */}
            <Card className="border-border shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <PieChart className="h-4 w-4 text-primary" />
                  Patients By Source
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(sa.patients_by_source ?? []).length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <RePie>
                      <Pie data={sa.patients_by_source} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                        {sa.patients_by_source.map((_: any, idx: number) => (
                          <Cell key={idx} fill={SOURCE_COLORS[idx % SOURCE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </RePie>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[280px] text-text-secondary text-sm">No source data</div>
                )}
              </CardContent>
            </Card>

            {/* Revenue by Source */}
            <Card className="border-border shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <IndianRupee className="h-4 w-4 text-primary" />
                  Revenue By Source
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(sa.revenue_by_source ?? []).length > 0 ? (
                  <div className="space-y-3">
                    {sa.revenue_by_source.map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: SOURCE_COLORS[idx % SOURCE_COLORS.length] }} />
                          <span className="text-sm font-medium text-text-primary">{item.source}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-text-primary">{formatIndianRupees(item.revenue)}</p>
                          <p className="text-xs text-text-muted">{item.patients ?? 0} patients</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[280px] text-text-secondary text-sm">No revenue data</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Monthly Acquisition Bar Chart */}
          <Card className="border-border shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart3 className="h-4 w-4 text-primary" />
                Monthly Patient Acquisition
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(sa.monthly_acquisition ?? []).length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={sa.monthly_acquisition.map((m: any) => ({
                    month: m.month,
                    ...Object.fromEntries(m.sources.map((s: any) => [s.source, s.count])),
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {Object.keys(sa.monthly_acquisition[0]?.sources?.[0] ?? {}).length > 0 && (
                      sa.monthly_acquisition.reduce((acc: string[], m: any) => {
                        m.sources.forEach((s: any) => { if (!acc.includes(s.source)) acc.push(s.source) })
                        return acc
                      }, []).map((source: string, idx: number) => (
                        <Bar key={source} dataKey={source} fill={SOURCE_COLORS[idx % SOURCE_COLORS.length]} stackId="a" />
                      ))
                    )}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-text-secondary text-sm">No monthly data</div>
              )}
            </CardContent>
          </Card>

          {/* Top Sources */}
          {(sa.patients_by_source ?? []).length > 0 && (
            <Card className="border-border shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Top Sources
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sa.patients_by_source.slice(0, 6).map((item: any, idx: number) => {
                    const pct = ((item.count / (sa.total_patients_with_source || 1)) * 100).toFixed(1)
                    return (
                      <div key={idx} className="rounded-lg border border-border p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: SOURCE_COLORS[idx % SOURCE_COLORS.length] }} />
                          <span className="text-sm font-medium text-text-primary">{item.source}</span>
                        </div>
                        <p className="text-xl font-bold text-text-primary">{item.count}</p>
                        <p className="text-xs text-text-muted">{pct}% contribution</p>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Analytics Drawer */}
      <AnimatePresence>
        {analyticsOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setAnalyticsOpen(false)} />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed right-0 top-0 z-50 h-full w-full max-w-lg bg-white shadow-2xl overflow-y-auto">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white px-4 py-3">
                <h2 className="text-lg font-semibold text-text-primary">Source Analytics</h2>
                <button onClick={() => setAnalyticsOpen(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                {(sa.patients_by_source ?? []).length > 0 && (
                  <>
                    <div className="h-[250px]">
                      <p className="text-sm font-medium text-text-primary mb-2">Patients By Source</p>
                      <ResponsiveContainer width="100%" height="100%">
                        <RePie>
                          <Pie data={sa.patients_by_source} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }: any) => `${((percent ?? 0) * 100).toFixed(0)}%`}>
                            {sa.patients_by_source.map((_: any, idx: number) => (
                              <Cell key={idx} fill={SOURCE_COLORS[idx % SOURCE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </RePie>
                      </ResponsiveContainer>
                    </div>
                    <div className="border-t border-border pt-4">
                      <p className="text-sm font-medium text-text-primary mb-3">Revenue Breakdown</p>
                      <div className="space-y-2">
                        {(sa.revenue_by_source ?? []).map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                            <div className="flex items-center gap-2">
                              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOURCE_COLORS[idx % SOURCE_COLORS.length] }} />
                              <span className="text-xs font-medium text-text-primary">{item.source}</span>
                            </div>
                            <span className="text-xs font-semibold">{formatIndianRupees(item.revenue)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="border-t border-border pt-4">
                      <p className="text-sm font-medium text-text-primary mb-3">Monthly Trends</p>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={sa.monthly_acquisition?.slice(-6).map((m: any) => ({
                            month: m.month,
                            ...Object.fromEntries(m.sources.map((s: any) => [s.source, s.count])),
                          })) ?? []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                            <Tooltip />
                            {sa.monthly_acquisition?.[0]?.sources?.map((s: any) => s.source).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).map((source: string, idx: number) => (
                              <Bar key={source} dataKey={source} fill={SOURCE_COLORS[idx % SOURCE_COLORS.length]} stackId="a" />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="border-t border-border pt-4">
                      <p className="text-sm font-medium text-text-primary mb-3">Top Sources</p>
                      <div className="grid grid-cols-2 gap-2">
                        {sa.patients_by_source.slice(0, 6).map((item: any, idx: number) => {
                          const pct = ((item.count / (sa.total_patients_with_source || 1)) * 100).toFixed(1)
                          return (
                            <div key={idx} className="rounded-lg border border-border p-2.5">
                              <div className="flex items-center gap-1.5 mb-1">
                                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: SOURCE_COLORS[idx % SOURCE_COLORS.length] }} />
                                <span className="text-[11px] font-medium text-text-primary truncate">{item.source}</span>
                              </div>
                              <p className="text-sm font-bold text-text-primary">{item.count}</p>
                              <p className="text-[10px] text-text-muted">Growth: {sa.growth_percentage ?? 0}%</p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}
                {!(sa.patients_by_source ?? []).length && (
                  <div className="flex items-center justify-center h-40 text-text-secondary text-sm">No source data available</div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
