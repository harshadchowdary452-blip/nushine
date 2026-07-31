import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button, buttonVariants, type ButtonProps } from "@/design-system/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/design-system/components/dropdown-menu"

/**
 * Joins adjacent buttons into a segmented control. Corner radii are collapsed
 * on shared edges and the internal border is doubled so the seam reads as one
 * control. Children must be `<Button>` elements (or anything accepting a
 * `className`).
 */
function ButtonGroup({
  className,
  children,
  vertical = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { vertical?: boolean }) {
  const count = React.Children.count(children)
  return (
    <div
      role="group"
      className={cn("inline-flex items-center", vertical && "flex-col items-stretch", className)}
      {...props}
    >
      {React.Children.map(children, (child, i) => {
        if (!React.isValidElement<{ className?: string }>(child)) return child
        const joined = cn(
          !vertical && i > 0 && "-ml-px",
          !vertical && i === 0 && "rounded-r-none",
          !vertical && i === count - 1 && "rounded-l-none",
          !vertical && i > 0 && i < count - 1 && "rounded-none",
          vertical && i > 0 && "-mt-px",
          vertical && i === 0 && "rounded-b-none",
          vertical && i === count - 1 && "rounded-t-none",
          vertical && i > 0 && i < count - 1 && "rounded-none"
        )
        return React.cloneElement(child, { className: cn(child.props.className, joined) })
      })}
    </div>
  )
}
ButtonGroup.displayName = "ButtonGroup"

/**
 * Primary action with a chevron that opens a menu of secondary actions.
 * `children` are rendered inside the dropdown (typically `<DropdownMenuItem>`).
 */
function SplitButton({
  label,
  onClick,
  children,
  variant = "primary",
  size = "default",
  disabled = false,
  className,
  triggerClassName,
  icon: Icon,
}: {
  label: React.ReactNode
  onClick?: () => void
  children: React.ReactNode
  variant?: ButtonProps["variant"]
  size?: ButtonProps["size"]
  disabled?: boolean
  className?: string
  triggerClassName?: string
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <DropdownMenu>
      <div className={cn("inline-flex items-center", className)}>
        <Button
          type="button"
          variant={variant}
          size={size}
          onClick={onClick}
          disabled={disabled}
          className="rounded-r-none"
        >
          {Icon && <Icon />}
          {label}
        </Button>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={variant}
            size={size}
            disabled={disabled}
            aria-label={`${typeof label === "string" ? label : "Actions"} menu`}
            className={cn("rounded-l-none border-l border-l-black/10 px-2.5", triggerClassName)}
          >
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}
SplitButton.displayName = "SplitButton"

/**
 * A single trigger that opens a menu of actions.
 */
function DropdownButton({
  label,
  children,
  variant = "outline",
  size = "default",
  disabled = false,
  className,
  icon: Icon,
}: {
  label: React.ReactNode
  children: React.ReactNode
  variant?: ButtonProps["variant"]
  size?: ButtonProps["size"]
  disabled?: boolean
  className?: string
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={variant} size={size} disabled={disabled} className={className}>
          {Icon && <Icon />}
          {label}
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}
DropdownButton.displayName = "DropdownButton"

/**
 * Floating action button — a persistent, circular action anchored to the
 * viewport. Pass an optional `label` to render an extended FAB.
 */
function Fab({
  label,
  className,
  icon: Icon,
  ...props
}: Omit<ButtonProps, "children"> & {
  label?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <Button
      type="button"
      size="icon-lg"
      className={cn(
        "!rounded-full shadow-[var(--ds-shadow-dialog)] fixed bottom-6 right-6 z-[var(--ds-z-dropdown)]",
        label && "h-auto gap-2 px-5 py-3 text-sm",
        className
      )}
      {...props}
    >
      {Icon && <Icon />}
      {label}
    </Button>
  )
}
Fab.displayName = "Fab"

export { ButtonGroup, SplitButton, DropdownButton, Fab, buttonVariants }
