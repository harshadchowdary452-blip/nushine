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
      "bg-gradient-to-br from-[var(--color-primary-light)] to-white",
      "rounded-xl border border-[var(--color-primary)]/10 p-5",
      className
    )}>
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-[var(--color-primary)]">{icon}</span>}
        <div>
          <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h4>
          {description && <p className="text-xs text-[var(--color-text-muted)]">{description}</p>}
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
      <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
      <span className={cn(
        "text-xs font-medium",
        highlight ? "text-[var(--color-primary)]" : "text-[var(--color-text-primary)]"
      )}>
        {value}
      </span>
    </div>
  );
}
