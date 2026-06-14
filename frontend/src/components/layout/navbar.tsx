import { useState, useEffect, useCallback } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { PanelLeftOpen, Bell, ChevronDown, LogOut, User, Calendar, AlertCircle, MessageSquare, Clock, CheckCheck, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSidebarStore } from "@/store/sidebarStore"
import { useAuthStore } from "@/store/authStore"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { notificationsApi } from "@/services/endpoints"
import { format } from "date-fns"

interface NotificationItem {
  id: string
  title: string
  description: string
  type: string
  is_read: boolean
  created_at: string
}

const iconMap: Record<string, { icon: React.ElementType; color: string }> = {
  appointment: { icon: Calendar, color: "text-primary" },
  alert: { icon: AlertCircle, color: "text-danger" },
  message: { icon: MessageSquare, color: "text-success" },
  reminder: { icon: Clock, color: "text-warning" },
  billing: { icon: AlertCircle, color: "text-warning" },
  crm: { icon: MessageSquare, color: "text-primary" },
  followup: { icon: Clock, color: "text-info" },
  system: { icon: AlertCircle, color: "text-gray-500" },
}

const filters = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "read", label: "Read" },
  { key: "appointment", label: "Appointments" },
  { key: "billing", label: "Billing" },
  { key: "crm", label: "CRM" },
  { key: "followup", label: "Follow‑Ups" },
  { key: "system", label: "System" },
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
      const items = data?.items ?? []
      setNotifCount(data?.unread ?? 0)
      setNotifications(items)
    } catch {
      setNotifCount(0)
    }
  }, [])

  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await notificationsApi.unreadCount()
      setNotifCount(data?.unread ?? 0)
    } catch {
      setNotifCount(0)
    }
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
    } catch {
      console.warn("Failed to delete notification", id)
    }
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
    <header className="sticky top-0 z-20 flex h-16 items-center border-b border-gray-200 bg-white px-4 transition-all duration-300">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={toggle}
            className="hidden lg:flex text-gray-400 hover:text-gray-600">
            <PanelLeftOpen className={cn("h-5 w-5 transition-transform", collapsed && "rotate-180")} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setMobileOpen(true)}
            className="flex md:hidden text-gray-400">
            <PanelLeftOpen className="h-5 w-5" />
          </Button>

          <div className="hidden sm:flex items-center gap-3">
            <div className="h-5 w-px bg-gray-200" />
            <div className="flex flex-col">
              <span className="text-xs font-semibold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                NUSHINE Dental
              </span>
              <span className="text-[10px] text-gray-400 leading-tight hidden md:block">
                Transforming Smiles Through Intelligent Care
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Button variant="ghost" size="icon-sm" className="relative text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              onClick={() => notifOpen ? setNotifOpen(false) : handleOpen()}>
              <Bell className="h-5 w-5" />
              {notifCount > 0 && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
                  {notifCount > 9 ? "9+" : notifCount}
                </motion.span>
              )}
            </Button>
            <AnimatePresence>
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
                  <motion.div initial={{ opacity: 0, y: -4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.96 }} transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full z-20 mt-1.5 w-96 rounded-2xl border border-gray-100 bg-white shadow-dropdown overflow-hidden">
                    <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900">Notifications</p>
                      <div className="flex items-center gap-1">
                        {notifications.length > 0 && (
                          <button onClick={handleDeleteAll}
                            className="flex h-7 w-7 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-danger transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => setNotifOpen(false)}
                          className="flex h-7 w-7 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-1.5 overflow-x-auto px-4 py-2.5 border-b border-gray-50">
                      {filters.map((f) => (
                        <button key={f.key} onClick={() => setActiveFilter(f.key)}
                          className={cn(
                            "shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-all whitespace-nowrap",
                            activeFilter === f.key ? "bg-primary text-white shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          )}>
                          {f.label}
                        </button>
                      ))}
                    </div>

                    <div className="max-h-[360px] overflow-y-auto">
                      {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <Bell className="mb-2 h-8 w-8 text-gray-300" />
                          <p className="text-sm text-gray-400">No notifications</p>
                        </div>
                      ) : (
                        <div className="py-1">
                          {filtered.map((n) => {
                            const mapped = iconMap[n.type] || { icon: Bell, color: "text-gray-500" }
                            const Icon = mapped.icon
                            return (
                              <div key={n.id}
                                className={cn(
                                  "flex gap-3 rounded-xl px-4 py-2.5 transition-colors group",
                                  !n.is_read ? "bg-primary/5" : "hover:bg-gray-50"
                                )}>
                                <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gray-50", mapped.color)}>
                                  <Icon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                                  <p className="text-xs text-gray-400 truncate">{n.description}</p>
                                  <p className="mt-0.5 text-[11px] text-gray-300">
                                    {format(new Date(n.created_at), "MMM d, h:mm a")}
                                  </p>
                                </div>
                                <button onClick={() => handleDelete(n.id)}
                                  className="shrink-0 flex h-7 w-7 items-center justify-center rounded-xl text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-danger-soft hover:text-danger transition-all">
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

          <div className="relative">
            <button onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2.5 rounded-xl pl-2 pr-3 py-1.5 transition-colors hover:bg-gray-50">
              <Avatar className="h-7 w-7 ring-2 ring-gray-100">
                <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-xs font-medium text-white">{initials}</AvatarFallback>
              </Avatar>
              <div className="hidden lg:block text-left">
                <p className="text-sm font-medium text-gray-900 leading-tight">{user?.full_name ?? "User"}</p>
                <p className="text-xs text-gray-400 leading-tight">{user?.role?.replace("_", " ") ?? ""}</p>
              </div>
              <ChevronDown className="hidden lg:block h-3.5 w-3.5 text-gray-400" />
            </button>
            <AnimatePresence>
              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
                  <motion.div initial={{ opacity: 0, y: -4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.96 }} transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full z-20 mt-1.5 w-56 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-dropdown">
                    <div className="border-b border-gray-100 px-3 py-3">
                      <p className="text-sm font-medium text-gray-900">{user?.full_name ?? "User"}</p>
                      <p className="text-xs text-gray-400">{user?.email ?? ""}</p>
                    </div>
                    <div className="pt-1">
                      <Link to="/settings" onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900">
                        <User className="h-4 w-4" /> Profile
                      </Link>
                      <button onClick={() => { setProfileOpen(false); logout(); navigate("/login") }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-danger transition-colors hover:bg-danger-soft">
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
