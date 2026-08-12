import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  Users, BarChart3, PieChart,
  Target, Star, AlertTriangle, CheckCircle2, Calendar,
} from "lucide-react"
import { leadsApi } from "@/services/endpoints"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { Skeleton } from "@/components/ui/skeleton"
import { KpiCard } from "@/design-system"
import { PieChart as RePie, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"

import type { Lead } from "@/types"

const STATUS_COLORS: Record<string, string> = {
  NEW: "var(--ds-chart-11)",
  CONTACTED: "var(--ds-chart-10)",
  INTERESTED: "var(--ds-chart-3)",
  FOLLOW_UP_REQUIRED: "var(--ds-chart-6)",
  APPOINTMENT_BOOKED: "var(--ds-chart-5)",
  VISITED: "var(--ds-chart-4)",
  CONVERTED: "var(--ds-chart-14)",
  LOST: "var(--ds-chart-8)",
  NOT_INTERESTED: "var(--ds-chart-7)",
  NO_RESPONSE: "var(--ds-chart-12)",
}

export default function LeadAnalytics() {

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads", "all"],
    queryFn: () => leadsApi.list({ limit: 500 }),
  })

  const analytics = useMemo(() => {
    const items: Lead[] = Array.isArray(leads) ? leads : (leads as { items?: Lead[] } | undefined)?.items || []
    const total = items.length
    const statusBreakdown: Record<string, number> = {}
    const sourceBreakdown: Record<string, number> = {}
    let highPriority = 0
    let converted = 0
    let followUpDue = 0
    let lost = 0

    items.forEach((l) => {
      statusBreakdown[l.status] = (statusBreakdown[l.status] || 0) + 1
      sourceBreakdown[l.source] = (sourceBreakdown[l.source] || 0) + 1
      if (l.priority === "HIGH") highPriority++
      if (l.status === "CONVERTED") converted++
      if (l.status === "LOST" || l.status === "NOT_INTERESTED" || l.status === "NO_RESPONSE") lost++
      if (l.next_follow_up_date && new Date(l.next_follow_up_date) <= new Date()) followUpDue++
    })

    const statusData = Object.entries(statusBreakdown).map(([name, value]) => ({ name: name.replace(/_/g, " "), value,                 fill: STATUS_COLORS[name] || "var(--ds-chart-7)" }))
    const sourceData = Object.entries(sourceBreakdown).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }))
    const conversionRate = total > 0 ? ((converted / total) * 100).toFixed(1) : "0.0"

    return { total, converted, lost, highPriority, followUpDue, conversionRate, statusData, sourceData }
  }, [leads])

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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="gradient-hero rounded-2xl p-6 md:p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-20" />
        <div className="relative z-10 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
            <BarChart3 className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Lead Analytics</h1>
            <p className="text-white/70 mt-1">Lead performance, source breakdown & conversion metrics</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={CheckCircle2} title="Converted" value={analytics.converted} color="success" delay={0.05} />
        <KpiCard icon={Target} title="Conversion Rate" value={`${analytics.conversionRate}%`} color="info" delay={0.1} />
        <KpiCard icon={Star} title="High Priority" value={analytics.highPriority} color="warning" delay={0.15} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Users} title="Total Leads" value={analytics.total} color="primary" delay={0} />
        <KpiCard icon={AlertTriangle} title="Lost" value={analytics.lost} color="danger" delay={0.2} />
        <KpiCard icon={Calendar} title="Follow-ups Due Today" value={analytics.followUpDue} color="warning" delay={0.25} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><PieChart className="h-4 w-4 text-primary" /> Leads by Status</CardTitle></CardHeader>
          <CardContent>
            {analytics.statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <RePie>
                  <Pie data={analytics.statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(props) => `${String(props.name ?? "")} ${((Number(props.percent ?? 0)) * 100).toFixed(0)}%`}>
                    {analytics.statusData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RePie>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-[var(--ds-text-tertiary)] text-sm">No data</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><BarChart3 className="h-4 w-4 text-primary" /> Leads by Source</CardTitle></CardHeader>
          <CardContent>
            {analytics.sourceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics.sourceData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border-light)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="value" fill="var(--ds-chart-1)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-[var(--ds-text-tertiary)] text-sm">No data</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">Status Distribution</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {analytics.statusData.map((item, idx) => {
              const pct = analytics.total > 0 ? ((item.value / analytics.total) * 100).toFixed(1) : "0"
              return (
                <div key={idx} className="rounded-lg border border-[var(--ds-border)] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.fill }} />
                    <span className="text-sm font-medium text-[var(--ds-text)]">{item.name}</span>
                  </div>
                  <p className="text-xl font-bold text-[var(--ds-text)]">{item.value}</p>
                  <p className="text-xs text-[var(--ds-text-secondary)]">{pct}% of total</p>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
