"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Search, Command } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useAuthStore } from "@/store/authStore"
import { useSearchStore } from "@/store/searchStore"

const roleNav: Record<string, { label: string; path: string; keywords?: string[] }[]> = {
  SUPER_ADMIN: [
    { label: "Dashboard", path: "/", keywords: ["overview", "home"] },
    { label: "Groups", path: "/admin/groups", keywords: ["groups", "organization"] },
    { label: "Hospitals", path: "/admin/hospitals", keywords: ["hospitals", "clinics"] },
    { label: "Doctors", path: "/admin/doctors", keywords: ["doctors", "physicians"] },
    { label: "Settings", path: "/settings", keywords: ["profile", "preferences"] },
  ],
  GROUP_ADMIN: [
    { label: "Dashboard", path: "/", keywords: ["overview", "home"] },
    { label: "Hospitals", path: "/admin/hospitals", keywords: ["hospitals", "clinics"] },
    { label: "Doctors", path: "/admin/doctors", keywords: ["doctors", "physicians"] },
    { label: "Workflow Board", path: "/treatments/workflow", keywords: ["workflow", "board"] },
    { label: "Expenses", path: "/admin/expenses", keywords: ["expenses", "cost"] },
    { label: "Settings", path: "/settings", keywords: ["profile", "preferences"] },
  ],
  HOSPITAL_ADMIN: [
    { label: "Dashboard", path: "/", keywords: ["overview", "home"] },
    { label: "Patients", path: "/patients", keywords: ["patients", "registrations"] },
    { label: "Appointments", path: "/appointments", keywords: ["appointments", "schedule"] },
    { label: "Cases", path: "/cases", keywords: ["cases", "reports"] },
    { label: "Treatments", path: "/treatments", keywords: ["treatments", "procedures"] },
    { label: "Billing", path: "/billing", keywords: ["billing", "invoices", "payments"] },
    { label: "CRM Dashboard", path: "/crm/dashboard2", keywords: ["crm", "leads", "marketing"] },
    { label: "Leads", path: "/leads", keywords: ["leads", "enquiries"] },
    { label: "Settings", path: "/settings", keywords: ["profile", "preferences"] },
    { label: "Clinical Settings", path: "/settings/clinical", keywords: ["clinical", "treatment types"] },
    { label: "CRM Settings", path: "/crm/settings", keywords: ["crm", "settings"] },
    { label: "Workflow Board", path: "/treatments/workflow", keywords: ["workflow", "board"] },
    { label: "Consent Forms", path: "/consent-forms", keywords: ["consent", "forms"] },
    { label: "Export Center", path: "/exports", keywords: ["exports", "download"] },
  ],
  DOCTOR: [
    { label: "Dashboard", path: "/", keywords: ["overview", "home"] },
    { label: "Availability", path: "/doctors/availability", keywords: ["availability", "schedule"] },
    { label: "Patients", path: "/patients", keywords: ["patients", "registrations"] },
    { label: "Appointments", path: "/appointments", keywords: ["appointments", "schedule"] },
    { label: "Cases", path: "/cases", keywords: ["cases", "reports"] },
    { label: "Treatments", path: "/treatments", keywords: ["treatments", "procedures"] },
    { label: "My Queue", path: "/treatments/queue", keywords: ["queue", "waiting"] },
    { label: "Billing", path: "/billing", keywords: ["billing", "invoices"] },
    { label: "Consent Forms", path: "/consent-forms", keywords: ["consent", "forms"] },
    { label: "Settings", path: "/settings", keywords: ["profile", "preferences"] },
  ],
}

export default function GlobalSearch() {
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { open, setOpen } = useSearchStore()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const role = user?.role || "DOCTOR"
  const items = roleNav[role] || roleNav.DOCTOR

  const filtered = query.trim()
    ? items.filter((item) => {
        const q = query.toLowerCase()
        return item.label.toLowerCase().includes(q) || item.path.toLowerCase().includes(q) || item.keywords?.some((k) => k.includes(q))
      })
    : items

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k" && !e.repeat) {
        e.preventDefault()
        setOpen(!open)
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [open, setOpen])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery("")
      setSelectedIndex(0)
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleSelect = useCallback((path: string) => {
    setOpen(false)
    navigate(path)
  }, [navigate, setOpen])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1)) }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)) }
    if (e.key === "Enter" && filtered[selectedIndex]) { handleSelect(filtered[selectedIndex].path) }
    if (e.key === "Escape") { setOpen(false) }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="fixed inset-0 z-[var(--ds-z-dialog)] bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.12 }}
            className="fixed left-1/2 top-[15%] -translate-x-1/2 z-[var(--ds-z-dialog)] w-full max-w-lg"
            role="dialog"
            aria-modal="true"
            aria-label="Search pages"
          >
            <div className="rounded-[var(--ds-radius-2xl)] border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] shadow-[var(--ds-shadow-dialog)] overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--ds-border)]">
                <Search className="h-5 w-5 text-[var(--ds-text-tertiary)] shrink-0" strokeWidth={1.5} />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search pages..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKey}
                  className="flex-1 bg-transparent text-sm text-[var(--ds-text)] outline-none placeholder:text-[var(--ds-text-tertiary)]"
                />
                <kbd className="hidden sm:inline-flex h-5 items-center px-1.5 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] text-[10px] font-medium text-[var(--ds-text-tertiary)]">ESC</kbd>
              </div>
              <div className="max-h-[280px] overflow-y-auto py-1.5">
                {filtered.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-[var(--ds-text-tertiary)]">No results found</p>
                ) : (
                  filtered.map((item, index) => (
                    <button key={item.path}
                      onClick={() => handleSelect(item.path)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors",
                        index === selectedIndex
                          ? "bg-[var(--ds-primary-subtle)] text-[var(--ds-text)]"
                          : "text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-hover)]"
                      )}>
                      <Command className="h-4 w-4 text-[var(--ds-text-tertiary)] shrink-0" strokeWidth={1.5} />
                      <span className="flex-1">{item.label}</span>
                      <span className="text-[11px] text-[var(--ds-text-tertiary)] font-mono">{item.path}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ")
}
