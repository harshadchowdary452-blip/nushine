import { useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, TrendingUp, TrendingDown } from "lucide-react"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area } from "recharts"
import { cn } from "@/lib/utils"
import { formatIndianRupees, formatIndianNumber } from "@/lib/currency"

interface ChartDataItem {
  [key: string]: string | number
}

interface ChartTooltipPayloadItem {
  color: string
  name: string
  value: number | null
}

interface ChartTooltipProps {
  active?: boolean
  payload?: ChartTooltipPayloadItem[]
  label?: string
  valueType?: string
}

interface AnalyticsDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  icon?: React.ReactNode
  color?: string
  data?: ChartDataItem[]
  trend?: { value: number | string; positive: boolean } | null
  metrics?: { label: string; value: string; color?: string }[]
  chartType?: "line" | "bar" | "area"
  dataKeys?: { key: string; name: string; color: string }[]
  xAxisKey?: string
  valueType?: "currency" | "number"
  period?: string
  onPeriodChange?: (period: string) => void
}

const periodMap: Record<string, string> = {
  today: "Today",
  this_week: "Week",
  this_month: "Month",
  this_quarter: "Quarter",
  this_year: "Year",
}

const reversePeriodMap: Record<string, string> = {
  Today: "today",
  Week: "this_week",
  Month: "this_month",
  Quarter: "this_quarter",
  Year: "this_year",
}

const drawerPeriods = ["Today", "Week", "Month", "Quarter", "Year"]

const ChartTooltip = ({ active, payload, label, valueType }: ChartTooltipProps) => {
  if (active && payload && payload.length) {
    const fmt = valueType === "number" ? formatIndianNumber : formatIndianRupees
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-lg">
        <p className="text-sm font-semibold text-gray-900 mb-1">{label}</p>
        {payload.map((p: ChartTooltipPayloadItem, i: number) => (
          <p key={i} className="text-xs" style={{ color: p.color }}>
            {p.name}: {fmt(p.value != null ? p.value : 0)}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export default function AnalyticsDrawer({
  open, onClose, title, icon, color = "var(--ds-primary-600)", data = [], trend, metrics = [],
  chartType = "line", dataKeys = [], xAxisKey = "month", valueType = "currency",
  period, onPeriodChange,
}: AnalyticsDrawerProps) {
  const fmt = valueType === "number" ? formatIndianNumber : formatIndianRupees

  const displayPeriod = period ? (periodMap[period] || "Month") : "Month"

  const chartData = useMemo(() => {
    if (data.length > 0) return data
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return months.map((m) => ({ [xAxisKey]: m, [dataKeys[0]?.key || "value"]: 0 }))
  }, [data, xAxisKey, dataKeys])

  const renderChart = () => {
    const ChartComponent = chartType === "bar" ? BarChart : chartType === "area" ? AreaChart : LineChart
    const DataComponent = chartType === "bar" ? Bar : chartType === "area" ? Area : Line
    const extraProps = chartType === "area" ? { fillOpacity: 0.15 } : {}

    return (
      <ResponsiveContainer width="100%" height={280}>
        <ChartComponent data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border-light)" />
          <XAxis dataKey={xAxisKey} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => valueType === "number" ? formatIndianNumber(v) : `₹${(v / 1000).toFixed(0)}k`} />
          <Tooltip content={<ChartTooltip valueType={valueType} />} />
          {dataKeys.length > 1 && <Legend />}
          {dataKeys.map((dk) => (
            <DataComponent key={dk.key} type="monotone" dataKey={dk.key} name={dk.name} stroke={dk.color} fill={dk.color} strokeWidth={2} dot={{ r: 3 }} {...extraProps} />
          ))}
        </ChartComponent>
      </ResponsiveContainer>
    )
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[var(--ds-z-dialog)] bg-black/30"
            onClick={onClose} />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 bottom-0 z-[var(--ds-z-dialog)] w-full max-w-lg bg-white shadow-2xl md:max-w-md lg:max-w-lg overflow-y-auto"
          >
            <div className="sticky top-0 z-[var(--ds-z-sticky)] bg-white border-b border-gray-100">
              <div className="flex items-center justify-between p-6 pb-4">
                <div className="flex items-center gap-3">
                  {icon && <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}15`, color }}>{icon}</div>}
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                    {trend && (
                      <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", trend.positive ? "text-success" : "text-danger")}>
                        {trend.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {trend.value} vs last period
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-6 pt-4 space-y-6">
              {onPeriodChange && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {drawerPeriods.map((p) => (
                    <button key={p} onClick={() => onPeriodChange(reversePeriodMap[p])}
                      className={cn(
                        "shrink-0 rounded-lg px-4 py-1.5 text-sm font-medium transition-all",
                        displayPeriod === p ? "bg-primary text-primary-foreground shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      )}>
                      {p}
                    </button>
                  ))}
                </div>
              )}

              {metrics.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {metrics.map((m, i) => (
                    <div key={i} className="rounded-xl border bg-white p-4">
                      <p className="text-xs text-gray-500 font-medium">{m.label}</p>
                      <p className="text-xl font-bold mt-1" style={{ color: m.color || "var(--ds-text)" }}>{m.value}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl border bg-white p-4">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Trend</h3>
                {renderChart()}
              </div>

              <div className="rounded-xl border bg-white p-4">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Insights</h3>
                <ul className="space-y-2">
                  {chartData.length > 0 && (
                    <>
                      <li className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-success" />
                        Peak value: {dataKeys[0] ? `${dataKeys[0].name}: ${fmt(Math.max(...chartData.map(d => Number(d[dataKeys[0]?.key || "value"]) || 0)))}` : "N/A"}
                      </li>
                      <li className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-warning" />
                        Average: {dataKeys[0] ? fmt(chartData.reduce((s, d) => s + (Number(d[dataKeys[0]?.key || "value"]) || 0), 0) / chartData.length) : "N/A"}
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
