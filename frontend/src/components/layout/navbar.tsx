import { useState, useEffect, useCallback } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { PanelLeftOpen, Search, Bell, ChevronDown, LogOut, User, Calendar, AlertCircle, MessageSquare, Clock, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSidebarStore } from "@/store/sidebarStore"
import { useAuthStore } from "@/store/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { notificationsApi } from "@/services/endpoints"
import { format } from "date-fns"

export default function Navbar() {
  const { collapsed, toggle, setMobileOpen } = useSidebarStore()
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifCount, setNotifCount] = useState(0)
  const [notifications, setNotifications] = useState<{ id: string; title: string; description: string; time: string; icon: React.ElementType; color: string }[]>([])

  const iconMap: Record<string, { icon: React.ElementType; color: string }> = {
    appointment: { icon: Calendar, color: "text-primary" },
    alert: { icon: AlertCircle, color: "text-danger" },
    message: { icon: MessageSquare, color: "text-success" },
    reminder: { icon: Clock, color: "text-warning" },
  }

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await notificationsApi.list()
      const items = data?.items ?? []
      setNotifCount(data?.count ?? items.length)
      setNotifications(items.slice(0, 10).map((n: any) => {
        const mapped = iconMap[n.type] || { icon: Bell, color: "text-gray-500" }
        return {
          id: n.id,
          title: n.title,
          description: n.description,
          time: n.time,
          icon: mapped.icon,
          color: mapped.color,
        }
      }))
    } catch {
      setNotifCount(0)
    }
  }, [])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])
  useEffect(() => {
    if (notifOpen) fetchNotifications()
  }, [notifOpen, fetchNotifications])

  const initials = user?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "U"

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center border-b border-gray-100 bg-white/70 glass px-4 transition-all duration-300">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={toggle}
            className="hidden lg:flex text-gray-400 hover:text-gray-600">
            <PanelLeftOpen className={cn("h-5 w-5 transition-transform", collapsed && "rotate-180")} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setMobileOpen(true)}
            className="flex lg:hidden text-gray-400">
            <PanelLeftOpen className="h-5 w-5" />
          </Button>
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input placeholder="Search patients, cases..." className="h-9 w-56 lg:w-72 pl-10 bg-gray-50/50 border-0 focus:bg-white focus:border focus:border-gray-200 rounded-xl" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Button variant="ghost" size="icon-sm" className="relative text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              onClick={() => setNotifOpen(!notifOpen)}>
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
                    className="absolute right-0 top-full z-20 mt-1.5 w-80 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-dropdown">
                    <div className="border-b border-gray-100 px-3 py-2.5">
                      <p className="text-sm font-semibold text-gray-900">Notifications</p>
                    </div>
                    <div className="max-h-[320px] overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <Bell className="mb-2 h-8 w-8 text-gray-300" />
                          <p className="text-sm text-gray-400">No notifications yet</p>
                        </div>
                      ) : (
                        <div className="py-1">
                          {notifications.map((n) => {
                            const Icon = n.icon
                            return (
                              <button key={n.id}
                                className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-gray-50">
                                <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gray-50", n.color)}>
                                  <Icon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                                  <p className="text-xs text-gray-400 truncate">{n.description}</p>
                                  <p className="mt-0.5 text-[11px] text-gray-300">{n.time}</p>
                                </div>
                              </button>
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
                <AvatarFallback className="bg-primary-soft text-xs font-medium text-primary">{initials}</AvatarFallback>
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
