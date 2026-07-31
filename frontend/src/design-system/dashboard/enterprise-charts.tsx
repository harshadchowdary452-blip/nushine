/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { useState } from "react"
import {
  Bar, BarChart, CartesianGrid, Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { FileDown, MoreHorizontal, Printer } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/design-system/components/button"
import { Skeleton } from "@/design-system/components/skeleton"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/design-system/components/dropdown-menu"
import { ChartStateBlock, DefaultTooltip, downloadCSV } from "./charts"

export type { ChartPoint } from "./charts"

export interface ChartExportProps {
  title: string
  rows: Record<string, unknown>[]
  columns: string[]
  filename: string
  className?: string
}

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string))

/** Opens a print-ready window with the exact rows behind the widget. */
export function printRows(title: string, rows: Record<string, unknown>[], columns: string[]): void {
  const win = window.open("", "_blank", "width=960,height=720")
  if (!win) return
  const thead = `<tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`
  const tbody = rows
    .map((row) => `<tr>${columns.map((c) => `<td>${escapeHtml(row[c])}</td>`).join("")}</tr>`)
    .join("")
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:24px;color:#1f2937}
    h1{font-size:20px;margin:0 0 4px} p{color:#6b7280;margin:0 0 16px;font-size:13px}
    table{border-collapse:collapse;width:100%;font-size:12px}
    th,td{border:1px solid #e5e7eb;padding:6px 10px;text-align:left}
    th{background:#f3f4f6;font-weight:600}
    @media print{body{margin:8mm}}
  </style></head><body>
  <h1>${escapeHtml(title)}</h1><p>Generated ${new Date().toLocaleString()}</p>
  <table><thead>${thead}</thead><tbody>${tbody || "<tr><td colspan=\"" + columns.length + "\">No records</td></tr>"}</tbody></table>
  <script>window.onload=function(){window.print()}</script>
  </body></html>`)
  win.document.close()
}

/** Per-widget export menu: CSV + print, bound to the exact widget data. */
export function ChartExport({ title, rows, columns, filename, className }: ChartExportProps) {
  const [open, setOpen] = useState(false)
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label={`${title} widget menu`} className={className}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => downloadCSV(filename, rows, columns)}
        >
          <FileDown className="h-4 w-4" aria-hidden="true" /> Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => printRows(title, rows, columns)}>
          <Printer className="h-4 w-4" aria-hidden="true" /> Print
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   StackedBarChart — composition chart (e.g. revenue = expenses + profit).
   ──────────────────────────────────────────────────────────────────────────── */

export interface StackedBarChartProps {
  data: Record<string, unknown>[]
  xKey: string
  series: ChartSeriesLike[]
  height?: number
  valueFormatter?: (value: number) => string
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  onPointClick?: (point: ChartPointLike) => void
  className?: string
}

export interface ChartSeriesLike {
  dataKey: string
  name: string
  color: string
}

export interface ChartPointLike {
  label: string
  data: Record<string, unknown>
}

/** Stacked bar chart for composition analysis across categories. */
export function StackedBarChart({
  data, xKey, series, height = 280, valueFormatter, loading, error, onRetry, onPointClick, className,
}: StackedBarChartProps) {
  const axisTick = { fontSize: 11 }

  const handleClick = (entry?: unknown) => {
    if (!onPointClick) return
    const payload = (entry as { payload?: Record<string, unknown> } | undefined)?.payload
    const row = (payload ?? entry) as Record<string, unknown> | undefined
    if (row && row[xKey] !== undefined) onPointClick({ label: String(row[xKey]), data: row })
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3" style={{ height }}>
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="w-full" style={{ height }} />
      </div>
    )
  }

  if (error) return <ChartStateBlock error onRetry={onRetry} height={height} />

  return (
    <div className={cn("w-full", className)} style={{ height }} aria-busy={loading}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border-light)" vertical={false} />
          <XAxis dataKey={xKey} tick={axisTick} stroke="var(--ds-text-tertiary)" />
          <YAxis tick={axisTick} tickFormatter={(v: number) => (valueFormatter ? valueFormatter(v) : String(v))} stroke="var(--ds-text-tertiary)" width={64} />
          <Tooltip content={<DefaultTooltip valueFormatter={valueFormatter ?? String} />} cursor={{ fill: "var(--ds-surface-secondary)", opacity: 0.5 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Bar
              key={s.dataKey}
              dataKey={s.dataKey}
              name={s.name}
              stackId="a"
              fill={s.color}
              radius={s.dataKey === series[series.length - 1].dataKey ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              maxBarSize={34}
              className={onPointClick ? "recharts-clickable" : undefined}
              onClick={onPointClick ? handleClick : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   RadarChart — multi-metric profile (doctor performance, service mix).
   ──────────────────────────────────────────────────────────────────────────── */

export interface RadarChartProps {
  data: Record<string, unknown>[]
  angleKey: string
  series: ChartSeriesLike[]
  height?: number
  valueFormatter?: (value: number) => string
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  onPointClick?: (point: ChartPointLike) => void
  className?: string
}

/** Radar chart for comparing multiple metrics on one entity. */
export function RadarChartComponent({
  data, angleKey, series, height = 280, valueFormatter, loading, error, onRetry, onPointClick, className,
}: RadarChartProps) {
  const axisTick = { fontSize: 11 }

  const clickableTick = onPointClick
    ? (tickProps: {
        payload?: { value?: unknown }
        x?: number | string
        y?: number | string
        textAnchor?: "start" | "middle" | "end" | "inherit"
      }) => {
        const value = tickProps.payload?.value
        if (value === undefined || value === null) {
          return (
            <text x={tickProps.x} y={tickProps.y} textAnchor={tickProps.textAnchor} fontSize={11} fill="var(--ds-text-tertiary)">
              {String(value ?? "")}
            </text>
          )
        }
        return (
          <text
            x={tickProps.x}
            y={tickProps.y}
            textAnchor={tickProps.textAnchor}
            fontSize={11}
            fill="var(--ds-text-tertiary)"
            className="recharts-clickable"
            onClick={(e) => {
              e.stopPropagation()
              onPointClick({ label: String(value), data: { [angleKey]: value } })
            }}
          >
            {String(value)}
          </text>
        )
      }
    : axisTick

  if (loading) {
    return (
      <div className="flex flex-col gap-3" style={{ height }}>
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="w-full" style={{ height }} />
      </div>
    )
  }

  if (error) return <ChartStateBlock error onRetry={onRetry} height={height} />

  return (
    <div className={cn("w-full", className)} style={{ height }} aria-busy={loading}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="var(--ds-border-light)" />
          <PolarAngleAxis dataKey={angleKey} tick={clickableTick} stroke="var(--ds-text-tertiary)" />
          <PolarRadiusAxis domain={[0, "dataMax"]} tick={false} axisLine={false} tickCount={4} />
          <Tooltip content={<DefaultTooltip valueFormatter={valueFormatter ?? String} />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Radar
              key={s.dataKey}
              dataKey={s.dataKey}
              name={s.name}
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.22}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   HeatmapChart — density grid (appointment volume by weekday × hour).
   ──────────────────────────────────────────────────────────────────────────── */

export interface HeatmapDatum {
  /** 0 = Monday … 6 = Sunday. */
  day: number
  /** Hour of day (24h). */
  hour: number
  count: number
}

export interface HeatmapChartProps {
  data: HeatmapDatum[]
  title?: string
  description?: string
  height?: number
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  onCellClick?: (cell: HeatmapDatum) => void
  className?: string
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** Appointment-volume heatmap, cells shaded by intensity on the primary scale. */
export function HeatmapChart({
  data, loading, error, onRetry, onCellClick, className, height = 280,
}: HeatmapChartProps) {
  const [hovered, setHovered] = useState<HeatmapDatum | null>(null)

  const present = data.filter((d) => d.count > 0)
  const hours = React.useMemo(() => {
    const hs = new Set<number>()
    for (const d of data) hs.add(d.hour)
    const list = [...hs].sort((a, b) => a - b)
    const min = list.length ? Math.max(7, list[0] - 1) : 8
    const max = list.length ? Math.min(21, list[list.length - 1] + 1) : 20
    const cols: number[] = []
    for (let h = min; h <= max; h++) cols.push(h)
    return cols
  }, [data])

  const maxCount = Math.max(1, ...present.map((d) => d.count))
  const grid = hours.map((hour) => Array.from({ length: 7 }, (_, day) => {
    const cell = present.find((d) => d.day === day && d.hour === hour)
    return { day, hour, count: cell?.count ?? 0 }
  }))

  if (loading) {
    return (
      <div className="flex flex-col gap-3" style={{ height }}>
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="w-full" style={{ height: height - 40 }} />
      </div>
    )
  }

  if (error) return <ChartStateBlock error onRetry={onRetry} height={height} />

  return (
    <div className={cn("w-full", className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-separate" style={{ borderSpacing: 3 }} aria-label="Appointment volume by weekday and hour">
          <thead>
            <tr>
              <th className="ds-caption px-1 text-left font-medium text-[var(--ds-text-tertiary)]" scope="col" aria-label="Time" />
              {DAY_LABELS.map((d) => (
                <th key={d} className="ds-caption px-0.5 pb-1 text-center font-medium text-[var(--ds-text-tertiary)]" scope="col">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, ri) => (
              <tr key={hours[ri]}>
                <td className="ds-caption pr-1.5 text-right text-[var(--ds-text-tertiary)]">
                  {hours[ri] === 0 ? "12a" : hours[ri] < 12 ? `${hours[ri]}a` : hours[ri] === 12 ? "12p" : `${hours[ri] - 12}p`}
                </td>
                {row.map((cell) => {
                  const intensity = cell.count > 0 ? 12 + (cell.count / maxCount) * 78 : 0
                  const isHover = hovered && hovered.day === cell.day && hovered.hour === cell.hour
                  return (
                    <td key={cell.day} className="p-0">
                      <button
                        type="button"
                        onClick={onCellClick ? () => onCellClick(cell) : undefined}
                        onMouseEnter={() => setHovered(cell)}
                        onMouseLeave={() => setHovered(null)}
                        onFocus={() => setHovered(cell)}
                        onBlur={() => setHovered(null)}
                        disabled={!onCellClick}
                        aria-label={`${DAY_LABELS[cell.day]} ${hours[ri]}:00 — ${cell.count} appointment${cell.count === 1 ? "" : "s"}`}
                        className={cn(
                          "h-8 w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] transition-transform",
                          onCellClick && cell.count > 0 && "ds-focus-ring hover:scale-105",
                          cell.count === 0 && "cursor-default opacity-40"
                        )}
                        style={{
                          backgroundColor: intensity > 0
                            ? `color-mix(in srgb, var(--ds-primary) ${intensity}%, var(--ds-surface-secondary))`
                            : "var(--ds-surface-secondary)",
                          transform: isHover && cell.count > 0 ? "scale(1.06)" : undefined,
                        }}
                      >
                        <span className="ds-numeric text-[10px] font-semibold" style={{ color: intensity > 55 ? "var(--ds-primary-foreground)" : "var(--ds-text-secondary)" }}>
                          {cell.count > 0 ? cell.count : ""}
                        </span>
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="ds-caption text-[var(--ds-text-tertiary)]" aria-live="polite">
          {hovered && hovered.count > 0
            ? `${DAY_LABELS[hovered.day]} ${hovered.hour}:00 — ${hovered.count} appointment${hovered.count === 1 ? "" : "s"}`
            : "Hover a cell for detail"}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="ds-caption text-[var(--ds-text-tertiary)]">Low</span>
          <div className="h-2 w-24 rounded-full" style={{ background: "linear-gradient(to right, var(--ds-surface-secondary), var(--ds-primary))" }} aria-hidden="true" />
          <span className="ds-caption text-[var(--ds-text-tertiary)]">High</span>
        </div>
      </div>
    </div>
  )
}

/** Re-export to keep one consistent tooltip across all enterprise charts. */
export { DefaultTooltip }
