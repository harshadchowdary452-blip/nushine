import { useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  Calendar as CalendarIcon,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useFixedPosition, useOverlayDismiss, resolveOverlayLayer } from "@/lib/overlay"
import { Button } from "@/design-system/components/button"
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  isBefore,
  isAfter,
  parse,
} from "date-fns"

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

function popupLayer(triggerEl: HTMLElement | null): string {
  return resolveOverlayLayer(triggerEl)
}

interface CalendarGridProps {
  viewDate: Date
  selected?: Date
  rangeStart?: Date
  rangeEnd?: Date
  minDate?: Date
  maxDate?: Date
  onSelect: (day: Date) => void
  disableOutside?: boolean
}

function CalendarGrid({
  viewDate,
  selected,
  rangeStart,
  rangeEnd,
  minDate,
  maxDate,
  onSelect,
  disableOutside = false,
}: CalendarGridProps) {
  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(viewDate), { weekStartsOn: 1 }),
      }),
    [viewDate]
  )

  function isDisabled(day: Date) {
    if (disableOutside && !isSameMonth(day, viewDate)) return true
    if (minDate && isBefore(day, startOfDay(minDate))) return true
    if (maxDate && isAfter(day, startOfDay(maxDate))) return true
    return false
  }

  function handleGridKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const grid = e.currentTarget
    const cells = Array.from(grid.querySelectorAll<HTMLButtonElement>("button[data-day]"))
    const idx = cells.indexOf(document.activeElement as HTMLButtonElement)
    if (idx === -1) return
    const cols = 7
    let next = -1
    if (e.key === "ArrowRight") next = idx + 1
    else if (e.key === "ArrowLeft") next = idx - 1
    else if (e.key === "ArrowDown") next = idx + cols
    else if (e.key === "ArrowUp") next = idx - cols
    else if (e.key === "Home") next = idx - (idx % cols)
    else if (e.key === "End") next = idx - (idx % cols) + cols - 1
    if (next >= 0 && next < cells.length) {
      e.preventDefault()
      cells[next].focus()
    }
  }

  return (
    <>
      <div className="mb-1 grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((d) => (
          <div key={d} className="ds-form-label py-1 text-center text-[var(--ds-text-tertiary)]">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5" role="grid" aria-label="Calendar" onKeyDown={handleGridKey}>
        {days.map((day, i) => {
          const outside = !isSameMonth(day, viewDate)
          const disabled = isDisabled(day)
          const isSel = selected && isSameDay(day, selected)
          const inRange = rangeStart && rangeEnd && !isBefore(day, rangeStart) && !isAfter(day, rangeEnd)
          const isRangeStart = rangeStart && isSameDay(day, rangeStart)
          const isRangeEnd = rangeEnd && isSameDay(day, rangeEnd)
          return (
            <button
              key={i}
              type="button"
              data-day
              tabIndex={-1}
              disabled={disabled}
              onClick={() => onSelect(day)}
              aria-label={format(day, "EEEE, MMMM d, yyyy")}
              aria-pressed={isSel}
              aria-current={isToday(day) ? "date" : undefined}
              className={cn(
                "flex h-8 w-full items-center justify-center rounded-[var(--ds-radius-lg)] text-sm ds-transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)]/30",
                inRange && "bg-[var(--ds-primary-subtle)] text-[var(--ds-primary)]",
                isRangeStart && "rounded-l-[var(--ds-radius-lg)] rounded-r-none",
                isRangeEnd && "rounded-r-[var(--ds-radius-lg)] rounded-l-none",
                !inRange && (outside ? "text-[var(--ds-text-disabled)]" : "text-[var(--ds-text)] hover:bg-[var(--ds-surface-hover)]"),
                !inRange && isToday(day) && "font-semibold text-[var(--ds-primary)]",
                isSel && "bg-[var(--ds-primary)] font-semibold text-[var(--ds-primary-foreground)] hover:bg-[var(--ds-primary)] shadow-sm",
                disabled && "pointer-events-none opacity-40"
              )}
            >
              {format(day, "d")}
            </button>
          )
        })}
      </div>
    </>
  )
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

interface PopupShellProps {
  position: { top: number; left: number; width: number } | null
  popupRef: React.RefObject<HTMLDivElement | null>
  layer: string
  className?: string
  role?: string
  ariaLabel?: string
  children: React.ReactNode
}

function PopupShell({ position, popupRef, layer, className, role, ariaLabel, children }: PopupShellProps) {
  return createPortal(
    <div
      ref={popupRef}
      role={role}
      aria-label={ariaLabel}
      style={position ? { top: position.top, left: position.left, width: position.width } : undefined}
      className={cn(
        "ds-animate-dropdown fixed overflow-hidden rounded-[var(--ds-radius-xl)] border border-[var(--ds-menu-border)] bg-[var(--ds-menu-bg)] p-3 text-[var(--ds-text)] shadow-[var(--ds-shadow-dropdown)]",
        layer,
        className
      )}
    >
      {children}
    </div>,
    document.body
  )
}

interface DatePickerProps {
  value: Date | undefined
  onChange: (date: Date | undefined) => void
  placeholder?: string
  className?: string
  minDate?: Date
  maxDate?: Date
  showPresets?: boolean
}

const DATE_PRESETS = [
  { label: "Today", fn: () => new Date() },
  { label: "This Week", fn: () => startOfWeek(new Date(), { weekStartsOn: 1 }) },
  { label: "Last 7 Days", fn: () => { const d = new Date(); d.setDate(d.getDate() - 7); return d } },
  { label: "This Month", fn: () => startOfMonth(new Date()) },
  { label: "Last 30 Days", fn: () => { const d = new Date(); d.setDate(d.getDate() - 30); return d } },
]

export default function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  className,
  minDate,
  maxDate,
  showPresets = true,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(value || new Date())
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const { position } = useFixedPosition(open, triggerRef)
  useOverlayDismiss(open, () => setOpen(false), triggerRef, popupRef)
  const layer = popupLayer(triggerRef.current)

  return (
    <div className={cn("relative", className)}>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => { setOpen((v) => !v); if (!open) setViewDate(value || new Date()) }}
        className={cn("flex w-full items-center justify-start gap-2 text-[var(--ds-text-secondary)]", value && "pr-10")}
      >
        <CalendarIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">{value ? format(value, "MMM d, yyyy") : placeholder}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </Button>
      {value && (
        <button
          type="button"
          aria-label="Clear date"
          onClick={() => onChange(undefined)}
          className="absolute right-8 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-[var(--ds-text-tertiary)] ds-transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      {open && (
        <PopupShell position={position} popupRef={popupRef} layer={layer} role="dialog" ariaLabel="Pick a date" className="w-72">
          {showPresets && (
            <div className="mb-3 flex gap-1.5 overflow-x-auto">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { onChange(p.fn()); setOpen(false) }}
                  className="ds-badge-text shrink-0 whitespace-nowrap rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface-secondary)] px-2.5 py-1 text-[var(--ds-text-secondary)] ds-transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewDate(subMonths(viewDate, 1))}
              aria-label="Previous month"
              className="flex h-7 w-7 items-center justify-center rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] ds-transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { setViewDate(new Date(viewDate.getFullYear(), 0, 1)); onChange?.(new Date(viewDate.getFullYear(), 0, 1)); setOpen(false) }}
                className="ds-nav-label rounded-[var(--ds-radius-lg)] px-2 py-1 text-[var(--ds-text)] ds-transition-colors hover:bg-[var(--ds-surface-hover)]"
              >
                {format(viewDate, "MMMM yyyy")}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setViewDate(addMonths(viewDate, 1))}
              aria-label="Next month"
              className="flex h-7 w-7 items-center justify-center rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] ds-transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <CalendarGrid
            viewDate={viewDate}
            selected={value}
            minDate={minDate}
            maxDate={maxDate}
            onSelect={(day) => { onChange(day); setOpen(false) }}
          />
        </PopupShell>
      )}
    </div>
  )
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

interface MonthPickerProps {
  value: Date | undefined
  onChange: (date: Date | undefined) => void
  placeholder?: string
  className?: string
}

export function MonthPicker({ value, onChange, placeholder = "Select month", className }: MonthPickerProps) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(value?.getFullYear() || new Date().getFullYear())
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const { position } = useFixedPosition(open, triggerRef)
  useOverlayDismiss(open, () => setOpen(false), triggerRef, popupRef)
  const layer = popupLayer(triggerRef.current)

  return (
    <div className={cn("relative", className)}>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="grid"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-start gap-2 text-[var(--ds-text-secondary)]"
      >
        <CalendarIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">
          {value ? `${MONTHS[value.getMonth()]} ${value.getFullYear()}` : placeholder}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </Button>
      {open && (
        <PopupShell position={position} popupRef={popupRef} layer={layer} role="grid" ariaLabel="Pick a month" className="w-64">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              aria-label="Previous year"
              className="flex h-7 w-7 items-center justify-center rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] ds-transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="ds-nav-label text-[var(--ds-text)]">{year}</span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              aria-label="Next year"
              className="flex h-7 w-7 items-center justify-center rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] ds-transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {MONTHS.map((m, i) => {
              const selected = value && value.getMonth() === i && value.getFullYear() === year
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => { onChange(new Date(year, i, 1)); setOpen(false) }}
                  aria-pressed={selected}
                  className={cn(
                    "ds-nav-label rounded-[var(--ds-radius-xl)] py-2.5 ds-transition-colors",
                    selected
                      ? "bg-[var(--ds-primary)] text-[var(--ds-primary-foreground)] shadow-sm"
                      : "text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
                  )}
                >
                  {m}
                </button>
              )
            })}
          </div>
        </PopupShell>
      )}
    </div>
  )
}

interface TimePickerProps {
  value?: string
  onChange: (time: string) => void
  className?: string
  step?: number
  use12h?: boolean
  placeholder?: string
}

export function TimePicker({
  value,
  onChange,
  className,
  step = 15,
  use12h = false,
  placeholder = "Select time",
}: TimePickerProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const { position } = useFixedPosition(open, triggerRef)
  useOverlayDismiss(open, () => setOpen(false), triggerRef, popupRef)
  const layer = popupLayer(triggerRef.current)

  const times = useMemo(() => {
    const out: string[] = []
    const mins = Math.max(1, Math.round(step))
    for (let i = 0; i < 24 * 60; i += mins) {
      const h = Math.floor(i / 60)
      const m = i % 60
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`)
    }
    return out
  }, [step])

  const display = value
    ? use12h
      ? format(parse(value, "HH:mm", new Date()), "h:mm a")
      : value
    : placeholder

  return (
    <div className={cn("relative", className)}>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-start gap-2 text-[var(--ds-text-secondary)]"
      >
        <Clock className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">{display}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </Button>
      {open && (
        <PopupShell position={position} popupRef={popupRef} layer={layer} role="listbox" ariaLabel="Pick a time" className="w-40">
          <div className="max-h-56 overflow-y-auto p-0.5">
            {times.map((t) => (
              <button
                key={t}
                type="button"
                role="option"
                aria-selected={value === t}
                onClick={() => { onChange(t); setOpen(false) }}
                className={cn(
                  "ds-nav-label flex w-full items-center justify-between rounded-[var(--ds-radius-lg)] px-2.5 py-2 ds-transition-colors",
                  value === t
                    ? "bg-[var(--ds-menu-item-active-bg)] text-[var(--ds-menu-item-active-fg)]"
                    : "text-[var(--ds-text-secondary)] hover:bg-[var(--ds-menu-item-hover-bg)] hover:text-[var(--ds-text)]"
                )}
              >
                <span>{use12h ? format(parse(t, "HH:mm", new Date()), "h:mm a") : t}</span>
                {value === t && <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        </PopupShell>
      )}
    </div>
  )
}

interface DateTimePickerProps {
  value?: Date
  onChange: (date: Date | undefined) => void
  className?: string
  placeholder?: string
}

export function DateTimePicker({ value, onChange, className, placeholder = "Select date & time" }: DateTimePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(value || new Date())
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const { position } = useFixedPosition(open, triggerRef)
  useOverlayDismiss(open, () => setOpen(false), triggerRef, popupRef)
  const layer = popupLayer(triggerRef.current)

  function apply(date: Date, time: string | undefined) {
    const t = time || format(value || new Date(), "HH:mm")
    const parsed = parse(t, "HH:mm", date)
    onChange(parsed)
  }

  return (
    <div className={cn("relative", className)}>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => { setOpen((v) => !v); if (!open) setViewDate(value || new Date()) }}
        className="flex w-full items-center justify-start gap-2 text-[var(--ds-text-secondary)]"
      >
        <CalendarIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">
          {value ? format(value, "MMM d, yyyy · h:mm a") : placeholder}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </Button>
      {open && (
        <PopupShell position={position} popupRef={popupRef} layer={layer} role="dialog" ariaLabel="Pick date and time" className="w-80">
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setViewDate(subMonths(viewDate, 1))}
                  aria-label="Previous month"
                  className="flex h-7 w-7 items-center justify-center rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] ds-transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="ds-nav-label text-[var(--ds-text)]">{format(viewDate, "MMMM yyyy")}</span>
                <button
                  type="button"
                  onClick={() => setViewDate(addMonths(viewDate, 1))}
                  aria-label="Next month"
                  className="flex h-7 w-7 items-center justify-center rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] ds-transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <CalendarGrid
                viewDate={viewDate}
                selected={value}
                onSelect={(day) => apply(day, value ? format(value, "HH:mm") : undefined)}
              />
            </div>
            <div className="w-28 shrink-0 border-l border-[var(--ds-border-light)] pl-2">
              <p className="ds-form-label mb-1 px-1 text-[var(--ds-text-tertiary)]">Time</p>
              <div className="max-h-56 overflow-y-auto p-0.5">
                {["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => apply(value || new Date(), t)}
                    aria-pressed={value ? format(value, "HH:mm") === t : false}
                    className={cn(
                      "ds-nav-label w-full rounded-[var(--ds-radius-lg)] px-2 py-1.5 text-left ds-transition-colors",
                      value && format(value, "HH:mm") === t
                        ? "bg-[var(--ds-menu-item-active-bg)] text-[var(--ds-menu-item-active-fg)]"
                        : "text-[var(--ds-text-secondary)] hover:bg-[var(--ds-menu-item-hover-bg)] hover:text-[var(--ds-text)]"
                    )}
                  >
                    {format(parse(t, "HH:mm", new Date()), "h:mm a")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </PopupShell>
      )}
    </div>
  )
}

export interface DateRange {
  from?: Date
  to?: Date
}

interface DateRangePickerProps {
  value?: DateRange
  onChange: (range: DateRange) => void
  className?: string
  placeholder?: string
}

export function DateRangePicker({ value, onChange, className, placeholder = "Select date range" }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(value?.from || new Date())
  const [pending, setPending] = useState<DateRange | undefined>(value)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const { position } = useFixedPosition(open, triggerRef)
  useOverlayDismiss(open, () => setOpen(false), triggerRef, popupRef)
  const layer = popupLayer(triggerRef.current)

  function handleSelect(day: Date) {
    if (!pending?.from || (pending.from && pending.to)) {
      setPending({ from: day, to: undefined })
    } else if (day < pending.from) {
      setPending({ from: day, to: pending.from })
    } else {
      setPending({ from: pending.from, to: day })
    }
  }

  const display = value?.from || value?.to
    ? `${value.from ? format(value.from, "MMM d, yyyy") : "…"} – ${value.to ? format(value.to, "MMM d, yyyy") : "…"}`
    : placeholder

  return (
    <div className={cn("relative", className)}>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => { setOpen((v) => !v); if (!open) { setViewDate(value?.from || new Date()); setPending(value) } }}
        className="flex w-full items-center justify-start gap-2 text-[var(--ds-text-secondary)]"
      >
        <CalendarIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">{display}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </Button>
      {open && (
        <PopupShell position={position} popupRef={popupRef} layer={layer} role="dialog" ariaLabel="Pick a date range" className="w-72">
          <div className="mb-3 flex gap-1.5 overflow-x-auto">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  const from = p.fn()
                  const to = new Date()
                  onChange({ from, to })
                  setOpen(false)
                }}
                className="ds-badge-text shrink-0 whitespace-nowrap rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface-secondary)] px-2.5 py-1 text-[var(--ds-text-secondary)] ds-transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewDate(subMonths(viewDate, 1))}
              aria-label="Previous month"
              className="flex h-7 w-7 items-center justify-center rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] ds-transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="ds-nav-label text-[var(--ds-text)]">{format(viewDate, "MMMM yyyy")}</span>
            <button
              type="button"
              onClick={() => setViewDate(addMonths(viewDate, 1))}
              aria-label="Next month"
              className="flex h-7 w-7 items-center justify-center rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] ds-transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <CalendarGrid
            viewDate={viewDate}
            rangeStart={pending?.from}
            rangeEnd={pending?.to}
            onSelect={handleSelect}
          />
          <div className="mt-3 flex items-center justify-end gap-2 border-t border-[var(--ds-border-light)] pt-3">
            {pending?.from && pending.to && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setPending(undefined)}>
                Clear
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              disabled={!pending?.from || !pending?.to}
              onClick={() => { onChange(pending || {}); setOpen(false) }}
            >
              Apply
            </Button>
          </div>
        </PopupShell>
      )}
    </div>
  )
}
