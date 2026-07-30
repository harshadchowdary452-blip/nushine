import { Link, useLocation } from "react-router-dom"
import { ChevronRight, Slash } from "lucide-react"
import { cn } from "@/lib/utils"
import { routeLabels } from "./routeLabels"
  "/": "Dashboard",
  "/patients": "Patients",
  "/patients/new": "New Patient",
  "/appointments": "Appointments",
  "/appointments/new": "New Appointment",
  "/treatments": "Treatments",
  "/treatments/new": "New Treatment",
  "/treatments/workflow": "Workflow Board",
  "/treatments/queue": "My Queue",
  "/cases": "Cases",
  "/cases/new": "New Case",
  "/billing": "Billing",
  "/billing/new": "New Invoice",
  "/consent-forms": "Consent Forms",
  "/doctors/availability": "Availability",
  "/leads": "Leads",
  "/crm/dashboard2": "CRM Dashboard",
  "/crm/enquiry-calendar": "Enquiry Calendar",
  "/crm/settings": "CRM Settings",
  "/whatsapp": "WhatsApp",
  "/whatsapp/templates": "WhatsApp Templates",
  "/admin/groups": "Groups",
  "/admin/hospitals": "Hospitals",
  "/admin/doctors": "Doctors",
  "/admin/expenses": "Expenses",
  "/admin/users": "Users",
  "/admin/roles": "Roles",
  "/reports": "Reports",
  "/analytics": "Analytics",
  "/exports": "Export Center",
  "/settings": "Settings",
  "/settings/clinical": "Clinical Settings",
  "/settings/whatsapp": "WhatsApp Config",
  "/settings/notifications": "Notification Settings",
  "/settings/security": "Security",
}

// Path segment patterns for dynamic routes (e.g., /patients/123 → /patients/:id)
const dynamicSegments: { prefix: string; label: (id: string) => string }[] = [
  { prefix: "/patients/", label: (id) => `Patient #${id.slice(0, 8)}` },
  { prefix: "/appointments/", label: (id) => `Appointment #${id.slice(0, 8)}` },
  { prefix: "/treatments/", label: (id) => `Treatment #${id.slice(0, 8)}` },
  { prefix: "/cases/", label: (id) => `Case #${id.slice(0, 8)}` },
  { prefix: "/billing/", label: (id) => `Invoice #${id.slice(0, 8)}` },
  { prefix: "/leads/", label: (id) => `Lead #${id.slice(0, 8)}` },
  { prefix: "/crm/leads/", label: (id) => `Lead #${id.slice(0, 8)}` },
  { prefix: "/whatsapp/", label: (id) => `Template #${id.slice(0, 8)}` },
]

function getLabel(path: string): string | null {
  const exact = routeLabels[path]
  if (exact) return exact
  for (const { prefix, label } of dynamicSegments) {
    if (path.startsWith(prefix) && path.length > prefix.length) {
      return label(path.slice(prefix.length))
    }
  }
  return null
}

function buildSegments(pathname: string): { path: string; label: string }[] {
  // Handle root
  if (pathname === "/") return [{ path: "/", label: "Dashboard" }]

  const parts = pathname.split("/").filter(Boolean)
  const segments: { path: string; label: string }[] = []

  // Build incremental paths
  for (let i = 0; i < parts.length; i++) {
    const partial = "/" + parts.slice(0, i + 1).join("/")
    const label = getLabel(partial)
    if (label) {
      segments.push({ path: partial, label })
    } else if (i === parts.length - 1) {
      // If last segment has no label, use humanized last segment
      const fallback = parts[i]
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
      segments.push({ path: partial, label: fallback })
    }
  }

  // If we only have one segment, prepend Dashboard
  if (segments.length === 1 && segments[0].path !== "/") {
    segments.unshift({ path: "/", label: "Dashboard" })
  }

  return segments
}

interface BreadcrumbProps {
  className?: string
  variant?: "default" | "compact"
}

export default function Breadcrumb({ className, variant = "default" }: BreadcrumbProps) {
  const { pathname } = useLocation()
  const segments = buildSegments(pathname)

  if (segments.length <= 1) return null

  const isCompact = variant === "compact"

  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center", className)}>
      <ol className="flex items-center gap-1">
        {segments.map((seg, idx) => {
          const isLast = idx === segments.length - 1
          return (
            <li key={seg.path} className="flex items-center gap-1">
              {idx > 0 && (
                isCompact ? (
                  <Slash className="h-3 w-3 text-[var(--ds-text-tertiary)]" strokeWidth={1.5} />
                ) : (
                  <ChevronRight className="h-3 w-3 text-[var(--ds-text-tertiary)]" strokeWidth={1.5} />
                )
              )}
              {isLast ? (
                <span
                  className={cn(
                    "truncate font-medium text-[var(--ds-text)]",
                    isCompact ? "text-xs" : "text-sm"
                  )}
                  aria-current="page"
                >
                  {seg.label}
                </span>
              ) : (
                <Link
                  to={seg.path}
                  className={cn(
                    "truncate text-[var(--ds-text-tertiary)] transition-colors hover:text-[var(--ds-text-secondary)]",
                    isCompact ? "text-xs" : "text-sm"
                  )}
                >
                  {seg.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
