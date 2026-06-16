import type { ReactNode } from "react"
import { motion } from "framer-motion"
import Sidebar from "./sidebar"
import Navbar from "./navbar"

const pageVariants = {
  initial: { y: 6, opacity: 0 },
  animate: { y: 0, opacity: 1, transition: { duration: 0.2, ease: "easeOut" as const } },
  exit: { y: -6, opacity: 0, transition: { duration: 0.12 } },
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-bg">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium">
        Skip to main content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col pb-12 md:pb-0">
        <Navbar />
        <motion.main
          id="main-content"
          role="main"
          initial="initial"
          animate="animate"
          exit="exit"
          variants={pageVariants}
          className="flex-1 outline-none"
          tabIndex={-1}
        >
          <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6">
            {children}
          </div>
        </motion.main>
      </div>
    </div>
  )
}
