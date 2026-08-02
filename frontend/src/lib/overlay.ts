import { useCallback, useEffect, useState } from "react"
import type { RefObject } from "react"

export interface FixedPosition {
  top: number
  left: number
  width: number
}

/**
 * Returns the centralized z-index layer class for a portaled overlay.
 * When the trigger lives inside a dialog, the overlay is rendered to `document.body`,
 * so it must sit above the dialog layer to avoid being hidden behind the modal.
 */
export function resolveOverlayLayer(triggerEl: HTMLElement | null): string {
  let el: HTMLElement | null = triggerEl
  while (el) {
    if (el.getAttribute?.("role") === "dialog") {
      return "z-[var(--ds-z-dialog-dropdown)]"
    }
    el = el.parentElement
  }
  return "z-[var(--ds-z-dropdown)]"
}

interface FixedPositionOptions {
  gap?: number
  align?: "start" | "end"
  popupRef?: RefObject<HTMLElement | null>
}

/**
 * Tracks a trigger element's viewport position so a body-portaled overlay can be
 * positioned with `position: fixed` and stay glued to its trigger on scroll/resize.
 * When `align: "end"` (or the popup overflows the right edge), the overlay is
 * right-aligned to the trigger and clamped inside the viewport.
 */
export function useFixedPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  options: FixedPositionOptions = {}
): { position: FixedPosition | null; updatePosition: () => void } {
  const { gap = 4, align = "start", popupRef } = options
  const [position, setPosition] = useState<FixedPosition | null>(null)

  const updatePosition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const popupEl = popupRef?.current ?? null
    const popupWidth = popupEl?.offsetWidth ?? 0
    const popupHeight = popupEl?.offsetHeight ?? 0
    const width = popupWidth || rect.width
    const margin = 8
    let left = align === "end" ? rect.right - width : rect.left
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))

    // Prefer opening below the trigger; flip above (or clamp on-screen) when the
    // popup would overflow the viewport bottom — otherwise it becomes unreachable.
    let top = rect.bottom + gap
    if (popupHeight > 0) {
      const fitsBelow = rect.bottom + gap + popupHeight <= window.innerHeight - margin
      const fitsAbove = rect.top - gap - popupHeight >= margin
      if (!fitsBelow) {
        top = fitsAbove
          ? rect.top - gap - popupHeight
          : Math.max(margin, window.innerHeight - margin - popupHeight)
      }
    }
    setPosition({ top, left, width })
  }, [gap, align, popupRef, triggerRef])

  useEffect(() => {
    if (!open) return
    updatePosition()
    window.addEventListener("scroll", updatePosition, true)
    window.addEventListener("resize", updatePosition)
    return () => {
      window.removeEventListener("scroll", updatePosition, true)
      window.removeEventListener("resize", updatePosition)
    }
  }, [open, updatePosition])

  return { position, updatePosition }
}

/** Closes the overlay on outside `mousedown` and on `Escape`. */
export function useOverlayDismiss(
  open: boolean,
  onDismiss: () => void,
  triggerRef: RefObject<HTMLElement | null>,
  popupRef: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!open) return
    function handlePointer(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || popupRef.current?.contains(t)) return
      onDismiss()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss()
    }
    document.addEventListener("mousedown", handlePointer)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handlePointer)
      document.removeEventListener("keydown", handleKey)
    }
  }, [open, onDismiss, triggerRef, popupRef])
}
