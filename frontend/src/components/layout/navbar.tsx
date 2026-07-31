import { useState, useEffect, useCallback } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  PanelLeftOpen, Bell, ChevronDown, LogOut, User, Calendar, AlertCircle,
  MessageSquare, Clock, Trash2, X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useSidebarStore } from "@/store/sidebarStore"
import { useAuthStore } from "@/store/authStore"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ToothLogo, BrandText } from "@/components/ui/brand-logo"
import { notificationsApi } from "@/services/endpoints"
import { queryClient } from "@/lib/queryClient"
import { format } from "date-fns"

interface NotificationItem {
  id: string; title: string; description: string; type: string; is_read: boolean; created_at: string
}

const iconMap: Record<string, { icon: React.ElementType; color: string }> = {
  appointment: { icon: Calendar, color: "text-[var(--ds-primary)]" },
  alert: { icon: AlertCircle, color: "text-red-500" },
  message: { icon: MessageSquare, color: "text-emerald-500" },
  reminder: { icon: Clock, color: "text-amber-500" },
  billing: { icon: AlertCircle, color: "text-amber-500" },
  crm: { icon: MessageSquare, color: "text-[var(--ds-primary)]" },
  system: { icon: AlertCircle, color: "text-[var(--ds-text-tertiary)]" },
}

const filters = [
  { key: "all", label: "All" }, { key: "unread", label: "Unread" }, { key: "read", label: "Read" },
  { key: "appointment", label: "Appointments" }, { key: "billing", label: "Billing" },
  { key: "crm", label: "CRM" }, { key: "system", label: "System" },
] as const
type FilterKey = (typeof filters)[number]["key"]

export default function Navbar() {
  const { collapsed, toggle, setMobileOpen } = useSidebarStore()
  const { user, logout } = useAuthStore()
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
    } catch { /* notification delete failed, ignore */ }
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
    if (activeFilter === "read") return n.is_read
    return n.type === activeFilter
  })

  const initials = user?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "U"

  return (
    <header role="banner" className="sticky top-0 z-20 flex h-14 items-center border-b border-[var(--ds-border)] bg-white/95 backdrop-blur-sm px-4 transition-all font-['Poppins','Inter',sans-serif]">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden lg:flex text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text-secondary)] h-8 w-8">
            <PanelLeftOpen className={cn("h-[22px] w-[22px] transition-transform", collapsed && "rotate-180")} strokeWidth={1.5} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setMobileOpen(true)}
            aria-label="Open mobile menu"
            title="Open mobile menu"
            className="flex md:hidden text-[var(--ds-text-tertiary)] h-8 w-8">
            <PanelLeftOpen className="h-[22px] w-[22px]" strokeWidth={1.5} />
          </Button>
          <Link to="/" className="hidden sm:flex items-center gap-2">
            <ToothLogo size={22} showSparkle={false} />
            <div>
              <p className="text-sm font-bold text-[var(--ds-text)] leading-tight"><BrandText size="sm" /></p>
              <p className="text-[10px] text-[var(--ds-sidebar-icon)] font-medium tracking-[0.25em] uppercase -mt-px">Dental Management System</p>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-1.5">

          {/* Notifications */}
          <div className="relative">
            <button onClick={() => notifOpen ? setNotifOpen(false) : handleOpen()}
              aria-label={`Notifications${notifCount > 0 ? `, ${notifCount} unread` : ""}`}
              title={`Notifications${notifCount > 0 ? ` (${notifCount} unread)` : ""}`}
              className="relative flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-hover)] transition-all">
              <Bell className="h-[18px] w-[18px]" />
              {notifCount > 0 && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                  className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[var(--ds-primary)] px-1 text-[8px] font-bold text-[var(--ds-primary-foreground)]">
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
                    initial={{ opacity: 0, y: -4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.96 }} transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full z-20 mt-1.5 w-[380px] rounded-xl border border-[var(--ds-border-light)] bg-[var(--ds-surface)] shadow-dropdown overflow-hidden">
                    <div className="border-b border-[var(--ds-border-light)] px-4 py-2.5 flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-[var(--ds-text)]">Notifications</h2>
                      <div className="flex items-center gap-1">
                        {notifications.length > 0 && (
                          <button onClick={handleDeleteAll}
                            aria-label="Delete all notifications"
                            title="Delete all"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--ds-text-tertiary)] hover:bg-[var(--ds-surface-hover)] hover:text-red-500 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => setNotifOpen(false)}
                          aria-label="Close notifications"
                          title="Close"
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--ds-text-tertiary)] hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text-secondary)] transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-1 overflow-x-auto px-4 py-2 border-b border-[var(--ds-border-light)]" role="tablist" aria-label="Filter notifications">
                      {filters.map((f) => (
                        <button key={f.key} onClick={() => setActiveFilter(f.key)}
                          role="tab"
                          aria-selected={activeFilter === f.key}
                          className={cn(
                            "shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-all whitespace-nowrap",
                            activeFilter === f.key ? "bg-[var(--ds-primary)] text-[var(--ds-primary-foreground)] shadow-sm" : "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-hover)]"
                          )}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                    <div className="max-h-[320px] overflow-y-auto" role="list" aria-label="Notification list">
                      {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <Bell className="mb-2 h-7 w-7 text-[var(--ds-text-tertiary)]" />
                          <p className="text-sm text-[var(--ds-text-tertiary)]">No notifications</p>
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
                                  "flex gap-2.5 rounded-lg px-4 py-2.5 transition-colors group",
                                  !n.is_read ? "bg-[var(--ds-primary)]/5" : "hover:bg-[var(--ds-surface-hover)]"
                                )}>
                                <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--ds-background-subtle)]", mapped.color)}>
                                  <Icon className="h-3.5 w-3.5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-[var(--ds-text)] truncate">{n.title}</p>
                                  <p className="text-xs text-[var(--ds-text-tertiary)] truncate">{n.description}</p>
                                  <p className="mt-0.5 text-[11px] text-[var(--ds-text-tertiary)]">{format(new Date(n.created_at), "MMM d, h:mm a")}</p>
                                </div>
                                <button onClick={() => handleDelete(n.id)}
                                  aria-label={`Delete notification: ${n.title}`}
                                  title="Delete"
                                  className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-[var(--ds-text-tertiary)] opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all">
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
              title={user?.full_name ?? "User"}
              className="flex items-center gap-2 rounded-lg pl-1.5 pr-2.5 py-1 transition-colors hover:bg-[var(--ds-surface-hover)]">
              <Avatar className="h-7 w-7 ring-2 ring-[var(--ds-border-light)]">
                <AvatarFallback className="bg-gradient-to-br from-[var(--ds-primary-500)] to-[var(--ds-primary-600)] text-xs font-medium text-white">{initials}</AvatarFallback>
              </Avatar>
              <div className="hidden lg:block text-left">
                <p className="text-sm font-medium text-[var(--ds-text)] leading-tight">{user?.full_name ?? "User"}</p>
                <p className="text-[11px] text-[var(--ds-text-tertiary)] leading-tight capitalize">{user?.role?.replace("_", " ").toLowerCase() ?? ""}</p>
              </div>
              <ChevronDown className="hidden lg:block h-3 w-3 text-[var(--ds-text-tertiary)]" />
            </button>
            <AnimatePresence>
              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} aria-hidden="true" />
                  <motion.div
                    role="menu"
                    aria-label="User menu"
                    initial={{ opacity: 0, y: -4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.96 }} transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full z-20 mt-1.5 w-52 rounded-xl border border-[var(--ds-border-light)] bg-[var(--ds-surface)] p-1 shadow-dropdown">
                    <div className="border-b border-[var(--ds-border-light)] px-3 py-2.5">
                      <p className="text-sm font-medium text-[var(--ds-text)]">{user?.full_name ?? "User"}</p>
                      <p className="text-xs text-[var(--ds-text-tertiary)] truncate">{user?.email ?? ""}</p>
                    </div>
                    <div className="pt-1">
                      <Link to="/settings" onClick={() => setProfileOpen(false)}
                        role="menuitem"
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--ds-text-secondary)] transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]">
                        <User className="h-4 w-4" /> Profile
                      </Link>
                      <button onClick={() => { setProfileOpen(false); queryClient.clear(); logout(); navigate("/login") }}
                          role="menuitem"
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50">
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
    </header>
  )
}
