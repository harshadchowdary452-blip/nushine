import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import {
  MessageSquare, Mail, BarChart3, TrendingUp, Users, Phone, Target, Star, Send,
  CalendarDays, CheckCircle2, Clock, AlertTriangle, PhoneCall, MessageCircle,
  Plus, Loader2, ExternalLink
} from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import { crmApi } from "@/services/endpoints"
import { Skeleton } from "@/components/ui/skeleton"
import KpiCard from "@/components/layout/kpi-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatIndianNumber } from "@/lib/currency"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }

const statusColors: Record<string, string> = {
  SCHEDULED: "bg-blue-50 text-blue-700",
  PENDING: "bg-yellow-50 text-yellow-700",
  CONTACTED: "bg-purple-50 text-purple-700",
  RESPONDED: "bg-green-50 text-green-700",
  APPOINTMENT_BOOKED: "bg-indigo-50 text-indigo-700",
  COMPLETED: "bg-green-50 text-green-700",
  NO_RESPONSE: "bg-red-50 text-red-700",
  MISSED: "bg-red-50 text-red-600",
  CANCELLED: "bg-gray-50 text-gray-500",
}

const typeLabels: Record<string, string> = {
  "1_DAY": "1-Day Follow-Up",
  "6_MONTH_RECALL": "6-Month Recall",
  MANUAL: "Manual",
}

export default function CrmDashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["crm", "dashboard"],
    queryFn: () => crmApi.dashboard(),
    staleTime: 30000,
    gcTime: 60000,
  })

  if (!user) return null

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-[130px] rounded-2xl" />)}
        </div>
      </div>
    )
  }

  const m = dashboard?.metrics || {}
  const todayFus = dashboard?.todays_follow_ups || []

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="show">
      <div className="gradient-hero rounded-2xl p-6 md:p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-20" />
        <div className="relative z-10">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
              <Target className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">CRM Dashboard</h1>
              <p className="text-white/70 mt-1">Follow-up reminders & patient engagement</p>
            </div>
          </div>
        </div>
      </div>

      {/* Follow-Up Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard icon={CalendarDays} title="Today's Follow-Ups" value={m.todays_follow_ups_count ?? todayFus.length} color="primary" delay={0} />
        <KpiCard icon={Clock} title="Pending" value={m.pending_follow_ups ?? 0} color="warning" delay={0.05} />
        <KpiCard icon={CheckCircle2} title="Completed" value={m.completed_follow_ups ?? 0} color="success" delay={0.1} />
        <KpiCard icon={AlertTriangle} title="Overdue" value={m.overdue_follow_ups ?? 0} color="danger" delay={0.15} />
        <KpiCard icon={Send} title="WhatsApp Sent" value={m.whatsapp_messages_sent ?? 0} color="info" delay={0.2} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={CalendarDays} title="1-Day Follow-Ups Due" value={m.one_day_follow_ups_due ?? 0} color="primary" delay={0.25} />
        <KpiCard icon={Users} title="6-Month Recalls Due" value={m.six_month_recalls_due ?? 0} color="info" delay={0.3} />
        <KpiCard icon={TrendingUp} title="Response Rate" value={`${m.response_rate ?? 0}%`} color="success" delay={0.35} />
        <KpiCard icon={MessageCircle} title="WhatsApp Resp. Rate" value={`${m.whatsapp_response_rate ?? 0}%`} color="info" delay={0.4} />
      </div>

      {/* Today's Follow-Ups */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Today's Follow-Ups
            <Badge className="ml-2">{todayFus.length}</Badge>
          </CardTitle>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate("/crm/follow-ups")}>
            <ExternalLink className="h-4 w-4" /> View All
          </Button>
        </CardHeader>
        <CardContent>
          {todayFus.length === 0 ? (
            <div className="py-8 text-center text-gray-400">No follow-ups scheduled for today</div>
          ) : (
            <div className="space-y-2">
              {todayFus.slice(0, 10).map((fu: any) => (
                <TodayFollowUpRow key={fu.id} fu={fu} statusColors={statusColors} typeLabels={typeLabels} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

function TodayFollowUpRow({ fu, statusColors, typeLabels }: { fu: any; statusColors: Record<string, string>; typeLabels: Record<string, string> }) {
  const navigate = useNavigate()
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-gray-50 cursor-pointer"
      onClick={() => navigate(`/crm/follow-ups?patient=${fu.patient_id}`)}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
        <Users className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{fu.patient_name}</span>
          {fu.follow_up_type && (
            <Badge className="text-xs bg-gray-50 text-gray-600">{typeLabels[fu.follow_up_type] || fu.follow_up_type}</Badge>
          )}
          <Badge className={`text-xs ${statusColors[fu.status] || "bg-gray-50 text-gray-600"}`}>{fu.status}</Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
          {fu.treatment_name && <span>Treatment: {fu.treatment_name}</span>}
          {fu.doctor_name && <span>Dr. {fu.doctor_name}</span>}
          {fu.patient_phone && <span>{fu.patient_phone}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {fu.whatsapp_sent_at && <MessageCircle className="h-4 w-4 text-green-500" />}
        {fu.call_made_at && <PhoneCall className="h-4 w-4 text-blue-500" />}
        {fu.status === "COMPLETED" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
      </div>
    </div>
  )
}
