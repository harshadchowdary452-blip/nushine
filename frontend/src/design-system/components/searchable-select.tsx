import { useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Branch } from "@radix-ui/react-dismissable-layer"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFixedPosition, useOverlayDismiss, resolveOverlayLayer } from "@/lib/overlay"
import { Button } from "@/design-system/components/button"
import { Input } from "@/design-system/components/input"

interface SearchableSelectProps {
  value: string
  onValueChange: (value: string) => void
  options: string[]
  placeholder?: string
  className?: string
  triggerClassName?: string
}

export default function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  className,
  triggerClassName,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [highlighted, setHighlighted] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const { position } = useFixedPosition(open, triggerRef, { popupRef })
  useOverlayDismiss(open, () => setOpen(false), triggerRef, popupRef)
  const layer = resolveOverlayLayer(triggerRef.current)

  const filtered = useMemo(
    () => options.filter((o) => o.toLowerCase().includes(search.toLowerCase())),
    [options, search]
  )

  function selectOption(option: string) {
    onValueChange(option)
    setOpen(false)
    setSearch("")
    setHighlighted(0)
  }

  function handleTriggerKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setOpen(true)
    }
  }

  function handleListKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlighted((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && filtered[highlighted]) {
      e.preventDefault()
      selectOption(filtered[highlighted])
    }
  }

  return (
    <div className={cn("relative", className)}>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls="searchable-select-popup"
        onClick={() => {
          setOpen((v) => !v)
          setHighlighted(0)
        }}
        onKeyDown={handleTriggerKey}
        className={cn("w-full justify-between", triggerClassName)}
      >
        {value || placeholder}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      {open &&
        createPortal(
          <Branch
            id="searchable-select-popup"
            ref={popupRef}
            role="listbox"
            aria-label={placeholder}
            style={{ pointerEvents: "auto", ...position }}
            onKeyDown={handleListKey}
            className={cn(
              "fixed overflow-hidden rounded-[var(--ds-radius-xl)] border border-[var(--ds-menu-border)] bg-[var(--ds-menu-bg)] shadow-[var(--ds-shadow-dropdown)]",
              layer
            )}
          >
            <div className="flex items-center border-b border-[var(--ds-border-light)] px-3">
              <Search className="h-4 w-4 shrink-0 text-[var(--ds-text-tertiary)]" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setHighlighted(0)
                }}
                className="h-9 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <p className="py-2 text-center text-sm text-[var(--ds-text-tertiary)]">No results</p>
              ) : (
                filtered.map((option, i) => (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={value === option}
                    onMouseEnter={() => setHighlighted(i)}
                    onClick={() => selectOption(option)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-[var(--ds-radius-lg)] px-2.5 py-2 text-sm text-left transition-colors",
                      i === highlighted
                        ? "bg-[var(--ds-menu-item-hover-bg)]"
                        : "hover:bg-[var(--ds-menu-item-hover-bg)]",
                      value === option ? "text-[var(--ds-menu-item-active-fg)]" : "text-[var(--ds-text-secondary)]"
                    )}
                  >
                    <Check className={cn("h-4 w-4 shrink-0", value === option ? "opacity-100" : "opacity-0")} />
                    {option}
                  </button>
                ))
              )}
            </div>
          </Branch>,
          document.body
        )}
    </div>
  )
}
