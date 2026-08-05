import * as React from "react"
import { cn } from "@/lib/utils"

export type NumericMode = "integer" | "decimal" | "currency" | "percentage"

export interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> {
  value?: string | number | null
  onChange?: (value: string) => void
  mode?: NumericMode
  min?: number
  max?: number
  allowNegative?: boolean
  prefix?: string
  suffix?: string
  decimalPlaces?: number
}

function stripFormatting(v: string, allowNegative: boolean): string {
  return allowNegative ? v.replace(/[^\d.-]/g, "") : v.replace(/[^\d.]/g, "")
}

const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  (
    {
      className,
      mode = "decimal",
      min,
      max,
      allowNegative = false,
      prefix,
      suffix,
      decimalPlaces,
      value,
      onChange,
      onBlur,
      disabled,
      placeholder,
      ...props
    },
    ref
  ) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null)
    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node
        if (typeof ref === "function") ref(node)
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node
      },
      [ref]
    )

    const maxDecimals = decimalPlaces ?? (mode === "integer" ? 0 : mode === "percentage" ? 1 : 2)

    // React attaches onWheel as a passive listener, so preventDefault there is
    // ignored and warns. Attach a native non-passive listener instead so
    // scrolling over the field neither changes the page scroll nor nudges the
    // value — it just blurs the input.
    React.useEffect(() => {
      const el = innerRef.current
      if (!el) return
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        el.blur()
      }
      el.addEventListener("wheel", onWheel, { passive: false })
      return () => el.removeEventListener("wheel", onWheel)
    }, [])

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        const allowed = [
          "Backspace", "Delete", "Tab", "Escape", "Enter", "Home", "End",
          "ArrowLeft", "ArrowRight",
        ]
        if ((e.metaKey || e.ctrlKey) && ["a", "c", "v", "x", "z", "y"].includes(e.key.toLowerCase())) return
        if (allowed.includes(e.key)) return
        if (e.key === "-" && allowNegative) {
          const el = innerRef.current
          if (el && el.selectionStart === 0 && !el.value.includes("-")) return
        }
        if (e.key === "." && maxDecimals > 0) {
          const el = innerRef.current
          if (el && !el.value.includes(".")) return
        }
        if (/^\d$/.test(e.key)) return
        e.preventDefault()
      },
      [allowNegative, maxDecimals]
    )

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        let raw = stripFormatting(e.target.value, allowNegative)
        if (raw === "" || raw === "-" || raw === ".") {
          onChange?.(raw)
          return
        }
        const num = parseFloat(raw)
        if (isNaN(num)) return
        if (maxDecimals > 0) {
          const parts = raw.split(".")
          if (parts.length === 2 && parts[1].length > maxDecimals) {
            raw = parts[0] + "." + parts[1].slice(0, maxDecimals)
          }
        }
        if (prefix) raw = raw.replace(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "")
        if (suffix) raw = raw.replace(new RegExp(`${suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "")
        onChange?.(raw)
      },
      [maxDecimals, prefix, suffix, onChange, allowNegative]
    )

    const handleBlur = React.useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        const raw = stripFormatting(e.target.value, allowNegative)
        if (raw === "" || raw === "-" || raw === ".") {
          onChange?.("")
        } else {
          let num = parseFloat(raw)
          if (!isNaN(num)) {
            if (min !== undefined && num < min) num = min
            if (max !== undefined && num > max) num = max
            let formatted: string
            if (mode === "integer") {
              formatted = String(Math.round(num))
            } else {
              formatted = num.toFixed(maxDecimals)
            }
            if (formatted !== raw) onChange?.(formatted)
          }
        }
        onBlur?.(e)
      },
      [mode, min, max, maxDecimals, onChange, onBlur, allowNegative]
    )

    const displayValue = React.useMemo(() => {
      if (value === null || value === undefined) return ""
      const s = String(value)
      if (s === "" || s === "-" || s === ".") return s
      return s
    }, [value])

    const inputMode: React.HTMLAttributes<HTMLInputElement>["inputMode"] =
      mode === "integer" ? "numeric" : "decimal"

    return (
      <div className="relative flex items-center">
        {prefix && (
          <span className="pointer-events-none absolute left-3 select-none text-sm text-[var(--ds-text-tertiary)]">{prefix}</span>
        )}
        <input
          ref={setRefs}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={displayValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className={cn(
            "ds-input-text flex h-[var(--ds-input-height)] w-full rounded-[var(--ds-input-radius)] border border-[var(--ds-input-border)] bg-[var(--ds-surface)] text-[var(--ds-text)] shadow-[var(--ds-input-shadow)] ds-transition-colors",
            "hover:border-[var(--ds-input-border-hover)]",
            "focus:border-[var(--ds-input-border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/10",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--ds-surface-disabled)]",
            "placeholder:text-[var(--ds-input-placeholder)]",
            prefix ? "pl-7" : "px-[var(--ds-spacing-3)]",
            suffix ? "pr-7" : "pr-[var(--ds-spacing-3)]",
            "py-[var(--ds-spacing-2)]",
            className
          )}
          {...props}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 select-none text-sm text-[var(--ds-text-tertiary)]">{suffix}</span>
        )}
      </div>
    )
  }
)
NumericInput.displayName = "NumericInput"

export { NumericInput }
