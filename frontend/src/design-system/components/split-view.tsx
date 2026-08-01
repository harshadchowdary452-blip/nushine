import * as React from "react"
import { PanelRightClose, PanelRightOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Separator } from "./separator"

export interface SplitViewWorkspaceProps {
  /** Left pane: the data grid / list. */
  master: React.ReactNode
  /** Right pane: live record preview. */
  detail?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Initial detail width as a percentage of the workspace. */
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  detailLabel?: string
  masterLabel?: string
  /** Placeholder shown in the detail pane when no record is selected. */
  emptyDetail?: React.ReactNode
  className?: string
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/**
 * Split View mode (Part 3C): a resizable, collapsible master-detail layout.
 * The grid stays live on the left while a record preview is pinned on the
 * right. On small screens the detail pane slides over the master instead.
 */
export function SplitViewWorkspace({
  master,
  detail,
  open: openProp,
  onOpenChange,
  defaultWidth = 40,
  minWidth = 28,
  maxWidth = 60,
  detailLabel = "Preview",
  masterLabel = "List",
  emptyDetail,
  className,
}: SplitViewWorkspaceProps) {
  const [internalOpen, setInternalOpen] = React.useState(true)
  const open = openProp ?? internalOpen
  const setOpen = (next: boolean) => {
    setInternalOpen(next)
    onOpenChange?.(next)
  }

  const [width, setWidth] = React.useState(clamp(defaultWidth, minWidth, maxWidth))
  const containerRef = React.useRef<HTMLDivElement>(null)
  const dragging = React.useRef(false)

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragging.current = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const percent = ((rect.right - e.clientX) / rect.width) * 100
    setWidth(clamp(percent, minWidth, maxWidth))
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return
    dragging.current = false
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  }

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toggle = (
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-1.5"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-controls="split-view-detail"
      aria-label={`${open ? "Close" : "Open"} ${detailLabel} panel`}
    >
      {open ? <PanelRightClose className="h-4 w-4" aria-hidden="true" /> : <PanelRightOpen className="h-4 w-4" aria-hidden="true" />}
      <span className="hidden sm:inline">{open ? "Hide preview" : "Preview"}</span>
    </Button>
  )

  return (
    <div ref={containerRef} className={cn("relative flex min-h-0 w-full gap-0", className)}>
      <div className={cn("flex min-w-0 flex-1 flex-col", dragging.current && "select-none")}>
        {masterLabel ? (
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="ds-overline text-[var(--ds-text-tertiary)]">{masterLabel}</span>
            {detail ? toggle : null}
          </div>
        ) : null}
        <div className="min-h-0 flex-1">{master}</div>
      </div>

      {detail ? (
        open ? (
          <>
            <Separator
              orientation="vertical"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize preview"
              aria-valuemin={minWidth}
              aria-valuemax={maxWidth}
              aria-valuenow={Math.round(width)}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className={cn(
                "mx-3 hidden h-auto w-px shrink-0 cursor-col-resize touch-none bg-[var(--ds-border)] lg:block",
                "hover:bg-[var(--ds-primary)] focus-visible:bg-[var(--ds-primary)]"
              )}
            />
            <section
              id="split-view-detail"
              aria-label={detailLabel}
              className={cn(
                "min-h-0 overflow-y-auto border border-[var(--ds-border)] bg-[var(--ds-surface)]",
                "lg:sticky lg:top-0 lg:w-[var(--ds-split-width)] lg:self-start"
              )}
              style={{ ["--ds-split-width" as string]: `${width}%` }}
            >
              <header className="flex items-center justify-between gap-2 border-b border-[var(--ds-border)] px-4 py-3">
                <span className="ds-overline text-[var(--ds-text-tertiary)]">{detailLabel}</span>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setOpen(false)} aria-label={`Close ${detailLabel} panel`}>
                  <PanelRightClose className="h-3.5 w-3.5" aria-hidden="true" />
                  Close
                </Button>
              </header>
              <div className="p-4">{detail ?? emptyDetail}</div>
            </section>
          </>
        ) : null
      ) : null}
    </div>
  )
}
