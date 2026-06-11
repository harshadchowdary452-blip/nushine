import type { LucideIcon } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown } from "lucide-react"

interface KpiCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  trend?: { value: number | string; positive: boolean }
  description?: string
  className?: string
  loading?: boolean
  color?: "primary" | "success" | "warning" | "info" | "danger"
  delay?: number
}

const colorMap = {
  primary: { bg: "bg-primary-soft", text: "text-primary", icon: "text-primary" },
  success: { bg: "bg-success-soft", text: "text-success", icon: "text-success" },
  warning: { bg: "bg-warning-soft", text: "text-warning", icon: "text-warning" },
  info: { bg: "bg-info-soft", text: "text-info", icon: "text-info" },
  danger: { bg: "bg-danger-soft", text: "text-danger", icon: "text-danger" },
}

export default function KpiCard({ title, value, icon: Icon, trend, description, className, loading = false, color = "primary", delay = 0 }: KpiCardProps) {
  const c = colorMap[color]

  if (loading) {
    return (
      <div className={cn("rounded-2xl border border-gray-100 bg-white p-5 shadow-kpi", className)}>
        <div className="space-y-3">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-8 w-32" />
          {description && <div className="skeleton h-3 w-20" />}
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      whileHover={{ y: -2 }}
      className={cn("group rounded-2xl border border-gray-100 bg-white p-5 shadow-kpi transition-all duration-300 hover:shadow-kpi-hover", className)}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: delay + 0.1 }}
            className="text-2xl font-bold tracking-tight text-gray-900"
          >
            {value}
          </motion.p>
          {trend && (
            <div className="flex items-center gap-1.5">
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                trend.positive ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
              )}>
                {trend.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trend.value}
              </span>
              {description && <span className="text-xs text-gray-400">{description}</span>}
            </div>
          )}
          {!trend && description && <p className="text-xs text-gray-400">{description}</p>}
        </div>
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110", c.bg, c.text)}>
          <Icon className={cn("h-5 w-5", c.icon)} />
        </div>
      </div>
    </motion.div>
  )
}
