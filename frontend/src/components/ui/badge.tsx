import * as React from "react"
import {
  Badge as DSBadge,
  badgeVariants as dsBadgeVariants,
} from "@/design-system/components/badge"
import type { VariantProps } from "class-variance-authority"

const LEGACY_TO_DS_VARIANT: Record<string, string> = {
  secondary: "default",
  destructive: "danger",
}

function mapVariant(variant?: string): string {
  if (!variant) return "default"
  return LEGACY_TO_DS_VARIANT[variant] ?? variant
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "primary" | "success" | "warning" | "danger" | "destructive" | "info" | "outline" | "accent"
}

type DSVariantName = NonNullable<DSVariants["variant"]>

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant, ...props }, ref) => (
    <DSBadge ref={ref} variant={mapVariant(variant) as DSVariantName} {...props} />
  )
)
Badge.displayName = "Badge"

type DSVariants = VariantProps<typeof dsBadgeVariants>

function badgeVariants({
  variant,
  className,
}: {
  variant?: string
  className?: string
}) {
  return dsBadgeVariants({
    variant: mapVariant(variant) as DSVariants["variant"],
    className,
  })
}

 
export { Badge, badgeVariants }
