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
        <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-50 to-blue-50 border border-teal-100/50 shadow-sm">
          <Icon className="h-12 w-12 text-teal-400" />
        </div>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-teal-100 border-2 border-white flex items-center justify-center"
        >
          <Smile className="h-3 w-3 text-teal-500" />
        </motion.div>
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 max-w-sm mb-6 leading-relaxed">{description}</p>
      {action}
    </motion.div>
  )
}
