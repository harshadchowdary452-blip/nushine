import { useState, useEffect, useRef, useCallback } from "react"
import { Search, X, Command, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/design-system/components/input"

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  loading?: boolean
  className?: string
  debounceMs?: number
}

export default function SearchBar({
  value,
  onChange,
  placeholder = "Search...",
  loading = false,
  className,
  debounceMs = 300,
}: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const debouncedOnChange = useCallback(
    (val: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => onChange(val), debounceMs)
    },
    [onChange, debounceMs]
  )

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  return (
    <div className={cn("relative group", className)}>
      <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 leading-none">
        {loading ? (
          <Loader2 className="ds-animate-spin h-4 w-4 text-[var(--ds-text-tertiary)]" />
        ) : (
          <Search className="h-4 w-4 text-[var(--ds-text-tertiary)] transition-colors group-focus-within:text-[var(--ds-primary)]" />
        )}
      </div>
      <Input
        ref={inputRef}
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value)
          debouncedOnChange(e.target.value)
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn("h-9 rounded-[var(--ds-radius-xl)] bg-[var(--ds-surface-secondary)] pl-10 pr-16 transition-all", value && "pr-20")}
      />
      <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1">
        {localValue && (
          <button
            onClick={() => { setLocalValue(""); onChange(""); inputRef.current?.focus() }}
            aria-label="Clear search"
            className="ds-target flex h-5 w-5 items-center justify-center rounded-full text-[var(--ds-text-tertiary)] transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        {!localValue && (
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ds-text-tertiary)]">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        )}
      </div>
    </div>
  )
}
