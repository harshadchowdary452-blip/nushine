import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Calendar, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const presets = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "Last Month", value: "last_month" },
  { label: "This Quarter", value: "quarter" },
  { label: "This Year", value: "year" },
  { label: "Custom", value: "custom" },
] as const

export type DateRangePreset = typeof presets[number]["value"]

interface DashboardDateFilterProps {
  value: DateRangePreset
  onChange: (value: DateRangePreset) => void
}

export default function DashboardDateFilter({ value, onChange }: DashboardDateFilterProps) {
  const [open, setOpen] = useState(false)
  const activeLabel = presets.find((p) => p.value === value)?.label || "Select Range"

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-gray-600"
      >
        <Calendar className="h-4 w-4" />
        {activeLabel}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </Button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-[var(--ds-z-overlay)]" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 top-full z-[var(--ds-z-dropdown)] mt-1.5 w-44 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-dropdown"
            >
              {presets.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => { onChange(preset.value); setOpen(false) }}
                  className={cn(
                    "flex w-full items-center rounded-xl px-3 py-2 text-sm transition-colors",
                    value === preset.value
                      ? "bg-primary-soft text-primary font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
