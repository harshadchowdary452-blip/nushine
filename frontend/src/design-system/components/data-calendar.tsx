import * as React from "react"
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { CalendarDays, ChevronLeft, ChevronRight, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Input } from "./input"
import { Badge } from "./badge"
import { Checkbox } from "./checkbox"
import { Skeleton } from "./skeleton"
import { EmptyState } from "./page-container"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

export type CalendarView = "day" | "week" | "month" | "agenda"

export type CalendarTone = "primary" | "accent" | "success" | "warning" | "danger" | "info" | "default"

export interface CalendarEvent {
  id: string
  title: string
  start: string | Date
  end?: string | Date
  category?: string
  status?: string
  tone?: CalendarTone
  allDay?: boolean
}

export interface CalendarCategory {
  value: string
  label: string
  tone?: CalendarTone
}

const TONE_CHIP: Record<CalendarTone, string> = {
  primary: "bg-[var(--ds-primary-subtle)] text-[var(--ds-primary)] border-[var(--ds-primary)]/20",
  accent: "bg-[var(--ds-accent-subtle)] text-[var(--ds-accent)] border-[var(--ds-accent)]/20",
  success: "bg-[var(--ds-success-subtle)] text-[var(--ds-success)] border-[var(--ds-success)]/20",
  warning: "bg-[var(--ds-warning-subtle)] text-[var(--ds-warning)] border-[var(--ds-warning)]/20",
  danger: "bg-[var(--ds-danger-subtle)] text-[var(--ds-danger)] border-[var(--ds-danger)]/20",
  info: "bg-[var(--ds-info-subtle)] text-[var(--ds-info)] border-[var(--ds-info)]/20",
  default: "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)] border-[var(--ds-border)]",
}

const TONE_DOT: Record<CalendarTone, string> = {
  primary: "bg-[var(--ds-primary)]",
  accent: "bg-[var(--ds-accent)]",
  success: "bg-[var(--ds-success)]",
  warning: "bg-[var(--ds-warning)]",
  danger: "bg-[var(--ds-danger)]",
  info: "bg-[var(--ds-info)]",
  default: "bg-[var(--ds-text-tertiary)]",
}

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "agenda", label: "Agenda" },
]

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

interface DataCalendarProps {
  events: CalendarEvent[]
  onEventClick?: (event: CalendarEvent) => void
  defaultView?: CalendarView
  loading?: boolean
  /** Category definitions for the filter menu; derived from events when omitted. */
  categories?: CalendarCategory[]
  searchable?: boolean
  emptyTitle?: string
  emptyDescription?: string
  className?: string
}

export default function DataCalendar({
  events,
  onEventClick,
  defaultView = "month",
  loading = false,
  categories,
  searchable = true,
  emptyTitle = "Nothing scheduled",
  emptyDescription = "No events match the current view or filters.",
  className,
}: DataCalendarProps) {
  const [view, setView] = React.useState<CalendarView>(defaultView)
  const [cursor, setCursor] = React.useState<Date>(startOfDay(new Date()))
  const [search, setSearch] = React.useState("")
  const [hiddenCategories, setHiddenCategories] = React.useState<Set<string>>(new Set())

  const categoryDefs: CalendarCategory[] = React.useMemo(() => {
    if (categories && categories.length > 0) return categories
    const seen = new Map<string, CalendarCategory>()
    for (const event of events) {
      if (!event.category) continue
      if (!seen.has(event.category)) {
        seen.set(event.category, { value: event.category, label: event.category, tone: event.tone })
      }
    }
    return Array.from(seen.values())
  }, [categories, events])

  const filteredEvents = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return events.filter((event) => {
      if (hiddenCategories.has(event.category ?? "")) return false
      if (q && !event.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [events, hiddenCategories, search])

  const toggleCategory = (value: string) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const today = new Date()
  const rangeLabel = React.useMemo(() => {
    if (view === "day") return format(cursor, "EEEE, d MMMM yyyy")
    if (view === "week") {
      const weekStart = startOfWeek(cursor)
      const weekEnd = endOfWeek(cursor)
      return `${format(weekStart, "d MMM")} – ${format(weekEnd, "d MMM yyyy")}`
    }
    if (view === "agenda") return format(cursor, "MMMM yyyy")
    return format(cursor, "MMMM yyyy")
  }, [view, cursor])

  function shiftCursor(direction: 1 | -1) {
    setCursor((prev) => {
      if (view === "month" || view === "agenda") return addMonths(prev, direction)
      if (view === "week") return addDays(prev, direction * 7)
      return addDays(prev, direction)
    })
  }

  function moveBack() {
    shiftCursor(-1)
  }
  function moveForward() {
    shiftCursor(1)
  }
  function goToday() {
    setCursor(today)
  }

  const weekStart = startOfWeek(cursor)

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={goToday}>
            Today
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" className="h-9 w-9" onClick={moveBack} aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" className="h-9 w-9" onClick={moveForward} aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <h2 className="ds-nav-label min-w-[150px] text-base font-semibold text-[var(--ds-text)]" aria-live="polite">
            {rangeLabel}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {searchable && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ds-text-tertiary)]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search events…"
                className="h-9 w-52 pl-8 pr-8 text-sm"
                aria-label="Search events"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--ds-radius-md)] p-0.5 text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text)]"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {categoryDefs.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Categories
                  {hiddenCategories.size > 0 && <Badge variant="primary" className="h-4 min-w-[16px] px-1 text-[10px]">{hiddenCategories.size}</Badge>}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2">
                <p className="ds-form-label px-2 py-1.5 text-[var(--ds-text-tertiary)]">Hide categories</p>
                <div className="flex flex-col gap-0.5">
                  {categoryDefs.map((category) => {
                    const hidden = hiddenCategories.has(category.value)
                    return (
                      <label key={category.value} className={cn("flex cursor-pointer items-center gap-2.5 rounded-[var(--ds-radius-lg)] px-2 py-1.5 transition-colors hover:bg-[var(--ds-surface-hover)]", hidden && "opacity-50")}>
                        <Checkbox checked={!hidden} onCheckedChange={() => toggleCategory(category.value)} />
                        <span className={cn("h-2 w-2 rounded-full", TONE_DOT[category.tone ?? "default"])} aria-hidden="true" />
                        <span className="ds-body text-[var(--ds-text)]">{category.label}</span>
                      </label>
                    )
                  })}
                </div>
              </PopoverContent>
            </Popover>
          )}

          <div role="group" aria-label="Calendar view" className="flex items-center rounded-[var(--ds-radius-xl)] bg-[var(--ds-surface-secondary)] p-1">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => setView(v.value)}
                aria-pressed={view === v.value}
                className={cn(
                  "ds-nav-label ds-focus-ring rounded-[var(--ds-radius-lg)] px-3 py-1.5 text-xs transition-colors",
                  view === v.value ? "bg-[var(--ds-surface)] text-[var(--ds-text)] shadow-sm" : "text-[var(--ds-text-secondary)] hover:text-[var(--ds-text)]"
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-[var(--ds-radius-2xl)] border border-[var(--ds-border)] bg-[var(--ds-surface)]">
          <div className="grid grid-cols-7 border-b border-[var(--ds-border)]">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="border-r border-[var(--ds-border-light)] px-2 py-2 last:border-r-0">
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, row) => (
            <div key={row} className="grid grid-cols-7 border-b border-[var(--ds-border-light)] last:border-b-0">
              {Array.from({ length: 7 }).map((_, col) => (
                <div key={col} className="flex h-24 flex-col gap-2 border-r border-[var(--ds-border-light)] p-2 last:border-r-0">
                  <Skeleton className="h-3 w-6" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="overflow-hidden rounded-[var(--ds-radius-2xl)] border border-[var(--ds-border)] bg-[var(--ds-surface)]">
          <EmptyState icon={CalendarDays} title={emptyTitle} description={emptyDescription} size="compact" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--ds-radius-2xl)] border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-card)]">
          {view === "month" && (
            <MonthView cursor={cursor} events={filteredEvents} onEventClick={onEventClick} onDayClick={setCursor} />
          )}
          {view === "week" && <WeekView weekStart={weekStart} events={filteredEvents} onEventClick={onEventClick} />}
          {view === "day" && <DayView day={cursor} events={filteredEvents} onEventClick={onEventClick} />}
          {view === "agenda" && <AgendaView cursor={cursor} events={filteredEvents} onEventClick={onEventClick} />}
        </div>
      )}
    </div>
  )
}

interface EventChipProps {
  event: CalendarEvent
  onEventClick?: (event: CalendarEvent) => void
  className?: string
}

function EventChip({ event, onEventClick, className }: EventChipProps) {
  const tone = event.tone ?? "default"
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onEventClick?.(event)
      }}
      className={cn(
        "ds-focus-ring ds-body-sm flex w-full items-center gap-1.5 truncate rounded-[var(--ds-radius-md)] border px-1.5 py-1 text-left transition-opacity hover:opacity-80",
        TONE_CHIP[tone],
        className
      )}
      title={`${event.title}${event.status ? ` · ${event.status}` : ""}`}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[tone])} aria-hidden="true" />
      <span className="ds-truncate">{event.title}</span>
    </button>
  )
}

function MonthView({
  cursor,
  events,
  onEventClick,
  onDayClick,
}: {
  cursor: Date
  events: CalendarEvent[]
  onEventClick?: (event: CalendarEvent) => void
  onDayClick: (day: Date) => void
}) {
  const monthStart = startOfMonth(cursor)
  const gridStart = startOfWeek(monthStart)
  const gridEnd = endOfWeek(endOfMonth(cursor))
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-[var(--ds-border)] bg-[var(--ds-background-subtle)]">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="ds-overline px-2 py-2 text-center text-[var(--ds-text-tertiary)]">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayEvents = events
            .filter((event) => isSameDay(toDate(event.start), day))
            .sort((a, b) => (a.allDay ? -1 : 1) - (b.allDay ? -1 : 1))
          const inMonth = isSameMonth(day, cursor)
          const dayOfMonth = day.getDate()
          return (
            <div
              key={day.toISOString()}
              role="button"
              tabIndex={0}
              onClick={() => onDayClick(day)}
              onKeyDown={(e) => e.key === "Enter" && onDayClick(day)}
              className={cn(
                "ds-focus-ring flex min-h-[92px] cursor-pointer flex-col gap-1 border-b border-r border-[var(--ds-border-light)] p-1.5 transition-colors hover:bg-[var(--ds-surface-hover)]",
                dayOfMonth % 7 === 0 && "border-r-0"
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "ds-numeric flex h-6 w-6 items-center justify-center rounded-full text-xs",
                    isToday(day) ? "bg-[var(--ds-primary)] font-semibold text-[var(--ds-primary-foreground)]" : inMonth ? "text-[var(--ds-text)]" : "text-[var(--ds-text-tertiary)]"
                  )}
                >
                  {dayOfMonth}
                </span>
                {dayEvents.length > 3 && <span className="ds-caption text-[var(--ds-text-tertiary)]">+{dayEvents.length - 3}</span>}
              </div>
              <div className="hidden flex-col gap-1 sm:flex">
                {dayEvents.slice(0, 3).map((event) => (
                  <EventChip key={event.id} event={event} onEventClick={onEventClick} />
                ))}
              </div>
              <div className="flex gap-0.5 sm:hidden">
                {dayEvents.slice(0, 4).map((event) => (
                  <span key={event.id} className={cn("h-1.5 flex-1 rounded-full", TONE_DOT[event.tone ?? "default"])} aria-hidden="true" />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8)

function WeekView({
  weekStart,
  events,
  onEventClick,
}: {
  weekStart: Date
  events: CalendarEvent[]
  onEventClick?: (event: CalendarEvent) => void
}) {
  const days = eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart) })
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px] grid-cols-7">
        {days.map((day) => {
          const dayEvents = events
            .filter((event) => isSameDay(toDate(event.start), day))
            .sort((a, b) => toDate(a.start).getTime() - toDate(b.start).getTime())
          return (
            <div key={day.toISOString()} className="border-r border-[var(--ds-border-light)] last:border-r-0">
              <div className={cn("flex flex-col items-center border-b border-[var(--ds-border-light)] px-1 py-2", isToday(day) && "bg-[var(--ds-primary-subtle)]/40")}>
                <span className="ds-overline text-[var(--ds-text-tertiary)]">{format(day, "EEE")}</span>
                <span className={cn("ds-numeric flex h-7 w-7 items-center justify-center rounded-full text-sm", isToday(day) && "bg-[var(--ds-primary)] font-semibold text-[var(--ds-primary-foreground)]")}>
                  {day.getDate()}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 p-1.5">
                {dayEvents.length === 0 && <p className="ds-caption py-4 text-center text-[var(--ds-text-tertiary)]">—</p>}
                {dayEvents.map((event) => (
                  <EventChip key={event.id} event={event} onEventClick={onEventClick} className="flex-col items-start gap-0.5 !py-1.5" />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DayView({ day, events, onEventClick }: { day: Date; events: CalendarEvent[]; onEventClick?: (event: CalendarEvent) => void }) {
  const dayEvents = events
    .filter((event) => isSameDay(toDate(event.start), day))
    .sort((a, b) => (a.allDay ? -1 : 1) - (b.allDay ? -1 : 1) || toDate(a.start).getTime() - toDate(b.start).getTime())

  const byHour = (hour: number) =>
    dayEvents.filter((event) => !event.allDay && toDate(event.start).getHours() === hour)

  return (
    <div className="flex flex-col">
      <div className={cn("flex items-center gap-2 border-b border-[var(--ds-border-light)] px-4 py-3", isToday(day) && "bg-[var(--ds-primary-subtle)]/40")}>
        <span className="ds-overline text-[var(--ds-text-tertiary)]">{format(day, "EEEE")}</span>
        <span className={cn("ds-metric text-[var(--ds-text)]", isToday(day) && "text-[var(--ds-primary)]")}>{day.getDate()}</span>
        <span className="ds-nav-label text-[var(--ds-text-secondary)]">{format(day, "MMMM yyyy")}</span>
      </div>
      {dayEvents.filter((event) => event.allDay).length > 0 && (
        <div className="flex flex-col gap-1.5 border-b border-[var(--ds-border-light)] px-4 py-2">
          {dayEvents.filter((event) => event.allDay).map((event) => (
            <EventChip key={event.id} event={event} onEventClick={onEventClick} className="w-full" />
          ))}
        </div>
      )}
      <div className="flex flex-col">
        {HOURS.map((hour) => {
          const eventsAtHour = byHour(hour)
          return (
            <div key={hour} className="flex min-h-[56px] border-b border-[var(--ds-border-light)] last:border-b-0">
              <div className="ds-caption ds-numeric w-14 shrink-0 border-r border-[var(--ds-border-light)] py-2 pr-2 text-right text-[var(--ds-text-tertiary)]">
                {format(new Date(2020, 0, 1, hour), "h a")}
              </div>
              <div className="flex flex-1 flex-col gap-1.5 px-2 py-1.5">
                {eventsAtHour.map((event) => (
                  <EventChip key={event.id} event={event} onEventClick={onEventClick} className="w-full" />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AgendaView({
  cursor,
  events,
  onEventClick,
}: {
  cursor: Date
  events: CalendarEvent[]
  onEventClick?: (event: CalendarEvent) => void
}) {
  const monthStart = startOfMonth(cursor)
  const monthEnd = endOfMonth(cursor)
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const daysWithEvents = monthDays.filter((day) => events.some((event) => isSameDay(toDate(event.start), day)))

  if (daysWithEvents.length === 0) {
    return <EmptyState icon={CalendarDays} title="No events this month" description="Nothing is scheduled in the current month." size="compact" />
  }

  return (
    <div className="flex flex-col">
      {daysWithEvents.map((day) => {
        const dayEvents = events
          .filter((event) => isSameDay(toDate(event.start), day))
          .sort((a, b) => (a.allDay ? -1 : 1) - (b.allDay ? -1 : 1) || toDate(a.start).getTime() - toDate(b.start).getTime())
        return (
          <div key={day.toISOString()} className="border-b border-[var(--ds-border-light)] last:border-b-0">
            <div className={cn("flex items-center gap-2 px-4 py-2", isToday(day) ? "bg-[var(--ds-primary-subtle)]/40" : "bg-[var(--ds-background-subtle)]")}>
              <span className={cn("ds-numeric flex h-6 w-6 items-center justify-center rounded-full text-xs", isToday(day) && "bg-[var(--ds-primary)] font-semibold text-[var(--ds-primary-foreground)]")}>
                {day.getDate()}
              </span>
              <span className="ds-nav-label text-[var(--ds-text-secondary)]">{format(day, "EEEE, MMMM d")}</span>
              {isSameDay(day, new Date()) && <Badge variant="primary">Today</Badge>}
            </div>
            <div className="flex flex-col gap-1.5 px-4 py-2">
              {dayEvents.map((event) => (
                <div key={event.id} className="flex items-center gap-3">
                  <span className="ds-caption ds-numeric w-16 shrink-0 text-[var(--ds-text-tertiary)]">
                    {event.allDay ? "All day" : format(toDate(event.start), "h:mm a")}
                  </span>
                  <EventChip event={event} onEventClick={onEventClick} className="w-full" />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
