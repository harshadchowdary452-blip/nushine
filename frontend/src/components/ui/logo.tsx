import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  variant?: "default" | "white"
  showTagline?: boolean
  size?: "sm" | "md" | "lg"
}

const sizeMap = {
  sm: { icon: 28, text: "text-base", tagline: "text-[10px]" },
  md: { icon: 36, text: "text-lg", tagline: "text-xs" },
  lg: { icon: 48, text: "text-2xl", tagline: "text-sm" },
}

export default function Logo({ className, variant = "default", showTagline = false, size = "md" }: LogoProps) {
  const s = sizeMap[size]
  const iconColor = variant === "white" ? "#fff" : "#0EA5E9"
  const textColor = variant === "white" ? "text-white" : "text-gray-900"
  const taglineColor = variant === "white" ? "text-white/60" : "text-gray-400"

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <svg width={s.icon} height={s.icon} viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="10" fill={iconColor} />
        <path
          d="M24 10c-3 0-5.5 2-6.5 5.5C16.5 18 16 22 16 26s.5 7 1.5 8.5c.8 1.2 2 2 3.5 2.5.8.2 1.5.6 2 1.2l1 1.3c.5.7 1.5.7 2 0l1-1.3c.5-.6 1.2-1 2-1.2 1.5-.5 2.7-1.3 3.5-2.5 1-1.5 1.5-4.5 1.5-8.5s-.5-8-1.5-10.5C29.5 12 27 10 24 10z"
          fill={variant === "white" ? "#0C4A6E" : "white"}
          opacity="0.95"
        />
        <path d="M22 18l-3 6h3l-1 6 5-7h-3l3-5h-4z" fill={iconColor} opacity="0.9" />
      </svg>
      <div>
        <span className={cn("font-bold tracking-tight", s.text, textColor)}>
          NuShine Dental
        </span>
        {showTagline && (
          <p className={cn(s.tagline, taglineColor, "-mt-0.5")}>
            Modern Dental Practice
          </p>
        )}
      </div>
    </div>
  )
}
