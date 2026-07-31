import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  variant?: "default" | "white" | "sidebar"
  showTagline?: boolean
  size?: "sm" | "md" | "lg"
}

const sizeMap = {
  sm: { icon: 28, text: "text-base", tagline: "text-[10px]" },
  md: { icon: 36, text: "text-lg", tagline: "text-xs" },
  lg: { icon: 48, text: "text-2xl", tagline: "text-sm" },
}

/** Full "NUSHINE Dental" lockup with gradient icon. */
export default function Logo({ className, variant = "default", showTagline = false, size = "md" }: LogoProps) {
  const s = sizeMap[size]
  const isWhite = variant === "white"
  const isSidebar = variant === "sidebar"
  const useDefaultIcon = !isWhite || isSidebar
  const iconFill = useDefaultIcon ? "url(#gradient-default)" : "url(#gradient-white)"
  const toothFill = isWhite ? "var(--ds-primary-900)" : "white"

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <svg width={s.icon} height={s.icon} viewBox="0 0 48 48" fill="none">
        <defs>
          <linearGradient id="gradient-default" x1="0" y1="0" x2="48" y2="48">
            <stop offset="0%" stopColor="var(--ds-primary-400)" />
            <stop offset="100%" stopColor="var(--ds-primary-600)" />
          </linearGradient>
          <linearGradient id="gradient-white" x1="0" y1="0" x2="48" y2="48">
            <stop offset="0%" stopColor="var(--ds-sidebar-logo-grad-1)" />
            <stop offset="100%" stopColor="var(--ds-sidebar-logo-grad-2)" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="10" fill={iconFill} />
        <path
          d="M24 10c-3 0-5.5 2-6.5 5.5C16.5 18 16 22 16 26s.5 7 1.5 8.5c.8 1.2 2 2 3.5 2.5.8.2 1.5.6 2 1.2l1 1.3c.5.7 1.5.7 2 0l1-1.3c.5-.6 1.2-1 2-1.2 1.5-.5 2.7-1.3 3.5-2.5 1-1.5 1.5-4.5 1.5-8.5s-.5-8-1.5-10.5C29.5 12 27 10 24 10z"
          fill={toothFill}
          opacity="0.95"
        />
        <path d="M22 18l-3 6h3l-1 6 5-7h-3l3-5h-4z" fill={iconFill} opacity="0.9" />
      </svg>
      <div>
        {isSidebar ? (
          <span className={cn("tracking-tight leading-tight", s.text)}>
            <span className="bg-gradient-to-r from-[var(--ds-primary-300)] to-[var(--ds-primary-400)] bg-clip-text font-extrabold text-transparent">
              NUSHINE
            </span>{" "}
            <span className="font-bold text-[var(--ds-sidebar-text)]">Dental</span>
          </span>
        ) : (
          <span className={cn("font-bold tracking-tight", s.text, isWhite ? "text-white" : "text-[var(--ds-text)]")}>
            NUSHINE Dental
          </span>
        )}
        {showTagline && (
            <p className={cn(s.tagline, isSidebar ? "mt-0.5 text-[var(--ds-sidebar-icon)]" : isWhite ? "text-white/60" : "text-[var(--ds-text-tertiary)]", "-mt-0.5")}>
            {isSidebar ? "Dental Excellence Platform" : "Transforming Smiles Through Intelligent Care"}
          </p>
        )}
      </div>
    </div>
  )
}
