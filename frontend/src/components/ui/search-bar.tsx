import { useState, useEffect, useRef, useCallback } from "react"
import { Search, X, Command, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

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
      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10 leading-none">
        {loading ? (
          <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
        ) : (
          <Search className="h-4 w-4 text-gray-400 transition-colors group-focus-within:text-primary" />
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
        className={cn("pl-10 pr-16 h-9 bg-gray-50/80 border-gray-100 focus:bg-white focus:border-primary rounded-xl transition-all", value && "pr-20")}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
        {localValue && (
          <button
            onClick={() => { setLocalValue(""); onChange(""); inputRef.current?.focus() }}
            className="flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        {!localValue && (
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        )}
      </div>
    </div>
  )
}
