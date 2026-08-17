import type { ReactNode } from "react"
import {
  AlertTriangle,
  WifiOff,
  ShieldAlert,
  ServerCrash,
  Clock,
  SearchX,
  RefreshCw,
  ArrowLeft,
  LifeBuoy,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"

/**
 * The seven error situations the product recognises. Every failed request,
 * guard rejection and unmatched route maps to exactly one of these so users
 * see the same language for the same problem everywhere.
 */
export type ErrorKind =
  | "network"
  | "permission"
  | "server"
  | "session"
  | "not-found"
  | "validation"
  | "unknown"

interface ErrorPreset {
  icon: React.ElementType
  title: string
  /** WHY it happened, in operator language — never a stack trace. */
  reason: string
  /** What the user can actually do about it. */
  recovery: string
  retryable: boolean
  supportable: boolean
}

const PRESETS: Record<ErrorKind, ErrorPreset> = {
  network: {
    icon: WifiOff,
    title: "Connection problem",
    reason: "We couldn't reach the Appointin server. Your network may be offline or unstable.",
    recovery: "Check your internet connection, then retry. Any unsaved work is kept on this device until you leave the page.",
    retryable: true,
    supportable: false,
  },
  permission: {
    icon: ShieldAlert,
    title: "You don't have access to this",
    reason: "Your role doesn't include permission for this area or action.",
    recovery: "If you believe you need access, ask your hospital administrator to update your role.",
    retryable: false,
    supportable: true,
  },
  server: {
    icon: ServerCrash,
    title: "Something went wrong on our side",
    reason: "The server hit an unexpected problem while handling your request. Your data has not been changed.",
    recovery: "Retry in a moment. If it keeps happening, contact support — the incident has been logged.",
    retryable: true,
    supportable: true,
  },
  session: {
    icon: Clock,
    title: "Your session has expired",
    reason: "You were signed out after a period of inactivity to protect patient data.",
    recovery: "Sign in again to continue where you left off.",
    retryable: false,
    supportable: false,
  },
  "not-found": {
    icon: SearchX,
    title: "Page not found",
    reason: "This page doesn't exist, or the record it pointed to has been moved or deleted.",
    recovery: "Check the link, or head back to your dashboard.",
    retryable: false,
    supportable: false,
  },
  validation: {
    icon: AlertTriangle,
    title: "Some information needs attention",
    reason: "One or more fields contain values that can't be saved.",
    recovery: "Review the highlighted fields below and try again.",
    retryable: false,
    supportable: false,
  },
  unknown: {
    icon: AlertTriangle,
    title: "Something went wrong",
    reason: "An unexpected error occurred in the application.",
    recovery: "Retry, or reload the page. If it keeps happening, contact support.",
    retryable: true,
    supportable: true,
  },
}

export interface ErrorStateProps {
  kind?: ErrorKind
  /** Overrides the preset headline. */
  title?: string
  /** Overrides the preset reason line. */
  description?: string
  onRetry?: () => void
  retryLabel?: string
  /** Secondary escape hatch — usually navigation ("Back to dashboard"). */
  onBack?: () => void
  backLabel?: string
  /** Extra content (e.g. field-level validation list). */
  children?: ReactNode
  className?: string
  /** `page` centres in the full content area; `section` fits inside a card. */
  size?: "page" | "section"
}

/**
 * The single error treatment for the product.
 *
 * Announced via `role="alert"` so assistive tech reports the failure without
 * the user having to hunt for it. Deliberately never renders exception text —
 * raw messages leak stack frames, SQL and internal hostnames into a clinical
 * UI.
 */
export function ErrorState({
  kind = "unknown",
  title,
  description,
  onRetry,
  retryLabel = "Try again",
  onBack,
  backLabel = "Back to dashboard",
  children,
  className,
  size = "page",
}: ErrorStateProps) {
  const preset = PRESETS[kind]
  const Icon = preset.icon
  const showRetry = onRetry && (preset.retryable || retryLabel !== "Try again")

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center px-[var(--ds-spacing-6)] text-center",
        size === "page" ? "min-h-[50vh] py-[var(--ds-spacing-16)]" : "py-[var(--ds-spacing-10)]",
        className
      )}
    >
      <div className="mb-[var(--ds-spacing-4)] flex h-14 w-14 items-center justify-center rounded-[var(--ds-radius-2xl)] bg-[var(--ds-danger-subtle)]">
        <Icon className="h-7 w-7 text-[var(--ds-danger)]" strokeWidth={1.5} aria-hidden="true" />
      </div>

      <h2 className={cn("text-[var(--ds-text)]", size === "page" ? "ds-section-title" : "ds-card-title")}>
        {title ?? preset.title}
      </h2>

      <p className="ds-secondary-text mt-[var(--ds-spacing-2)] max-w-md">
        {description ?? preset.reason}
      </p>

      <p className="ds-caption mt-[var(--ds-spacing-1)] max-w-md">{preset.recovery}</p>

      {children && <div className="mt-[var(--ds-spacing-4)] w-full max-w-md text-left">{children}</div>}

      <div className="ds-cluster mt-[var(--ds-spacing-6)] justify-center">
        {showRetry && (
          <Button onClick={onRetry} variant="primary">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {retryLabel}
          </Button>
        )}
        {onBack && (
          <Button onClick={onBack} variant={showRetry ? "outline" : "primary"}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {backLabel}
          </Button>
        )}
        {preset.supportable && (
          <Button asChild variant="ghost">
            <a href="mailto:support@appointin.com?subject=Appointin%20support%20request">
              <LifeBuoy className="h-4 w-4" aria-hidden="true" />
              Contact support
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Maps a failed HTTP response to the matching ErrorKind so every data screen
 * classifies failures identically instead of inventing its own copy.
 */
export function errorKindFromStatus(status?: number): ErrorKind {
  if (status === undefined) return "network"
  if (status === 401) return "session"
  if (status === 403) return "permission"
  if (status === 404) return "not-found"
  if (status === 422 || status === 400) return "validation"
  if (status >= 500) return "server"
  return "unknown"
}
