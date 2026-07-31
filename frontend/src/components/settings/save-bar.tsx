import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SettingsSaveBarProps {
  visible: boolean;
  isSaving: boolean;
  hasChanges: boolean;
  onSave: () => void;
  onReset: () => void;
}

export function SettingsSaveBar({
  visible,
  isSaving,
  hasChanges,
  onSave,
  onReset,
}: SettingsSaveBarProps) {
  if (!visible) return null;

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="sticky bottom-0 z-[var(--ds-z-sticky)]"
    >
      <div className="bg-[var(--ds-surface)]/90 backdrop-blur-xl border-t border-[var(--ds-border)] shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.08)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              hasChanges ? "bg-[var(--ds-warning)] animate-pulse" : "bg-[var(--ds-success)]"
            )} />
            <span className="text-sm font-medium text-[var(--ds-text-secondary)]">
              {hasChanges ? "Unsaved changes" : "All changes saved"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onReset}
              disabled={isSaving || !hasChanges}
              className={cn(
                "h-8 px-3 rounded-[var(--ds-radius-lg)] text-sm font-medium transition-all",
                "border border-[var(--ds-border)] bg-[var(--ds-surface)] text-[var(--ds-text-secondary)]",
                "hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              Discard
            </button>
            <button
              onClick={onSave}
              disabled={isSaving || !hasChanges}
              className={cn(
                "h-8 px-4 rounded-[var(--ds-radius-lg)] text-sm font-medium transition-all",
                "bg-[var(--ds-primary)] text-[var(--ds-primary-foreground)] shadow-sm",
                "hover:bg-[var(--ds-primary-hover)] active:scale-[0.98]",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)]/30"
              )}
            >
              {isSaving ? (
                <span className="flex items-center gap-1.5">
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving...
                </span>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
