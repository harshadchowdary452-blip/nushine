import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

function Select({ value, defaultValue, ...props }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Root>) {
  const rootProps: Record<string, unknown> = { ...props }
  if (value != null && value !== "") {
    rootProps.value = value
  } else if (defaultValue != null && defaultValue !== "") {
    rootProps.defaultValue = defaultValue
  }
  return <SelectPrimitive.Root {...rootProps} />
}

const SelectGroup = SelectPrimitive.Group

const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "ds-input-text flex h-[var(--ds-input-height)] w-full items-center justify-between whitespace-nowrap rounded-[var(--ds-input-radius)] border border-[var(--ds-input-border)] bg-[var(--ds-surface)] pl-[var(--ds-spacing-3)] pr-[var(--ds-spacing-3)] text-[var(--ds-text)] shadow-[var(--ds-input-shadow)] ds-transition-colors",
      "hover:border-[var(--ds-input-border-hover)]",
      "focus:border-[var(--ds-input-border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/10",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "aria-[invalid=true]:border-[var(--ds-danger)] aria-[invalid=true]:focus:ring-[var(--ds-danger)]/10",
      "data-[placeholder]:text-[var(--ds-input-placeholder)] [&>span]:line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      onCloseAutoFocus={(e) => e.preventDefault()}
      className={cn(
        "ds-motion-popover relative z-[var(--ds-z-dialog-dropdown)] max-h-96 min-w-[8rem] overflow-y-auto rounded-[var(--ds-radius-xl)] border border-[var(--ds-menu-border)] bg-[var(--ds-menu-bg)] p-1.5 text-[var(--ds-text)] shadow-[var(--ds-shadow-dropdown)]",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "p-0",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("ds-form-label px-2.5 py-2 text-[var(--ds-text-tertiary)] uppercase", className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "ds-nav-label relative flex w-full cursor-default select-none items-center rounded-[var(--ds-radius-lg)] py-2 pl-2.5 pr-8 outline-none ds-transition-colors",
      "text-[var(--ds-text-secondary)] focus:bg-[var(--ds-menu-item-hover-bg)] focus:text-[var(--ds-text)] data-[highlighted]:bg-[var(--ds-menu-item-hover-bg)] data-[highlighted]:text-[var(--ds-text)]",
      "data-[state=checked]:text-[var(--ds-menu-item-active-fg)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute right-2.5 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-[var(--ds-border-light)]", className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}
