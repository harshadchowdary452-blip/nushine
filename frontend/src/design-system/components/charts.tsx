import * as React from "react"
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts"
import { cn } from "@/lib/utils"
import { Skeleton } from "./skeleton"

interface ChartCardProps {
  title?: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  loading?: boolean
  height?: number
}

/** Card shell shared by every chart so heights, radii and loading match. */
export function ChartCard({ title, description, actions, children, className, loading = false, height }: ChartCardProps) {
  return (
    <section className={cn("rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-card-padding)] shadow-[var(--ds-shadow-card)]", className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="ds-min-w-0">
            {title && <h3 className="ds-card-title text-[var(--ds-text)]">{title}</h3>}
            {description && <p className="ds-caption text-[var(--ds-text-tertiary)]">{description}</p>}
          </div>
          {actions && <div className="ds-cluster ds-cluster-sm shrink-0">{actions}</div>}
        </div>
      )}
      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="w-full" style={height ? { height } : { height: 160 }} />
        </div>
      ) : (
        children
      )}
    </section>
  )
}

export interface ChartTooltipEntry {
  name: string
  value: number
  color: string
  dataKey: string
}

interface ChartTooltipProps {
  active?: boolean
  payload?: ChartTooltipEntry[]
  label?: string
  /** Formats every value in the payload (e.g. currency). */
  formatter?: (value: number) => string
}

/** Tokenized tooltip shared by every chart in the product. */
export function ChartTooltip({ active, payload, label, formatter }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-3 shadow-[var(--ds-shadow-dropdown)]">
      {label != null && label !== "" && <p className="ds-nav-label mb-1 font-semibold text-[var(--ds-text)]">{label}</p>}
      <ul className="flex flex-col gap-0.5">
        {payload.map((entry, index) => (
          <li key={`${entry.name}-${index}`} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-xs text-[var(--ds-text-secondary)]">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden="true" />
              {entry.name}
            </span>
            <span className="ds-numeric text-xs font-semibold text-[var(--ds-text)]">
              {formatter ? formatter(entry.value ?? 0) : entry.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface MiniSparklineProps {
  data: number[]
  id: string
  stroke?: string
  fill?: string
  height?: number
  className?: string
}

/**
 * Measures the container with a ResizeObserver and feeds explicit numeric
 * width/height into Recharts' ResponsiveContainer. Recharts warns with
 * "width(-1)/height(-1)" whenever it self-measures a 0x0 container (first
 * frame, collapsed collapsible, tab switch), so the chart is only rendered
 * once it has positive dimensions and re-renders on every resize.
 */
export function useContainerSize<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null)
  const [size, setSize] = React.useState({ width: 0, height: 0 })

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setSize((prev) =>
        prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height },
      )
    }
    update()
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(update)
      observer.observe(el)
      return () => observer.disconnect()
    }
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  return { ref, size }
}

/** Tiny area sparkline for KPI and trend cards. Uses a unique gradient id. */
export function MiniSparkline({ data, id, stroke = "var(--ds-primary)", fill = "var(--ds-primary)", height = 40, className }: MiniSparklineProps) {
  const { ref, size } = useContainerSize<HTMLDivElement>()
  const points = data.map((value, index) => ({ index, value }))
  const gradientId = `ds-spark-${id}`

  if (data.length < 2) {
    return <div className={className} style={{ height }} aria-hidden="true" />
  }

  return (
    <div ref={ref} className={cn("w-full", className)} style={{ height }} aria-hidden="true">
      {size.width > 0 && size.height > 0 && (
        <ResponsiveContainer width={size.width} height={size.height}>
          <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={fill} stopOpacity={0.18} />
                <stop offset="100%" stopColor={fill} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip
              content={<ChartTooltip formatter={(value) => String(value)} />}
              cursor={{ stroke: "var(--ds-border)", strokeDasharray: "3 3" }}
            />
            <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={1.75} fill={`url(#${gradientId})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
