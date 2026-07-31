import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ErrorBoundary } from "@/components/error-boundary"

function ThrowingComponent() {
  throw new Error("Test error")
  return null
}

function GoodComponent() {
  return <div>Works</div>
}

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <GoodComponent />
      </ErrorBoundary>
    )
    expect(screen.getByText("Works")).toBeInTheDocument()
  })

  it("renders fallback UI when child throws", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    )
    expect(screen.getByText("Something went wrong")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toBeInTheDocument()
    // Raw exception text must never reach the UI (it can leak stack frames
    // and internals); it belongs in the console only.
    expect(screen.queryByText("Test error")).not.toBeInTheDocument()
    consoleSpy.mockRestore()
  })

  it("offers a retry action that resets the boundary", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    )
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument()
    consoleSpy.mockRestore()
  })

  it("renders custom fallback when provided", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    render(
      <ErrorBoundary fallback={<div>Custom error</div>}>
        <ThrowingComponent />
      </ErrorBoundary>
    )
    expect(screen.getByText("Custom error")).toBeInTheDocument()
    consoleSpy.mockRestore()
  })
})
