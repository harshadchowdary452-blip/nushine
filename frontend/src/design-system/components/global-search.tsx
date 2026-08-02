"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Search, Command, History, ArrowRight, User, CalendarClock, FolderOpen, PhoneCall, Loader2, UserPlus, CalendarPlus, FolderPlus, ClipboardPlus, ClipboardList, Receipt, ListChecks, CalendarDays, Stethoscope, Building2, MessageSquare, ListTodo } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useAuthStore } from "@/store/authStore"
import { useSearchStore } from "@/store/searchStore"
import { useRecentItemsStore } from "@/store/recentItemsStore"
import { patientsApi, appointmentsApi, casesApi, leadsApi, treatmentApi, doctorsApi, hospitalsApi, billingApi } from "@/services/endpoints"
import type { Patient, Appointment, Case, Lead } from "@/types"

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

const RECENTS_KEY = "global-search-recents"
const MAX_RECENTS = 5

const ALL_ROLES = ["SUPER_ADMIN", "GROUP_ADMIN", "HOSPITAL_ADMIN", "DOCTOR"]
const LEAD_ROLES = ["SUPER_ADMIN", "GROUP_ADMIN", "HOSPITAL_ADMIN"]

interface QuickActionDef {
  title: string
  subtitle: string
  path: string
  icon: React.ElementType
  keywords: string[]
  roles?: string[]
}

const QUICK_ACTIONS: QuickActionDef[] = [
  { title: "Create Patient", subtitle: "Register a new patient", path: "/patients", icon: UserPlus, keywords: ["new", "add", "register", "create"] },
  { title: "New Appointment", subtitle: "Book an appointment", path: "/appointments", icon: CalendarPlus, keywords: ["book", "schedule", "create"] },
  { title: "New Case", subtitle: "Open a patient case", path: "/cases", icon: FolderPlus, keywords: ["create", "open case"] },
  { title: "New Treatment", subtitle: "Create a treatment plan", path: "/treatments", icon: ClipboardPlus, keywords: ["plan", "procedure", "create"] },
  { title: "Create Invoice", subtitle: "Generate a bill / invoice", path: "/billing", icon: Receipt, keywords: ["bill", "payment", "charge"] },
  { title: "New Lead", subtitle: "Capture an enquiry", path: "/leads", icon: PhoneCall, keywords: ["enquiry", "add lead"], roles: LEAD_ROLES },
  { title: "Convert Lead", subtitle: "Convert an enquiry to a patient", path: "/leads", icon: UserPlus, keywords: ["convert", "enquiry"], roles: LEAD_ROLES },
  { title: "Open CRM", subtitle: "Leads, follow-ups & campaigns", path: "/crm/dashboard2", icon: MessageSquare, keywords: ["crm", "marketing", "campaign"], roles: LEAD_ROLES },
  { title: "Open Billing", subtitle: "Invoices & payments", path: "/billing", icon: Receipt, keywords: ["billing", "invoice", "payment"] },
  { title: "Open Calendar", subtitle: "Appointments schedule", path: "/appointments", icon: CalendarClock, keywords: ["calendar", "schedule", "appointments"] },
  { title: "Open Reports", subtitle: "Export center & reports", path: "/exports", icon: ListTodo, keywords: ["reports", "exports", "download"], roles: LEAD_ROLES },
  { title: "Open Task Center", subtitle: "Today, overdue & upcoming tasks", path: "/tasks", icon: ListChecks, keywords: ["tasks", "todo", "reminders"] },
  { title: "Set Availability", subtitle: "Update doctor schedule", path: "/doctors/availability", icon: CalendarDays, keywords: ["schedule", "slots", "off days"], roles: ["DOCTOR"] },
]

interface SearchResult {
  id: string
  section: "Quick Actions" | "Recent" | "Pages" | "Patients" | "Appointments" | "Cases" | "Leads" | "Treatments" | "Doctors" | "Hospitals" | "Invoices"
  title: string
  subtitle?: string
  path: string
  icon: React.ElementType
  keywords?: string[]
}

function iconForKind(kind: string): React.ElementType {
  switch (kind) {
    case "patient": return User
    case "appointment": return CalendarClock
    case "case": return FolderOpen
    case "treatment": return ClipboardPlus
    case "billing": return Receipt
    case "lead": return PhoneCall
    default: return History
  }
}

function loadRecents(): { title: string; path: string }[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]")
  } catch {
    return []
  }
}

function saveRecent(item: { title: string; path: string }) {
  const next = [item, ...loadRecents().filter((r) => r.path !== item.path)].slice(0, MAX_RECENTS)
  localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
}

function matchQuery(query: string, text: string, keywords?: string[]): boolean {
  const q = query.toLowerCase()
  if (!q) return true
  if (text.toLowerCase().includes(q)) return true
  return keywords?.some((k) => k.toLowerCase().includes(q)) ?? false
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) {
    return <>{text}</>
  }
  const lower = text.toLowerCase()
  const ql = q.toLowerCase()
  const idx = lower.indexOf(ql)
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-[3px] bg-[var(--ds-primary-subtle)] px-0.5 text-[var(--ds-primary)]">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  )
}

export default function GlobalSearch() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [recents, setRecents] = useState<{ title: string; path: string }[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { open, setOpen } = useSearchStore()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const role = user?.role || "DOCTOR"
  const pages = roleNav[role] || roleNav.DOCTOR
  const recentStoreItems = useRecentItemsStore((s) => s.items)

  const quickActions = useMemo<SearchResult[]>(() => {
    return QUICK_ACTIONS
      .filter((d) => (d.roles ?? ALL_ROLES).includes(role))
      .filter((d) => matchQuery(query, d.title, d.keywords))
      .map((d) => ({
        id: `action-${d.title}`,
        section: "Quick Actions" as const,
        title: d.title,
        subtitle: d.subtitle,
        path: d.path,
        icon: d.icon,
        keywords: d.keywords,
      }))
  }, [role, query])

  const recentResults = useMemo<SearchResult[]>(() => {
    const seen = new Set<string>()
    const out: SearchResult[] = []
    const push = (path: string, title: string, subtitle: string | undefined, icon: React.ElementType) => {
      if (!path || seen.has(path)) return
      seen.add(path)
      out.push({ id: `recent-${path}`, section: "Recent" as const, title, subtitle, path, icon })
    }
    for (const item of recentStoreItems) {
      push(item.path, item.title, item.subtitle || undefined, iconForKind(item.kind))
    }
    for (const r of recents) {
      push(r.path, r.title, r.path, History)
    }
    return out
  }, [recentStoreItems, recents])

  const buildPageResults = useCallback((): SearchResult[] =>
    pages
      .filter((p) => matchQuery(query, p.label, p.keywords))
      .map((p) => ({
        id: `page-${p.path}`,
        section: "Pages" as const,
        title: p.label,
        subtitle: p.path,
        path: p.path,
        icon: Command,
        keywords: p.keywords,
      })), [pages, query])

  const fetchContent = useCallback(async (q: string): Promise<SearchResult[]> => {
    const opts = { page_size: 4, search: q }
    const [p, a, c, l, t, d, h, b] = await Promise.all([
      patientsApi.search(opts).catch(() => ({ items: [] as Patient[] })),
      appointmentsApi.list(opts).catch(() => ({ items: [] as Appointment[] })),
      casesApi.list(opts).catch(() => ({ items: [] as Case[] })),
      leadsApi.list(opts).catch(() => ({ items: [] as Lead[] })),
      treatmentApi.list({ limit: 4, search: q }).catch(() => ({ items: [] })),
      doctorsApi.list({ limit: 4, search: q }).catch(() => ({ items: [] })),
      hospitalsApi.list({ limit: 4, search: q }).catch(() => ({ items: [] })),
      billingApi.list({ page_size: 4, search: q }).catch(() => ({ items: [] })),
    ])
    const out: SearchResult[] = []
    for (const patient of p?.items ?? []) {
      const name = patient.patient_name || patient.full_name
      if (!matchQuery(q, name || "", [patient.phone || "", patient.op_no || ""])) continue
      out.push({
        id: `patient-${patient.id}`,
        section: "Patients",
        title: name || "Unnamed patient",
        subtitle: [patient.phone, patient.op_no].filter(Boolean).join(" · ") || undefined,
        path: `/patients/${patient.id}`,
        icon: User,
      })
    }
    for (const appt of a?.items ?? []) {
      if (!matchQuery(q, appt.patient_name || "", [appt.doctor_name || "", appt.appointment_number || ""])) continue
      out.push({
        id: `appt-${appt.id}`,
        section: "Appointments",
        title: appt.patient_name || "Appointment",
        subtitle: appt.doctor_name ? `with ${appt.doctor_name} · ${appt.appointment_date}` : appt.appointment_date,
        path: `/appointments/${appt.id}`,
        icon: CalendarClock,
      })
    }
    for (const caseItem of c?.items ?? []) {
      if (!matchQuery(q, caseItem.patient_name || "", [caseItem.case_number || "", caseItem.chief_complaint || ""])) continue
      out.push({
        id: `case-${caseItem.id}`,
        section: "Cases",
        title: caseItem.patient_name || "Case",
        subtitle: [caseItem.case_number, caseItem.chief_complaint].filter(Boolean).join(" · ") || undefined,
        path: `/cases/${caseItem.id}`,
        icon: FolderOpen,
      })
    }
    for (const lead of l?.items ?? []) {
      if (!matchQuery(q, lead.lead_name || "", [lead.mobile || "", lead.interested_treatment || ""])) continue
      out.push({
        id: `lead-${lead.id}`,
        section: "Leads",
        title: lead.lead_name || "Lead",
        subtitle: lead.mobile || lead.interested_treatment || undefined,
        path: `/leads/${lead.id}`,
        icon: PhoneCall,
      })
    }
    for (const plan of t?.items ?? []) {
      const name = plan.treatment_name || "Treatment"
      if (!matchQuery(q, name, [plan.patient_name || "", plan.treatment_number || ""])) continue
      out.push({
        id: `treatment-${plan.id}`,
        section: "Treatments",
        title: name,
        subtitle: [plan.patient_name, plan.treatment_number].filter(Boolean).join(" · ") || undefined,
        path: `/treatments/${plan.id}`,
        icon: ClipboardList,
      })
    }
    for (const doc of d?.items ?? []) {
      const name = doc.full_name || doc.name || "Doctor"
      if (!matchQuery(q, name, [doc.specialization || "", doc.email || ""])) continue
      out.push({
        id: `doctor-${doc.id}`,
        section: "Doctors",
        title: name,
        subtitle: doc.specialization || doc.email || undefined,
        path: "/admin/doctors",
        icon: Stethoscope,
      })
    }
    for (const hospital of h?.items ?? []) {
      if (!matchQuery(q, hospital.name || "", [])) continue
      out.push({
        id: `hospital-${hospital.id}`,
        section: "Hospitals",
        title: hospital.name || "Hospital",
        subtitle: "Hospital",
        path: "/admin/hospitals",
        icon: Building2,
      })
    }
    for (const billing of b?.items ?? []) {
      const title = billing.invoice_number ? `Invoice ${billing.invoice_number}` : "Invoice"
      if (!matchQuery(q, title, [billing.patient_name || "", billing.invoice_number || ""])) continue
      out.push({
        id: `billing-${billing.id}`,
        section: "Invoices",
        title,
        subtitle: billing.patient_name || undefined,
        path: `/billing/${billing.id}`,
        icon: Receipt,
      })
    }
    return out
  }, [])

  const debouncedQuery = query.trim()
  // Guards against a stale response overwriting newer results when the user
  // types faster than the 250ms debounce (prevents out-of-order flicker).
  const fetchGen = useRef(0)

  useEffect(() => {
    const gen = ++fetchGen.current
    if (!debouncedQuery || !open) {
      setResults([...quickActions, ...recentResults, ...buildPageResults()])
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      const content = await fetchContent(debouncedQuery)
      if (gen !== fetchGen.current) return
      setResults([...content, ...quickActions, ...buildPageResults()])
      setLoading(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [debouncedQuery, fetchContent, buildPageResults, quickActions, recentResults, open])

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
      setRecents(loadRecents())
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery("")
      setSelectedIndex(0)
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query, results.length])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  const handleSelect = useCallback((r: SearchResult) => {
    saveRecent({ title: r.title, path: r.path })
    setOpen(false)
    navigate(r.path)
  }, [navigate, setOpen])

  const grouped = useMemo(() => {
    const order: SearchResult["section"][] = [
      "Quick Actions", "Recent", "Pages",
      "Patients", "Appointments", "Cases", "Treatments", "Invoices", "Leads", "Doctors", "Hospitals",
    ]
    let flatIndex = 0
    const out: { section: SearchResult["section"]; items: { item: SearchResult; flatIndex: number }[] }[] = []
    for (const section of order) {
      const items = results.filter((r) => r.section === section)
      if (items.length === 0) continue
      out.push({ section, items: items.map((item) => ({ item, flatIndex: flatIndex++ })) })
    }
    return out
  }, [results])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, results.length - 1)) }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)) }
    if (e.key === "Enter" && results[selectedIndex]) { handleSelect(results[selectedIndex]) }
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
            className="fixed left-1/2 top-[12%] z-[var(--ds-z-dialog)] w-full max-w-lg -translate-x-1/2"
            role="dialog"
            aria-modal="true"
            aria-label="Global search"
          >
            <div className="overflow-hidden rounded-[var(--ds-radius-2xl)] border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] shadow-[var(--ds-shadow-dialog)]">
              <div className="flex items-center gap-3 border-b border-[var(--ds-border)] px-4 py-3.5">
                <Search className="h-5 w-5 shrink-0 text-[var(--ds-text-tertiary)]" strokeWidth={1.5} />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search patients, doctors, invoices, pages…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKey}
                  aria-label="Search query"
                  className="flex-1 bg-transparent text-sm text-[var(--ds-text)] outline-none placeholder:text-[var(--ds-text-tertiary)]"
                />
                {loading ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--ds-text-tertiary)]" />
                ) : (
                  <kbd className="hidden h-5 items-center rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] px-1.5 text-[10px] font-medium text-[var(--ds-text-tertiary)] sm:inline-flex">ESC</kbd>
                )}
              </div>
              <div ref={listRef} className="max-h-[min(420px,60vh)] overflow-y-auto py-1.5" aria-live="polite">
                {grouped.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-[var(--ds-text-tertiary)]">
                    {loading ? "Searching…" : "No results found"}
                  </p>
                ) : (
                  grouped.map((group) => (
                    <div key={group.section}>
                      <p className="px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-tertiary)]">
                        {group.section}
                        <span className="ml-1.5 font-normal text-[var(--ds-text-tertiary)]/70">{group.items.length}</span>
                      </p>
                      {group.items.map(({ item, flatIndex }) => {
                        const Icon = item.icon
                        const selected = flatIndex === selectedIndex
                        return (
                          <button
                            key={item.id}
                            data-index={flatIndex}
                            onClick={() => handleSelect(item)}
                            onMouseEnter={() => setSelectedIndex(flatIndex)}
                            className={cn(
                              "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                              selected ? "bg-[var(--ds-primary-subtle)] text-[var(--ds-text)]" : "text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-hover)]"
                            )}
                          >
                            <span className={cn(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ds-radius-lg)]",
                              selected ? "bg-[var(--ds-primary-light)] text-[var(--ds-primary)]" : "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-tertiary)]"
                            )}>
                              <Icon className="h-4 w-4" strokeWidth={1.5} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-[var(--ds-text)]">
                                <Highlight text={item.title} query={query} />
                              </span>
                              {item.subtitle && (
                                <span className="block truncate text-[11px] text-[var(--ds-text-tertiary)]">
                                  <Highlight text={item.subtitle} query={query} />
                                </span>
                              )}
                            </span>
                            {item.section === "Recent" && <History className="h-3.5 w-3.5 shrink-0 text-[var(--ds-text-tertiary)]" strokeWidth={1.5} />}
                            <ArrowRight className={cn("h-3.5 w-3.5 shrink-0 text-[var(--ds-text-tertiary)] transition-opacity", selected ? "opacity-100" : "opacity-0")} strokeWidth={1.5} />
                          </button>
                        )
                      })}
                    </div>
                  ))
                )}
              </div>
              <div className="hidden items-center gap-3 border-t border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] px-4 py-1.5 text-[10px] text-[var(--ds-text-tertiary)] sm:flex">
                <span><kbd className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface)] px-1">↑</kbd><kbd className="ml-0.5 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface)] px-1">↓</kbd> navigate</span>
                <span><kbd className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface)] px-1">↵</kbd> open</span>
                <span className="ml-auto">Actions, records & {pages.length} modules</span>
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
