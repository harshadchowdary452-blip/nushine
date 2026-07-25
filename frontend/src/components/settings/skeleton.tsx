import { cn } from "@/lib/utils";

export function SettingsSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      {[1, 2, 3].map((section) => (
        <div
          key={section}
          className="bg-white rounded-xl border border-[var(--color-border)] shadow-[var(--shadow-card)] overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-[var(--color-border)]">
            <div className="h-4 w-40 skeleton rounded" />
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((field) => (
                <div key={field} className="space-y-2">
                  <div className="h-3 w-24 skeleton rounded" />
                  <div className="h-9 w-full skeleton rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface SettingsEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function SettingsEmptyState({ icon, title, description, action }: SettingsEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg)] flex items-center justify-center text-[var(--color-text-muted)] mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">{title}</h3>
      <p className="text-sm text-[var(--color-text-secondary)] max-w-sm mb-4">{description}</p>
      {action}
    </div>
  );
}
