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
export { routeLabels } from "./components/breadcrumb"

// Page Templates
export {
  PageContainer, PageHeader, PageTabs, SectionCard,
  EmptyState, LoadingSkeleton, MetricCard,
} from "./components/page-container"
export type { PageHeaderProps, SectionCardProps, EmptyStateProps, MetricCardProps } from "./components/page-container"
