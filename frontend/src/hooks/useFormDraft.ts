import { useCallback, useEffect, useRef, useState } from "react"
import { useBlocker } from "react-router-dom"

const draftPrefix = "appointin.form"

export interface UseFormDraftOptions {
  /** Bump when the persisted draft shape changes. */
  version?: number
  enabled?: boolean
}

export interface UseFormDraftResult<T extends object> {
  /** A previously saved draft, or null. */
  readDraft: () => T | null
  /** Persist current values so work is never lost on accidental close. */
  saveDraft: (values: T) => void
  /** Remove the stored draft (call after a successful submit). */
  clearDraft: () => void
  hasDraft: boolean
}

/**
 * Draft persistence (Part 3D, "Autosave & Drafts"). Any create/edit workflow
 * can autosave its values to localStorage and restore them when the user
 * returns — no entered information is lost accidentally.
 */
export function useFormDraft<T extends object>(
  key: string,
  options?: UseFormDraftOptions,
): UseFormDraftResult<T> {
  const version = options?.version ?? 1
  const enabled = options?.enabled ?? true
  const storageKey = `${draftPrefix}.${key}`

  const readDraft = useCallback((): T | null => {
    if (!enabled) return null
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { v?: number; s?: T }
      if (parsed?.v !== version) return null
      return parsed.s ?? null
    } catch {
      return null
    }
  }, [enabled, storageKey, version])

  const [hasDraft, setHasDraft] = useState<boolean>(() => readDraft() !== null)

  const saveDraft = useCallback(
    (values: T) => {
      if (!enabled) return
      try {
        localStorage.setItem(storageKey, JSON.stringify({ v: version, s: values }))
        setHasDraft(true)
      } catch {
        // storage unavailable — degrade gracefully
      }
    },
    [enabled, storageKey, version],
  )

  const clearDraft = useCallback(() => {
    setHasDraft(false)
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // storage unavailable — degrade gracefully
    }
  }, [storageKey])

  return { readDraft, saveDraft, clearDraft, hasDraft }
}

export interface UseUnsavedChangesGuardResult {
  /** Confirm-and-allow the next navigation (call after a successful save). */
  clear: () => void
  /** Returns true when the current state should block navigation. */
  isDirty: () => boolean
}

/**
 * Blocks accidental data loss when a form is dirty: prompts on refresh/close
 * (beforeunload) and on in-app navigation (react-router blocker). Call
 * `clear()` after a successful save.
 */
export function useUnsavedChangesGuard(dirty: boolean): UseUnsavedChangesGuardResult {
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const confirmedRef = useRef(false)

  useEffect(() => {
    if (!dirty) {
      confirmedRef.current = false
      return
    }
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  useBlocker(({ currentLocation, nextLocation }) => {
    if (confirmedRef.current || !dirtyRef.current) return false
    if (currentLocation.pathname === nextLocation.pathname) return false
    // Synchronous confirm keeps the flow simple and dependency-free.
    const leave = window.confirm("You have unsaved changes. Discard them and leave?")
    if (leave) confirmedRef.current = true
    return !leave
  })

  const clear = useCallback(() => {
    confirmedRef.current = true
    dirtyRef.current = false
  }, [])

  const isDirty = useCallback(() => dirtyRef.current, [])

  return { clear, isDirty }
}
