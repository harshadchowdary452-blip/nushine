import { cn } from "@/lib/utils"

interface ToothLogoProps {
  className?: string
  size?: number
  showSparkle?: boolean
}

export function ToothLogo({ className = "", size = 27, showSparkle = true }: ToothLogoProps) {
  return (
    <svg className={cn("shrink-0", className)} width={size} height={size} viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="tooth-bg" x1="0" y1="0" x2="56" y2="56">
          <stop offset="0%" stopColor="#16D3C5" />
          <stop offset="55%" stopColor="#1AA5D4" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
        <linearGradient id="tooth-shine" x1="0" y1="0" x2="0" y2="56">
          <stop offset="0%" stopColor="white" stopOpacity="0.25" />
          <stop offset="40%" stopColor="white" stopOpacity="0.05" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="tooth-border" x1="0" y1="0" x2="56" y2="56">
          <stop offset="0%" stopColor="white" stopOpacity="0.15" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Rounded square container */}
      <rect x="2" y="2" width="52" height="52" rx="14" fill="url(#tooth-bg)" />

      {/* Inner border highlight */}
      <rect x="2" y="2" width="52" height="52" rx="14" stroke="url(#tooth-border)" strokeWidth="1.5" />

      {/* Top shine overlay */}
      <rect x="2" y="2" width="52" height="20" rx="14" fill="url(#tooth-shine)" />

      {/* Refined tooth — wider natural proportions, smoother curves */}
      <path
        d="M28 14c-4.5 0-7.8 2.6-9 6.8-1 3.4-1.5 7.6-1.5 11.2s.5 7 1.4 8.8c.7 1.4 1.8 2.4 3.2 2.9 1.1.4 2.1 1 2.8 1.7l.7.8c.6.7 1.7.7 2.3 0l.7-.8c.7-.7 1.7-1.3 2.8-1.7 1.4-.5 2.5-1.5 3.2-2.9.9-1.8 1.4-5.2 1.4-8.8s-.5-7.8-1.5-11.2C35.8 16.6 32.5 14 28 14z"
        fill="white"
        opacity="0.96"
      />

      {/* "N" as a natural central groove fissure — carved negative space effect */}
      <path
        d="M23.5 25v11l6-11v11"
        stroke="url(#tooth-bg)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />

      {/* Premium sparkle — refined 4-point diamond */}
      {showSparkle && (
        <g transform="translate(44, 9)">
          <path
            d="M3 0l1.2 2.3L6.5 3l-2.3 1.2L3 6.5 1.8 4.2-.5 3l2.3-1.2z"
            fill="#16D3C5"
          />
        </g>
      )}
    </svg>
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
      <span className="text-[#16D3C5]">Nu</span>
      <span className={darkBg ? "text-white" : "text-[#0B1D3A]"}>Shine</span>
    </span>
  )
}

interface BrandLogoProps {
  className?: string
  size?: "sm" | "md" | "lg"
  showTagline?: boolean
  showSparkle?: boolean
  tagline?: string
  darkBg?: boolean
}

const logoSizeMap = {
  sm: { icon: 19, brand: "xs" as const, tagline: "text-[8px]" },
  md: { icon: 22, brand: "sm" as const, tagline: "text-[9px]" },
  lg: { icon: 27, brand: "md" as const, tagline: "text-[9px]" },
}

export function BrandLogo({ className = "", size = "md", showTagline = false, showSparkle = true, tagline, darkBg }: BrandLogoProps) {
  const s = logoSizeMap[size]
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <ToothLogo size={s.icon} showSparkle={showSparkle} />
      <div>
        <BrandText size={s.brand} darkBg={darkBg} />
        {showTagline && (
          <p className={cn(s.tagline, "text-[#94A3B8] font-medium tracking-[0.25em] uppercase")}>
            {tagline || "Dental Management System"}
          </p>
        )}
      </div>
    </div>
  )
}
