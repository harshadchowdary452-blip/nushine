import { cn } from "@/lib/utils";

interface PreviewCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function PreviewCard({ title, description, icon, children, className }: PreviewCardProps) {
  return (
    <div className={cn(
      "rounded-[var(--ds-card-radius)] border border-[var(--ds-primary)]/10 bg-[var(--ds-primary-subtle)] p-5",
      className
    )}>
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-[var(--ds-primary)]">{icon}</span>}
        <div>
          <h4 className="text-sm font-semibold text-[var(--ds-text)]">{title}</h4>
          {description && <p className="text-xs text-[var(--ds-text-tertiary)]">{description}</p>}
        </div>
      </div>
      <div className="space-y-2">
        {children}
      </div>
    </div>
  );
}

interface PreviewRowProps {
  label: string;
  value: string | React.ReactNode;
  highlight?: boolean;
}

export function PreviewRow({ label, value, highlight }: PreviewRowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-[var(--ds-text-tertiary)]">{label}</span>
      <span className={cn(
        "text-xs font-medium",
        highlight ? "text-[var(--ds-primary)]" : "text-[var(--ds-text)]"
      )}>
        {value}
      </span>
    </div>
  );
}
