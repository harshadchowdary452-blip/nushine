import { Calendar, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "./dropdown-menu"

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

/** Dashboard date-range preset picker. */
export default function DashboardDateFilter({ value, onChange }: DashboardDateFilterProps) {
  const activeLabel = presets.find((p) => p.value === value)?.label || "Select Range"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Calendar className="h-4 w-4" aria-hidden="true" />
          {activeLabel}
          <ChevronDown className="h-3.5 w-3.5 text-[var(--ds-text-tertiary)]" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 p-1.5">
        {presets.map((preset) => (
          <DropdownMenuItem
            key={preset.value}
            onSelect={() => onChange(preset.value)}
            className={cn(
              "rounded-xl",
              value === preset.value && "bg-[var(--ds-primary-subtle)] font-medium text-[var(--ds-primary)]"
            )}
          >
            {preset.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
