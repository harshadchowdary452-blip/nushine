"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { createPortal } from "react-dom"
import { Link, useLocation } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  LayoutDashboard, Users, FolderOpen, CalendarDays, Stethoscope, Receipt,
  Settings, ChevronLeft, Building2, Shield, MessageSquare,
  Activity, IndianRupee, FileText,
  Clock, UserPlus, Search, Download, LayoutList, Kanban,
  Sun, Moon, Star, ChevronDown, Hospital, History, Menu,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useSidebarStore } from "@/store/sidebarStore"
import { useAuthStore } from "@/store/authStore"
import { useThemeStore } from "@/store/themeStore"
import { useSearchStore } from "@/store/searchStore"
import { useFavoriteStore } from "@/store/favoriteStore"
import { useRecentlyOpenedStore } from "@/store/recentlyOpenedStore"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

/* ═══════════════════════════════════════════════════════════════════════════
   NAVIGATION DATA MODEL
   ═══════════════════════════════════════════════════════════════════════════ */

interface NavItem {
  label: string
  icon: React.ElementType
  path: string
  badge?: string
}

interface NavGroup {
  label: string
  items: NavItem[]
}

type RoleKey = "SUPER_ADMIN" | "GROUP_ADMIN" | "HOSPITAL_ADMIN" | "DOCTOR"

const navConfig: Record<RoleKey, NavGroup[]> = {
  SUPER_ADMIN: [
    {
      label: "Overview",
      items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/" }],
    },
    {
      label: "Administration",
      items: [
        { label: "Groups", icon: Shield, path: "/admin/groups" },
        { label: "Hospitals", icon: Building2, path: "/admin/hospitals" },
        { label: "Doctors", icon: Stethoscope, path: "/admin/doctors" },
      ],
    },
    {
      label: "Configuration",
      items: [{ label: "Settings", icon: Settings, path: "/settings" }],
    },
  ],
  GROUP_ADMIN: [
    {
      label: "Overview",
      items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/" }],
    },
    {
      label: "Administration",
      items: [
        { label: "Hospitals", icon: Building2, path: "/admin/hospitals" },
        { label: "Doctors", icon: Stethoscope, path: "/admin/doctors" },
      ],
    },
    {
      label: "Clinical",
      items: [{ label: "Workflow Board", icon: Kanban, path: "/treatments/workflow" }],
    },
    {
      label: "Finance",
      items: [{ label: "Expenses", icon: IndianRupee, path: "/admin/expenses" }],
    },
    {
      label: "Settings",
      items: [{ label: "Settings", icon: Settings, path: "/settings" }],
    },
  ],
  HOSPITAL_ADMIN: [
    {
      label: "Overview",
      items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/" }],
    },
    {
      label: "Patient Management",
      items: [
        { label: "Patients", icon: Users, path: "/patients", badge: "Core" },
        { label: "Appointments", icon: CalendarDays, path: "/appointments" },
        { label: "Doctors", icon: Stethoscope, path: "/admin/doctors" },
      ],
    },
    {
      label: "Clinical",
      items: [
        { label: "Treatments", icon: Activity, path: "/treatments" },
        { label: "Cases", icon: FolderOpen, path: "/cases" },
        { label: "Billing", icon: Receipt, path: "/billing" },
        { label: "Workflow Board", icon: Kanban, path: "/treatments/workflow" },
        { label: "Consent Forms", icon: FileText, path: "/consent-forms" },
      ],
    },
    {
      label: "CRM",
      items: [
        { label: "Dashboard", icon: LayoutDashboard, path: "/crm/dashboard2" },
        { label: "Leads", icon: UserPlus, path: "/leads" },
        { label: "Enquiry Calendar", icon: CalendarDays, path: "/crm/enquiry-calendar" },
        { label: "WhatsApp", icon: MessageSquare, path: "/whatsapp" },
      ],
    },
    {
      label: "Finance",
      items: [
        { label: "Expenses", icon: IndianRupee, path: "/admin/expenses" },
        { label: "Export Center", icon: Download, path: "/exports" },
      ],
    },
    {
      label: "Configuration",
      items: [
        { label: "Settings", icon: Settings, path: "/settings" },
        { label: "Clinical Settings", icon: Stethoscope, path: "/settings/clinical" },
        { label: "CRM Settings", icon: Activity, path: "/crm/settings" },
        { label: "WhatsApp Config", icon: MessageSquare, path: "/settings/whatsapp" },
      ],
    },
  ],
  DOCTOR: [
    {
      label: "Overview",
      items: [
        { label: "Dashboard", icon: LayoutDashboard, path: "/" },
        { label: "Availability", icon: Clock, path: "/doctors/availability" },
      ],
    },
    {
      label: "Patient Management",
      items: [
        { label: "Patients", icon: Users, path: "/patients" },
        { label: "Appointments", icon: CalendarDays, path: "/appointments" },
      ],
    },
    {
      label: "Clinical",
      items: [
        { label: "Treatments", icon: Activity, path: "/treatments" },
        { label: "Cases", icon: FolderOpen, path: "/cases" },
        { label: "My Queue", icon: LayoutList, path: "/treatments/queue" },
        { label: "Billing", icon: Receipt, path: "/billing" },
        { label: "Consent Forms", icon: FileText, path: "/consent-forms" },
      ],
    },
    {
      label: "Settings",
      items: [{ label: "Settings", icon: Settings, path: "/settings" }],
    },
  ],
}

function getAllNavItems(role: RoleKey): NavItem[] {
  return navConfig[role].flatMap((g) => g.items)
}

/* ═══════════════════════════════════════════════════════════════════════════
   TOOLTIP WRAPPER
   ═══════════════════════════════════════════════════════════════════════════ */

function SidebarTooltip({ label, children, show }: { label: string; children: React.ReactNode; show: boolean }) {
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const update = useCallback(() => {
    if (!anchor) return
    const r = anchor.getBoundingClientRect()
    setPos({ top: r.top + r.height / 2, left: r.right + 12 })
  }, [anchor])

  useEffect(() => {
    if (show && anchor) {
      update()
      window.addEventListener("resize", update)
      return () => window.removeEventListener("resize", update)
    }
  }, [show, anchor, update])

  return (
    <div ref={setAnchor} className="relative group" onMouseEnter={update}>
      {children}
      {show && pos && createPortal(
        <motion.div
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -6 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          style={{ top: pos.top, left: pos.left, transform: "translateY(-50%)" }}
          className="fixed z-[var(--ds-z-tooltip)] pointer-events-none"
          role="tooltip"
        >
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--ds-radius-lg)] bg-[var(--ds-text)] text-[var(--ds-text-inverse)] text-xs font-medium whitespace-nowrap shadow-[var(--ds-shadow-lg)]">
            {label}
          </div>
        </motion.div>,
        document.body
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   NAV ITEM COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

interface NavItemInnerProps {
  item: NavItem
  isActive: boolean
  isExpanded: boolean
  isFavorite: boolean
  onToggleFavorite: (path: string, e: React.MouseEvent) => void
  onClick: () => void
}

function NavItemInner({ item, isActive, isExpanded, isFavorite, onToggleFavorite, onClick }: NavItemInnerProps) {
  const Icon = item.icon
  const link = (
    <Link
      to={item.path}
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-[var(--ds-radius-lg)] transition-all duration-150 group/item relative",
        "min-h-[var(--ds-sidebar-item-h)]",
        isExpanded ? "px-3" : "px-0 justify-center",
        isActive
          ? "bg-[var(--ds-sidebar-active-bg)] text-[var(--ds-sidebar-text-active)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          : "text-[var(--ds-sidebar-text)] hover:bg-[var(--ds-sidebar-hover)] hover:text-white"
      )}
      title={!isExpanded ? item.label : undefined}
    >
      {/* Active indicator bar */}
      {isActive && (
        <motion.span
          layoutId="sidebar-active-indicator"
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--ds-sidebar-active-indicator)]"
        />
      )}

      {/* Icon */}
      <span className={cn(
        "flex items-center justify-center shrink-0 transition-colors",
        isActive ? "text-[var(--ds-sidebar-icon-active)]" : "text-[var(--ds-sidebar-icon)] group-hover/item:text-white"
      )}>
        <Icon className="h-[20px] w-[20px]" strokeWidth={1.5} />
      </span>

      {/* Label + badge */}
      <span className={cn(
        "flex items-center gap-2 overflow-hidden transition-all duration-200 whitespace-nowrap text-sm flex-1",
        !isExpanded ? "max-w-0 opacity-0" : "max-w-44 opacity-100"
      )}>
        <span className="truncate">{item.label}</span>
        {item.badge && (
          <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-[var(--ds-accent)]/20 text-[10px] font-semibold text-[var(--ds-accent)]">
            {item.badge}
          </span>
        )}
      </span>

      {/* Favorite star */}
      {isExpanded && (
        <button
          onClick={(e) => onToggleFavorite(item.path, e)}
          aria-label={isFavorite ? `Remove ${item.label} from favorites` : `Add ${item.label} to favorites`}
          className={cn(
            "shrink-0 flex items-center justify-center h-6 w-6 rounded-[var(--ds-radius-md)] transition-all",
            "opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100",
            isFavorite
              ? "text-[var(--ds-accent)] hover:bg-[var(--ds-accent-subtle)]"
              : "text-[var(--ds-sidebar-text)] hover:bg-[var(--ds-sidebar-hover)]"
          )}
        >
          <Star className={cn("h-3.5 w-3.5", isFavorite && "fill-current")} strokeWidth={1.5} />
        </button>
      )}
    </Link>
  )

  if (!isExpanded) {
    return <SidebarTooltip label={item.label} show={!isExpanded}>{link}</SidebarTooltip>
  }
  return link
}

/* ═══════════════════════════════════════════════════════════════════════════
   SIDEBAR CONTENT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function EnterpriseSidebar() {
  const collapsed = useSidebarStore((s) => s.collapsed)
  const mobileOpen = useSidebarStore((s) => s.mobileOpen)
  const toggle = useSidebarStore((s) => s.toggle)
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen)
  const bottomNavOpen = useSidebarStore((s) => s.bottomNavOpen)
  const setBottomNavOpen = useSidebarStore((s) => s.setBottomNavOpen)
  const user = useAuthStore((s) => s.user)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const setSearchOpen = useSearchStore((s) => s.setOpen)
  const favItems = useFavoriteStore((s) => s.items)
  const favToggle = useFavoriteStore((s) => s.toggle)
  const recentOpened = useRecentlyOpenedStore((s) => s.items)
  const location = useLocation()

  const role = (user?.role as RoleKey) || "DOCTOR"
  const groups = navConfig[role] || navConfig.DOCTOR
  const allItems = useMemo(() => getAllNavItems(role), [role])
  const [hovered, setHovered] = useState(false)
  const isExpanded = !collapsed || hovered
  const [searchQuery, setSearchQuery] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  const initials = user?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "U"
  const [hospitalMenuOpen, setHospitalMenuOpen] = useState(false)

  const isActive = useCallback((path: string) => {
    if (path === "/") return location.pathname === "/"
    return location.pathname.startsWith(path)
  }, [location.pathname])

  // Keyboard shortcut: Cmd+K focuses search
  useEffect(() => {
    if (isExpanded && searchRef.current) {
      const handleKey = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "k" && !e.repeat) {
          e.preventDefault()
          searchRef.current?.focus()
        }
      }
      document.addEventListener("keydown", handleKey)
      return () => document.removeEventListener("keydown", handleKey)
    }
  }, [isExpanded])

  const filteredItems = useMemo(
    () => searchQuery
      ? allItems.filter((i) => i.label.toLowerCase().includes(searchQuery.toLowerCase()))
      : [],
    [allItems, searchQuery]
  )

  const favoriteItems = useMemo(
    () => allItems.filter((i) => favItems.includes(i.path)),
    [allItems, favItems]
  )

  const recentItems = recentOpened

  const hospitalName = user?.hospital_name || null

  /* ─── SIDEBAR CONTENT ─── */
  const sidebarContent = (
    <div
      className="relative flex h-full flex-col overflow-hidden bg-[var(--ds-sidebar-bg)] text-[var(--ds-sidebar-text)] select-none"
      style={{ backgroundImage: "var(--ds-sidebar-edge), var(--ds-sidebar-glow)" }}
    >

      {/* ═══ BRAND AREA ═══ */}
      <div className={cn(
        "flex items-center border-b border-[var(--ds-sidebar-border)] transition-all duration-[var(--ds-transition-slow)] shrink-0",
        "min-h-[var(--ds-sidebar-brand-h)]",
        isExpanded ? "px-5" : "px-0 justify-center"
      )}>
        <Link
          to="/"
          onClick={() => setMobileOpen(false)}
          className={cn(
            "flex items-center gap-3 overflow-hidden transition-all duration-[var(--ds-transition-slow)]",
            !isExpanded && "justify-center gap-0"
          )}
        >
          {/* Logo mark */}
          <div className="flex items-center justify-center w-8 h-8 rounded-[var(--ds-radius-lg)] bg-[var(--ds-accent)] shrink-0 shadow-sm">
            <svg width="18" height="18" viewBox="0 0 56 56" fill="none" aria-hidden="true">
              <path d="M28 14c-4.5 0-7.8 2.6-9 6.8-1 3.4-1.5 7.6-1.5 11.2s.5 7 1.4 8.8c.7 1.4 1.8 2.4 3.2 2.9 1.1.4 2.1 1 2.8 1.7l.7.8c.6.7 1.7.7 2.3 0l.7-.8c.7-.7 1.7-1.3 2.8-1.7 1.4-.5 2.5-1.5 3.2-2.9.9-1.8 1.4-5.2 1.4-8.8s-.5-7.8-1.5-11.2C35.8 16.6 32.5 14 28 14z" fill="white" opacity="0.96" />
            </svg>
          </div>

          {/* Brand text */}
          <div className="transition-all duration-[var(--ds-transition-slow)] overflow-hidden whitespace-nowrap"
            style={{ maxWidth: isExpanded ? "160px" : "0", opacity: isExpanded ? 1 : 0 }}
          >
            <p className="text-sm font-bold text-white leading-tight">NuShine</p>
            <p className="text-[10px] text-[var(--ds-sidebar-text)] font-medium tracking-[0.2em] uppercase">Dental Platform</p>
          </div>
        </Link>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Collapse button */}
        <button
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "hidden lg:flex items-center justify-center h-7 w-7 rounded-[var(--ds-radius-lg)] text-[var(--ds-sidebar-text)] hover:bg-[var(--ds-sidebar-hover)] hover:text-white transition-all duration-200",
            isExpanded ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          <ChevronLeft className={cn("h-3.5 w-3.5 transition-transform duration-300", collapsed && "rotate-180")} strokeWidth={2} />
        </button>
      </div>

      {/* ═══ HOSPITAL SWITCHER ═══ */}
      {hospitalName && (
        <div className={cn("shrink-0", isExpanded ? "px-3 pt-3" : "px-1.5 pt-3")}>
          <SidebarTooltip label={hospitalName} show={!isExpanded}>
            <button
              onClick={() => setHospitalMenuOpen(!hospitalMenuOpen)}
              className={cn(
                "flex items-center gap-2.5 w-full rounded-[var(--ds-radius-lg)] transition-colors text-left",
                isExpanded ? "px-2.5 py-2 hover:bg-[var(--ds-sidebar-hover)]" : "justify-center p-2 hover:bg-[var(--ds-sidebar-hover)]"
              )}
            >
              <Hospital className="h-4 w-4 shrink-0 text-[var(--ds-sidebar-icon)]" strokeWidth={1.5} />
              <div className={cn(
                "overflow-hidden transition-all duration-[var(--ds-transition-slow)]",
                isExpanded ? "max-w-36 opacity-100" : "max-w-0 opacity-0"
              )}>
                <p className="text-xs font-medium text-white truncate leading-tight">{hospitalName}</p>
                <p className="text-[10px] text-[var(--ds-sidebar-text)] truncate">Current Hospital</p>
              </div>
              {isExpanded && <ChevronDown className="h-3 w-3 shrink-0 text-[var(--ds-sidebar-text)] ml-auto" strokeWidth={1.5} />}
            </button>
          </SidebarTooltip>
        </div>
      )}

      {/* ═══ SEARCH ═══ */}
      {isExpanded && (
        <div className="px-3 pt-3 shrink-0">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2.5 w-full h-9 rounded-[var(--ds-radius-lg)] bg-[var(--ds-sidebar-surface)] border border-[var(--ds-sidebar-border)] px-3 text-left text-xs text-[var(--ds-sidebar-text)] hover:border-[var(--ds-accent)]/40 hover:bg-[var(--ds-sidebar-hover)] transition-all group"
          >
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--ds-sidebar-text)] group-hover:text-white transition-colors" strokeWidth={2} />
            <span className="flex-1">Search pages...</span>
            <kbd className="hidden sm:inline-flex h-4 items-center px-1.5 rounded-[var(--ds-radius-sm)] border border-[var(--ds-sidebar-border)] bg-[var(--ds-sidebar-bg)] text-[10px] font-medium text-[var(--ds-sidebar-text)] group-hover:border-[var(--ds-accent)]/30 transition-colors">⌘K</kbd>
          </button>
        </div>
      )}
      {/* Collapsed search button */}
      {!isExpanded && (
        <div className="px-1.5 pt-3 shrink-0">
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Search pages"
            className="flex items-center justify-center w-full h-9 rounded-[var(--ds-radius-lg)] text-[var(--ds-sidebar-text)] hover:bg-[var(--ds-sidebar-hover)] hover:text-white transition-all"
          >
            <Search className="h-[20px] w-[20px]" strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* ═══ FAVORITES ═══ */}
      {isExpanded && favoriteItems.length > 0 && !searchQuery && (
        <div className="pt-4 pb-1 shrink-0">
          <div className="px-5 pb-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-sidebar-text)] flex items-center gap-1.5">
              <Star className="h-3 w-3" strokeWidth={1.5} />
              Favorites
            </p>
          </div>
          <div className="px-2.5 space-y-[var(--ds-sidebar-item-gap)]">
            {favoriteItems.map((item) => (
              <NavItemInner
                key={item.path}
                item={item}
                isActive={isActive(item.path)}
                isExpanded={isExpanded}
                isFavorite={true}
                onToggleFavorite={(path, e) => { e.preventDefault(); e.stopPropagation(); favToggle(path) }}
                onClick={() => setMobileOpen(false)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ═══ RECENTLY OPENED ═══ */}
      {isExpanded && recentItems.length > 0 && !searchQuery && (
        <div className="pt-3 pb-1 shrink-0">
          <div className="px-5 pb-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-sidebar-text)] flex items-center gap-1.5">
              <History className="h-3 w-3" strokeWidth={1.5} />
              Recent
            </p>
          </div>
          <div className="px-2.5 space-y-[var(--ds-sidebar-item-gap)]">
            {recentItems.slice(0, 3).map((recent) => {
              const item = allItems.find((i) => i.path === recent.path)
              if (!item) return null
              return (
                <NavItemInner
                  key={recent.path}
                  item={item}
                  isActive={isActive(item.path)}
                  isExpanded={isExpanded}
                  isFavorite={favItems.includes(item.path)}
                  onToggleFavorite={(path, e) => { e.preventDefault(); e.stopPropagation(); favToggle(path) }}
                  onClick={() => setMobileOpen(false)}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ PRIMARY NAVIGATION ═══ */}
      <nav aria-label="Main navigation" className={cn(
        "flex-1 overflow-y-auto scrollbar-none",
        isExpanded ? "px-2.5 py-3" : "px-1.5 py-3"
      )}>
        {searchQuery && filteredItems.length === 0 && (
          <p className="px-2 text-xs text-[var(--ds-sidebar-text)] py-8 text-center">No pages found</p>
        )}

        {searchQuery && filteredItems.length > 0 && (
          <div className="space-y-[var(--ds-sidebar-item-gap)]">
            {filteredItems.slice(0, 10).map((item) => (
              <NavItemInner
                key={item.path}
                item={item}
                isActive={isActive(item.path)}
                isExpanded={true}
                isFavorite={favItems.includes(item.path)}
                onToggleFavorite={(path, e) => { e.preventDefault(); e.stopPropagation(); favToggle(path) }}
                onClick={() => { setSearchQuery(""); setMobileOpen(false) }}
              />
            ))}
          </div>
        )}

        {!searchQuery && groups.map((group, gi) => (
          <div key={group.label} className={cn(gi > 0 && "mt-[var(--ds-sidebar-section-gap)]")}>
            {/* Section header */}
            {isExpanded && (
              <div className="px-5 pb-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-sidebar-text)]">
                  {group.label}
                </p>
              </div>
            )}
            <div className="space-y-[var(--ds-sidebar-item-gap)]">
              {group.items.map((item) => (
                <NavItemInner
                  key={item.path}
                  item={item}
                  isActive={isActive(item.path)}
                  isExpanded={isExpanded}
                  isFavorite={favItems.includes(item.path)}
                  onToggleFavorite={(path, e) => { e.preventDefault(); e.stopPropagation(); favToggle(path) }}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ═══ FOOTER AREA ═══ */}
      <div className="border-t border-[var(--ds-sidebar-border)] p-2 space-y-0.5 shrink-0">
        {/* Theme toggle */}
        <div className={cn(isExpanded ? "px-2" : "flex justify-center")}>
          <button
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            className={cn(
              "flex items-center gap-3 w-full rounded-[var(--ds-radius-lg)] py-2 text-sm font-medium text-[var(--ds-sidebar-text)] hover:text-white hover:bg-[var(--ds-sidebar-hover)] transition-colors",
              isExpanded ? "px-2" : "justify-center p-2"
            )}
          >
            {theme === "light"
              ? <Moon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
              : <Sun className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
            }
            <span className={cn(
              "overflow-hidden transition-all duration-[var(--ds-transition-slow)] whitespace-nowrap",
              isExpanded ? "max-w-36 opacity-100" : "max-w-0 opacity-0"
            )}>
              {theme === "light" ? "Dark mode" : "Light mode"}
            </span>
          </button>
        </div>

        {/* User profile */}
        <div className={cn(isExpanded ? "px-2" : "flex justify-center")}>
          <Link
            to="/settings"
            className={cn(
              "flex items-center gap-3 w-full rounded-[var(--ds-radius-lg)] py-2 transition-colors hover:bg-[var(--ds-sidebar-hover)] group/user",
              isExpanded ? "px-2" : "justify-center p-2"
            )}
          >
            <Avatar className="h-7 w-7 shrink-0 ring-2 ring-[var(--ds-sidebar-border)] group-hover/user:ring-[var(--ds-accent)]/40 transition-all">
              <AvatarFallback className="bg-[var(--ds-accent)]/20 text-xs font-semibold text-[var(--ds-accent)]">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className={cn(
              "overflow-hidden transition-all duration-[var(--ds-transition-slow)]",
              isExpanded ? "max-w-36 opacity-100" : "max-w-0 opacity-0"
            )}>
              <p className="text-sm font-medium text-white truncate leading-tight">{user?.full_name ?? "User"}</p>
              <p className="text-[11px] text-[var(--ds-sidebar-text)] truncate capitalize">
                {user?.role?.replace(/_/g, " ").toLowerCase() ?? ""}
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDER: DESKTOP + TABLET + MOBILE
     ═══════════════════════════════════════════════════════════════════════════ */

  return (
    <>
      {/* ─── DESKTOP SIDEBAR ─── */}
      <aside
        aria-label="Sidebar"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "hidden lg:flex flex-col shrink-0 overflow-hidden bg-[var(--ds-sidebar-bg)] transition-all duration-[var(--ds-transition-slow)] ease-out will-change-transform",
          collapsed && !hovered ? "w-[var(--ds-sidebar-collapsed-width)]" : "w-[var(--ds-sidebar-width)]"
        )}
      >
        <div className="h-full overflow-hidden">{sidebarContent}</div>
      </aside>

      {/* ─── TABLET ICON ONLY ─── */}
      <aside aria-label="Sidebar" className="hidden md:flex lg:hidden flex-col shrink-0 w-[72px] overflow-hidden bg-[var(--ds-sidebar-bg)]">
        <div className="flex h-full flex-col bg-[var(--ds-sidebar-bg)]">
          <div className="flex h-[var(--ds-sidebar-brand-h)] items-center justify-center border-b border-[var(--ds-sidebar-border)]">
            <div className="flex items-center justify-center w-8 h-8 rounded-[var(--ds-radius-lg)] bg-[var(--ds-accent)]">
              <svg width="18" height="18" viewBox="0 0 56 56" fill="none" aria-hidden="true">
                <path d="M28 14c-4.5 0-7.8 2.6-9 6.8-1 3.4-1.5 7.6-1.5 11.2s.5 7 1.4 8.8c.7 1.4 1.8 2.4 3.2 2.9 1.1.4 2.1 1 2.8 1.7l.7.8c.6.7 1.7.7 2.3 0l.7-.8c.7-.7 1.7-1.3 2.8-1.7 1.4-.5 2.5-1.5 3.2-2.9.9-1.8 1.4-5.2 1.4-8.8s-.5-7.8-1.5-11.2C35.8 16.6 32.5 14 28 14z" fill="white" opacity="0.96" />
              </svg>
            </div>
          </div>
          <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-1.5 py-3 scrollbar-none space-y-1">
            {groups.map((group) =>
              group.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.path)
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-center rounded-[var(--ds-radius-lg)] p-2.5 transition-all duration-150 relative",
                      active
                        ? "bg-[var(--ds-sidebar-active-bg)] text-[var(--ds-sidebar-icon-active)]"
                        : "text-[var(--ds-sidebar-icon)] hover:bg-[var(--ds-sidebar-hover)] hover:text-white"
                    )}
                    title={item.label}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--ds-sidebar-active-indicator)]" />
                    )}
                    <Icon className="h-[20px] w-[20px]" strokeWidth={1.5} />
                  </Link>
                )
              })
            )}
            <div className="pt-2 border-t border-[var(--ds-sidebar-border)] mt-2">
              <button
                onClick={() => setSearchOpen(true)}
                aria-label="Search pages"
                className="flex items-center justify-center w-full rounded-[var(--ds-radius-lg)] p-2.5 text-[var(--ds-sidebar-icon)] hover:bg-[var(--ds-sidebar-hover)] hover:text-white transition-all"
              >
                <Search className="h-[20px] w-[20px]" strokeWidth={1.5} />
              </button>
            </div>
            <div className="pt-1">
              <button
                onClick={toggleTheme}
                aria-label="Toggle theme"
                className="flex items-center justify-center w-full rounded-[var(--ds-radius-lg)] p-2.5 text-[var(--ds-sidebar-icon)] hover:bg-[var(--ds-sidebar-hover)] hover:text-white transition-all"
              >
                {theme === "light" ? <Moon className="h-[20px] w-[20px]" strokeWidth={1.5} /> : <Sun className="h-[20px] w-[20px]" strokeWidth={1.5} />}
              </button>
            </div>
          </nav>
          <div className="border-t border-[var(--ds-sidebar-border)] p-2 flex justify-center">
            <Avatar className="h-8 w-8 shrink-0 ring-2 ring-[var(--ds-sidebar-border)]">
              <AvatarFallback className="bg-[var(--ds-accent)]/20 text-xs font-semibold text-[var(--ds-accent)]">{initials}</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </aside>

      {/* ─── MOBILE OVERLAY DRAWER ─── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[var(--ds-z-overlay)] bg-black/60 md:hidden"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="Mobile navigation"
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              className="fixed inset-y-0 left-0 z-[var(--ds-z-sidebar)] w-[var(--ds-sidebar-width)] shadow-xl"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ─── MOBILE BOTTOM NAV ─── */}
      <nav className="fixed bottom-0 left-0 right-0 z-[var(--ds-z-sticky)] flex h-14 items-center justify-around border-t border-[var(--ds-sidebar-border)] bg-[var(--ds-sidebar-bg)] md:hidden safe-area-bottom">
        {allItems.slice(0, 5).map((item) => {
          const Icon = item.icon
          const active = isActive(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 min-w-[56px] py-1 px-2 transition-colors",
                active ? "text-[var(--ds-accent)]" : "text-[var(--ds-sidebar-text)] hover:text-white"
              )}
            >
              <Icon className="h-[20px] w-[20px]" strokeWidth={1.5} />
              <span className="text-[10px] font-medium leading-tight text-center truncate w-full">{item.label}</span>
            </Link>
          )
        })}
        <button
          onClick={() => setBottomNavOpen(!bottomNavOpen)}
          aria-label="More navigation"
          aria-expanded={bottomNavOpen}
          className="flex flex-col items-center justify-center gap-0.5 min-w-[56px] py-1 px-2 text-[var(--ds-sidebar-text)] hover:text-white"
        >
          <Menu className="h-[20px] w-[20px]" strokeWidth={1.5} />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>

      {/* ─── MOBILE BOTTOM SHEET ─── */}
      <AnimatePresence>
        {bottomNavOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[var(--ds-z-overlay)] bg-black/50 md:hidden"
              onClick={() => setBottomNavOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="More navigation"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-[var(--ds-z-sidebar)] rounded-t-2xl bg-[var(--ds-sidebar-surface)] pb-8 shadow-[0_-4px_20px_rgba(0,0,0,0.2)] md:hidden safe-area-bottom"
            >
              <div className="mx-auto my-3 h-1 w-10 rounded-full bg-[var(--ds-sidebar-border)]" />
              <div className="grid grid-cols-4 gap-1 px-4">
                {allItems.slice(5).map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.path)
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setBottomNavOpen(false)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1 rounded-xl p-3 transition-colors",
                        active ? "bg-[var(--ds-sidebar-active-bg)] text-[var(--ds-accent)]" : "text-[var(--ds-sidebar-text)] hover:bg-[var(--ds-sidebar-hover)]"
                      )}
                    >
                      <Icon className="h-[20px] w-[20px]" strokeWidth={1.5} />
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
