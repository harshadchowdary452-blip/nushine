import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SettingsPageProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SettingsPage({
  title,
  description,
  icon,
  actions,
  children,
  className,
}: SettingsPageProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn("min-h-full pb-24", className)}
    >
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            {icon && (
                <div className="w-10 h-10 rounded-xl bg-[var(--ds-primary)] flex items-center justify-center text-[var(--ds-primary-foreground)] shadow-sm">
                {icon}
              </div>
            )}
            <div>
              <h1 className="font-[var(--ds-text-h1)] text-[var(--ds-text)]">{title}</h1>
              {description && (
                <p className="text-sm text-[var(--ds-text-secondary)] mt-0.5">{description}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </motion.div>
  );
}
