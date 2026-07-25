import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsFieldProps {
  label: string;
  description?: string;
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
  error?: string;
  className?: string;
  disabled?: boolean;
  layout?: "vertical" | "horizontal";
}

export function SettingsField({
  label,
  description,
  htmlFor,
  required,
  children,
  error,
  className,
  disabled,
  layout = "vertical",
}: SettingsFieldProps) {
  if (layout === "horizontal") {
    return (
      <div className={cn("flex items-center justify-between gap-4", disabled && "opacity-50", className)}>
        <div className="flex-1 min-w-0">
          <label htmlFor={htmlFor} className="text-sm font-medium text-[var(--color-text-primary)]">
            {label}
            {required && <span className="text-[var(--color-danger)] ml-1">*</span>}
          </label>
          {description && (
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{description}</p>
          )}
          {error && <p className="text-xs text-[var(--color-danger)] mt-1">{error}</p>}
        </div>
        <div className="flex-shrink-0">{children}</div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", disabled && "opacity-50", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-[var(--color-text-primary)]">
        {label}
        {required && <span className="text-[var(--color-danger)] ml-1">*</span>}
      </label>
      {description && (
        <p className="text-xs text-[var(--color-text-muted)]">{description}</p>
      )}
      {children}
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
