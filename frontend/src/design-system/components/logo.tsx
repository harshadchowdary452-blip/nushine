import { cn } from "@/lib/utils"
import { ToothLogo } from "./brand-logo"

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

/** Full "APPOINTIN" lockup with vector tooth icon. */
export default function Logo({ className, variant = "default", showTagline = false, size = "md" }: LogoProps) {
  const s = sizeMap[size]
  const isSidebar = variant === "sidebar"
  const isWhite = variant === "white"

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <ToothLogo size={s.icon} />
      <div>
        {isSidebar ? (
          <span className={cn("tracking-tight leading-tight", s.text)}>
            <span className="font-extrabold text-[var(--ds-primary-300)]">APPOINTIN</span>
          </span>
        ) : (
          <span className={cn("font-bold tracking-tight", s.text, isWhite ? "text-white" : "text-[var(--ds-text)]")}>
            APPOINTIN
          </span>
        )}
        {showTagline && (
            <p className={cn(s.tagline, isSidebar ? "mt-0.5 text-[var(--ds-sidebar-icon)]" : isWhite ? "text-white/60" : "text-[var(--ds-text-tertiary)]", "-mt-0.5")}>
            Connect. Care. Grow.
          </p>
        )}
      </div>
    </div>
  )
}
