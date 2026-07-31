import { useNavigate, useRouteError, isRouteErrorResponse } from "react-router-dom"
import { ErrorState, errorKindFromStatus } from "@/design-system"

/**
 * Router-level error boundary (React Router `errorElement`).
 *
 * Catches render errors and thrown responses from loaders/actions/lazy chunks
 * so a crash inside one route degrades to a recoverable screen instead of a
 * white page. Error details go to the console for engineers; the user sees
 * classified, actionable copy — never a stack trace.
 */
export default function RouteErrorPage() {
  const error = useRouteError()
  const navigate = useNavigate()

  // Log for diagnostics without surfacing internals in the UI.
  if (error) console.error("Route error:", error)

  const kind = isRouteErrorResponse(error) ? errorKindFromStatus(error.status) : "unknown"

  return (
    <div className="app-shell flex items-center justify-center bg-[var(--ds-background)] p-[var(--ds-spacing-6)]">
      <ErrorState
        kind={kind}
        onRetry={() => window.location.reload()}
        retryLabel="Reload page"
        onBack={() => navigate("/", { replace: true })}
        backLabel="Back to dashboard"
      />
    </div>
  )
}
