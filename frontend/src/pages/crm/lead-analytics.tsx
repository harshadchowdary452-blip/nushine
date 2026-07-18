import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  Users, TrendingUp, BarChart3, PieChart,
  Target, Star, AlertTriangle, CheckCircle2, Calendar,
} from "lucide-react"
import { leadsApi } from "@/services/endpoints"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { Skeleton } from "@/components/ui/skeleton"
import KpiCard from "@/components/layout/kpi-card"
import { PieChart as RePie, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"

import type { Lead } from "@/types"

const STATUS_COLORS: Record<string, string> = {
  NEW: "#0EA5E9",
  CONTACTED: "#8B5CF6",
  INTERESTED: "#06B6D4",
  FOLLOW_UP_REQUIRED: "#F59E0B",
  APPOINTMENT_BOOKED: "#6366F1",
  VISITED: "#10B981",
  CONVERTED: "#22C55E",
  LOST: "#EF4444",
  NOT_INTERESTED: "#64748B",
  NO_RESPONSE: "#F97316",
}

export default function LeadAnalytics() {

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads", "all"],
    queryFn: () => leadsApi.list({ limit: 500 }),
  })

  const analytics = useMemo(() => {
    const items: Lead[] = Array.isArray(leads) ? leads : []
    const total = items.length
    const statusBreakdown: Record<string, number> = {}
    const sourceBreakdown: Record<string, number> = {}
    let totalScore = 0
    let highPriority = 0
    let converted = 0
    let followUpDue = 0
    let lost = 0

    items.forEach((l) => {
      statusBreakdown[l.status] = (statusBreakdown[l.status] || 0) + 1
      sourceBreakdown[l.source] = (sourceBreakdown[l.source] || 0) + 1
      totalScore += l.lead_score || 0
      if (l.priority === "HIGH") highPriority++
      if (l.status === "CONVERTED") converted++
      if (l.status === "LOST" || l.status === "NOT_INTERESTED" || l.status === "NO_RESPONSE") lost++
      if (l.next_follow_up_date && new Date(l.next_follow_up_date) <= new Date()) followUpDue++
    })

    const statusData = Object.entries(statusBreakdown).map(([name, value]) => ({ name: name.replace(/_/g, " "), value, fill: STATUS_COLORS[name] || "#64748B" }))
    const sourceData = Object.entries(sourceBreakdown).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }))
    const conversionRate = total > 0 ? ((converted / total) * 100).toFixed(1) : "0.0"
    const avgScore = total > 0 ? (totalScore / total).toFixed(0) : "0"

    return { total, converted, lost, highPriority, followUpDue, conversionRate, avgScore, statusData, sourceData }
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
        <KpiCard icon={Users} title="Total Leads" value={analytics.total} color="primary" delay={0} />
        <KpiCard icon={CheckCircle2} title="Converted" value={analytics.converted} color="success" delay={0.05} />
        <KpiCard icon={Target} title="Conversion Rate" value={`${analytics.conversionRate}%`} color="info" delay={0.1} />
        <KpiCard icon={TrendingUp} title="Avg Lead Score" value={analytics.avgScore} color="primary" delay={0.15} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Star} title="High Priority" value={analytics.highPriority} color="warning" delay={0.2} />
        <KpiCard icon={AlertTriangle} title="Lost" value={analytics.lost} color="danger" delay={0.25} />
        <KpiCard icon={Calendar} title="Follow-ups Due Today" value={analytics.followUpDue} color="warning" delay={0.3} />
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
              <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">No data</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><BarChart3 className="h-4 w-4 text-primary" /> Leads by Source</CardTitle></CardHeader>
          <CardContent>
            {analytics.sourceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics.sourceData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#0EA5E9" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">No data</div>
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
                <div key={idx} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.fill }} />
                    <span className="text-sm font-medium text-gray-800">{item.name}</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900">{item.value}</p>
                  <p className="text-xs text-gray-500">{pct}% of total</p>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
