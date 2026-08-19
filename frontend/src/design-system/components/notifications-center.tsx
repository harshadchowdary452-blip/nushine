"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import {
  Bell, Calendar, AlertCircle, MessageSquare, Clock, Trash2, X, CheckCheck,
  CheckCircle2, FlaskConical, Hourglass, UserPlus, Workflow,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useFixedPosition, useOverlayDismiss, resolveOverlayLayer } from "@/lib/overlay"
import { notificationsApi } from "@/services/endpoints"
import { entityPath } from "@/lib/entity-links"
import { showErrorToast } from "@/utils/showErrorToast"
import { useToast } from "@/design-system/components/toast"
import { format } from "date-fns"

export interface NotificationItem {
  id: string
  title: string
  description: string
  type: string
  is_read: boolean
  entity_type?: string | null
  entity_id?: string | null
  created_at: string
}

const iconMap: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  appointment: { icon: Calendar, color: "text-[var(--ds-info)]", label: "Appointment" },
  alert: { icon: AlertCircle, color: "text-[var(--ds-danger)]", label: "Alert" },
  message: { icon: MessageSquare, color: "text-[var(--ds-success)]", label: "Message" },
  reminder: { icon: Clock, color: "text-[var(--ds-warning)]", label: "Reminder" },
  billing: { icon: AlertCircle, color: "text-[var(--ds-warning)]", label: "Billing" },
  crm: { icon: MessageSquare, color: "text-[var(--ds-primary)]", label: "CRM" },
  system: { icon: AlertCircle, color: "text-[var(--ds-text-tertiary)]", label: "System" },
  follow_up_assigned: { icon: MessageSquare, color: "text-[var(--ds-primary)]", label: "Follow-up assigned" },
  workflow: { icon: Workflow, color: "text-[var(--ds-primary)]", label: "Workflow" },
  treatment_overdue: { icon: AlertCircle, color: "text-[var(--ds-danger)]", label: "Treatment overdue" },
  treatment_completed: { icon: CheckCircle2, color: "text-[var(--ds-success)]", label: "Treatment completed" },
  lab_delay: { icon: FlaskConical, color: "text-[var(--ds-warning)]", label: "Lab delay" },
  patient_waiting: { icon: Hourglass, color: "text-[var(--ds-warning)]", label: "Patient waiting" },
  pending_assignment: { icon: UserPlus, color: "text-[var(--ds-info)]", label: "Assignment pending" },
  daily_queue: { icon: Calendar, color: "text-[var(--ds-info)]", label: "Today's queue" },
}

const filters = [
  { key: "all", label: "All", match: () => true },
  { key: "unread", label: "Unread", match: (n: NotificationItem) => !n.is_read },
  {
    key: "appointment", label: "Appointments",
    match: (n: NotificationItem) => n.type === "appointment" || n.type === "daily_queue",
  },
  {
    key: "treatment", label: "Treatments",
    match: (n: NotificationItem) =>
      ["treatment_overdue", "treatment_completed", "lab_delay", "patient_waiting", "pending_assignment"].includes(n.type),
  },
  { key: "billing", label: "Billing", match: (n: NotificationItem) => n.type === "billing" },
  { key: "crm", label: "CRM", match: (n: NotificationItem) => n.type === "follow_up_assigned" || n.type === "message" },
  { key: "system", label: "System", match: (n: NotificationItem) => n.type === "workflow" || n.type === "system" },
] as const
type FilterKey = (typeof filters)[number]["key"]

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return format(new Date(date), "MMM d")
}

interface NotificationsCenterProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUnreadCountChange: (count: number) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

export default function NotificationsCenter({
  open,
  onOpenChange,
  onUnreadCountChange,
  triggerRef,
}: NotificationsCenterProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all")
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { position } = useFixedPosition(open, triggerRef, { gap: 6, align: "end", popupRef })
  useOverlayDismiss(open, () => onOpenChange(false), triggerRef, popupRef)
  const layer = resolveOverlayLayer(triggerRef.current)

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await notificationsApi.list()
      onUnreadCountChange(data?.unread ?? 0)
      setNotifications(data?.items ?? [])
    } catch (err: unknown) {
      setNotifications([])
      showErrorToast(err, addToast)
    }
  }, [onUnreadCountChange, addToast])

  const markAllRead = async () => {
    try {
      await notificationsApi.markAllRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      onUnreadCountChange(0)
    } catch (err: unknown) {
      showErrorToast(err, addToast)
    }
  }

  useEffect(() => {
    if (!open) return
    fetchNotifications()
  }, [open, fetchNotifications])

  const markRead = async (id: string) => {
    try {
      await notificationsApi.markRead(id)
    } catch (err: unknown) {
      showErrorToast(err, addToast)
    }
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    const stillUnread = notifications.filter((n) => n.id !== id && !n.is_read).length
    onUnreadCountChange(stillUnread)
  }

  const openNotification = async (n: NotificationItem) => {
    if (!n.is_read) {
      await markRead(n.id)
    }
    onOpenChange(false)
    const path = entityPath(n.entity_type, n.entity_id)
    if (path) navigate(path)
  }

  const handleDelete = async (id: string) => {
    try {
      await notificationsApi.delete(id)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    } catch (err: unknown) {
      showErrorToast(err, addToast)
    }
    try {
      const data = await notificationsApi.unreadCount()
      onUnreadCountChange(data?.unread ?? 0)
    } catch {
      /* ignore count refresh failure */
    }
  }

  const handleDeleteAll = async () => {
    try {
      await notificationsApi.deleteAll()
      setNotifications([])
      onUnreadCountChange(0)
    } catch (err: unknown) {
      showErrorToast(err, addToast)
    }
  }

  const filtered = notifications.filter((n) => {
    const active = filters.find((f) => f.key === activeFilter) ?? filters[0]
    return active.match(n)
  })

  const unreadTotal = notifications.filter((n) => !n.is_read).length
  const unreadInFilter = filtered.filter((n) => !n.is_read).length

  return (
    <>
      {open &&
        createPortal(
          <motion.div
            ref={popupRef}
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.15 }}
            style={position ? { top: position.top, right: "auto", left: position.left } : undefined}
            className={cn(
              "fixed w-[min(420px,calc(100vw-16px))] overflow-hidden rounded-[var(--ds-radius-xl)] border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-dropdown)]",
              layer
            )}
          >
            <div className="flex items-center justify-between border-b border-[var(--ds-border)] px-5 py-3">
              <div>
                <h2 className="text-sm font-bold text-[var(--ds-text)]">Notifications</h2>
                {unreadTotal > 0 && (
                  <p className="text-[11px] font-medium text-[var(--ds-primary)]">
                    {unreadTotal} unread
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {notifications.length > 0 && (
                  <>
                    <button
                      onClick={() => markAllRead()}
                      aria-label="Mark all as read"
                      title="Mark all as read"
                      className="flex h-7 w-7 items-center justify-center rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-primary)]"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={handleDeleteAll}
                      aria-label="Delete all notifications"
                      title="Delete all"
                      className="flex h-7 w-7 items-center justify-center rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] transition-colors hover:bg-[var(--ds-danger-subtle)] hover:text-[var(--ds-danger)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => onOpenChange(false)}
                  aria-label="Close notifications"
                  className="flex h-7 w-7 items-center justify-center rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] transition-colors hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div
              className="flex gap-1 overflow-x-auto border-b border-[var(--ds-border-light)] px-4 py-2"
              role="tablist"
              aria-label="Filter notifications"
            >
              {filters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setActiveFilter(f.key)}
                  role="tab"
                  aria-selected={activeFilter === f.key}
                  className={cn(
                    "shrink-0 rounded-[var(--ds-radius-lg)] px-2.5 py-1 text-xs font-medium transition-all",
                    activeFilter === f.key
                      ? "bg-[var(--ds-primary)] text-[var(--ds-primary-foreground)] shadow-sm"
                      : "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-border)]"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="max-h-[340px] overflow-y-auto" role="list" aria-label="Notification list">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Bell className="mb-2 h-7 w-7 text-[var(--ds-text-tertiary)]" />
                  <p className="text-sm text-[var(--ds-text-secondary)]">No notifications</p>
                  {activeFilter !== "all" && (
                    <p className="text-[11px] text-[var(--ds-text-tertiary)]">Try a different filter</p>
                  )}
                </div>
              ) : (
                <div className="py-1">
                  {filtered.map((n) => {
                    const mapped = iconMap[n.type] || { icon: Bell, color: "text-[var(--ds-text-tertiary)]", label: "System" }
                    const Icon = mapped.icon
                    const hasTarget = !!entityPath(n.entity_type, n.entity_id)
                    return (
                      <div
                        key={n.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openNotification(n)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            openNotification(n)
                          }
                        }}
                        aria-label={`${n.title}${hasTarget ? ", open record" : ""}${!n.is_read ? ", unread" : ""}`}
                        className={cn(
                          "group flex gap-3 px-4 py-3 text-left transition-colors",
                          !n.is_read
                            ? "bg-[var(--ds-primary-subtle)] cursor-pointer hover:bg-[var(--ds-primary-light)]"
                            : "hover:bg-[var(--ds-surface-hover)] cursor-pointer",
                          !hasTarget && "cursor-default"
                        )}
                      >
                        <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface-secondary)]", mapped.color)}>
                          <Icon className="h-4 w-4" strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-[var(--ds-text)]">{n.title}</p>
                            {!n.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ds-primary)]" />}
                          </div>
                          <p className="truncate text-xs text-[var(--ds-text-secondary)]">{n.description}</p>
                          <p className="mt-0.5 text-[11px] text-[var(--ds-text-tertiary)]">
                            {timeAgo(n.created_at)}
                            <span className="mx-1 text-[var(--ds-border)]">•</span>
                            <span className="capitalize">{mapped.label}</span>
                            {hasTarget && <span className="ml-1 text-[var(--ds-primary)]">· Open</span>}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(n.id)
                          }}
                          aria-label={`Delete: ${n.title}`}
                          className="flex h-7 w-7 shrink-0 items-center justify-center self-start rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] opacity-0 transition-all group-hover:opacity-100 hover:bg-[var(--ds-danger-subtle)] hover:text-[var(--ds-danger)] focus-visible:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {unreadInFilter > 0 && (
              <div className="border-t border-[var(--ds-border-light)] bg-[var(--ds-surface-secondary)] px-4 py-1.5 text-right">
                <button
                  onClick={() => markAllRead()}
                  className="text-[11px] font-medium text-[var(--ds-primary)] hover:underline"
                >
                  Mark {unreadInFilter} as read
                </button>
              </div>
            )}
          </motion.div>,
          document.body
        )}
    </>
  )
}
