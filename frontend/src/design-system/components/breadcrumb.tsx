import { Link, useLocation } from "react-router-dom"
import { ChevronRight, Slash, Home } from "lucide-react"
import { cn } from "@/lib/utils"
import { routeLabels } from "./routeLabels"

// Path segment patterns for dynamic routes (e.g., /patients/123 → /patients/:id)
const dynamicSegments: { prefix: string; label: (id: string) => string }[] = [
  { prefix: "/patients/", label: (id) => `Patient ${id.slice(0, 8)}` },
  { prefix: "/appointments/", label: (id) => `Appointment ${id.slice(0, 8)}` },
  { prefix: "/treatments/", label: (id) => `Treatment ${id.slice(0, 8)}` },
  { prefix: "/cases/", label: (id) => `Case ${id.slice(0, 8)}` },
  { prefix: "/billing/", label: (id) => `Invoice ${id.slice(0, 8)}` },
  { prefix: "/leads/", label: (id) => `Lead ${id.slice(0, 8)}` },
  { prefix: "/whatsapp/", label: (id) => `Template ${id.slice(0, 8)}` },
  { prefix: "/consent-forms/view/", label: (id) => `Consent Form ${id.slice(0, 8)}` },
  { prefix: "/crm/", label: (id) => `CRM ${id.slice(0, 8)}` },
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

/**
 * Intelligent breadcrumb. The current (last) segment is styled as the page title
 * so the chrome header doubles as the location + page context without repeating
 * the content-area header. Dynamic entity routes render human labels, and long
 * labels truncate gracefully.
 */
export default function Breadcrumb({ className, variant = "compact" }: BreadcrumbProps) {
  const { pathname } = useLocation()
  const segments = buildSegments(pathname)

  if (segments.length <= 1) return null

  const isCompact = variant === "compact"

  return (
    <nav aria-label="Breadcrumb" className={cn("flex min-w-0 items-center", className)}>
      <ol className="flex min-w-0 items-center gap-1.5">
        {segments.map((seg, idx) => {
          const isLast = idx === segments.length - 1
          return (
            <li key={seg.path} className="flex min-w-0 items-center gap-1.5">
              {idx > 0 && (
                isCompact ? (
                  <Slash className="h-3 w-3 shrink-0 text-[var(--ds-text-tertiary)]" strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0 text-[var(--ds-text-tertiary)]" strokeWidth={1.5} aria-hidden="true" />
                )
              )}
              {isLast ? (
                <span
                  className={cn(
                    "ds-breadcrumb truncate font-semibold text-[var(--ds-text)]",
                    !isCompact && "text-[var(--ds-font-size-md)]"
                  )}
                  aria-current="page"
                  title={seg.label}
                >
                  {seg.label}
                </span>
              ) : (
                <Link
                  to={seg.path}
                  className={cn(
                    "ds-breadcrumb flex shrink-0 items-center gap-1.5 truncate rounded-[var(--ds-radius-sm)] text-[var(--ds-text-tertiary)] ds-transition-colors hover:text-[var(--ds-text-secondary)]",
                    !isCompact && "text-[var(--ds-font-size-sm)]"
                  )}
                >
                  {idx === 0 && <Home className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />}
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
