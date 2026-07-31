import { motion } from "framer-motion"
import { type LucideIcon } from "lucide-react"
import { Smile } from "lucide-react"

interface DentalEmptyStateProps {
  icon?: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
}

export default function DentalEmptyState({ icon: Icon = Smile, title, description, action }: DentalEmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="relative mb-6">
        <div className="flex h-24 w-24 items-center justify-center rounded-[var(--ds-radius-3xl)] border border-[var(--ds-accent)]/20 bg-[var(--ds-accent-subtle)] shadow-sm">
          <Icon className="h-12 w-12 text-[var(--ds-accent)]" />
        </div>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
          className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--ds-surface)] bg-[var(--ds-accent-subtle)]"
        >
          <Smile className="h-3 w-3 text-[var(--ds-accent)]" />
        </motion.div>
      </div>
      <h3 className="ds-section-title mb-2 text-[var(--ds-text)]">{title}</h3>
      <p className="ds-secondary-text mb-6 max-w-sm leading-relaxed text-[var(--ds-text-secondary)]">{description}</p>
      {action}
    </motion.div>
  )
}
