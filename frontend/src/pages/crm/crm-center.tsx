import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  CalendarCheck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Phone,
  MessageCircle,
  Mail,
  UserX,
  CalendarClock,
  Stethoscope,
  CreditCard,
  LayoutDashboard,
} from "lucide-react"
import { crmV2Api } from "@/services/endpoints"
import { PageHeader } from "@/design-system"
import KpiCard from "@/components/ui/kpi-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface DashboardData {
  today_followups: number
  upcoming: number
  overdue: number
  completed_today: number
  pending_calls: number
  pending_whatsapp: number
  pending_email: number
  missed_appointments: number
  inactive_patients: number
  patients_due_recall: number
  outstanding_payments: number
  recent_followups: RecentFollowUp[]
  followups_by_status: { status: string; count: number }[]
  followups_by_channel: { channel: string; count: number }[]
}

interface RecentFollowUp {
  id: string
  patient_name: string
  follow_up_date: string
  channel: string
  status: string
  priority: string
}

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-50 text-yellow-700",
  SCHEDULED: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-green-50 text-green-700",
  OVERDUE: "bg-red-50 text-red-700",
  SKIPPED: "bg-gray-50 text-gray-600",
  IN_PROGRESS: "bg-indigo-50 text-indigo-700",
}

const channelColors: Record<string, string> = {
  WHATSAPP: "bg-green-50 text-green-600",
  SMS: "bg-blue-50 text-blue-600",
  EMAIL: "bg-purple-50 text-purple-600",
  PHONE: "bg-amber-50 text-amber-600",
  TASK: "bg-gray-50 text-gray-600",
  NOTIFICATION: "bg-indigo-50 text-indigo-600",
}

const priorityColors: Record<string, string> = {
  HIGH: "bg-red-50 text-red-600",
  MEDIUM: "bg-yellow-50 text-yellow-600",
  LOW: "bg-green-50 text-green-600",
}

const statusBarColors: Record<string, string> = {
  PENDING: "bg-yellow-400",
  SCHEDULED: "bg-blue-400",
  COMPLETED: "bg-green-400",
  OVERDUE: "bg-red-400",
  SKIPPED: "bg-gray-400",
  IN_PROGRESS: "bg-indigo-400",
}

const channelBarColors: Record<string, string> = {
  WHATSAPP: "bg-green-400",
  SMS: "bg-blue-400",
  EMAIL: "bg-purple-400",
  PHONE: "bg-amber-400",
  TASK: "bg-gray-400",
  NOTIFICATION: "bg-indigo-400",
}

const channelIcons: Record<string, React.ElementType> = {
  WHATSAPP: MessageCircle,
  SMS: MessageCircle,
  EMAIL: Mail,
  PHONE: Phone,
}

const formatLabel = (s: string) =>
  s
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())

function MiniBar({
  label,
  count,
  max,
  color,
}: {
  label: string
  count: number
  max: number
  color: string
}) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 text-muted-foreground text-xs">{formatLabel(label)}</span>
      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right font-medium text-xs">{count}</span>
    </div>
  )
}

export default function CrmCenter() {
  const { data, isLoading } = useQuery({
    queryKey: ["crm-center-dashboard"],
    queryFn: () => crmV2Api.dashboard(),
  })

  const d: DashboardData | null = data || null

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[130px] rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!d) return null

  const statusMax = Math.max(1, ...d.followups_by_status.map((s) => s.count))
  const channelMax = Math.max(1, ...d.followups_by_channel.map((c) => c.count))

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <PageHeader
        title="CRM Center"
        description="Today's follow-up activity & patient status overview"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={CalendarCheck}
          title="Today's Follow-Ups"
          value={d.today_followups}
          color="text-blue-600"
          delay={0}
        />
        <KpiCard
          icon={Clock}
          title="Upcoming"
          value={d.upcoming}
          color="text-amber-600"
          delay={0.05}
        />
        <KpiCard
          icon={AlertTriangle}
          title="Overdue"
          value={d.overdue}
          color="text-red-600"
          delay={0.1}
        />
        <KpiCard
          icon={CheckCircle2}
          title="Completed Today"
          value={d.completed_today}
          color="text-green-600"
          delay={0.15}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-blue-100">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Phone className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">{d.pending_calls}</p>
              <p className="text-xs text-muted-foreground">Pending Calls</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-100">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 text-green-600">
              <MessageCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">{d.pending_whatsapp}</p>
              <p className="text-xs text-muted-foreground">Pending WhatsApp</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-100">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
              <Mail className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">{d.pending_email}</p>
              <p className="text-xs text-muted-foreground">Pending Email</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-500">
              <UserX className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-bold">{d.missed_appointments}</p>
              <p className="text-xs text-muted-foreground">Missed Appointments</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-500">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-bold">{d.inactive_patients}</p>
              <p className="text-xs text-muted-foreground">Inactive Patients (90+)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-500">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-bold">{d.patients_due_recall}</p>
              <p className="text-xs text-muted-foreground">Due for Recall</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-bold">{d.outstanding_payments}</p>
              <p className="text-xs text-muted-foreground">Outstanding Payments</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4 text-primary" /> Recent Follow-Ups
          </CardTitle>
        </CardHeader>
        <CardContent>
          {d.recent_followups?.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.recent_followups.map((fu) => {
                  const ChIcon = channelIcons[fu.channel] || MessageCircle
                  return (
                    <TableRow key={fu.id}>
                      <TableCell className="font-medium">{fu.patient_name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {fu.follow_up_date}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${channelColors[fu.channel] || ""}`}>
                          <ChIcon className="h-3 w-3 mr-1" />
                          {fu.channel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${statusColors[fu.status] || ""}`}>
                          {fu.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${priorityColors[fu.priority] || ""}`}>
                          {fu.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="text-xs">
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No recent follow-ups
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Follow-Ups by Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {d.followups_by_status?.length > 0 ? (
              d.followups_by_status.map((s) => (
                <MiniBar
                  key={s.status}
                  label={s.status}
                  count={s.count}
                  max={statusMax}
                  color={statusBarColors[s.status] || "bg-gray-400"}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No data</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Follow-Ups by Channel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {d.followups_by_channel?.length > 0 ? (
              d.followups_by_channel.map((c) => (
                <MiniBar
                  key={c.channel}
                  label={c.channel}
                  count={c.count}
                  max={channelMax}
                  color={channelBarColors[c.channel] || "bg-gray-400"}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No data</p>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  )
}
