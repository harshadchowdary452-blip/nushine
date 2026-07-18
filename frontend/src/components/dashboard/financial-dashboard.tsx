import { useState, useMemo, memo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  DollarSign, TrendingUp, PieChart, IndianRupee, BarChart3, AlertCircle,
  ExternalLink,
} from "lucide-react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart as RePieChart, Pie, Cell,
} from "recharts"
import { useAuthStore } from "@/store/authStore"
import { dashboardApi } from "@/services/endpoints"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import KpiCard from "@/components/layout/kpi-card"
import DateFilterBar from "@/components/ui/date-filter-bar"
import { Button } from "@/components/ui/button"
import { formatIndianRupees, formatIndianNumber } from "@/lib/currency"
import type { RevenueExpenseTrendPoint } from "@/types"
import { cn } from "@/lib/utils"

const PIE_COLORS = ["#4F46E5", "#EF4444", "#F59E0B", "#10B981", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316", "#14B8A6", "#84CC16"]

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string; dataKey: string }>
  label?: string
}

const ChartTooltip = ({ active, payload, label }: ChartTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-lg">
        <p className="text-sm font-semibold text-gray-900 mb-1">{label}</p>
        {payload.map((p, i) => {
          const isFinancial = ["Revenue", "Expenses", "Profit", "revenue", "expenses", "profit"].includes(p.name) || ["revenue", "expenses", "profit"].includes(p.dataKey)
          return (
            <p key={i} className="text-xs" style={{ color: p.color }}>
              {p.name}: {isFinancial ? formatIndianRupees(p.value != null ? p.value : 0) : formatIndianNumber(p.value != null ? p.value : 0)}
            </p>
          )
        })}
      </div>
    )
  }
  return null
}

interface FinancialDashboardProps {
  className?: string
}

function FinancialDashboard({ className }: FinancialDashboardProps) {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [period, setPeriod] = useState("this_month")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const role = user?.role || ""

  const dashParams = useMemo(() => {
    const p: Record<string, string> = { period }
    if (period === "custom" && startDate) p.start_date = startDate
    if (period === "custom" && endDate) p.end_date = endDate
    return p
  }, [period, startDate, endDate])

  const { data: stats, isLoading } = useQuery({
    queryKey: ["financial-dashboard", role, user?.id, dashParams],
    queryFn: () => {
      if (role === "SUPER_ADMIN") return dashboardApi.superAdmin(dashParams)
      if (role === "GROUP_ADMIN") return dashboardApi.groupAdmin(dashParams)
      return dashboardApi.hospitalAdmin(dashParams)
    },
    staleTime: 10000,
    gcTime: 60000,
    refetchInterval: 30000,
  })

  if (!user) return null

  if (isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        <Skeleton className="h-8 w-48 rounded-lg" />
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-[90px] rounded-xl" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-[320px] rounded-xl" />
          <Skeleton className="h-[320px] rounded-xl" />
        </div>
      </div>
    )
  }

  const periodRevenue = stats?.period_revenue ?? 0
  const totalExpenses = stats?.total_expenses ?? 0
  const netProfit = stats?.net_profit ?? 0
  const profitMargin = stats?.profit_margin ?? 0
  const outstandingPayments = stats?.total_pending_billing ?? 0
  const expenseBreakdown: { category: string; amount: number }[] = stats?.expense_breakdown || []
  const revenueExpenseTrend: RevenueExpenseTrendPoint[] = stats?.revenue_expense_trend || []
  const totalExpenseAmount = expenseBreakdown.reduce((s: number, e) => s + e.amount, 0)

  return (
    <div className={cn("space-y-4", className)}>
      {/* Quick View Filter */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-indigo-500" /> Financial Overview
        </h2>
        <DateFilterBar period={period} onPeriodChange={setPeriod} startDate={startDate} endDate={endDate} onStartDateChange={setStartDate} onEndDateChange={setEndDate} />
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          icon={DollarSign}
          title="Total Revenue"
          value={formatIndianRupees(periodRevenue)}
          color="success"
          delay={0}
          onClick={() => navigate("/billing")}
        />
        <KpiCard
          icon={IndianRupee}
          title="Total Expenses"
          value={formatIndianRupees(totalExpenses)}
          color="danger"
          delay={0.04}
          onClick={() => navigate("/admin/expenses")}
        />
        <KpiCard
          icon={TrendingUp}
          title="Net Profit"
          value={formatIndianRupees(netProfit)}
          color={netProfit >= 0 ? "success" : "danger"}
          delay={0.08}
        />
        <KpiCard
          icon={PieChart}
          title="Profit Margin"
          value={profitMargin != null ? `${profitMargin.toFixed(1)}%` : "0%"}
          color="primary"
          delay={0.12}
        />
        <KpiCard
          icon={AlertCircle}
          title="Outstanding Payments"
          value={formatIndianRupees(outstandingPayments)}
          color="warning"
          delay={0.16}
          onClick={() => navigate("/billing")}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Revenue vs Expenses */}
        <Card>
          <CardHeader className="px-4 py-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Revenue vs Expenses</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate("/billing")}>
              View Billings <ExternalLink className="h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={revenueExpenseTrend.length > 0 ? revenueExpenseTrend : ([{ month: "No data", revenue: 0, expenses: 0, profit: 0, profit_margin: 0 }] as RevenueExpenseTrendPoint[])}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5, onClick: () => navigate("/billing") }} />
                <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5, onClick: () => navigate("/admin/expenses") }} />
                <Line type="monotone" dataKey="profit" name="Profit" stroke="#4F46E5" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Expense Breakdown */}
        <Card>
          <CardHeader className="px-4 py-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Expense Breakdown</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate("/admin/expenses")}>
              View All <ExternalLink className="h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {expenseBreakdown.length > 0 ? (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <ResponsiveContainer width="50%" height={220}>
                  <RePieChart>
                    <Pie
                      data={expenseBreakdown}
                      dataKey="amount"
                      nameKey="category"
                      cx="50%" cy="50%"
                      outerRadius={80}
                      innerRadius={40}
                      label={(props) => `${String((props as unknown as Record<string, unknown>).category ?? "")} ${((Number(props.percent ?? 0)) * 100).toFixed(0)}%`}
                    >
                      {expenseBreakdown.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatIndianRupees(Number(value))} />
                  </RePieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5 w-full">
                  <div className="flex items-center justify-between text-xs font-semibold text-gray-500 pb-1 border-b">
                    <span>Category</span>
                    <span>Amount</span>
                  </div>
                  {expenseBreakdown.map((item, i) => (
                    <div
                      key={item.category}
                      className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/admin/expenses?category=${encodeURIComponent(item.category)}&period=${period}${startDate ? `&start_date=${startDate}` : ""}${endDate ? `&end_date=${endDate}` : ""}`)}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="font-medium text-gray-700">{item.category}</span>
                      </div>
                      <span className="font-semibold text-gray-900">{formatIndianRupees(item.amount)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-xs font-bold pt-2 border-t mt-2">
                    <span>Total</span>
                    <span>{formatIndianRupees(totalExpenseAmount || totalExpenses)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-sm text-gray-400">
                No expenses for this period
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default memo(FinancialDashboard)
