import * as React from "react"
import { SlidersHorizontal, X } from "lucide-react"
import { Button } from "./button"
import { Badge } from "./badge"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./sheet"
import { cn } from "@/lib/utils"

interface FilterBarProps {
  activeCount: number
  onReset: () => void
  children: React.ReactNode
  className?: string
}

export function FilterBar({ activeCount, onReset, children, className }: FilterBarProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className={cn("space-y-3", className)}>
      <div className="hidden md:flex flex-wrap items-end gap-3">
        {children}
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onReset} className="h-9 text-xs">
            <X className="h-3 w-3 mr-1" /> Reset
          </Button>
        )}
      </div>
      <div className="md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <SlidersHorizontal className="h-4 w-4" />
              Filters{activeCount > 0 ? ` (${activeCount})` : ""}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[320px] sm:w-[380px] overflow-y-auto" aria-describedby={undefined}>
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              {children}
            </div>
            <div className="mt-6 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="flex-1">
                Close
              </Button>
              {activeCount > 0 && (
                <Button variant="destructive" size="sm" onClick={() => { onReset(); setOpen(false) }} className="flex-1">
                  Reset All
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  )
}

interface FilterChipsProps {
  chips: { key: string; label: string; value: string }[]
  onRemove: (key: string) => void
  onClearAll: () => void
}

export function FilterChips({ chips, onRemove, onClearAll }: FilterChipsProps) {
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.filter(c => c.key !== "date_preset").map((chip) => (
        <Badge key={chip.key} variant="secondary" className="gap-1 pr-1 text-xs font-normal">
          <span className="text-muted-foreground">{chip.label}:</span> {chip.value}
          <button
            onClick={() => onRemove(chip.key)}
            className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </Badge>
      ))}
      <Button variant="ghost" size="sm" onClick={onClearAll} className="h-6 text-xs px-2 text-muted-foreground">
        Clear all
      </Button>
    </div>
  )
}

interface FilterFieldProps {
  label: string
  children: React.ReactNode
  className?: string
}

export function FilterField({ label, children, className }: FilterFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}
