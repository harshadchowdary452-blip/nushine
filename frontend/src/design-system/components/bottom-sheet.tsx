import { Sheet, SheetContent, SheetTitle } from "@/design-system/components/sheet"

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

export default function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        side="bottom"
        className="gap-0 p-0 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="sticky top-0 z-[var(--ds-z-sticky)] flex items-center justify-between border-b border-[var(--ds-border-light)] bg-[var(--ds-surface)] px-5 py-4">
          {title && <SheetTitle className="pr-12 text-base">{title}</SheetTitle>}
        </div>
        <div className="px-5 py-4">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
