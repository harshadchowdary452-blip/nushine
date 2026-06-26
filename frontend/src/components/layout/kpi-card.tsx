import { memo } from "react"
import type { LucideIcon } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, ChevronRight } from "lucide-react"

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
  onClick?: () => void
}

const colorMap = {
  primary: { bg: "bg-indigo-50", text: "text-indigo-600", icon: "text-indigo-600" },
  success: { bg: "bg-emerald-50", text: "text-emerald-600", icon: "text-emerald-600" },
  warning: { bg: "bg-amber-50", text: "text-amber-600", icon: "text-amber-600" },
  info: { bg: "bg-cyan-50", text: "text-cyan-600", icon: "text-cyan-600" },
  danger: { bg: "bg-red-50", text: "text-red-600", icon: "text-red-600" },
}

function KpiCard({ title, value, icon: Icon, trend, description, className, loading = false, color = "primary", delay = 0, onClick }: KpiCardProps) {
  const c = colorMap[color]

  if (loading) {
    return (
      <div className={cn("rounded-xl border border-gray-200 bg-white p-3.5 shadow-card", className)}>
        <div className="flex items-center gap-3">
          <div className="skeleton h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-5 w-24" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: "easeOut" }}
      whileHover={{ y: -1 }}
      onClick={onClick}
      className={cn(
        "group rounded-xl border border-gray-200 bg-white p-3.5 shadow-card transition-all duration-200 hover:shadow-card-hover",
        onClick && "cursor-pointer",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105", c.bg, c.text)}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">{title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: delay + 0.05 }}
              className="text-card-title text-text-primary"
            >
              {value}
            </motion.p>
            {onClick && (
              <ChevronRight className="h-3.5 w-3.5 text-text-muted opacity-0 -ml-1 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
          {trend && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                trend.positive ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
              )}>
                {trend.positive ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                {trend.value}
              </span>
              {description && <span className="text-[10px] text-text-muted">{description}</span>}
            </div>
          )}
          {!trend && description && <p className="text-[10px] text-text-muted mt-0.5">{description}</p>}
        </div>
      </div>
    </motion.div>
  )
}

export default memo(KpiCard)
