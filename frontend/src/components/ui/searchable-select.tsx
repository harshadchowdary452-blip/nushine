import { useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFixedPosition, useOverlayDismiss, resolveOverlayLayer } from "@/lib/overlay"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface SearchableSelectProps {
  value: string
  onValueChange: (value: string) => void
  options: string[]
  placeholder?: string
  className?: string
  triggerClassName?: string
}

export default function SearchableSelect({ value, onValueChange, options, placeholder = "Select...", className, triggerClassName }: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const { position } = useFixedPosition(open, triggerRef)
  useOverlayDismiss(open, () => setOpen(false), triggerRef, popupRef)
  const layer = resolveOverlayLayer(triggerRef.current)

  const filtered = useMemo(
    () => options.filter((o) => o.toLowerCase().includes(search.toLowerCase())),
    [options, search]
  )

  return (
    <div className={cn("relative", className)}>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        aria-controls="searchable-select-popup"
        onClick={() => setOpen((v) => !v)}
        className={cn("w-full justify-between", triggerClassName)}
      >
        {value || placeholder}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      {open &&
        createPortal(
          <div
            id="searchable-select-popup"
            ref={popupRef}
            style={position ? { top: position.top, left: position.left, width: position.width } : undefined}
            className={cn("fixed rounded-lg border border-border bg-white shadow-lg", layer)}
          >
            <div className="flex items-center border-b border-border px-3">
              <Search className="h-4 w-4 shrink-0 text-gray-400" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-9 text-sm"
              />
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <p className="py-2 text-center text-sm text-gray-500">No results</p>
              ) : (
                filtered.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      onValueChange(option)
                      setOpen(false)
                      setSearch("")
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                      value === option ? "bg-primary/10 text-primary" : "hover:bg-gray-50"
                    )}
                  >
                    <Check className={cn("h-4 w-4", value === option ? "opacity-100" : "opacity-0")} />
                    {option}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
