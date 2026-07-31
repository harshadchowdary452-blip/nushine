"use client"

import { useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useLocation, useNavigate } from "react-router-dom"
import { Plus, UserPlus, CalendarPlus, FilePlus2, ClipboardPlus, Receipt, UserRoundPlus } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useFixedPosition, useOverlayDismiss, resolveOverlayLayer } from "@/lib/overlay"
import { Button } from "@/components/ui/button"

interface QuickAction {
  label: string
  icon: React.ElementType
  to: string
  description?: string
}

interface ModuleActions {
  module: string
  actions: QuickAction[]
}

const registry: ModuleActions[] = [
  {
    module: "Patients",
    actions: [
      { label: "Add Patient", icon: UserPlus, to: "/patients?create=1", description: "Register a new patient" },
      { label: "Browse Patients", icon: UserRoundPlus, to: "/patients", description: "Open patient directory" },
    ],
  },
  {
    module: "Appointments",
    actions: [
      { label: "New Appointment", icon: CalendarPlus, to: "/appointments?create=1", description: "Book an appointment" },
      { label: "Browse Appointments", icon: CalendarPlus, to: "/appointments", description: "Open appointment list" },
    ],
  },
  {
    module: "Leads",
    actions: [
      { label: "New Lead", icon: ClipboardPlus, to: "/leads?create=1", description: "Capture a new lead" },
      { label: "Browse Leads", icon: ClipboardPlus, to: "/leads", description: "Open lead pipeline" },
    ],
  },
  {
    module: "Cases",
    actions: [
      { label: "New Case", icon: FilePlus2, to: "/cases?create=1", description: "Create a new case" },
      { label: "Browse Cases", icon: FilePlus2, to: "/cases", description: "Open case list" },
    ],
  },
  {
    module: "Billing",
    actions: [
      { label: "New Invoice", icon: Receipt, to: "/billing?create=1", description: "Raise an invoice" },
      { label: "Browse Billing", icon: Receipt, to: "/billing", description: "Open billing history" },
    ],
  },
  {
    module: "Treatments",
    actions: [
      { label: "New Treatment", icon: Plus, to: "/treatments", description: "Plan a treatment" },
      { label: "Workflow Board", icon: Plus, to: "/treatments/workflow", description: "Review treatment workflow" },
    ],
  },
]

function matchModule(pathname: string): ModuleActions {
  const bases = registry.map((m) => ({ m, base: m.actions[0].to.split("?")[0].replace(/\/$/, "") }))
  let best: ModuleActions | null = null
  let bestLen = -1
  for (const { m, base } of bases) {
    if (pathname.startsWith(base) && base.length > bestLen) {
      best = m
      bestLen = base.length
    }
  }
  // Dashboard fallback
  return best || { module: "Patients", actions: registry[0].actions }
}

export default function QuickActions() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const { position } = useFixedPosition(open, triggerRef)
  useOverlayDismiss(open, () => setOpen(false), triggerRef, popupRef)
  const layer = resolveOverlayLayer(triggerRef.current)

  const module = matchModule(pathname)
  const primary = module.actions[0]

  const run = (action: QuickAction) => {
    setOpen(false)
    navigate(action.to)
  }

  return (
    <div className="relative flex items-center">
      <Button
        ref={triggerRef}
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="h-8 gap-1.5 px-2.5 text-xs font-semibold shadow-sm"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        <span className="hidden sm:inline">{primary.label}</span>
      </Button>
      {open &&
        createPortal(
          <motion.div
            ref={popupRef}
            role="menu"
            aria-label="Quick actions"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.12 }}
              style={position ? { top: position.top, right: "auto", left: position.left } : undefined}
              className={cn("fixed w-64 rounded-[var(--ds-radius-xl)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-1.5 shadow-[var(--ds-shadow-dropdown)]", layer)}
            >
              <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-tertiary)]">
                {module.module} Actions
              </p>
              <div className="pt-0.5">
                {module.actions.map((a) => {
                  const Icon = a.icon
                  return (
                    <button
                      key={a.label}
                      role="menuitem"
                      onClick={() => run(a)}
                      className="flex w-full items-center gap-3 rounded-[var(--ds-radius-lg)] px-3 py-2.5 text-left text-sm text-[var(--ds-text-secondary)] transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[var(--ds-primary-subtle)] text-[var(--ds-primary)]">
                        <Icon className="h-4 w-4" strokeWidth={1.5} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-[var(--ds-text)]">{a.label}</span>
                        {a.description && (
                          <span className="block truncate text-[11px] text-[var(--ds-text-tertiary)]">{a.description}</span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </motion.div>,
            document.body
          )}
    </div>
  )
}
