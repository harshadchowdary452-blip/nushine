import { useQuery } from "@tanstack/react-query"
import { Activity, CalendarCheck2, CircleDollarSign, UserPlus } from "lucide-react"
import { notificationsApi } from "@/services/endpoints"
import type { ActivityEvent } from "@/design-system/dashboard"

interface NotificationItem {
  id: string
  type: string
  title: string
  description?: string
  is_read: boolean
  entity_type?: string
  entity_id?: string
  created_at: string
}

/**
 * Maps the current user's notification stream into the dashboard's Recent
 * Activity feed. Used by dashboards whose endpoints don't return their own
 * activity list.
 */
export function useDashboardActivity(limit = 8): { items: ActivityEvent[]; loading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "notifications"],
    queryFn: () => notificationsApi.list(),
    staleTime: 60000,
    gcTime: 120000,
  })

  const items: ActivityEvent[] = (data?.items ?? []).slice(0, limit).map((n: NotificationItem) => {
    const tone: ActivityEvent["tone"] =
      n.type === "appointment" ? "primary"
      : n.type === "billing" ? "accent"
      : n.type === "patient" ? "success"
      : "info"
    const icon = n.type === "appointment" ? CalendarCheck2 : n.type === "billing" ? CircleDollarSign : n.type === "patient" ? UserPlus : Activity
    return {
      id: n.id,
      description: n.description ? `${n.title} — ${n.description}` : n.title,
      date: n.created_at,
      tone,
      icon,
    }
  })

  return { items, loading: isLoading }
}
