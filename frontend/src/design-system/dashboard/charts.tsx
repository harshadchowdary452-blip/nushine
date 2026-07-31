/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/design-system/components/button"
import { ChartCard, ChartTooltip } from "@/design-system/components/charts"
import { Skeleton } from "@/design-system/components/skeleton"

export interface ChartSeries {
  dataKey: string
  name: string
  /** CSS var token, e.g. "var(--ds-chart-1)". */
  color: string
  type?: "line" | "bar" | "area"
}

export interface ChartPoint {
  /** Value of the x-axis key for the clicked element. */
  label: string
  /** The full data row the element was built from. */
  data: Record<string, unknown>
}

export interface DashboardChartProps {
  data: Record<string, unknown>[]
  xKey: string
  series: ChartSeries[]
  title?: string
  description?: string
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  height?: number
  /** Formats axis + tooltip values (e.g. Indian rupee). */
  valueFormatter?: (value: number) => string
  className?: string
  actions?: React.ReactNode
  /** Drill-down: fired when a bar/line/area point is clicked. */
  onPointClick?: (point: ChartPoint) => void
  /** Renders the plot only (no card chrome) so an outer widget can own the card. */
  bare?: boolean
}

/** Simple shared error/empty state block rendered inside chart cards. */
export function ChartStateBlock({ error, onRetry, height }: { error?: boolean; onRetry?: () => void; height?: number }) {
  if (!error) return null
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 text-center"
      style={{ height: height ?? 220 }}
      role="alert"
    >
      <AlertTriangle className="h-5 w-5 text-[var(--ds-warning)]" aria-hidden="true" />
      <p className="ds-caption text-[var(--ds-text-secondary)]">Couldn&apos;t load this chart. Retry to fetch fresh data.</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
        </Button>
      )}
    </div>
  )
}

export function DefaultTooltip({ active, payload, label, valueFormatter }: {
  active?: boolean
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[]
  label?: string
  valueFormatter?: (value: number) => string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <ChartTooltip
      active
      payload={payload.map((p) => ({
        name: p.name ?? p.dataKey ?? "",
        value: p.value ?? 0,
        color: p.color ?? "var(--ds-chart-1)",
        dataKey: p.dataKey ?? "",
      }))}
      label={label}
      formatter={valueFormatter ?? String}
    />
  )
}

/**
 * Unified time-series/category chart (area, line or bar). Every dashboard chart
 * shares this shell so heights, colors, tooltips, loading/error/empty states
 * and drill-down clicks match.
 */
export function DashboardChart({
  data,
  xKey,
  series,
  title,
  description,
  loading,
  error,
  onRetry,
  height = 280,
  valueFormatter,
  className,
  actions,
  onPointClick,
  bare,
}: DashboardChartProps) {
  const empty = data.length === 0
  const chartData = empty ? [{ [xKey]: "No data" }] : data
  const axisTick = { fontSize: 11 }
  const clickable = onPointClick ? "recharts-clickable" : undefined

  const handlePoint = (entry?: unknown) => {
    if (!onPointClick) return
    const payload = (entry as { payload?: Record<string, unknown> } | undefined)?.payload
    const row = (payload ?? entry) as Record<string, unknown> | undefined
    if (row && row[xKey] !== undefined) {
      onPointClick({ label: String(row[xKey]), data: row })
    }
  }

  const body = error ? (
    <ChartStateBlock error onRetry={onRetry} height={height} />
  ) : (
    <div style={{ height }} aria-busy={loading} aria-label={title}>
      <ResponsiveContainer width="100%" height="100%">
        {(() => {
          const common = {
            data: chartData,
            margin: { top: 4, right: 8, bottom: 0, left: 0 },
          }
          const tooltip = <DefaultTooltip valueFormatter={valueFormatter} />
          const grid = <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border-light)" vertical={false} />

          if (series.some((s) => s.type === "bar")) {
                return (
                  <BarChart {...common}>
                    {grid}
                    <XAxis dataKey={xKey} tick={axisTick} stroke="var(--ds-text-tertiary)" />
                    <YAxis tick={axisTick} tickFormatter={(v: number) => (valueFormatter ? valueFormatter(v) : String(v))} stroke="var(--ds-text-tertiary)" width={64} />
                    <Tooltip content={tooltip} cursor={{ fill: "var(--ds-surface-secondary)", opacity: 0.5 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {series.map((s) => (
                      <Bar
                        key={s.dataKey}
                        dataKey={s.dataKey}
                        name={s.name}
                        fill={s.color}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={32}
                        className={clickable}
                        onClick={onPointClick ? handlePoint : undefined}
                      />
                    ))}
                  </BarChart>
                )
              }

              const isLine = series.some((s) => s.type === "line")
              if (isLine) {
                return (
                  <LineChart {...common}>
                    {grid}
                    <XAxis dataKey={xKey} tick={axisTick} stroke="var(--ds-text-tertiary)" />
                    <YAxis tick={axisTick} tickFormatter={(v: number) => (valueFormatter ? valueFormatter(v) : String(v))} stroke="var(--ds-text-tertiary)" width={64} />
                    <Tooltip content={tooltip} cursor={{ stroke: "var(--ds-border)", strokeDasharray: "3 3" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {series.map((s) => (
                      <Line
                        key={s.dataKey}
                        type="monotone"
                        dataKey={s.dataKey}
                        name={s.name}
                        stroke={s.color}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5, className: clickable }}
                        className={clickable}
                        onClick={onPointClick ? handlePoint : undefined}
                      />
                    ))}
                  </LineChart>
                )
              }

              return (
                <AreaChart {...common}>
                  <defs>
                    {series.map((s) => (
                      <linearGradient key={s.dataKey} id={`ds-area-${s.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  {grid}
                  <XAxis dataKey={xKey} tick={axisTick} stroke="var(--ds-text-tertiary)" />
                  <YAxis tick={axisTick} tickFormatter={(v: number) => (valueFormatter ? valueFormatter(v) : String(v))} stroke="var(--ds-text-tertiary)" width={64} />
                  <Tooltip content={tooltip} cursor={{ stroke: "var(--ds-border)", strokeDasharray: "3 3" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {series.map((s) => (
                    <Area
                      key={s.dataKey}
                      type="monotone"
                      dataKey={s.dataKey}
                      name={s.name}
                      stroke={s.color}
                      strokeWidth={2}
                      fill={`url(#ds-area-${s.dataKey})`}
                      className={clickable}
                      onClick={onPointClick ? handlePoint : undefined}
                    />
                  ))}
                </AreaChart>
              )
            })()}
          </ResponsiveContainer>
        </div>
      )

    const emptyCaption = empty && !loading && !error && (
      <p className="ds-caption mt-2 text-center text-[var(--ds-text-tertiary)]">No data for this period.</p>
    )

    if (bare) {
      return (
        <div className={className}>
          {loading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="w-full" style={{ height }} />
            </div>
          ) : (
            <>
              {body}
              {emptyCaption}
            </>
          )}
        </div>
      )
    }

    return (
      <ChartCard title={title} description={description} loading={loading} height={height} actions={actions} className={className}>
        {body}
        {emptyCaption}
      </ChartCard>
    )
}

export interface DonutDatum {
  name: string
  value: number
}

export interface DonutChartProps {
  data: DonutDatum[]
  title?: string
  description?: string
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  height?: number
  valueFormatter?: (value: number) => string
  colors?: string[]
  className?: string
  actions?: React.ReactNode
  /** Drill-down: fired when a donut slice is clicked. */
  onSliceClick?: (datum: DonutDatum) => void
  /** Renders the plot only (no card chrome) so an outer widget can own the card. */
  bare?: boolean
}

const DEFAULT_COLORS = [
  "var(--ds-chart-1)",
  "var(--ds-chart-2)",
  "var(--ds-chart-3)",
  "var(--ds-chart-4)",
  "var(--ds-chart-5)",
  "var(--ds-chart-6)",
  "var(--ds-chart-7)",
  "var(--ds-chart-8)",
]

/** Donut distribution chart (revenue sources, expense categories, lead sources). */
export function DonutChart({
  data,
  title,
  description,
  loading,
  error,
  onRetry,
  height = 260,
  valueFormatter,
  colors = DEFAULT_COLORS,
  className,
  actions,
  onSliceClick,
  bare,
}: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0)

  const body = error ? (
    <ChartStateBlock error onRetry={onRetry} height={height} />
  ) : data.length === 0 ? (
    <div className="flex items-center justify-center" style={{ height }}>
      <p className="ds-caption text-[var(--ds-text-tertiary)]">No data for this period.</p>
    </div>
  ) : (
    <div className="flex flex-col items-center gap-4 sm:flex-row" style={{ minHeight: height }}>
          <div className="relative shrink-0" style={{ height, width: height }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="58%"
                  outerRadius="82%"
                  paddingAngle={2}
                  stroke="var(--ds-surface)"
                  strokeWidth={2}
                  isAnimationActive={false}
                  className={onSliceClick ? "recharts-clickable" : undefined}
                  onClick={onSliceClick ? (_: unknown, index: number) => onSliceClick(data[index]) : undefined}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={colors[i % colors.length]} />
                  ))}
                </Pie>
                <Tooltip content={<DefaultTooltip valueFormatter={valueFormatter ?? String} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="ds-caption text-[var(--ds-text-tertiary)]">Total</span>
              <span className="ds-metric text-[var(--ds-text)]">{valueFormatter ? valueFormatter(total) : total}</span>
            </div>
          </div>
          <ul className="w-full min-w-0 flex-1 space-y-1.5">
            {data.map((d, i) => (
              <li key={d.name}>
                <button
                  type="button"
                  onClick={onSliceClick ? () => onSliceClick(d) : undefined}
                  disabled={!onSliceClick}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 text-xs",
                    onSliceClick && "ds-focus-ring rounded-[var(--ds-radius-lg)] px-1 hover:bg-[var(--ds-surface-hover)]"
                  )}
                  aria-label={onSliceClick ? `${d.name}: ${d.value}. Open filtered view.` : undefined}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} aria-hidden="true" />
                    <span className="truncate font-medium text-[var(--ds-text-secondary)]">{d.name}</span>
                  </span>
                  <span className="ds-numeric font-semibold text-[var(--ds-text)]">
                    {valueFormatter ? valueFormatter(d.value) : d.value}
                    {total > 0 && (
                      <span className="ml-1 text-[var(--ds-text-tertiary)]">
                        {((d.value / total) * 100).toFixed(0)}%
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )

    if (bare) {
      return (
        <div className={className}>
          {loading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            body
          )}
        </div>
      )
    }

    return (
      <ChartCard title={title} description={description} loading={loading} height={height} actions={actions} className={className}>
        {body}
      </ChartCard>
    )
}

/** Triggers a CSV download of the given rows. */
export function downloadCSV(filename: string, rows: Record<string, unknown>[], columns: string[]): void {
  const escape = (cell: unknown) => {
    const text = String(cell ?? "")
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const header = columns.map(escape).join(",")
  const body = rows.map((row) => columns.map((c) => escape(row[c])).join(",")).join("\n")
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
