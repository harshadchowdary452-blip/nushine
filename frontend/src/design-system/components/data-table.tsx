import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Cell,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type Header,
  type PaginationState,
  type Row,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type Table as TanstackTable,
  type VisibilityState,
} from "@tanstack/react-table"
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  GripVertical,
  Pin,
  PinOff,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/lib/use-media-query"
import { Button } from "./button"
import { Checkbox } from "./checkbox"
import { Input } from "./input"
import { Skeleton } from "./skeleton"
import { EmptyState } from "./page-container"
import { ErrorState } from "./error-state"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu"

export type DataTableDensity = "compact" | "comfortable" | "roomy"

/**
 * Optional per-column configuration surfaced by the data table.
 *
 * Declared via module augmentation so `column.columnDef.meta` stays fully
 * typed in consumers' column definitions.
 */
declare module "@tanstack/react-table" {
  // Type params must mirror the augmented interface signature (interface merging).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Renders a header filter control (text input or value picker). */
    filterVariant?: "text" | "select"
    /** Horizontal alignment of the cell content. */
    align?: "left" | "center" | "right"
  }
}

const DENSITY_CELL: Record<DataTableDensity, string> = {
  compact: "py-[6px] ds-body-sm",
  comfortable: "py-[10px] ds-body",
  roomy: "py-4 ds-body",
}

const DENSITY_HEADER: Record<DataTableDensity, string> = {
  compact: "h-9",
  comfortable: "h-11",
  roomy: "h-12",
}

export interface DataTableProps<TData, TValue = unknown> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]

  /** Async state. `loading` with data renders a progress strip; without data, skeleton rows. */
  loading?: boolean
  error?: Error | string | null
  onRetry?: () => void

  // Search & filtering
  searchable?: boolean
  searchPlaceholder?: string
  initialColumnFilters?: ColumnFiltersState
  onColumnFiltersChange?: (filters: ColumnFiltersState) => void
  initialSorting?: SortingState
  initialColumnVisibility?: VisibilityState
  onSortingChange?: (sorting: SortingState) => void

  // Server-driven mode
  manualFiltering?: boolean
  manualSorting?: boolean
  manualPagination?: boolean
  pageCount?: number
  onPageChange?: (pageIndex: number) => void

  // Toolbar
  title?: string
  description?: string
  toolbar?: React.ReactNode
  toolbarActions?: React.ReactNode
  hideTableChrome?: boolean

  // Selection
  enableRowSelection?: boolean
  onSelectionChange?: (selectedRows: TData[]) => void
  getRowId?: (row: TData) => string
  bulkActions?: (selectedRows: TData[]) => React.ReactNode

  // Row interaction
  onRowClick?: (row: TData) => void
  renderSubComponent?: (props: { row: Row<TData> }) => React.ReactNode
  getRowCanExpand?: (row: Row<TData>) => boolean

  // Layout
  pagination?: boolean
  pageSize?: number
  density?: DataTableDensity
  onDensityChange?: (density: DataTableDensity) => void
  stickyHeader?: boolean
  maxHeight?: string | number
  mobileCard?: (row: TData, index: number) => React.ReactNode
  className?: string

  // Empty state
  emptyIcon?: React.ElementType
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
}

const cellAlign = <TData,>(column: Column<TData, unknown>): string => {
  const align = column.columnDef.meta?.align
  if (align === "right") return "text-right"
  if (align === "center") return "text-center"
  return "text-left"
}

/** Right-side toolbar menus shared by every instance. */
interface TableChromeProps<TData> {
  table: TanstackTable<TData>
  density: DataTableDensity
  onDensityChange: (density: DataTableDensity) => void
}

function TableChrome<TData>({ table, density, onDensityChange }: TableChromeProps<TData>) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs">
            <Columns3 className="h-3.5 w-3.5" />
            Columns
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {table
            .getAllLeafColumns()
            .filter((column) => column.getCanHide())
            .map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                <span className="capitalize">{column.id.replace(/_/g, " ")}</span>
              </DropdownMenuCheckboxItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs">
            <GripVertical className="h-3.5 w-3.5" />
            Density
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={density}
            onValueChange={(value) => onDensityChange(value as DataTableDensity)}
          >
            <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="roomy">Roomy</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Per-column filter popover; only renders when the column opts in via meta. */
function ColumnFilter<TData>({ column }: { column: Column<TData, unknown> }) {
  const variant = column.columnDef.meta?.filterVariant
  const hasValue = !!column.getFilterValue()
  if (!variant) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("h-6 w-6", hasValue && "text-[var(--ds-primary)]")}
          aria-label={`Filter ${column.id}`}
        >
          <SlidersHorizontal className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        {variant === "select" ? (
          <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
            {Array.from(column.getFacetedUniqueValues().entries())
              .sort((a, b) => b[1] - a[1])
              .map(([value, count], index) => {
                const key = `${value}-${index}`
                const active = column.getFilterValue() === value
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => column.setFilterValue(active ? undefined : value)}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-[var(--ds-radius-lg)] px-2.5 py-1.5 text-sm transition-colors hover:bg-[var(--ds-surface-hover)]",
                      active ? "bg-[var(--ds-primary-subtle)] text-[var(--ds-primary)]" : "text-[var(--ds-text)]"
                    )}
                  >
                    <span className="ds-truncate">{String(value)}</span>
                    <span className="ds-caption text-[var(--ds-text-tertiary)]">{count}</span>
                  </button>
                )
              })}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              value={(column.getFilterValue() as string) ?? ""}
              onChange={(e) => column.setFilterValue(e.target.value)}
              placeholder="Search…"
              className="h-8 text-sm"
            />
            {hasValue && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8 shrink-0"
                onClick={() => column.setFilterValue(undefined)}
                aria-label="Clear filter"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function SortableHeader<TData, TValue>({ header }: { header: Header<TData, TValue> }) {
  const column = header.column
  if (!column.getCanSort()) {
    return <>{flexRender(column.columnDef.header, header.getContext())}</>
  }

  const sorted = column.getIsSorted()
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ChevronsUpDown

  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      title={sorted ? "Click to remove sort" : "Click to sort"}
      className="ds-focus-ring inline-flex items-center gap-1.5 rounded-[var(--ds-radius-md)] uppercase tracking-wide"
    >
      {flexRender(column.columnDef.header, header.getContext())}
      <Icon className={cn("h-3.5 w-3.5", !sorted && "opacity-40")} />
    </button>
  )
}

interface HeaderCellProps<TData> {
  header: Header<TData, unknown>
  density: DataTableDensity
}

function HeaderCell<TData>({ header, density }: HeaderCellProps<TData>) {
  const column = header.column
  const pinned = column.getIsPinned()
  const pinnedStyle =
    pinned === "left"
      ? { left: `${column.getStart("left")}px` }
      : pinned === "right"
        ? { right: `${column.getAfter("right")}px` }
        : undefined

  return (
    <th
      colSpan={header.colSpan}
      style={{
        ...pinnedStyle,
        width: column.getSize() !== 150 ? column.getSize() : undefined,
      }}
      className={cn(
        "ds-table-header ds-whitespace-nowrap px-[var(--ds-spacing-4)] text-left align-middle text-[var(--ds-text-secondary)]",
        DENSITY_HEADER[density],
        pinned && "sticky z-20 bg-[var(--ds-background-subtle)] shadow-[var(--ds-shadow-xs)]",
        column.getCanSort() && "select-none",
        column.columnDef.meta?.align === "right" && "text-right",
        column.columnDef.meta?.align === "center" && "text-center"
      )}
    >
      <div className={cn("flex items-center gap-1.5", column.columnDef.meta?.align === "right" && "justify-end")}>
        <SortableHeader header={header} />
        <ColumnFilter column={column} />
        {column.getCanPin() && (
          <button
            type="button"
            onClick={() => column.pin(pinned ? false : "left")}
            className="ds-focus-ring rounded-[var(--ds-radius-md)] p-0.5 text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text)]"
            title={pinned ? "Unpin column" : "Pin column"}
            aria-label={pinned ? `Unpin ${column.id}` : `Pin ${column.id} column`}
          >
            {pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          </button>
        )}
      </div>
    </th>
  )
}

interface PaginationProps<TData> {
  table: TanstackTable<TData>
  /** Server-driven pagination: totals derive from pageCount/pageSize, rows-per-page select hidden. */
  manual?: boolean
}

function getPageItems(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const items: (number | "ellipsis")[] = [1]
  if (current > 3) items.push("ellipsis")
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) items.push(i)
  if (current < total - 2) items.push("ellipsis")
  items.push(total)
  return items
}

function DataTablePagination<TData>({ table, manual = false }: PaginationProps<TData>) {
  const { pageIndex, pageSize } = table.getState().pagination
  const pageCount = Math.max(1, table.getPageCount())
  const rowsCount = table.getRowModel().rows.length
  const total = manual
    ? (pageCount - 1) * pageSize + (pageIndex === pageCount - 1 ? rowsCount : pageSize)
    : table.getFilteredRowModel().rows.length
  const from = total === 0 ? 0 : pageIndex * pageSize + 1
  const to = Math.min((pageIndex + 1) * pageSize, total)

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--ds-border-light)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="ds-caption text-[var(--ds-text-secondary)]">
        Showing <span className="ds-numeric font-medium text-[var(--ds-text)]">{from}–{to}</span> of{" "}
        <span className="ds-numeric font-medium text-[var(--ds-text)]">{total}</span>
      </p>

      <div className="flex items-center gap-2">
        {!manual && (
          <label className="ds-caption flex items-center gap-2 text-[var(--ds-text-secondary)]">
            Rows
            <select
              value={pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="ds-focus-ring ds-numeric h-8 rounded-[var(--ds-radius-lg)] border border-[var(--ds-input-border)] bg-[var(--ds-surface)] px-2 text-xs text-[var(--ds-text)]"
              aria-label="Rows per page"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            className="h-8 w-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {getPageItems(pageIndex + 1, pageCount).map((item, i) =>
            item === "ellipsis" ? (
              <span key={`e-${i}`} className="ds-caption px-1 text-[var(--ds-text-tertiary)]">
                …
              </span>
            ) : (
              <Button
                key={item}
                variant={item === pageIndex + 1 ? "primary" : "ghost"}
                size="icon-sm"
                className="h-8 w-8 text-xs"
                onClick={() => table.setPageIndex(item - 1)}
                aria-current={item === pageIndex + 1 ? "page" : undefined}
              >
                {item}
              </Button>
            )
          )}
          <Button
            variant="outline"
            size="icon-sm"
            className="h-8 w-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

interface DataCellProps<TData> {
  cell: Cell<TData, unknown>
  density: DataTableDensity
  onClick?: (row: TData) => void
}

function DataCell<TData>({ cell, density, onClick }: DataCellProps<TData>) {
  const column = cell.column
  const pinned = column.getIsPinned()
  const pinnedStyle =
    pinned === "left"
      ? { left: `${column.getStart("left")}px` }
      : pinned === "right"
        ? { right: `${column.getAfter("right")}px` }
        : undefined

  return (
    <td
      style={pinnedStyle}
      className={cn(
        "px-[var(--ds-spacing-4)] align-middle text-[var(--ds-text)]",
        DENSITY_CELL[density],
        cellAlign(column),
        pinned && "sticky z-10 bg-[var(--ds-surface)]",
        onClick && "cursor-pointer"
      )}
    >
      {flexRender(column.columnDef.cell, cell.getContext())}
    </td>
  )
}

export default function DataTable<TData, TValue = unknown>({
  columns,
  data,
  loading = false,
  error = null,
  onRetry,
  searchable = false,
  searchPlaceholder = "Search…",
  initialColumnFilters,
  onColumnFiltersChange,
  initialSorting,
  initialColumnVisibility,
  onSortingChange,
  manualFiltering = false,
  manualSorting = false,
  manualPagination = false,
  pageCount,
  onPageChange,
  title,
  description,
  toolbar,
  toolbarActions,
  hideTableChrome = false,
  enableRowSelection = false,
  onSelectionChange,
  getRowId,
  bulkActions,
  onRowClick,
  renderSubComponent,
  getRowCanExpand,
  pagination = true,
  pageSize = 10,
  density: densityProp,
  onDensityChange,
  stickyHeader = true,
  maxHeight = 640,
  mobileCard,
  className,
  emptyIcon,
  emptyTitle = "No records found",
  emptyDescription = "There is nothing to display here yet.",
  emptyAction,
}: DataTableProps<TData, TValue>): React.ReactElement {
  const isMobile = useMediaQuery("(max-width: 767px)")
  const [density, setDensityState] = React.useState<DataTableDensity>("comfortable")
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting ?? [])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(initialColumnFilters ?? [])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(initialColumnVisibility ?? {})
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [paginationState, setPaginationState] = React.useState<PaginationState>({ pageIndex: 0, pageSize })
  const [globalFilter, setGlobalFilter] = React.useState<string>("")

  const activeDensity = densityProp ?? density
  const handleDensityChange = (next: DataTableDensity) => {
    if (onDensityChange) onDensityChange(next)
    else setDensityState(next)
  }

  const effectiveColumns = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    const built: ColumnDef<TData, unknown>[] = [...(columns as ColumnDef<TData, unknown>[])]
    if (enableRowSelection) {
      built.unshift({
        id: "select",
        enableSorting: false,
        enableHiding: false,
        enablePinning: false,
        size: 44,
        minSize: 44,
        maxSize: 44,
        header: ({ table }) => {
          const isAll = table.getIsAllRowsSelected()
          const isSome = table.getIsSomeRowsSelected()
          return (
            <Checkbox
              checked={isAll ? true : isSome ? "indeterminate" : false}
              onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
              aria-label="Select all rows"
            />
          )
        },
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            onClick={(e) => e.stopPropagation()}
            disabled={!row.getCanSelect()}
            aria-label={`Select row ${row.index + 1}`}
          />
        ),
      })
    }
    if (renderSubComponent || getRowCanExpand) {
      built.unshift({
        id: "expand",
        enableSorting: false,
        enableHiding: false,
        enablePinning: false,
        size: 44,
        minSize: 44,
        maxSize: 44,
        cell: ({ row }) =>
          row.getCanExpand() ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                row.toggleExpanded()
              }}
              className="ds-focus-ring ds-target rounded-[var(--ds-radius-md)] text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text)]"
              aria-expanded={row.getIsExpanded()}
              aria-label={row.getIsExpanded() ? "Collapse row" : "Expand row"}
            >
              <ChevronRight className={cn("h-4 w-4 transition-transform", row.getIsExpanded() && "rotate-90")} />
            </button>
          ) : null,
      })
    }
    return built
  }, [columns, enableRowSelection, renderSubComponent, getRowCanExpand])

  const resolvedRowId = React.useMemo(
    () => getRowId ?? ((row: TData) => String((row as Record<string, unknown>).id ?? (row as Record<string, unknown>).uuid ?? crypto.randomUUID())),
    [getRowId]
  )

  const table = useReactTable<TData>({
    data,
    columns: effectiveColumns as ColumnDef<TData, unknown>[],
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination: paginationState,
      globalFilter,
    },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater
      setSorting(next)
      onSortingChange?.(next)
    },
    onColumnFiltersChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnFilters) : updater
      setColumnFilters(next)
      onColumnFiltersChange?.(next)
    },
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPaginationState,
    getRowId: enableRowSelection ? resolvedRowId : undefined,
    manualPagination,
    manualFiltering,
    manualSorting,
    pageCount,
    autoResetPageIndex: !manualPagination,
    enableRowSelection,
    getRowCanExpand,
    getCoreRowModel: getCoreRowModel(),
    ...(!manualSorting ? { getSortedRowModel: getSortedRowModel() } : {}),
    ...(!manualFiltering
      ? {
          getFilteredRowModel: getFilteredRowModel(),
          getFacetedRowModel: getFacetedRowModel(),
          getFacetedUniqueValues: getFacetedUniqueValues(),
          getFacetedMinMaxValues: getFacetedMinMaxValues(),
        }
      : {}),
    ...(pagination && !manualPagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    ...(renderSubComponent ? { getExpandedRowModel: getExpandedRowModel() } : {}),
  })

  React.useEffect(() => {
    if (!enableRowSelection) return
    onSelectionChange?.(table.getSelectedRowModel().rows.map((row) => row.original))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSelection, enableRowSelection])

  React.useEffect(() => {
    if (manualPagination && onPageChange) onPageChange(paginationState.pageIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginationState.pageIndex, manualPagination])

  const rows = table.getRowModel().rows
  const hasChrome = !hideTableChrome && (searchable || title || toolbar || toolbarActions || !manualFiltering)
  const isFiltered = globalFilter.length > 0 || columnFilters.length > 0
  const selectedCount = table.getSelectedRowModel().rows.length
  const showMobileCards = !!mobileCard && isMobile

  const renderTable = (
    <div className="overflow-hidden rounded-[var(--ds-table-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-card)]">
      <div
        role="region"
        aria-label={title ?? "Data table"}
        tabIndex={0}
        className={cn("ds-focus-ring ds-table-scroll relative w-full overflow-auto", stickyHeader && maxHeight ? "max-h-full" : "")}
        style={stickyHeader && maxHeight ? { maxHeight } : undefined}
      >
        <table className="w-full caption-bottom">
          <thead
            className={cn(
              "z-10 border-b border-[var(--ds-border)] bg-[var(--ds-background-subtle)]",
              stickyHeader && "sticky top-0"
            )}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-[var(--ds-border)]">
                {headerGroup.headers.map((header) => (
                  <HeaderCell key={header.id} header={header} density={activeDensity} />
                ))}
              </tr>
            ))}
          </thead>
          <tbody
            className="[&_tr:last-child]:border-0"
            onKeyDown={(e) => {
              if (!["ArrowDown", "ArrowUp"].includes(e.key)) return
              const rowsEls = Array.from(e.currentTarget.querySelectorAll<HTMLTableRowElement>("[data-table-row]"))
              const currentIndex = rowsEls.indexOf(e.target as HTMLTableRowElement)
              if (currentIndex === -1) return
              const next = e.key === "ArrowDown" ? rowsEls[currentIndex + 1] : rowsEls[currentIndex - 1]
              next?.focus()
              e.preventDefault()
            }}
          >
            {rows.map((row) => (
              <React.Fragment key={row.id}>
                <tr
                  data-table-row
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            onRowClick(row.original)
                          }
                        }
                      : undefined
                  }
                  aria-selected={enableRowSelection ? row.getIsSelected() : undefined}
                  className={cn(
                    "border-b border-[var(--ds-border-light)] transition-colors",
                    "hover:bg-[var(--ds-surface-hover)]",
                    row.getIsSelected() && "bg-[var(--ds-primary-subtle)] hover:bg-[var(--ds-primary-subtle)]",
                    onRowClick && "cursor-pointer",
                    "focus-visible:bg-[var(--ds-surface-hover)] focus-visible:outline-none"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <DataCell key={cell.id} cell={cell} density={activeDensity} onClick={onRowClick} />
                  ))}
                </tr>
                {row.getIsExpanded() && renderSubComponent && (
                  <tr className="border-b border-[var(--ds-border-light)] bg-[var(--ds-surface-secondary)]/50">
                    <td colSpan={row.getVisibleCells().length} className="px-[var(--ds-spacing-4)] py-4">
                      {renderSubComponent({ row })}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {pagination && <DataTablePagination table={table} manual={manualPagination} />}
    </div>
  )

  const renderSkeleton = (
    <div className="overflow-hidden rounded-[var(--ds-table-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-card)]">
      <div className="flex items-center gap-4 border-b border-[var(--ds-border)] bg-[var(--ds-background-subtle)] px-[var(--ds-spacing-4)] py-[var(--ds-spacing-4)]">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-[var(--ds-border-light)] px-[var(--ds-spacing-4)] py-[var(--ds-spacing-3)]">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  )

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {hasChrome && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center">
            {(title || description) && (
              <div className="ds-min-w-0">
                {title && <h2 className="ds-card-title text-[var(--ds-text)]">{title}</h2>}
                {description && <p className="ds-caption text-[var(--ds-text-secondary)]">{description}</p>}
              </div>
            )}
            {searchable && (
              <div className="relative w-full max-w-sm lg:ml-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-tertiary)]" />
                <Input
                  value={globalFilter}
                  onChange={(e) => {
                    setGlobalFilter(e.target.value)
                    setPaginationState((prev) => ({ ...prev, pageIndex: 0 }))
                  }}
                  placeholder={searchPlaceholder}
                  className="h-9 pl-9 pr-8 text-sm"
                  aria-label={searchPlaceholder}
                />
                {globalFilter && (
                  <button
                    type="button"
                    onClick={() => setGlobalFilter("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--ds-radius-md)] p-1 text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text)]"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            {toolbar && <div className="lg:ml-auto">{toolbar}</div>}
          </div>
          {!hideTableChrome && (
            <div className="flex items-center gap-2">
              {toolbarActions}
              <TableChrome table={table} density={activeDensity} onDensityChange={handleDensityChange} />
            </div>
          )}
        </div>
      )}

      {selectedCount > 0 && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--ds-radius-xl)] border border-[var(--ds-primary)]/25 bg-[var(--ds-primary-subtle)] px-4 py-3" role="status">
          <p className="ds-nav-label font-medium text-[var(--ds-primary)]">
            {selectedCount} {selectedCount === 1 ? "row" : "rows"} selected
          </p>
          <div className="flex items-center gap-2">
            {bulkActions?.(table.getSelectedRowModel().rows.map((row) => row.original))}
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => table.resetRowSelection()}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <ErrorState
          kind={typeof error === "string" ? "unknown" : "unknown"}
          title="Couldn't load this data"
          description={typeof error === "string" ? error : error.message}
          onRetry={onRetry}
          size="section"
        />
      ) : loading && rows.length === 0 ? (
        renderSkeleton
      ) : (
        <>
          {loading && rows.length > 0 && (
            <div role="status" aria-live="polite" aria-busy="true" className="h-0.5 w-full overflow-hidden rounded-full bg-[var(--ds-surface-secondary)]">
              <div className="ds-loading-strip h-full w-1/3 bg-[var(--ds-primary)]" />
            </div>
          )}
          {rows.length === 0 ? (
            <div className="overflow-hidden rounded-[var(--ds-table-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)]">
              <EmptyState
                icon={emptyIcon}
                title={isFiltered ? "No results for the current filters" : emptyTitle}
                description={isFiltered ? "Try adjusting or clearing the search and filters to see more records." : emptyDescription}
                action={
                  isFiltered ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setGlobalFilter("")
                        setColumnFilters([])
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    emptyAction
                  )
                }
                size="compact"
              />
            </div>
          ) : showMobileCards ? (
            <div className="flex flex-col gap-3">
              {rows.map((row, index) => (
                <div key={row.id}>{mobileCard?.(row.original, index)}</div>
              ))}
            </div>
          ) : (
            renderTable
          )}
        </>
      )}
    </div>
  )
}
