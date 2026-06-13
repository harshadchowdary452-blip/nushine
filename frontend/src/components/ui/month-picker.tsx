import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface MonthPickerProps {
  value: Date | undefined
  onChange: (date: Date | undefined) => void
  placeholder?: string
  className?: string
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export default function MonthPicker({ value, onChange, placeholder = "Select month", className }: MonthPickerProps) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(value?.getFullYear() || new Date().getFullYear())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div ref={ref} className={cn("relative", className)}>
      <Button variant="outline" size="sm" onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-gray-600 w-full justify-start">
        <Calendar className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left truncate">
          {value ? months[value.getMonth()] + " " + value.getFullYear() : placeholder}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform shrink-0", open && "rotate-180")} />
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }} transition={{ duration: 0.15 }}
            className="absolute left-0 top-full z-30 mt-1.5 w-64 rounded-2xl border border-gray-100 bg-white p-3 shadow-dropdown">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setYear(y => y - 1)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-gray-900">{year}</span>
              <button onClick={() => setYear(y => y + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {months.map((m, i) => {
                const selected = value && value.getMonth() === i && value.getFullYear() === year
                return (
                  <button key={m} onClick={() => { onChange(new Date(year, i, 1)); setOpen(false) }}
                    className={cn(
                      "rounded-xl py-2.5 text-sm font-medium transition-all",
                      selected ? "bg-primary text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"
                    )}>
                    {m}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
