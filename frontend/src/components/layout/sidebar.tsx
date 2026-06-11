import { useState, useRef } from "react"
import { Link, useLocation } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  LayoutDashboard, Users, FolderOpen, CalendarDays, Stethoscope, Receipt, UserCog, Settings,
  ChevronLeft, X, Building2, Shield, MessageSquare, Activity, Menu, IndianRupee, TrendingUp,
  Bell, Mail, BarChart3, FileText, Phone, ClipboardList,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useSidebarStore } from "@/store/sidebarStore"
import { useAuthStore } from "@/store/authStore"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import Logo from "@/components/ui/logo"

interface NavItem { label: string; icon: React.ElementType; path: string; }

interface NavSection { label: string; items: NavItem[]; }

const roleNav: Record<string, NavSection[]> = {
  SUPER_ADMIN: [
    { label: "General", items: [
      { label: "Dashboard", icon: BarChart3, path: "/" },
    ]},
    { label: "Management", items: [
      { label: "Admin Groups", icon: Shield, path: "/admin/groups" },
      { label: "Hospitals", icon: Building2, path: "/admin/hospitals" },
      { label: "Doctors", icon: Stethoscope, path: "/admin/doctors" },
    ]},
    { label: "Finance", items: [
      { label: "Expenses", icon: IndianRupee, path: "/admin/expenses" },
    ]},
    { label: "Settings", items: [
      { label: "Settings", icon: Settings, path: "/settings" },
    ]},
  ],
  GROUP_ADMIN: [
    { label: "General", items: [
      { label: "Dashboard", icon: BarChart3, path: "/" },
    ]},
    { label: "Management", items: [
      { label: "Hospitals", icon: Building2, path: "/admin/hospitals" },
      { label: "Doctors", icon: Stethoscope, path: "/admin/doctors" },
    ]},
    { label: "Finance", items: [
      { label: "Expenses", icon: IndianRupee, path: "/admin/expenses" },
    ]},
    { label: "Settings", items: [
      { label: "Settings", icon: Settings, path: "/settings" },
    ]},
  ],
  HOSPITAL_ADMIN: [
    { label: "General", items: [
      { label: "Dashboard", icon: BarChart3, path: "/" },
    ]},
    { label: "Clinical", items: [
      { label: "Patients", icon: Users, path: "/patients" },
      { label: "Appointments", icon: CalendarDays, path: "/appointments" },
      { label: "Cases", icon: FolderOpen, path: "/cases" },
      { label: "Treatments", icon: Activity, path: "/treatments" },
      { label: "Billing", icon: Receipt, path: "/billing" },
    ]},
    { label: "CRM", items: [
      { label: "WhatsApp", icon: MessageSquare, path: "/whatsapp" },
      { label: "Communications", icon: Phone, path: "/crm/communications" },
      { label: "Email Templates", icon: Mail, path: "/crm/templates" },
      { label: "Follow-Ups", icon: ClipboardList, path: "/crm/follow-ups" },
    ]},
    { label: "Management", items: [
      { label: "Doctors", icon: Stethoscope, path: "/admin/doctors" },
    ]},
    { label: "Finance", items: [
      { label: "Expenses", icon: IndianRupee, path: "/admin/expenses" },
    ]},
    { label: "Settings", items: [
      { label: "Settings", icon: Settings, path: "/settings" },
    ]},
  ],
  DOCTOR: [
    { label: "General", items: [
      { label: "Dashboard", icon: BarChart3, path: "/" },
    ]},
    { label: "Clinical", items: [
      { label: "Patients", icon: Users, path: "/patients" },
      { label: "Appointments", icon: CalendarDays, path: "/appointments" },
      { label: "Cases", icon: FolderOpen, path: "/cases" },
      { label: "Treatments", icon: Activity, path: "/treatments" },
      { label: "Billing", icon: Receipt, path: "/billing" },
    ]},
    { label: "Settings", items: [
      { label: "Settings", icon: Settings, path: "/settings" },
    ]},
  ],
}

function getMainNavItems(role: string): NavItem[] {
  const sections = roleNav[role] || roleNav.DOCTOR
  return sections.flatMap((s) => s.items)
}

function NavTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="group/tip relative">
      {children}
      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 pointer-events-none opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150">
        <div className="bg-gray-900 text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
          {label}
        </div>
      </div>
    </div>
  )
}

export default function Sidebar() {
  const { collapsed, mobileOpen, toggle, setMobileOpen, bottomNavOpen, setBottomNavOpen } = useSidebarStore()
  const { user } = useAuthStore()
  const location = useLocation()
  const role = user?.role || "DOCTOR"
  const sections = roleNav[role] || roleNav.DOCTOR
  const isCollapsed = collapsed
  const [hovered, setHovered] = useState(false)
  const isExpanded = !isCollapsed || hovered

  const initials = user?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "U"

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/"
    return location.pathname.startsWith(path)
  }

  const mainItems = getMainNavItems(role)

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white">
      <div className={cn(
        "flex items-center border-b border-[#E2E8F0] bg-[#F8FAFC] transition-all duration-[250ms] ease-in-out overflow-hidden",
        isExpanded ? "h-[88px] px-5" : "h-[72px] px-0 justify-center"
      )}>
        <Link to="/" className={cn("flex items-center overflow-hidden transition-all duration-[250ms] ease-in-out", isExpanded ? "gap-3" : "gap-0")} onClick={() => setMobileOpen(false)}>
          <Logo variant="sidebar" size={isExpanded ? "md" : "sm"} showTagline={isExpanded} />
        </Link>
        <div className="flex-1" />
        <Button variant="ghost" size="icon-sm" onClick={toggle}
          className={cn("hidden lg:flex shrink-0 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-opacity duration-[250ms]", isExpanded ? "opacity-100" : "opacity-0 w-0 overflow-hidden")}>
          <ChevronLeft className={cn("h-4 w-4 transition-transform duration-300", isCollapsed && "rotate-180")} />
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5 scrollbar-hide space-y-5">
        {sections.map((section) => (
          <div key={section.label}>
            <p className={cn(
              "px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 mb-2 overflow-hidden transition-all duration-[250ms] ease-in-out",
              !isExpanded ? "max-h-0 opacity-0" : "max-h-6 opacity-100"
            )}>
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.path)
                const link = (
                  <Link key={item.path} to={item.path} onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 group relative",
                      active
                        ? "bg-[#E0F2FE] text-[#0EA5E9] font-semibold"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    )}>
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[#0EA5E9]" />
                    )}
                    <span className="relative z-10 flex items-center gap-3 w-full">
                      <span className={cn(
                        "flex items-center justify-center shrink-0 transition-transform duration-150",
                        active && "scale-110",
                        !active && "group-hover:scale-105"
                      )}>
                        <Icon className={cn("h-5 w-5", active ? "text-[#0EA5E9]" : "text-gray-400 group-hover:text-gray-600")} />
                      </span>
                      <span className={cn(
                        "overflow-hidden transition-all duration-[250ms] ease-in-out",
                        !isExpanded ? "max-w-0 opacity-0" : "max-w-48 opacity-100"
                      )}>{item.label}</span>
                    </span>
                  </Link>
                )
                if (!isExpanded && !hovered) {
                  return <NavTooltip key={item.path} label={item.label}>{link}</NavTooltip>
                }
                return link
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[#E2E8F0] p-3">
        <div className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 overflow-hidden transition-all duration-[250ms] ease-in-out",
          !isExpanded ? "justify-center" : ""
        )}>
          <Avatar className="h-8 w-8 shrink-0 ring-2 ring-[#E2E8F0]">
            <AvatarFallback className="bg-[#E0F2FE] text-xs font-semibold text-[#0EA5E9]">{initials}</AvatarFallback>
          </Avatar>
          <div className={cn(
            "overflow-hidden transition-all duration-[250ms] ease-in-out",
            !isExpanded ? "max-w-0 opacity-0" : "max-w-48 opacity-100"
          )}>
            <p className="text-sm font-medium text-gray-900 truncate">{user?.full_name ?? "User"}</p>
            <p className="text-[11px] text-gray-400 truncate">{user?.role?.replace("_", " ") ?? ""}</p>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <aside onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        className={cn(
          "hidden lg:flex flex-col shrink-0 transition-[width] duration-[250ms] ease-in-out will-change-transform",
          isCollapsed && !hovered ? "w-[72px]" : "w-[280px]"
        )}>
        <div className="sticky top-0 h-screen">
          {sidebarContent}
        </div>
      </aside>

      <aside className="hidden md:flex lg:hidden flex-col shrink-0 w-[72px]">
        <div className="sticky top-0 h-screen flex flex-col bg-white border-r border-[#E2E8F0]">
          <div className="flex h-[72px] items-center justify-center border-b border-[#E2E8F0] bg-[#F8FAFC]">
            <Link to="/" onClick={() => setMobileOpen(false)}>
              <Logo variant="sidebar" size="sm" />
            </Link>
          </div>
          <nav className="flex-1 overflow-y-auto px-2 py-4 scrollbar-hide space-y-1">
            {sections.map((section) =>
              section.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.path)
                return (
                  <Link key={item.path} to={item.path}
                    className={cn(
                      "flex items-center justify-center rounded-lg p-2.5 text-sm font-medium transition-all duration-150 relative",
                      active
                        ? "bg-[#E0F2FE] text-[#0EA5E9]"
                        : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                    )}>
                    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[#0EA5E9]" />}
                    <Icon className="h-5 w-5 shrink-0" />
                  </Link>
                )
              })
            )}
          </nav>
          <div className="border-t border-[#E2E8F0] p-2 flex justify-center">
            <Avatar className="h-8 w-8 shrink-0 ring-2 ring-[#E2E8F0]">
              <AvatarFallback className="bg-[#E0F2FE] text-xs font-semibold text-[#0EA5E9]">{initials}</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
              onClick={() => setMobileOpen(false)} />
            <motion.aside initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 z-50 w-[280px] md:hidden shadow-2xl">
              {sidebarContent}
              <button onClick={() => setMobileOpen(false)}
                className="absolute -right-12 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-lg text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-gray-200 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.05)] md:hidden safe-area-bottom">
        {mainItems.slice(0, 5).map((item) => {
          const Icon = item.icon
          const active = isActive(item.path)
          return (
            <Link key={item.path} to={item.path}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 min-w-[56px] py-1 px-2 rounded-xl transition-colors",
                active ? "text-[#0EA5E9]" : "text-gray-400 hover:text-gray-600"
              )}>
              <Icon className={cn("h-5 w-5", active && "scale-110")} />
              <span className="text-[10px] font-medium leading-tight text-center truncate w-full">{item.label}</span>
            </Link>
          )
        })}
        <button onClick={() => setBottomNavOpen(!bottomNavOpen)}
          className="flex flex-col items-center justify-center gap-0.5 min-w-[56px] py-1 px-2 rounded-xl text-gray-400 hover:text-gray-600">
          <Menu className="h-5 w-5" />
          <span className="text-[10px] font-medium leading-tight">More</span>
        </button>
      </nav>

      <AnimatePresence>
        {bottomNavOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-black/30 md:hidden"
              onClick={() => setBottomNavOpen(false)} />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-white p-4 pb-8 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] md:hidden safe-area-bottom">
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-300" />
              <div className="grid grid-cols-4 gap-2">
                {mainItems.slice(5).map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.path)
                  return (
                    <Link key={item.path} to={item.path} onClick={() => setBottomNavOpen(false)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1 rounded-xl p-3 transition-colors",
                        active ? "bg-[#E0F2FE] text-[#0EA5E9]" : "text-gray-500 hover:bg-gray-50"
                      )}>
                      <Icon className="h-5 w-5" />
                      <span className="text-[10px] font-medium text-center">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}