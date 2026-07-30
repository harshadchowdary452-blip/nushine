export function SettingsSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      {[1, 2, 3].map((section) => (
        <div
          key={section}
          className="rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-card)] overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-[var(--ds-border)]">
            <div className="h-4 w-40 ds-skeleton rounded" />
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {[1, 2, 3, 4].map((field) => (
                <div key={field} className="space-y-2">
                  <div className="h-3 w-24 ds-skeleton rounded" />
                  <div className="h-9 w-full ds-skeleton rounded-[var(--ds-input-radius)]" />
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
        <div className="w-16 h-16 rounded-2xl bg-[var(--ds-surface-secondary)] flex items-center justify-center text-[var(--ds-text-tertiary)] mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-[var(--ds-text)] mb-1">{title}</h3>
      <p className="text-sm text-[var(--ds-text-secondary)] max-w-sm mb-4">{description}</p>
      {action}
    </div>
  );
}
