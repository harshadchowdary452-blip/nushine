import { useCallback, useRef, useState } from "react"

const memoryPrefix = "nushine.ws"

export interface WorkspaceMemoryOptions {
  /** Bump when the persisted shape changes so stale stores are discarded. */
  version?: number
}

/**
 * Persists an arbitrary slice of workspace state (search, filters, sort,
 * density, visible columns, open tabs, drawer state, selected record, etc.)
 * to localStorage under a per-module namespace. On return to a module the
 * state is restored so users never fall back to a default page.
 *
 * @example
 * const { state, update, reset } = useWorkspaceMemory("patients.list", {
 *   density: "comfortable",
 *   tab: "overview",
 *   drawerOpen: false,
 *   selectedId: undefined,
 * })
 */
export function useWorkspaceMemory<T extends object>(namespace: string, defaults: T, options?: WorkspaceMemoryOptions) {
  const key = `${memoryPrefix}.${namespace}`
  const version = options?.version ?? 1
  const defaultsRef = useRef(defaults)
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return defaultsRef.current
      const parsed = JSON.parse(raw) as { v?: number; s?: T }
      if (parsed?.v !== version) return defaultsRef.current
      return { ...defaultsRef.current, ...(parsed.s ?? {}) }
    } catch {
      return defaultsRef.current
    }
  })

  const update = useCallback(
    (patch: Partial<T> | ((prev: T) => T)) => {
      setState((prev) => {
        const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch }
        try {
          localStorage.setItem(key, JSON.stringify({ v: version, s: next }))
        } catch {
          // storage unavailable — degrade gracefully
        }
        return next
      })
    },
    [key, version]
  )

  const reset = useCallback(() => {
    setState(defaultsRef.current)
    try {
      localStorage.removeItem(key)
    } catch {
      // storage unavailable — degrade gracefully
    }
  }, [key])

  return { state, update, reset }
}
