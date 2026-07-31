/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { User, Play, Clock, Loader2 } from "lucide-react"
import { format } from "date-fns"
import { PageHeader } from "@/design-system"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { treatmentApi, authApi, doctorQueueApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

const STATUS_COLORS: Record<string, string> = {
  ASSIGNED: "bg-blue-100 text-blue-700",
  SCHEDULED: "bg-[var(--ds-primary-100)] text-[var(--ds-primary-700)]",
  IN_PROGRESS: "bg-green-100 text-green-700",
  WAITING_PATIENT: "bg-yellow-100 text-yellow-700",
  WAITING_LAB: "bg-orange-100 text-orange-700",
  ON_HOLD: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
  OVERDUE: "bg-red-200 text-red-800",
  COMPLETED: "bg-emerald-100 text-emerald-700",
}

export default function DoctorQueue() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [activeTab, setActiveTab] = useState("today")

  const { data: user } = useQuery({
    queryKey: ["auth-me"],
    queryFn: () => authApi.me(),
  })

  const doctorId = user?.id

  const { data, isLoading } = useQuery({
    queryKey: ["doctor-queue", doctorId],
    queryFn: () => doctorQueueApi.get(doctorId!),
    enabled: !!doctorId,
  })

  const startMutation = useMutation({
    mutationFn: (planId: string) => treatmentApi.start(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctor-queue", doctorId] })
      addToast({ title: "Treatment Started", variant: "success" })
    },
    onError: (err: any) =>
      addToast({
        title: "Error",
        description: err?.response?.data?.detail || "Failed",
        variant: "destructive",
      }),
  })

  const todayList = useMemo(() => {
    if (!data) return []
    const raw = Array.isArray(data)
      ? data
      : [...(data.today_queue || []), ...(data.in_progress || [])]
    return raw
  }, [data])

  const upcomingList = useMemo(() => {
    if (!data || Array.isArray(data)) return []
    return data.upcoming_queue || []
  }, [data])

  const waitingList = useMemo(() => {
    if (!data || Array.isArray(data)) return []
    return [
      ...(data.waiting_for_patient || []),
      ...(data.waiting_for_lab || []),
      ...(data.on_hold || []),
    ]
  }, [data])

  const completedList = useMemo(() => {
    if (!data || Array.isArray(data)) return []
    return data.completed_today || []
  }, [data])

  const overdueList = useMemo(() => {
    if (!data || Array.isArray(data)) return []
    return data.overdue || []
  }, [data])

  const allItems = {
    today: todayList,
    upcoming: upcomingList,
    waiting: waitingList,
    completed: completedList,
    overdue: overdueList,
  }
  const counts = {
    today: todayList.length,
    upcoming: upcomingList.length,
    waiting: waitingList.length,
    completed: completedList.length,
    overdue: overdueList.length,
  }

  if (isLoading)
    return (
      <div className="p-6 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    )

  return (
    <div className="space-y-6">
      <PageHeader title="My Queue" description="Today's and upcoming treatments assigned to you" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="today">Today ({counts.today})</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({counts.upcoming})</TabsTrigger>
          <TabsTrigger value="waiting">Waiting ({counts.waiting})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({counts.completed})</TabsTrigger>
          {counts.overdue > 0 && (
            <TabsTrigger value="overdue" className="text-red-600">
              Overdue ({counts.overdue})
            </TabsTrigger>
          )}
        </TabsList>

        {Object.entries(allItems).map(([key, list]) => (
          <TabsContent key={key} value={key} className="mt-4">
            {list.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground text-sm">
                  No treatments in this category
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {list.map((plan: any) => (
                  <div
                    key={plan.id}
                    className={cn(
                      "flex items-center gap-4 rounded-lg border bg-[var(--ds-surface)] p-4 hover:shadow-sm transition-shadow",
                      key === "overdue" && "border-red-200 bg-red-50",
                      plan.status === "IN_PROGRESS" && "border-green-200 bg-green-50",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{plan.treatment_name}</span>
                        <Badge
                          className={cn(
                            "text-[10px] px-1.5 py-0",
                            STATUS_COLORS[plan.status as string],
                          )}
                        >
                          {plan.status?.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" /> {plan.patient_name || "—"}
                        </span>
                        <span>
                          Teeth:{" "}
                          {Array.isArray(plan.tooth_numbers)
                            ? plan.tooth_numbers.join(", ")
                            : plan.tooth_numbers || "—"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Visit {plan.completed_sittings || 0}/{plan.total_sittings || 0}
                        </span>
                        {plan.next_appointment_date && (
                          <span>
                            Next: {format(new Date(plan.next_appointment_date), "dd MMM, HH:mm")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {plan.status === "ASSIGNED" || plan.status === "SCHEDULED" ? (
                        <Button
                          size="sm"
                          onClick={() => startMutation.mutate(plan.id)}
                          disabled={startMutation.isPending}
                        >
                          {startMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : (
                            <Play className="h-3.5 w-3.5 mr-1" />
                          )}{" "}
                          Start
                        </Button>
                      ) : plan.status === "IN_PROGRESS" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/treatments/${plan.id}`)}
                        >
                          Continue
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate(`/treatments/${plan.id}`)}
                        >
                          View
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
