import { useState, useRef, useEffect } from "react"
import { Link, useLocation } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  LayoutDashboard, Users, FolderOpen, CalendarDays, Stethoscope, Receipt,
  Settings, ChevronLeft, Building2, Shield, MessageSquare,
  Activity, Menu, IndianRupee, BarChart3, FileText,
  Clock, UserPlus,
  Search, Download, LayoutList, Kanban,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useSidebarStore } from "@/store/sidebarStore"
import { useAuthStore } from "@/store/authStore"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ToothLogo, BrandText } from "@/components/ui/brand-logo"

interface NavItem { label: string; icon: React.ElementType; path: string; }
interface NavSection { label: string; items: NavItem[]; }

const roleNav: Record<string, NavSection[]> = {
  SUPER_ADMIN: [
    { label: "General", items: [{ label: "Dashboard", icon: BarChart3, path: "/" }] },
    { label: "Management", items: [
      { label: "Admin Groups", icon: Shield, path: "/admin/groups" },
      { label: "Hospitals", icon: Building2, path: "/admin/hospitals" },
      { label: "Doctors", icon: Stethoscope, path: "/admin/doctors" },
    ]},
    { label: "Settings", items: [{ label: "Settings", icon: Settings, path: "/settings" }] },
  ],
  GROUP_ADMIN: [
    { label: "General", items: [{ label: "Dashboard", icon: BarChart3, path: "/" }] },
    { label: "Management", items: [
      { label: "Hospitals", icon: Building2, path: "/admin/hospitals" },
      { label: "Doctors", icon: Stethoscope, path: "/admin/doctors" },
    ]},
    { label: "Clinical", items: [
      { label: "Workflow Board", icon: Kanban, path: "/treatments/workflow" },
    ]},
    { label: "Finance", items: [
      { label: "Expenses", icon: IndianRupee, path: "/admin/expenses" },
    ]},
    { label: "Settings", items: [{ label: "Settings", icon: Settings, path: "/settings" }] },
  ],
  HOSPITAL_ADMIN: [
    { label: "General", items: [{ label: "Dashboard", icon: BarChart3, path: "/" }] },
    { label: "Clinical", items: [
      { label: "Patients", icon: Users, path: "/patients" },
      { label: "Appointments", icon: CalendarDays, path: "/appointments" },
      { label: "Case Reports", icon: FolderOpen, path: "/cases" },
      { label: "Treatments", icon: Activity, path: "/treatments" },
      { label: "Workflow Board", icon: Kanban, path: "/treatments/workflow" },
      { label: "Billing", icon: Receipt, path: "/billing" },
      { label: "Consent Forms", icon: FileText, path: "/consent-forms" },
    ]},
    { label: "CRM", items: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/crm/dashboard2" },
      { label: "Leads", icon: UserPlus, path: "/leads" },
      { label: "Enquiries", icon: CalendarDays, path: "/crm/enquiry-calendar" },
      { label: "WhatsApp", icon: MessageSquare, path: "/whatsapp" },
    ]},
    { label: "Finance", items: [
      { label: "Expenses", icon: IndianRupee, path: "/admin/expenses" },
      { label: "Export Center", icon: Download, path: "/exports" },
    ]},
    { label: "Settings", items: [
      { label: "Settings", icon: Settings, path: "/settings" },
      { label: "Clinical Settings", icon: Stethoscope, path: "/settings/clinical" },
      { label: "CRM Settings", icon: Activity, path: "/crm/settings" },
      { label: "WhatsApp Config", icon: MessageSquare, path: "/settings/whatsapp" },
    ]},
  ],
  DOCTOR: [
    { label: "General", items: [
      { label: "Dashboard", icon: BarChart3, path: "/" },
      { label: "Availability", icon: Clock, path: "/doctors/availability" },
    ] },
    { label: "Clinical", items: [
      { label: "Patients", icon: Users, path: "/patients" },
      { label: "Appointments", icon: CalendarDays, path: "/appointments" },
      { label: "Case Reports", icon: FolderOpen, path: "/cases" },
      { label: "Treatments", icon: Activity, path: "/treatments" },
      { label: "My Queue", icon: LayoutList, path: "/treatments/queue" },
      { label: "Billing", icon: Receipt, path: "/billing" },
      { label: "Consent Forms", icon: FileText, path: "/consent-forms" },
    ]},
    { label: "Settings", items: [{ label: "Settings", icon: Settings, path: "/settings" }] },
  ],
}

function getMainNavItems(role: string): NavItem[] {
  const sections = roleNav[role] || roleNav.DOCTOR
  return sections.flatMap((s) => s.items)
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
  const [searchQuery, setSearchQuery] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)

  const initials = user?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "U"

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/"
    return location.pathname.startsWith(path)
  }

  const mainItems = getMainNavItems(role)

  const allNavItems = sections.flatMap((s) => s.items)
  const filteredItems = searchQuery
    ? allNavItems.filter((i) => i.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : []

  useEffect(() => {
    if (isExpanded && searchRef.current) {
      const handleKey = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "k") {
          e.preventDefault()
          searchRef.current?.focus()
        }
      }
      document.addEventListener("keydown", handleKey)
      return () => document.removeEventListener("keydown", handleKey)
    }
  }, [isExpanded])

  const sidebarClass = cn(
    "hidden lg:flex flex-col shrink-0 transition-[width] duration-200 ease-out will-change-transform bg-white border-r border-sidebar-border",
    isCollapsed && !hovered ? "w-[80px]" : "w-[280px]"
  )

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white font-['Poppins','Inter',sans-serif]">
      {/* Logo area */}
      <div className={cn(
        "flex items-center border-b border-sidebar-border transition-all duration-200 overflow-hidden",
        isExpanded ? "h-[60px] px-5" : "h-[60px] px-0 justify-center"
      )}>
        <Link to="/" className={cn("flex items-center overflow-hidden transition-all duration-200", isExpanded ? "gap-2.5" : "gap-0")} onClick={() => setMobileOpen(false)}>
          <ToothLogo size={isExpanded ? 27 : 24} showSparkle={false} />
          <div className={cn("transition-all duration-200", !isExpanded ? "opacity-0 w-0" : "opacity-100")}>
            <p className="text-sm font-bold leading-tight"><BrandText size="sm" /></p>
            <p className="text-[10px] text-[var(--ds-sidebar-icon)] font-medium tracking-[0.25em] uppercase -mt-px">Dental Management System</p>
          </div>
        </Link>
        <div className="flex-1" />
        <button onClick={toggle}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "hidden lg:flex items-center justify-center h-7 w-7 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-200",
            isExpanded ? "opacity-100" : "opacity-0 pointer-events-none"
          )}>
          <ChevronLeft className={cn("h-3.5 w-3.5 transition-transform duration-200", isCollapsed && "rotate-180")} strokeWidth={2} />
        </button>
      </div>

      {/* Search */}
      <div className={cn("px-3 pt-3 transition-all duration-200 overflow-hidden", !isExpanded ? "opacity-0 h-0 py-0" : "opacity-100")}>
        <div className="relative mb-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" strokeWidth={2} />
          <input
            ref={searchRef}
            id="sidebar-search"
            type="text"
            placeholder="Search..."
            aria-label="Search navigation"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-2 text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-[var(--ds-primary)] focus:bg-white focus:ring-2 focus:ring-[var(--ds-primary)]/10 transition-all"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex h-4 items-center px-1.5 rounded border border-gray-200 bg-white text-[10px] font-medium text-gray-400">⌘K</kbd>
        </div>
        {searchQuery && filteredItems.length > 0 && (
          <div className="absolute left-3 right-3 z-50 mt-1 rounded-xl border border-gray-200 bg-white py-1 shadow-dropdown">
            {filteredItems.slice(0, 8).map((item) => {
              const Icon = item.icon
              return (
                <Link key={item.path} to={item.path} onClick={() => { setSearchQuery(""); setMobileOpen(false) }}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  <Icon className="h-4 w-4 text-gray-400" strokeWidth={2} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav aria-label="Main navigation" className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3 scrollbar-hide space-y-1">
        {searchQuery && filteredItems.length === 0 && (
          <p className="px-2 text-xs text-gray-400 py-4 text-center">No results found</p>
        )}
        {!searchQuery && sections.map((section) => (
          <div key={section.label}>
            <p className={cn(
              "px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1 overflow-hidden transition-all duration-200",
              !isExpanded ? "max-h-0 opacity-0" : "max-h-5 opacity-100"
            )}>
              {section.label}
            </p>
            {section.items.map((item) => {
              const Icon = item.icon
              const active = isActive(item.path)
              return (
                <Link key={item.path} to={item.path}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 group relative",
                    active
                      ? "bg-gradient-to-r from-[var(--ds-primary-300)]/10 to-[var(--ds-primary-500)]/10 text-[var(--ds-sidebar-text-active)] font-semibold"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  )}
                  title={!isExpanded ? item.label : undefined}>
                  {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3.5px] h-5 rounded-r-full bg-gradient-to-b from-[var(--ds-primary-300)] to-[var(--ds-primary-500)]" />}
                  <span className={cn("flex items-center justify-center shrink-0", active ? "text-[var(--ds-primary-300)]" : "text-gray-400 group-hover:text-gray-600")}>
                    <Icon className="h-[22px] w-[22px]" strokeWidth={1.5} />
                  </span>
                  <span className={cn(
                    "overflow-hidden transition-all duration-200 whitespace-nowrap text-sm",
                    !isExpanded ? "max-w-0 opacity-0" : "max-w-44 opacity-100"
                  )}>{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-sidebar-border p-2.5">
        <div className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2 overflow-hidden transition-all duration-200",
          !isExpanded ? "justify-center" : ""
        )}>
          <Avatar className="h-8 w-8 shrink-0 ring-2 ring-gray-100">
            <AvatarFallback className="bg-gradient-to-br from-[var(--ds-primary-300)]/20 to-[var(--ds-primary-500)]/20 text-xs font-semibold text-[var(--ds-primary-300)]">{initials}</AvatarFallback>
          </Avatar>
          <div className={cn("overflow-hidden transition-all duration-200", !isExpanded ? "max-w-0 opacity-0" : "max-w-36 opacity-100")}>
            <p className="text-sm font-medium text-gray-900 truncate leading-tight">{user?.full_name ?? "User"}</p>
            <p className="text-[11px] text-gray-400 truncate capitalize">{user?.role?.replace("_", " ").toLowerCase() ?? ""}</p>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside aria-label="Sidebar" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        className={sidebarClass}>
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {/* Tablet icon-only sidebar */}
      <aside aria-label="Sidebar" className="hidden md:flex lg:hidden flex-col shrink-0 w-[80px]">
        <div className="sticky top-0 h-screen flex flex-col bg-white border-r border-sidebar-border font-['Poppins','Inter',sans-serif]">
          <div className="flex h-[60px] items-center justify-center border-b border-sidebar-border">
            <ToothLogo size={24} showSparkle={false} />
          </div>
          <nav aria-label="Main navigation" className="min-h-0 flex-1 overflow-y-auto px-1.5 py-3 scrollbar-hide space-y-1">
            {sections.map((section) =>
              section.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.path)
                return (
                  <Link key={item.path} to={item.path}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-center rounded-lg p-2.5 transition-all duration-150 relative",
                      active ? "bg-gradient-to-r from-[var(--ds-primary-300)]/10 to-[var(--ds-primary-500)]/10 text-[var(--ds-primary-300)]" : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                    )}
                    title={item.label}>
                    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3.5px] h-5 rounded-r-full bg-gradient-to-b from-[var(--ds-primary-300)] to-[var(--ds-primary-500)]" />}
                    <Icon className="h-[22px] w-[22px]" strokeWidth={1.5} />
                  </Link>
                )
              })
            )}
          </nav>
          <div className="border-t border-sidebar-border p-2 flex justify-center">
            <Avatar className="h-8 w-8 shrink-0 ring-2 ring-gray-100">
              <AvatarFallback className="bg-gradient-to-br from-[var(--ds-primary-300)]/20 to-[var(--ds-primary-500)]/20 text-xs font-semibold text-[var(--ds-primary-300)]">{initials}</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-black/60 md:hidden"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true" />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="Mobile navigation"
              initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 z-50 w-[280px] md:hidden shadow-xl">
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around border-t border-gray-200 bg-white md:hidden safe-area-bottom font-['Poppins','Inter',sans-serif]">
        {mainItems.slice(0, 5).map((item) => {
          const Icon = item.icon
          const active = isActive(item.path)
          return (
            <Link key={item.path} to={item.path}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 min-w-[56px] py-1 px-2 transition-colors",
                active ? "text-[var(--ds-primary-300)]" : "text-gray-400 hover:text-gray-600"
              )}>
              <Icon className={cn("h-[22px] w-[22px]", active && "scale-105")} strokeWidth={1.5} />
              <span className="text-[10px] font-medium leading-tight text-center truncate w-full">{item.label}</span>
            </Link>
          )
        })}
        <button onClick={() => setBottomNavOpen(!bottomNavOpen)}
          aria-label="More navigation items"
          aria-expanded={bottomNavOpen}
          className="flex flex-col items-center justify-center gap-0.5 min-w-[56px] py-1 px-2 text-gray-400 hover:text-gray-600">
          <Menu className="h-[22px] w-[22px]" strokeWidth={1.5} />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>

      {/* Mobile bottom sheet */}
      <AnimatePresence>
        {bottomNavOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
              onClick={() => setBottomNavOpen(false)} />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="More navigation"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-white pb-8 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] md:hidden safe-area-bottom font-['Poppins','Inter',sans-serif]">
              <div className="mx-auto my-3 h-1 w-10 rounded-full bg-gray-300" />
              <div className="grid grid-cols-4 gap-1 px-4">
                {mainItems.slice(5).map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.path)
                  return (
                    <Link key={item.path} to={item.path} onClick={() => setBottomNavOpen(false)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1 rounded-xl p-3 transition-colors",
                        active ? "bg-gradient-to-r from-[var(--ds-primary-300)]/10 to-[var(--ds-primary-500)]/10 text-[var(--ds-primary-300)]" : "text-gray-500 hover:bg-gray-50"
                      )}>
                      <Icon className="h-[22px] w-[22px]" strokeWidth={1.5} />
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
