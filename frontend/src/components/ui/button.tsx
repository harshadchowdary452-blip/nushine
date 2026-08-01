import * as React from "react"
import {
  Button as DSButton,
  buttonVariants as dsButtonVariants,
} from "@/design-system/components/button"
import type { VariantProps } from "class-variance-authority"

const LEGACY_TO_DS_VARIANT: Record<string, string> = {
  default: "primary",
}

function mapVariant(variant?: string): string {
  if (!variant) return "primary"
  return LEGACY_TO_DS_VARIANT[variant] ?? variant
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link" | "primary" | "accent"
  size?: "default" | "sm" | "lg" | "xl" | "icon" | "icon-sm" | "icon-lg"
  loading?: boolean
  loadingLabel?: string
}

type DSVariantName = NonNullable<DSVariants["variant"]>

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, ...props }, ref) => (
    <DSButton ref={ref} variant={mapVariant(variant) as DSVariantName} {...props} />
  )
)
Button.displayName = "Button"

type DSVariants = VariantProps<typeof dsButtonVariants>

function buttonVariants({
  variant,
  size,
  className,
}: {
  variant?: string
  size?: string
  className?: string
}) {
  return dsButtonVariants({
    variant: mapVariant(variant) as DSVariants["variant"],
    size: size as DSVariants["size"],
    className,
  })
}

 
export { Button, buttonVariants }
