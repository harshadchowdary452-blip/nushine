import { useState, useMemo, memo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts"
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import { dashboardApi } from "@/services/endpoints"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import DateFilterBar from "@/components/ui/date-filter-bar"
import { formatIndianRupees } from "@/lib/currency"
import { cn } from "@/lib/utils"

interface ExpensesVsRevenueQuickViewProps {
  className?: string
}

const MiniTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-gray-100 bg-white p-2 shadow-md">
        <p className="text-xs font-semibold text-gray-700 mb-0.5">{label}</p>
        {payload.map((p: { color: string; name: string; value: number }, i: number) => (
          <p key={i} className="text-xs font-medium" style={{ color: p.color }}>
            {p.name}: {formatIndianRupees(p.value ?? 0)}
          </p>
        ))}
      </div>
    )
  }
  return null
}

function ExpensesVsRevenueQuickView({ className }: ExpensesVsRevenueQuickViewProps) {
  const { user } = useAuthStore()
  const role = user?.role || ""

  const [period, setPeriod] = useState("this_month")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const dashParams = useMemo(() => {
    const p: Record<string, string> = { period }
    if (period === "custom" && startDate) p.start_date = startDate
    if (period === "custom" && endDate) p.end_date = endDate
    return p
  }, [period, startDate, endDate])

  const { data: stats, isLoading } = useQuery({
    queryKey: ["expenses-revenue-quickview", role, user?.id, dashParams],
    queryFn: () => {
      if (role === "SUPER_ADMIN") return dashboardApi.superAdmin(dashParams)
      if (role === "GROUP_ADMIN") return dashboardApi.groupAdmin(dashParams)
      return dashboardApi.hospitalAdmin(dashParams)
    },
    staleTime: 10000,
    gcTime: 60000,
  })

  if (!user) return null

  const periodRevenue = stats?.period_revenue ?? 0
  const totalExpenses = stats?.total_expenses ?? 0
  const netProfit = periodRevenue - totalExpenses
  const profitMargin = periodRevenue > 0 ? (netProfit / periodRevenue) * 100 : 0

  const compareData = [
    { name: "Revenue", amount: periodRevenue, fill: "var(--ds-chart-4)" },
    { name: "Expenses", amount: totalExpenses, fill: "var(--ds-chart-8)" },
  ]

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
          <DollarSign className="h-3.5 w-3.5 text-indigo-500" />
          Revenue vs Expenses
        </h3>
        <DateFilterBar
          period={period}
          onPeriodChange={setPeriod}
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          compact
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-green-100 bg-green-50/40">
              <CardContent className="p-3">
                <p className="text-xs text-green-700 font-medium mb-0.5">Revenue</p>
                <p className="text-sm font-bold text-green-900">{formatIndianRupees(periodRevenue)}</p>
              </CardContent>
            </Card>
            <Card className="border-red-100 bg-red-50/40">
              <CardContent className="p-3">
                <p className="text-xs text-red-700 font-medium mb-0.5">Expenses</p>
                <p className="text-sm font-bold text-red-900">{formatIndianRupees(totalExpenses)}</p>
              </CardContent>
            </Card>
            <Card className={cn("border", netProfit >= 0 ? "border-indigo-100 bg-indigo-50/40" : "border-orange-100 bg-orange-50/40")}>
              <CardContent className="p-3">
                <div className="flex items-center gap-1 mb-0.5">
                  {netProfit >= 0 ? <TrendingUp className="h-3 w-3 text-indigo-600" /> : <TrendingDown className="h-3 w-3 text-orange-600" />}
                  <p className="text-xs font-medium text-gray-600">Net Profit</p>
                </div>
                <p className={cn("text-sm font-bold", netProfit >= 0 ? "text-indigo-900" : "text-orange-900")}>
                  {formatIndianRupees(netProfit)}
                </p>
                <p className={cn("text-[10px] mt-0.5", netProfit >= 0 ? "text-indigo-500" : "text-orange-500")}>
                  {profitMargin.toFixed(1)}% margin
                </p>
              </CardContent>
            </Card>
          </div>

          {periodRevenue > 0 || totalExpenses > 0 ? (
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={compareData} barCategoryGap="40%">
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip content={<MiniTooltip />} cursor={{ fill: "transparent" }} />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-center text-xs text-gray-400 py-3">No data for this period</p>
          )}
        </>
      )}
    </div>
  )
}

export default memo(ExpensesVsRevenueQuickView)
