"use client"

import { useState, useEffect, useCallback } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  PanelLeftOpen, Bell, ChevronDown, LogOut, User, Calendar, AlertCircle,
  MessageSquare, Clock, Trash2, X, Search, Sun, Moon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useSidebarStore } from "@/store/sidebarStore"
import { useAuthStore } from "@/store/authStore"
import { useThemeStore } from "@/store/themeStore"
import { useSearchStore } from "@/store/searchStore"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { notificationsApi } from "@/services/endpoints"
import { queryClient } from "@/lib/queryClient"
import { format } from "date-fns"
import Breadcrumb from "./breadcrumb"

interface NotificationItem {
  id: string; title: string; description: string; type: string; is_read: boolean; created_at: string
}

const iconMap: Record<string, { icon: React.ElementType; color: string }> = {
  appointment: { icon: Calendar, color: "text-[var(--ds-info)]" },
  alert: { icon: AlertCircle, color: "text-[var(--ds-danger)]" },
  message: { icon: MessageSquare, color: "text-[var(--ds-success)]" },
  reminder: { icon: Clock, color: "text-[var(--ds-warning)]" },
  billing: { icon: AlertCircle, color: "text-[var(--ds-warning)]" },
  crm: { icon: MessageSquare, color: "text-[var(--ds-primary)]" },
  system: { icon: AlertCircle, color: "text-[var(--ds-text-tertiary)]" },
}

const filters = [
  { key: "all", label: "All" }, { key: "unread", label: "Unread" },
  { key: "appointment", label: "Appointments" }, { key: "billing", label: "Billing" },
  { key: "crm", label: "CRM" }, { key: "system", label: "System" },
] as const
type FilterKey = (typeof filters)[number]["key"]

export default function EnterpriseHeader() {
  const { collapsed, toggle, setMobileOpen } = useSidebarStore()
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const { setOpen: setSearchOpen } = useSearchStore()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifCount, setNotifCount] = useState(0)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all")

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await notificationsApi.list()
      setNotifCount(data?.unread ?? 0)
      setNotifications(data?.items ?? [])
    } catch { setNotifCount(0) }
  }, [])

  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await notificationsApi.unreadCount()
      setNotifCount(data?.unread ?? 0)
    } catch { setNotifCount(0) }
  }, [])

  const handleOpen = async () => {
    setNotifOpen(true)
    await notificationsApi.markAllRead()
    await fetchNotifications()
    await fetchUnreadCount()
  }

  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 60000)
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  const handleDelete = async (id: string) => {
    try {
      await notificationsApi.delete(id)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    } catch { /* ignore */ }
    await fetchUnreadCount()
  }

  const handleDeleteAll = async () => {
    await notificationsApi.deleteAll()
    setNotifications([])
    setNotifCount(0)
  }

  const filtered = notifications.filter((n) => {
    if (activeFilter === "all") return true
    if (activeFilter === "unread") return !n.is_read
    return n.type === activeFilter
  })

  const initials = user?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "U"

  return (
    <header role="banner" className="sticky top-0 z-[var(--ds-z-header)] flex flex-col bg-[var(--ds-header-bg)] transition-all">
      {/* Main header bar */}
      <div className="flex h-[var(--ds-header-h)] items-center border-b border-[var(--ds-header-border)] px-4 lg:px-5">
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon-sm" onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden lg:flex text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text)] hover:bg-[var(--ds-surface-hover)]">
            <PanelLeftOpen className={cn("h-[18px] w-[18px] transition-transform duration-200", collapsed && "rotate-180")} strokeWidth={1.5} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setMobileOpen(true)}
            aria-label="Open mobile menu"
            className="flex md:hidden text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text)]">
            <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.5} />
          </Button>
          <Link to="/" className="hidden sm:flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-[var(--ds-radius-md)] bg-[var(--ds-primary)]">
              <svg width="14" height="14" viewBox="0 0 56 56" fill="none" aria-hidden="true">
                <path d="M28 14c-4.5 0-7.8 2.6-9 6.8-1 3.4-1.5 7.6-1.5 11.2s.5 7 1.4 8.8c.7 1.4 1.8 2.4 3.2 2.9 1.1.4 2.1 1 2.8 1.7l.7.8c.6.7 1.7.7 2.3 0l.7-.8c.7-.7 1.7-1.3 2.8-1.7 1.4-.5 2.5-1.5 3.2-2.9.9-1.8 1.4-5.2 1.4-8.8s-.5-7.8-1.5-11.2C35.8 16.6 32.5 14 28 14z" fill="white" opacity="0.96"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--ds-text)] leading-tight">NuShine</p>
              <p className="text-[9px] text-[var(--ds-text-tertiary)] font-medium tracking-[0.2em] uppercase -mt-px">Dental Platform</p>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-1">
          {/* Search trigger */}
          <button onClick={() => setSearchOpen(true)}
            aria-label="Search pages"
            className="hidden sm:flex items-center gap-2 h-8 px-3 rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text)] hover:bg-[var(--ds-surface-hover)] transition-all text-xs border border-[var(--ds-border)]">
            <Search className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span className="hidden md:inline">Search...</span>
            <kbd className="hidden lg:inline-flex h-4 items-center px-1 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] text-[9px] font-medium text-[var(--ds-text-tertiary)]">⌘K</kbd>
          </button>

          {/* Theme toggle */}
          <button onClick={() => toggleTheme()}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text)] hover:bg-[var(--ds-surface-hover)] transition-all">
            {theme === "light" ? <Moon className="h-[18px] w-[18px]" strokeWidth={1.5} /> : <Sun className="h-[18px] w-[18px]" strokeWidth={1.5} />}
          </button>

          {/* Notifications */}
          <div className="relative">
            <button onClick={() => notifOpen ? setNotifOpen(false) : handleOpen()}
              aria-label={`Notifications${notifCount > 0 ? `, ${notifCount} unread` : ""}`}
              className="relative flex h-8 w-8 items-center justify-center rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text)] hover:bg-[var(--ds-surface-hover)] transition-all">
              <Bell className="h-[18px] w-[18px]" strokeWidth={1.5} />
              {notifCount > 0 && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                  className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[var(--ds-danger)] px-1 text-[8px] font-bold text-white">
                  {notifCount > 9 ? "9+" : notifCount}
                </motion.span>
              )}
            </button>
            <AnimatePresence>
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
                  <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Notifications"
                    initial={{ opacity: 0, y: -4, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full z-[var(--ds-z-dropdown)] mt-1.5 w-[380px] rounded-[var(--ds-radius-xl)] border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-dropdown)] overflow-hidden">
                    <div className="border-b border-[var(--ds-border)] px-5 py-3 flex items-center justify-between">
                      <h2 className="font-[var(--ds-text-h4)] text-[var(--ds-text)]">Notifications</h2>
                      <div className="flex items-center gap-1">
                        {notifications.length > 0 && (
                          <button onClick={handleDeleteAll}
                            aria-label="Delete all notifications"
                            className="flex h-7 w-7 items-center justify-center rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] hover:bg-[var(--ds-danger-subtle)] hover:text-[var(--ds-danger)] transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => setNotifOpen(false)}
                          aria-label="Close notifications"
                          className="flex h-7 w-7 items-center justify-center rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)] transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-1 overflow-x-auto px-5 py-2.5 border-b border-[var(--ds-border-light)]" role="tablist" aria-label="Filter notifications">
                      {filters.map((f) => (
                        <button key={f.key} onClick={() => setActiveFilter(f.key)}
                          role="tab"
                          aria-selected={activeFilter === f.key}
                          className={cn(
                            "shrink-0 rounded-[var(--ds-radius-lg)] px-2.5 py-1 text-xs font-medium transition-all whitespace-nowrap",
                            activeFilter === f.key ? "bg-[var(--ds-primary)] text-white shadow-sm" : "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-border)]"
                          )}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                    <div className="max-h-[320px] overflow-y-auto" role="list" aria-label="Notification list">
                      {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <Bell className="mb-2 h-7 w-7 text-[var(--ds-text-tertiary)]" />
                          <p className="text-sm text-[var(--ds-text-secondary)]">No notifications</p>
                        </div>
                      ) : (
                        <div className="py-1">
                          {filtered.map((n) => {
                            const mapped = iconMap[n.type] || { icon: Bell, color: "text-[var(--ds-text-tertiary)]" }
                            const Icon = mapped.icon
                            return (
                              <div key={n.id}
                                role="listitem"
                                className={cn(
                                  "flex gap-3 rounded-[var(--ds-radius-lg)] px-5 py-3 transition-colors group",
                                  !n.is_read ? "bg-[var(--ds-primary-subtle)]" : "hover:bg-[var(--ds-surface-hover)]"
                                )}>
                                <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface-secondary)]", mapped.color)}>
                                  <Icon className="h-3.5 w-3.5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-[var(--ds-text)] truncate">{n.title}</p>
                                  <p className="text-[var(--ds-text-body-sm)] text-[var(--ds-text-secondary)] truncate">{n.description}</p>
                                  <p className="mt-0.5 text-[var(--ds-text-caption)] text-[var(--ds-text-tertiary)]">
                                    {format(new Date(n.created_at), "MMM d, h:mm a")}
                                  </p>
                                </div>
                                <button onClick={() => handleDelete(n.id)}
                                  aria-label={`Delete: ${n.title}`}
                                  className="shrink-0 flex h-7 w-7 items-center justify-center rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] opacity-0 group-hover:opacity-100 hover:bg-[var(--ds-danger-subtle)] hover:text-[var(--ds-danger)] transition-all">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Profile */}
          <div className="relative">
            <button onClick={() => setProfileOpen(!profileOpen)}
              aria-label={`User menu${profileOpen ? " (open)" : ""}`}
              aria-expanded={profileOpen}
              className="flex items-center gap-2 rounded-[var(--ds-radius-lg)] pl-1.5 pr-2.5 py-1 transition-colors hover:bg-[var(--ds-surface-hover)]">
              <Avatar className="h-7 w-7 ring-2 ring-[var(--ds-border)]">
                <AvatarFallback className="bg-[var(--ds-primary)] text-xs font-medium text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden lg:block text-left">
                <p className="text-sm font-medium text-[var(--ds-text)] leading-tight">{user?.full_name ?? "User"}</p>
                <p className="text-[11px] text-[var(--ds-text-secondary)] leading-tight capitalize">{user?.role?.replace(/_/g, " ").toLowerCase() ?? ""}</p>
              </div>
              <ChevronDown className="hidden lg:block h-3 w-3 text-[var(--ds-text-tertiary)]" strokeWidth={2} />
            </button>
            <AnimatePresence>
              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} aria-hidden="true" />
                  <motion.div
                    role="menu"
                    aria-label="User menu"
                    initial={{ opacity: 0, y: -4, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full z-[var(--ds-z-dropdown)] mt-1.5 w-52 rounded-[var(--ds-radius-xl)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-1 shadow-[var(--ds-shadow-dropdown)]">
                    <div className="border-b border-[var(--ds-border)] px-3 py-2.5">
                      <p className="text-sm font-medium text-[var(--ds-text)]">{user?.full_name ?? "User"}</p>
                      <p className="text-[var(--ds-text-body-sm)] text-[var(--ds-text-secondary)] truncate">{user?.email ?? ""}</p>
                    </div>
                    <div className="pt-1">
                      <Link to="/settings" onClick={() => setProfileOpen(false)}
                        role="menuitem"
                        className="flex items-center gap-2 rounded-[var(--ds-radius-lg)] px-3 py-2 text-sm text-[var(--ds-text-secondary)] transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]">
                        <User className="h-4 w-4" /> Profile
                      </Link>
                      <button onClick={() => { setProfileOpen(false); queryClient.clear(); logout(); navigate("/login") }}
                        role="menuitem"
                        className="flex w-full items-center gap-2 rounded-[var(--ds-radius-lg)] px-3 py-2 text-sm text-[var(--ds-danger)] transition-colors hover:bg-[var(--ds-danger-subtle)]">
                        <LogOut className="h-4 w-4" /> Logout
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      </div>
      {/* Breadcrumb row */}
      <div className="border-b border-[var(--ds-border-light)] px-4 lg:px-5 py-2">
        <Breadcrumb variant="compact" />
      </div>
    </header>
  )
}
