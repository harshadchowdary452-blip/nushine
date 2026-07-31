import { useEffect, useRef, type ReactNode } from "react"
import { useLocation } from "react-router-dom"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useRecentlyOpenedStore } from "@/store/recentlyOpenedStore"
import { routeLabels } from "./routeLabels"
import EnterpriseSidebar from "./sidebar"
import EnterpriseHeader from "./header"
import GlobalSearch from "./global-search"

const pageVariants = {
  initial: { y: 12, opacity: 0 },
  animate: { y: 0, opacity: 1, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
  exit: { y: -12, opacity: 0, transition: { duration: 0.2 } },
}

export default function EnterpriseAppLayout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const recentStore = useRecentlyOpenedStore()
  const mainRef = useRef<HTMLElement | null>(null)

  // Track recently opened pages
  useEffect(() => {
    const label = routeLabels[location.pathname]
    if (label && location.pathname !== "/") {
      recentStore.push({ path: location.pathname, label })
    }
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset the content scroll position on navigation
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="app-shell flex overflow-hidden bg-[var(--ds-background)] antialiased">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-[var(--ds-primary)] focus:text-[var(--ds-primary-foreground)] focus:rounded-[var(--ds-radius-lg)] focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      <GlobalSearch />
      <EnterpriseSidebar />

      {/* Main workspace column — only this region participates in the frame; the
          content area below is the single scroll container for every module. */}
      <div className="flex min-w-0 flex-1 flex-col pb-14 md:pb-0">
        <EnterpriseHeader />

        <motion.main
          id="main-content"
          role="main"
          ref={mainRef}
          initial="initial"
          animate="animate"
          exit="exit"
          variants={pageVariants}
          className="min-h-0 flex-1 overflow-y-auto outline-none"
          tabIndex={-1}
        >
          <div className={cn(
            "mx-auto flex w-full min-h-full flex-col",
            "px-[var(--ds-container-padding-sm)] sm:px-[var(--ds-container-padding)] lg:px-[var(--ds-container-padding-lg)]",
            "py-[var(--ds-page-padding-y)] lg:py-[var(--ds-page-padding-y-lg)]",
            "max-w-[var(--ds-container-max)]"
          )}>
            {children}
          </div>
        </motion.main>
      </div>
    </div>
  )
}
