import { useNavigate } from "react-router-dom"
import { ErrorState } from "@/design-system"

/**
 * 404 — rendered inside the app shell for any unmatched route.
 *
 * Replaces the old silent `Navigate to="/"`: redirecting hid broken links from
 * both the user (who lands somewhere unexpected with no explanation) and the
 * team (who never learn the link was dead).
 */
export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <ErrorState
      kind="not-found"
      onBack={() => navigate("/", { replace: true })}
      backLabel="Back to dashboard"
    />
  )
}
