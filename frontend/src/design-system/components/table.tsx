import * as React from "react"
import { cn } from "@/lib/utils"

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    // The wrapper owns horizontal overflow so a wide table scrolls inside its
    // own frame instead of dragging the whole page sideways. It is focusable
    // and labelled as a region so keyboard users can scroll it (WCAG 2.1.1) —
    // a plain overflow div is unreachable without a pointer.
    <div
      tabIndex={0}
      role="region"
      aria-label="Table"
      className="ds-table-scroll ds-focus-ring relative w-full rounded-[var(--ds-table-radius)] border border-[var(--ds-border)] shadow-[var(--ds-shadow-xs)]"
    >
      <table ref={ref} className={cn("w-full caption-bottom", className)} {...props} />
    </div>
  )
)
Table.displayName = "Table"

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn(
        "[&_tr]:border-b border-[var(--ds-border)] bg-[var(--ds-background-subtle)]",
        className
      )}
      {...props}
    />
  )
)
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody
      ref={ref}
      className={cn(
        "[&_tr:last-child]:border-0 [&_tr:nth-child(even)]:bg-[var(--ds-table-row-zebra-bg)]",
        className
      )}
      {...props}
    />
  )
)
TableBody.displayName = "TableBody"

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-[var(--ds-border-light)] transition-colors hover:bg-[var(--ds-surface-hover)] data-[state=selected]:bg-[var(--ds-primary-subtle)]",
        className
      )}
      {...props}
    />
  )
)
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "ds-table-header h-11 px-[var(--ds-spacing-4)] text-left align-middle text-[var(--ds-text-secondary)]",
        className
      )}
      {...props}
    />
  )
)
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn(
        "ds-table-cell px-[var(--ds-spacing-4)] py-[var(--ds-spacing-3)] align-middle text-[var(--ds-text)]",
        className
      )}
      {...props}
    />
  )
)
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption
      ref={ref}
      className={cn(
        "ds-caption mt-[var(--ds-spacing-3)]",
        className
      )}
      {...props}
    />
  )
)
TableCaption.displayName = "TableCaption"

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption }
