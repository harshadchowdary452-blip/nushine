import { useState, useRef } from "react"
import { createPortal } from "react-dom"
import { motion } from "framer-motion"
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFixedPosition, useOverlayDismiss, resolveOverlayLayer } from "@/lib/overlay"
import { Button } from "@/components/ui/button"
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday, getYear } from "date-fns"

interface DatePickerProps {
  value: Date | undefined
  onChange: (date: Date | undefined) => void
  placeholder?: string
  className?: string
}

const presets = [
  { label: "Today", days: 0 },
  { label: "This Week", days: "week" as const },
  { label: "Last 7 Days", days: 7 },
  { label: "This Month", days: "month" as const },
  { label: "Last 30 Days", days: 30 },
  { label: "This Quarter", days: "quarter" as const },
  { label: "This Year", days: "year" as const },
]

export default function DatePicker({ value, onChange, placeholder = "Select date", className }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(value || new Date())
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const { position } = useFixedPosition(open, triggerRef)
  useOverlayDismiss(open, () => setOpen(false), triggerRef, popupRef)
  const layer = resolveOverlayLayer(triggerRef.current)

  const daysInMonth = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewDate)),
    end: endOfWeek(endOfMonth(viewDate)),
  })

  const handlePrev = () => setViewDate(subMonths(viewDate, 1))
  const handleNext = () => setViewDate(addMonths(viewDate, 1))

  const handleSelect = (day: Date) => {
    onChange(day)
    setOpen(false)
  }

  const handlePreset = (preset: typeof presets[number]) => {
    const today = new Date()
    if (preset.days === 0) onChange(today)
    else if (preset.days === "week") {
      const start = startOfWeek(today, { weekStartsOn: 1 })
      onChange(start)
    } else if (preset.days === "month") {
      onChange(startOfMonth(today))
    } else if (preset.days === "quarter") {
      const qStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)
      onChange(qStart)
    } else if (preset.days === "year") {
      onChange(new Date(today.getFullYear(), 0, 1))
    } else {
      const d = new Date(today)
      d.setDate(d.getDate() - preset.days)
      onChange(d)
    }
    setOpen(false)
  }

  return (
    <div className={cn("relative", className)}>
      <Button ref={triggerRef} variant="outline" size="sm" onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-gray-600 w-full justify-start">
        <CalendarIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left truncate">{value ? format(value, "MMM d, yyyy") : placeholder}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform shrink-0", open && "rotate-180")} />
      </Button>
      {open &&
        createPortal(
          <motion.div ref={popupRef} initial={{ opacity: 0, y: -4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.15 }}
            style={position ? { top: position.top, left: position.left, width: position.width } : undefined}
            className={cn("fixed w-72 rounded-2xl border border-gray-100 bg-white p-3 shadow-dropdown", layer)}>
              <div className="flex gap-1.5 mb-3 overflow-x-auto">
                {presets.map((p) => (
                  <button key={p.label} onClick={() => handlePreset(p)}
                    className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors whitespace-nowrap">
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between mb-3">
                <button onClick={handlePrev} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-1">
                  <button onClick={() => { const y = getYear(viewDate); onChange?.(new Date(y, 0, 1)) }}
                    className="text-sm font-semibold text-gray-900 hover:text-primary transition-colors">
                    {format(viewDate, "MMMM yyyy")}
                  </button>
                </div>
                <button onClick={handleNext} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
                  <div key={d} className="text-center text-[11px] font-medium text-gray-400 py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {daysInMonth.map((day, i) => (
                  <button key={i} onClick={() => handleSelect(day)}
                    className={cn(
                      "flex h-8 w-full items-center justify-center rounded-lg text-sm transition-colors",
                      !isSameMonth(day, viewDate) && "text-gray-300",
                      isSameMonth(day, viewDate) && !isSameDay(day, value || new Date(0)) && "text-gray-700 hover:bg-gray-100",
                      isToday(day) && "font-bold text-primary",
                      value && isSameDay(day, value) && "bg-primary text-primary-foreground hover:bg-primary-hover font-semibold shadow-sm"
                    )}>
                    {format(day, "d")}
                  </button>
                ))}
              </div>
            </motion.div>,
            document.body
          )}
    </div>
  )
}
