import { Link, useLocation } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  LayoutDashboard, Users, FolderOpen, CalendarDays, Stethoscope, Receipt, UserCog, Settings,
  ChevronLeft, X, Building2, Shield, MessageSquare, Activity, Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useSidebarStore } from "@/store/sidebarStore"
import { useAuthStore } from "@/store/authStore"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import Logo from "@/components/ui/logo"

interface NavItem { label: string; icon: React.ElementType; path: string; badge?: string }

const roleNav: Record<string, { label: string; items: NavItem[] }[]> = {
  SUPER_ADMIN: [
    { label: "Overview", items: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/" },
    ]},
    { label: "Administration", items: [
      { label: "Admin Groups", icon: Shield, path: "/admin/groups" },
      { label: "Hospitals", icon: Building2, path: "/admin/hospitals" },
      { label: "Doctors", icon: Activity, path: "/admin/doctors" },
    ]},
    { label: "Settings", items: [
      { label: "Settings", icon: Settings, path: "/settings" },
    ]},
  ],
  GROUP_ADMIN: [
    { label: "Overview", items: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/" },
    ]},
    { label: "Management", items: [
      { label: "Hospitals", icon: Building2, path: "/admin/hospitals" },
      { label: "Doctors", icon: Activity, path: "/admin/doctors" },
    ]},
    { label: "Settings", items: [
      { label: "Settings", icon: Settings, path: "/settings" },
    ]},
  ],
  HOSPITAL_ADMIN: [
    { label: "Overview", items: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/" },
    ]},
    { label: "Staff", items: [
      { label: "Doctors", icon: Activity, path: "/admin/doctors" },
      { label: "Consultants", icon: UserCog, path: "/consultants" },
    ]},
    { label: "Operations", items: [
      { label: "Patients", icon: Users, path: "/patients" },
      { label: "Appointments", icon: CalendarDays, path: "/appointments" },
      { label: "Cases", icon: FolderOpen, path: "/cases" },
      { label: "Treatments", icon: Stethoscope, path: "/treatments" },
    ]},
    { label: "Finance", items: [
      { label: "Billing", icon: Receipt, path: "/billing" },
    ]},
    { label: "Communication", items: [
      { label: "WhatsApp", icon: MessageSquare, path: "/whatsapp" },
    ]},
    { label: "Settings", items: [
      { label: "Settings", icon: Settings, path: "/settings" },
    ]},
  ],
  DOCTOR: [
    { label: "Overview", items: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/" },
    ]},
    { label: "My Work", items: [
      { label: "Patients", icon: Users, path: "/patients" },
      { label: "Appointments", icon: CalendarDays, path: "/appointments" },
      { label: "Cases", icon: FolderOpen, path: "/cases" },
      { label: "Treatments", icon: Stethoscope, path: "/treatments" },
    ]},
    { label: "Settings", items: [
      { label: "Settings", icon: Settings, path: "/settings" },
    ]},
  ],
}

const sectionVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0 },
}

export default function Sidebar() {
  const { collapsed, mobileOpen, toggle, setMobileOpen } = useSidebarStore()
  const { user } = useAuthStore()
  const location = useLocation()
  const role = user?.role || "DOCTOR"
  const sections = roleNav[role] || roleNav.DOCTOR
  const isCollapsed = collapsed

  const initials = user?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "U"

  const sidebarContent = (
    <div className="flex h-full flex-col bg-sidebar-bg">
      <div className="flex h-16 items-center justify-between px-4 border-b border-sidebar-border">
        <Link to="/" className="flex items-center gap-3 overflow-hidden" onClick={() => setMobileOpen(false)}>
          <Logo variant="white" size="sm" />
        </Link>
        <Button variant="ghost" size="icon-sm" onClick={toggle}
          className="hidden lg:flex text-sidebar-muted hover:text-sidebar-text hover:bg-sidebar-hover">
          <ChevronLeft className={cn("h-4 w-4 transition-transform", isCollapsed && "rotate-180")} />
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-hide space-y-5">
        {sections.map((section) => (
          <motion.div key={section.label} variants={sectionVariants} initial="hidden" animate="show">
            <motion.p variants={itemVariants}
              className={cn("px-3 text-[11px] font-semibold uppercase tracking-widest text-sidebar-muted mb-2 transition-opacity duration-200", isCollapsed && "opacity-0 h-0 overflow-hidden")}>
              {section.label}
            </motion.p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.path
                return (
                  <motion.div key={item.path} variants={itemVariants}>
                    <Link to={item.path} onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative",
                        isActive
                          ? "bg-sidebar-active-bg text-sidebar-active"
                          : "text-sidebar-text hover:bg-sidebar-hover hover:text-white"
                      )}>
                      {isActive && (
                        <motion.div layoutId="sidebar-active" transition={{ type: "spring", stiffness: 380, damping: 30 }}
                          className="absolute inset-0 rounded-xl bg-sidebar-active-bg" />
                      )}
                      <span className="relative z-10 flex items-center gap-3">
                        <Icon className={cn("h-4.5 w-4.5 shrink-0 transition-transform duration-200", isActive && "scale-110")} />
                        <span className={cn("transition-opacity duration-200", isCollapsed && "hidden")}>{item.label}</span>
                      </span>
                    </Link>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5", isCollapsed && "justify-center")}>
          <Avatar className="h-8 w-8 shrink-0 ring-2 ring-sidebar-border">
            <AvatarFallback className="bg-primary/20 text-xs font-medium text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div className={cn("min-w-0 transition-opacity duration-200", isCollapsed && "hidden")}>
            <p className="text-sm font-medium text-white truncate">{user?.full_name ?? "User"}</p>
            <p className="text-xs text-sidebar-muted truncate">{user?.role?.replace("_", " ") ?? ""}</p>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <aside className={cn(
        "hidden lg:flex flex-col shrink-0 transition-all duration-300 ease-in-out",
        isCollapsed ? "w-16" : "w-60"
      )}>
        <div className="sticky top-0 h-screen">
          {sidebarContent}
        </div>
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 z-50 w-60 lg:hidden">
              {sidebarContent}
              <button onClick={() => setMobileOpen(false)}
                className="absolute -right-10 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-bg text-sidebar-muted">
                <X className="h-4 w-4" />
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
