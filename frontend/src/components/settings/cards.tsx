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
    <div className={cn("bg-white rounded-xl border border-[var(--color-border)] shadow-[var(--shadow-card)] overflow-hidden", className)}>
      <div className="px-5 py-4 border-b border-[var(--color-border)] bg-gradient-to-r from-white to-[var(--color-bg)]">
        <div className="flex items-center gap-2.5">
          {icon && (
            <span className="text-[var(--color-primary)]">{icon}</span>
          )}
          <div>
            <h3 className="text-card-title text-[var(--color-text-primary)]">{title}</h3>
            {description && (
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{description}</p>
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
    <div className={cn("grid gap-4", colClass, className)}>
      {children}
    </div>
  );
}
