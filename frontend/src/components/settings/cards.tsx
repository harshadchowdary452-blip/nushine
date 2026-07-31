import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsSectionProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function SettingsSection({
  title,
  description,
  icon,
  children,
  className,
  contentClassName,
}: SettingsSectionProps) {
  return (
    <div className={cn(
      "rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-card)] overflow-hidden",
      className
    )}>
      <div className="px-5 py-4 border-b border-[var(--ds-border)]">
        <div className="flex items-center gap-2.5">
          {icon && (
            <span className="text-[var(--ds-primary)]">{icon}</span>
          )}
          <div>
            <h3 className="ds-card-title text-[var(--ds-text)]">{title}</h3>
            {description && (
              <p className="text-xs text-[var(--ds-text-tertiary)] mt-0.5">{description}</p>
            )}
          </div>
        </div>
      </div>
      <div className={cn("p-5", contentClassName)}>
        {children}
      </div>
    </div>
  );
}

interface SettingsGridProps {
  children: ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}

export function SettingsGrid({ children, columns = 2, className }: SettingsGridProps) {
  const colClass = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  }[columns];

  return (
    <div className={cn("grid gap-5", colClass, className)}>
      {children}
    </div>
  );
}
