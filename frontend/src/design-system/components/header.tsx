"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { PanelLeftOpen, Bell, Search, Sun, Moon } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useSidebarStore } from "@/store/sidebarStore"
import { useAuthStore } from "@/store/authStore"
import { useThemeStore } from "@/store/themeStore"
import { useSearchStore } from "@/store/searchStore"
import { notificationsApi } from "@/services/endpoints"
import { Button } from "@/components/ui/button"
import { WordmarkLogo } from "@/design-system/components/brand-logo"
import Breadcrumb from "./breadcrumb"
import QuickActions from "./quick-actions"
import ContextSwitcher from "./context-switcher"
import NotificationsCenter from "./notifications-center"
import ProfileMenu from "./profile-menu"

export default function EnterpriseHeader() {
  const collapsed = useSidebarStore((s) => s.collapsed)
  const toggle = useSidebarStore((s) => s.toggle)
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const setSearchOpen = useSearchStore((s) => s.setOpen)
  const user = useAuthStore((s) => s.user)

  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifCount, setNotifCount] = useState(0)
  const notifTriggerRef = useRef<HTMLButtonElement>(null)
  const profileTriggerRef = useRef<HTMLButtonElement>(null)

  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await notificationsApi.unreadCount()
      setNotifCount(data?.unread ?? 0)
    } catch {
      setNotifCount(0)
    }
  }, [])

  useEffect(() => {
    fetchUnreadCount()
    // Pause polling while the tab is hidden to avoid pointless network work.
    const interval = setInterval(fetchUnreadCount, 60000)
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchUnreadCount()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [fetchUnreadCount])

  return (
    <header
      role="banner"
      className="sticky top-0 z-[var(--ds-z-header)] flex shrink-0 flex-col bg-[var(--ds-header-bg)] shadow-[var(--ds-header-shadow)] transition-all"
    >
      {/* Brand accent edge — a thin solid Executive Navy strip that separates
          the header from content and anchors the Appointin identity. */}
      <div
        aria-hidden="true"
        className="h-[2px] w-full shrink-0"
        style={{ background: "var(--ds-header-accent)" }}
      />
      <div className="flex h-[var(--ds-header-h)] items-center gap-3 border-b border-[var(--ds-header-border)] px-3 lg:px-5">
        {/* Left zone: toggle + title/breadcrumb */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5 lg:flex-none">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden text-[var(--ds-text-tertiary)] hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)] lg:flex"
          >
            <PanelLeftOpen
              className={cn(
                "h-[18px] w-[18px] transition-transform duration-200",
                collapsed && "rotate-180",
              )}
              strokeWidth={1.5}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            className="flex text-[var(--ds-text-tertiary)] hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)] lg:hidden"
          >
            <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.5} />
          </Button>
          <Link to="/home" className="flex shrink-0 items-center" aria-label="Appointin home">
            <WordmarkLogo height={13} />
          </Link>
          <div className="mx-1 hidden h-5 w-px bg-[var(--ds-header-border)] lg:block" />
          <div className="hidden min-w-0 md:block">
            <Breadcrumb variant="compact" />
          </div>
        </div>

        {/* Center zone: global search trigger */}
        <div className="hidden flex-1 justify-center px-4 sm:flex">
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Open search"
            className="group flex h-8 w-full max-w-md items-center gap-2.5 rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] px-3 text-xs text-[var(--ds-text-tertiary)] transition-all hover:border-[var(--ds-input-border-focus)] hover:text-[var(--ds-text)]"
          >
            <Search className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            <span className="truncate">Search patients, appointments, cases…</span>
            <kbd className="ml-auto hidden h-5 shrink-0 items-center gap-0.5 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface)] px-1.5 text-[10px] font-medium text-[var(--ds-text-tertiary)] md:flex">
              <span>⌘</span>K
            </kbd>
          </button>
        </div>

        {/* Right zone: actions */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Open search"
            className="flex h-8 w-8 items-center justify-center rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)] sm:hidden"
          >
            <Search className="h-[18px] w-[18px]" strokeWidth={1.5} />
          </button>

          <QuickActions />

          <div className="mx-0.5 hidden h-5 w-px bg-[var(--ds-header-border)] xl:block" />
          <div className="hidden xl:block">
            <ContextSwitcher />
          </div>

          <button
            onClick={() => toggleTheme()}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
          >
            {theme === "light" ? (
              <Moon className="h-[18px] w-[18px]" strokeWidth={1.5} />
            ) : (
              <Sun className="h-[18px] w-[18px]" strokeWidth={1.5} />
            )}
          </button>

          <div className="relative">
            <button
              ref={notifTriggerRef}
              onClick={() => setNotifOpen((v) => !v)}
              aria-label={`Notifications${notifCount > 0 ? `, ${notifCount} unread` : ""}`}
              aria-expanded={notifOpen}
              className="relative flex h-8 w-8 items-center justify-center rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
            >
              <Bell className="h-[18px] w-[18px]" strokeWidth={1.5} />
              {notifCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[var(--ds-danger)] px-1 text-[8px] font-bold text-white"
                >
                  {notifCount > 9 ? "9+" : notifCount}
                </motion.span>
              )}
            </button>
            <NotificationsCenter
              open={notifOpen}
              onOpenChange={setNotifOpen}
              onUnreadCountChange={setNotifCount}
              triggerRef={notifTriggerRef}
            />
          </div>

          <div className="relative">
            <button
              ref={profileTriggerRef}
              onClick={() => setProfileOpen((v) => !v)}
              aria-label={`User menu${profileOpen ? " (open)" : ""}`}
              aria-expanded={profileOpen}
              className="flex h-8 items-center gap-2 rounded-[var(--ds-radius-lg)] px-1.5 transition-colors hover:bg-[var(--ds-surface-hover)]"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ds-primary)] text-xs font-semibold text-[var(--ds-primary-foreground)] ring-2 ring-[var(--ds-primary-light)]">
                {(user?.full_name ?? "U")
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </span>
            </button>
            <ProfileMenu
              open={profileOpen}
              onOpenChange={setProfileOpen}
              triggerRef={profileTriggerRef}
            />
          </div>
        </div>
      </div>
    </header>
  )
}
