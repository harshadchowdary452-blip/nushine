import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown } from "lucide-react"

interface KpiCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: { value: string; positive: boolean }
  icon: React.ElementType
  color?: string
  delay?: number
  loading?: boolean
}

export default function KpiCard({ title, value, subtitle, trend, icon: Icon, color = "text-primary", delay = 0, loading }: KpiCardProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-kpi">
        <div className="space-y-3">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-8 w-32" />
          <div className="skeleton h-3 w-20" />
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className="rounded-2xl border border-gray-100 bg-white p-5 shadow-kpi hover:shadow-kpi-hover hover:-translate-y-0.5 transition-all duration-300 group"
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 group-hover:scale-110 transition-transform duration-300", color)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="space-y-1">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: delay + 0.1 }}
          className="text-2xl font-bold text-gray-900 tracking-tight"
        >
          {value}
        </motion.p>
        {subtitle && (
          <p className="text-xs text-gray-400">{subtitle}</p>
        )}
      </div>
      {trend && (
        <div className={cn("mt-3 flex items-center gap-1 text-xs font-medium", trend.positive ? "text-success" : "text-danger")}>
          {trend.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {trend.value}
        </div>
      )}
    </motion.div>
  )
}
