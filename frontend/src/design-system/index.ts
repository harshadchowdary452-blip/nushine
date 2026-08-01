/* ═══════════════════════════════════════════════════════════════════════════
   DESIGN SYSTEM — Public API
   ═══════════════════════════════════════════════════════════════════════════ */

// Design Tokens (imported via CSS)
import "./tokens.css"

// Core UI Components
export { Button, buttonVariants } from "./components/button"
export type { ButtonProps } from "./components/button"
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from "./components/card"
export { Badge, badgeVariants } from "./components/badge"
export type { BadgeProps } from "./components/badge"
export { StatusBadge } from "./components/status-badge"
export { Input } from "./components/input"
export type { InputProps } from "./components/input"
export {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "./components/tabs"
export {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption,
} from "./components/table"
export {
  Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger,
  DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from "./components/dialog"
export {
  Drawer, DrawerTrigger, DrawerClose, DrawerOverlay, DrawerContent,
  DrawerHeader, DrawerBody, DrawerFooter, DrawerTitle, DrawerDescription,
} from "./components/drawer"

// Shells
export { default as EnterpriseAppLayout } from "./components/app-layout"
export { default as EnterpriseSidebar } from "./components/sidebar"
export { default as EnterpriseHeader } from "./components/header"
export { default as GlobalSearch } from "./components/global-search"
export { default as Breadcrumb } from "./components/breadcrumb"
export { routeLabels } from "./components/routeLabels"

// Page Templates
export {
  PageContainer, PageHeader, PageTabs, SectionCard,
  EmptyState, LoadingSkeleton, MetricCard,
} from "./components/page-container"
export type { PageHeaderProps, SectionCardProps, EmptyStateProps, MetricCardProps } from "./components/page-container"

// Error Experience
export { ErrorState, errorKindFromStatus } from "./components/error-state"
export type { ErrorStateProps, ErrorKind } from "./components/error-state"

// Inputs & Controls
export { Label } from "./components/label"
export { Textarea } from "./components/textarea"
export type { TextareaProps } from "./components/textarea"
export { Checkbox } from "./components/checkbox"
export { Switch } from "./components/switch"
export { NumericInput } from "./components/numeric-input"
export type { NumericInputProps, NumericMode } from "./components/numeric-input"
export { default as SearchableSelect } from "./components/searchable-select"
export { default as SearchBar } from "./components/search-bar"

// Overlays & Menus
export {
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, TooltipWrap,
} from "./components/tooltip"
export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from "./components/popover"
export {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuGroup,
  DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuRadioGroup,
} from "./components/dropdown-menu"
export {
  Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose,
  SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription,
} from "./components/sheet"
export { ScrollArea, ScrollBar } from "./components/scroll-area"
export { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./components/collapsible"
export { Skeleton } from "./components/skeleton"
export { Separator } from "./components/separator"
export { Avatar, AvatarImage, AvatarFallback } from "./components/avatar"

// Select & Toast
export {
  Select, SelectGroup, SelectValue, SelectTrigger, SelectContent,
  SelectLabel, SelectItem, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton,
} from "./components/select"
export { useToast, Toaster, Toast, ToastViewport, toastVariants } from "./components/toast"
export type { Toast as ToastType } from "./components/toast"
export {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription,
  AlertDialogCancel, AlertDialogAction,
} from "./components/alert-dialog"

// Button composites
export { ButtonGroup, SplitButton, DropdownButton, Fab } from "./components/button-composites"

// Forms
export { FormField, FormSection, StickySaveBar } from "./components/form"

// Date & time
export { default as DatePicker, MonthPicker, TimePicker, DateTimePicker, DateRangePicker } from "./components/date-time"
export type { DateRange } from "./components/date-time"

// Domain compositors
export { default as KpiCard } from "./components/kpi-card"
export { default as DentalEmptyState } from "./components/dental-empty-state"
export { default as Leaderboard } from "./components/leaderboard"
export { default as BottomSheet } from "./components/bottom-sheet"

// Data components (Part 3A-2)
export { default as DataTable } from "./components/data-table"
export type { DataTableDensity, DataTableProps } from "./components/data-table"
export { FilterBar, FilterField, FilterChips, SavedFilters } from "./components/filters"
export type { SavedFilterSet } from "./components/filters"
export { Timeline, TimelineItemAction } from "./components/timeline"
export type { TimelineItem, TimelineTone } from "./components/timeline"
export {
  ConfirmDialog, DeleteDialog, SuccessDialog, ErrorDialog,
  ProgressDialog, FullscreenDialog, PreviewDialog,
} from "./components/dialog-templates"
export {
  DetailDrawer, DrawerSection, ActivityFeed, RelatedRecords, DrawerStatusPill,
} from "./components/detail-drawer"
export type { DetailDrawerTab, ActivityItem, RelatedRecord } from "./components/detail-drawer"
export { ChartCard, ChartTooltip, MiniSparkline } from "./components/charts"
export type { ChartTooltipEntry } from "./components/charts"
export {
  TrendCard, ProgressCard, ComparisonCard, UpcomingActivities, NotificationsFeed,
} from "./components/dashboard-widgets"
export type { NotificationItem } from "./components/dashboard-widgets"
export { default as DataCalendar } from "./components/data-calendar"
export type { CalendarView, CalendarTone, CalendarEvent, CalendarCategory } from "./components/data-calendar"

// Dashboard & brand compositors
export { default as QuickExport } from "./components/quick-export"
export { default as DateFilterBar } from "./components/date-filter-bar"
export { default as DashboardDateFilter } from "./components/dashboard-date-filter"
export type { DateRangePreset } from "./components/dashboard-date-filter"
export { ToothLogo, BrandText, BrandLogo } from "./components/brand-logo"
export { default as QuickViewDrawer } from "./components/quick-view-drawer"
export { ChangeStatusDialog } from "./components/change-status-dialog"
export { default as DashboardFilterBar, defaultFilters } from "./components/dashboard-filter-bar"
export type { DashboardFilters } from "./components/dashboard-filter-bar"
export { default as Logo } from "./components/logo"

// Enterprise Dashboard System (Part 3B-1)
export * from "./dashboard"

// Enterprise Workspace System (Part 3C)
export { EnterpriseWorkspace, QuickPreviewDrawer } from "./components/enterprise-workspace"
export type {
  EnterpriseWorkspaceProps, WorkspaceSearchProps, WorkspaceFiltersProps, QuickViewProps,
} from "./components/enterprise-workspace"
export { EnterpriseRecordHeader } from "./components/enterprise-record-header"
export type { EnterpriseRecordHeaderProps, RecordHeaderMeta, RecordStat } from "./components/enterprise-record-header"
export { EnterpriseDetailWorkspace } from "./components/enterprise-detail-workspace"
export type { EnterpriseDetailWorkspaceProps, EnterpriseDetailTab } from "./components/enterprise-detail-workspace"
export { ProductivityPanel, ProductivitySection } from "./components/productivity-panel"
export type { ProductivityPanelProps, ProductivitySectionProps, ProductivityInsight, ProductivityInsightTone } from "./components/productivity-panel"
export { SplitViewWorkspace } from "./components/split-view"
export type { SplitViewWorkspaceProps } from "./components/split-view"
