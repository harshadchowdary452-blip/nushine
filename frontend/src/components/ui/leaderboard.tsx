import { memo } from "react"
import { motion } from "framer-motion"
import { TrendingUp, TrendingDown, Medal, Trophy, Award } from "lucide-react"
import { cn } from "@/lib/utils"

interface LeaderboardItem {
  rank: number
  name: string
  value: string
  subtitle?: string
  growth?: string
  positive?: boolean
  id?: string
}

interface LeaderboardProps {
  title: string
  items: LeaderboardItem[]
  valueLabel?: string
  loading?: boolean
  icon?: React.ElementType
  onItemClick?: (id?: string) => void
}

const rankIcons = [Trophy, Medal, Award]
const rankColors = ["text-yellow-500", "text-gray-400", "text-amber-700"]

function Leaderboard({ title, items, valueLabel, loading, icon: Icon, onItemClick }: LeaderboardProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-kpi">
        <div className="skeleton h-5 w-32 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-12 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-gray-100 bg-white p-5 shadow-kpi hover:shadow-kpi-hover transition-all duration-300"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-primary" />}
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        </div>
        {valueLabel && <span className="text-xs text-gray-400">{valueLabel}</span>}
      </div>

      <div className="space-y-2">
        {items.map((item, idx) => {
          const RankIcon = item.rank <= 3 ? rankIcons[item.rank - 1] : null
          const rankColor = item.rank <= 3 ? rankColors[item.rank - 1] : "text-gray-300"
          return (
            <motion.div
              key={item.rank}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: item.rank * 0.04 }}
              onClick={() => onItemClick?.(item.id)}
              className={cn(
                "flex items-center justify-between rounded-xl px-4 py-3 transition-all hover:bg-gray-50 cursor-pointer border border-transparent",
                item.rank <= 3 && "bg-gradient-to-r from-amber-50/50 to-transparent",
                idx < items.length - 1 && "border-b border-gray-100/80"
              )}
            >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold", rankColor)}>
                    {RankIcon ? <RankIcon className="h-4 w-4" /> : <span className="text-gray-300">#{item.rank}</span>}
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-gray-700 truncate block">{item.name}</span>
                    {item.subtitle && <span className="text-[10px] text-gray-400 truncate block mt-0.5">{item.subtitle}</span>}
                  </div>
                </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-semibold text-gray-900">{item.value}</span>
                {item.growth && (
                  <span className={cn("flex items-center gap-0.5 text-xs font-medium", item.positive ? "text-success" : "text-danger")}>
                    {item.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {item.growth}
                  </span>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}

export default memo(Leaderboard)
