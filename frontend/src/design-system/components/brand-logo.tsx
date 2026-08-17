import { cn } from "@/lib/utils"
import appointinLogo from "@/assets/appointin-logo.png"

interface ToothLogoProps {
  className?: string
  size?: number
}

export function ToothLogo({ className = "", size = 27 }: ToothLogoProps) {
  return (
    <img
      src={appointinLogo}
      alt="Appointin"
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
      draggable={false}
    />
  )
}

interface BrandTextProps {
  className?: string
  size?: "xs" | "sm" | "md" | "lg"
  darkBg?: boolean
}

const brandSizeMap = {
  xs: "text-[10px]",
  sm: "text-[11px]",
  md: "text-[13px]",
  lg: "text-[14px]",
}

export function BrandText({ className = "", size = "md", darkBg }: BrandTextProps) {
  return (
    <span className={cn(brandSizeMap[size], "font-bold tracking-tight leading-none", className)}>
      <span className={darkBg ? "text-white" : "text-[var(--ds-text)]"}>APPOINTIN</span>
    </span>
  )
}

interface BrandLogoProps {
  className?: string
  size?: "sm" | "md" | "lg"
  showTagline?: boolean
  tagline?: string
  darkBg?: boolean
}

const logoSizeMap = {
  sm: { icon: 19, brand: "xs" as const, tagline: "text-[8px]" },
  md: { icon: 22, brand: "sm" as const, tagline: "text-[9px]" },
  lg: { icon: 27, brand: "md" as const, tagline: "text-[9px]" },
}

export function BrandLogo({ className = "", size = "md", showTagline = false, tagline, darkBg }: BrandLogoProps) {
  const s = logoSizeMap[size]
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <ToothLogo size={s.icon} />
      <div>
        <BrandText size={s.brand} darkBg={darkBg} />
        {showTagline && (
          <p className={cn(s.tagline, "text-[var(--ds-text-tertiary)] font-medium tracking-[0.25em] uppercase")}>
            {tagline || "Connect. Care. Grow."}
          </p>
        )}
      </div>
    </div>
  )
}

interface WordmarkLogoProps {
  className?: string
  height?: number
  darkBg?: boolean
}

export function WordmarkLogo({ className = "", height = 28, darkBg }: WordmarkLogoProps) {
  return (
    <img
      src={appointinLogo}
      alt="Appointin"
      style={{ height, width: "auto", display: "block" }}
      className={cn("shrink-0 object-contain max-w-none", darkBg && "brightness-0 invert", className)}
      draggable={false}
    />
  )
}
