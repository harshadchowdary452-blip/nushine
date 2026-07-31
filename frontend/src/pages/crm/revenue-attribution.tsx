import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  IndianRupee, TrendingUp, Users, BarChart3, PieChart, Target,
} from "lucide-react"
import { leadsApi } from "@/services/endpoints"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { Skeleton } from "@/components/ui/skeleton"
import KpiCard from "@/components/layout/kpi-card"
import { PieChart as RePie, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import { formatIndianRupees } from "@/lib/currency"
import type { Lead } from "@/types"

const SOURCE_COLORS = [
  "var(--ds-chart-1)",
  "var(--ds-chart-10)",
  "var(--ds-chart-6)",
  "var(--ds-chart-4)",
  "var(--ds-chart-8)",
  "var(--ds-chart-13)",
  "var(--ds-chart-2)",
  "var(--ds-chart-12)",
  "var(--ds-chart-5)",
  "var(--ds-chart-14)",
  "var(--ds-chart-11)",
  "var(--ds-chart-16)",
  "var(--ds-chart-15)",
  "var(--ds-chart-3)",
  "var(--ds-chart-9)",
  "var(--ds-chart-7)",
]

export default function RevenueAttribution() {

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads", "all"],
    queryFn: () => leadsApi.list({ limit: 500 }),
  })

  const revenueData = useMemo(() => {
    const items: Lead[] = Array.isArray(leads) ? leads : []
    const converted = items.filter((l) => l.status === "CONVERTED")
    const sourceRevenue: Record<string, { count: number; potentialRevenue: number }> = {}

    items.forEach((l) => {
      if (!sourceRevenue[l.source]) sourceRevenue[l.source] = { count: 0, potentialRevenue: 0 }
      sourceRevenue[l.source].count++
      sourceRevenue[l.source].potentialRevenue += l.budget || 0
    })

    const bySource = Object.entries(sourceRevenue)
      .sort((a, b) => b[1].potentialRevenue - a[1].potentialRevenue)
      .map(([source, data], idx) => ({
        source: source.replace(/_/g, " "),
        leads: data.count,
        potentialRevenue: data.potentialRevenue,
        convertedLeads: converted.filter((l) => l.source === source).length,
        fill: SOURCE_COLORS[idx % SOURCE_COLORS.length],
      }))

    const totalPotential = bySource.reduce((s, r) => s + r.potentialRevenue, 0)
    const totalLeads = items.length

    return { bySource, totalPotential, totalLeads, convertedCount: converted.length }
  }, [leads])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[130px] rounded-2xl" />)}
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
            <IndianRupee className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Revenue Attribution</h1>
            <p className="text-white/70 mt-1">Lead-to-revenue tracking by source</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={IndianRupee} title="Total Potential Revenue" value={formatIndianRupees(revenueData.totalPotential)} color="success" delay={0} />
        <KpiCard icon={Users} title="Total Leads" value={revenueData.totalLeads} color="primary" delay={0.05} />
        <KpiCard icon={Target} title="Converted" value={revenueData.convertedCount} color="info" delay={0.1} />
        <KpiCard icon={TrendingUp} title="Avg Revenue per Lead" value={formatIndianRupees(revenueData.totalLeads > 0 ? revenueData.totalPotential / revenueData.totalLeads : 0)} color="info" delay={0.15} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><PieChart className="h-4 w-4 text-primary" /> Revenue Distribution by Source</CardTitle></CardHeader>
          <CardContent>
            {revenueData.bySource.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <RePie>
                  <Pie data={revenueData.bySource} dataKey="potentialRevenue" nameKey="source" cx="50%" cy="50%" outerRadius={100} label={(props) => `${String(props.name ?? "")} ${((Number(props.percent ?? 0)) * 100).toFixed(0)}%`}>
                    {revenueData.bySource.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: unknown) => formatIndianRupees(Number(value))} />
                </RePie>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">No data</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><BarChart3 className="h-4 w-4 text-primary" /> Revenue by Source</CardTitle></CardHeader>
          <CardContent>
            {revenueData.bySource.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={revenueData.bySource} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border-light)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `\u20B9${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="source" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={(value: unknown) => formatIndianRupees(Number(value))} />
                  <Bar dataKey="potentialRevenue" fill="var(--ds-chart-1)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">No data</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">Source Performance</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase">Source</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase">Leads</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase">Converted</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase">Conversion %</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase">Potential Revenue</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase">Revenue per Lead</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {revenueData.bySource.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.fill }} />
                        <span className="font-medium text-gray-800">{row.source}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{row.leads}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{row.convertedLeads}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      <span className={row.leads > 0 ? "text-green-600" : "text-gray-400"}>
                        {row.leads > 0 ? ((row.convertedLeads / row.leads) * 100).toFixed(1) : "0.0"}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{formatIndianRupees(row.potentialRevenue)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{row.leads > 0 ? formatIndianRupees(row.potentialRevenue / row.leads) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
