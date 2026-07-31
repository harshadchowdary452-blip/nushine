import { memo } from "react"
import { motion } from "framer-motion"
import { TrendingUp, TrendingDown, Medal, Trophy, Award } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/design-system/components/skeleton"

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
const rankColors = [
  "text-[var(--ds-warning)]",
  "text-[var(--ds-text-tertiary)]",
  "text-[var(--ds-accent)]",
]

function Leaderboard({ title, items, valueLabel, loading, icon: Icon, onItemClick }: LeaderboardProps) {
  if (loading) {
    return (
      <div className="rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-card-padding)] shadow-[var(--ds-shadow-card)]">
        <Skeleton className="mb-4 h-5 w-32" />
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="ds-hover-lift rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-card-padding)] shadow-[var(--ds-shadow-card)]"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-[var(--ds-primary)]" />}
          <h3 className="ds-card-title text-[var(--ds-text)]">{title}</h3>
        </div>
        {valueLabel && <span className="ds-caption text-[var(--ds-text-tertiary)]">{valueLabel}</span>}
      </div>

      <div className="flex flex-col gap-2">
        {items.map((item, idx) => {
          const RankIcon = item.rank <= 3 ? rankIcons[item.rank - 1] : null
          const rankColor = item.rank <= 3 ? rankColors[item.rank - 1] : "text-[var(--ds-text-tertiary)]"
          return (
            <motion.div
              key={item.rank}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: item.rank * 0.04 }}
              onClick={() => onItemClick?.(item.id)}
              className={cn(
                "flex cursor-pointer items-center justify-between rounded-[var(--ds-radius-xl)] border border-transparent px-4 py-3 transition-all hover:bg-[var(--ds-surface-hover)]",
                item.rank <= 3 && "bg-[var(--ds-warning-subtle)]/40",
                idx < items.length - 1 && "border-b-[var(--ds-border-light)]"
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--ds-radius-lg)] text-xs font-bold", rankColor)}>
                  {RankIcon ? <RankIcon className="h-4 w-4" /> : <span className="text-[var(--ds-text-tertiary)]">#{item.rank}</span>}
                </div>
                <div className="min-w-0">
                  <span className="ds-body block truncate text-[var(--ds-text)]">{item.name}</span>
                  {item.subtitle && <span className="ds-caption mt-0.5 block truncate text-[var(--ds-text-tertiary)]">{item.subtitle}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="ds-nav-label font-semibold text-[var(--ds-text)]">{item.value}</span>
                {item.growth && (
                  <span className={cn("flex items-center gap-0.5 text-xs font-medium", item.positive ? "text-[var(--ds-success)]" : "text-[var(--ds-danger)]")}>
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
