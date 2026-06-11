import type { ReactNode } from "react"
import { motion } from "framer-motion"
import Sidebar from "./sidebar"
import Navbar from "./navbar"

const pageVariants = {
  initial: { y: 8 },
  animate: { y: 0, transition: { duration: 0.25, ease: "easeOut" as const } },
  exit: { y: -8, transition: { duration: 0.15 } },
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar />
        <motion.main
          initial="initial"
          animate="animate"
          exit="exit"
          variants={pageVariants}
          className="flex-1"
        >
          <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
            {children}
          </div>
        </motion.main>
      </div>
    </div>
  )
}
