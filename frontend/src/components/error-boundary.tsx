import { Component, type ErrorInfo, type ReactNode } from "react"
// Imported directly (not via the design-system barrel): the root boundary must
// stay importable even if the app shell it guards fails to load, and must not
// drag layout/store modules into every consumer.
import { ErrorState } from "@/design-system/components/error-state"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Last-resort React error boundary at the application root.
 *
 * Sits outside the router, so recovery is a state reset (re-render) or a hard
 * reload. Error details go to the console for engineers; the user gets the
 * standard classified error screen — the raw `error.message` is deliberately
 * never rendered, because exception text leaks stack frames and internals.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex min-h-[50vh] items-center justify-center bg-[var(--ds-background)] p-[var(--ds-spacing-6)]">
          <ErrorState
            kind="unknown"
            onRetry={this.handleReset}
            onBack={() => window.location.assign("/")}
            backLabel="Back to dashboard"
          />
        </div>
      )
    }

    return this.props.children
  }
}
