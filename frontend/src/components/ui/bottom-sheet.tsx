import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

export default function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[var(--ds-z-dialog)] bg-black/30 md:hidden"
            onClick={onClose} />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className="fixed bottom-0 left-0 right-0 z-[var(--ds-z-dialog)] rounded-t-2xl bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.1)] md:hidden safe-area-bottom max-h-[85vh] overflow-y-auto"
          >
            <div className="sticky top-0 z-[var(--ds-z-sticky)] bg-white border-b border-gray-100 rounded-t-2xl">
              <div className="flex items-center justify-between px-5 py-4">
                {title && <h3 className="text-base font-semibold text-gray-900">{title}</h3>}
                <button onClick={onClose}
                  className="ml-auto flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="px-5 py-4">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
