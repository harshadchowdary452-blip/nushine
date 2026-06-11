import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 select-none relative overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-primary text-white shadow-sm hover:bg-primary-hover hover:shadow-glow active:scale-[0.97]",
        destructive: "bg-danger text-white shadow-sm hover:bg-danger/90 active:scale-[0.97]",
        outline: "border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-300 hover:shadow-md active:scale-[0.97]",
        secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200 hover:shadow-sm active:scale-[0.97]",
        ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 rounded-xl",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-10 rounded-xl px-6",
        xl: "h-12 rounded-2xl px-8 text-base",
        icon: "h-9 w-9 rounded-xl",
        "icon-sm": "h-8 w-8 rounded-lg",
        "icon-lg": "h-10 w-10 rounded-xl",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
