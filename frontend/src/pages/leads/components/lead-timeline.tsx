import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { format } from "date-fns"
import {
  Plus, Phone, MessageSquare, Calendar,
  Star, Clock, Activity,
  CheckCircle2, ArrowRight, FileText,
} from "lucide-react"
import { leadsApi } from "@/services/endpoints"
import { Badge } from "@/components/ui/badge"
import type { Lead, LeadCall, LeadCommunication } from "@/types"

interface TimelineItem {
  id: string
  type: "created" | "call" | "communication" | "follow-up" | "status-change" | "note" | "feedback" | "appointment" | "converted"
  label: string
  description: string
  date: string
  icon: React.ElementType
  color: string
  bgColor: string
  metadata?: Record<string, unknown>
}

interface LeadTimelineProps {
  lead: Lead
  calls: LeadCall[]
  communications: LeadCommunication[]
}

const typeConfig: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  created: { icon: Plus, color: "text-blue-600", bgColor: "bg-blue-50" },
  call: { icon: Phone, color: "text-[var(--ds-accent-600)]", bgColor: "bg-[var(--ds-accent-50)]" },
  communication: { icon: MessageSquare, color: "text-green-600", bgColor: "bg-green-50" },
  "follow-up": { icon: Calendar, color: "text-orange-600", bgColor: "bg-orange-50" },
  "status-change": { icon: ArrowRight, color: "text-[var(--ds-primary-600)]", bgColor: "bg-[var(--ds-primary-50)]" },
  note: { icon: FileText, color: "text-[var(--ds-text-secondary)]", bgColor: "bg-[var(--ds-background-subtle)]" },
  feedback: { icon: Star, color: "text-amber-600", bgColor: "bg-amber-50" },
  appointment: { icon: Clock, color: "text-cyan-600", bgColor: "bg-cyan-50" },
  converted: { icon: CheckCircle2, color: "text-emerald-600", bgColor: "bg-emerald-50" },
}

export default function LeadTimeline({ lead, calls, communications }: LeadTimelineProps) {
  const { data: followUps } = useQuery({
    queryKey: ["lead-followups", lead.id],
    queryFn: () => leadsApi.getFollowUps(lead.id),
    enabled: !!lead.id,
  })

  const timelineItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = []

    items.push({
      id: `created-${lead.id}`,
      type: "created",
      label: "Lead Created",
      description: `Lead "${lead.lead_name}" was created from ${lead.source?.replace(/_/g, " ") || "Unknown"} source`,
      date: lead.created_at,
      ...typeConfig.created,
      metadata: { source: lead.source },
    })

    if (lead.status === "CONVERTED" && lead.converted_patient_id) {
      items.push({
        id: `converted-${lead.id}`,
        type: "converted",
        label: "Converted to Patient",
        description: `Lead was converted to patient successfully`,
        date: lead.updated_at,
        ...typeConfig.converted,
        metadata: { patient_id: lead.converted_patient_id },
      })
    }

    if (lead.status === "LOST") {
      items.push({
        id: `lost-${lead.id}`,
        type: "status-change",
        label: "Lead Lost",
        description: "Lead was marked as lost",
        date: lead.updated_at,
        ...typeConfig["status-change"],
      })
    }

    if (calls?.length) {
      calls.forEach((call) => {
        items.push({
          id: `call-${call.id}`,
          type: "call",
          label: `Call: ${(call.outcome || "Unknown").replace(/_/g, " ")}`,
          description: call.notes || `Call duration: ${call.duration_seconds ? `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s` : "N/A"}`,
          date: call.created_at,
          ...typeConfig.call,
          metadata: { outcome: call.outcome, duration: call.duration_seconds },
        })
      })
    }

    if (communications?.length) {
      communications.forEach((comm) => {
        items.push({
          id: `comm-${comm.id}`,
          type: "communication",
          label: `Message via ${comm.channel}`,
          description: comm.message?.slice(0, 120) || "No content",
          date: comm.created_at,
          ...typeConfig.communication,
          metadata: { channel: comm.channel, status: comm.status },
        })
      })
    }

    if (followUps) {
      const fuList: Array<Record<string, unknown>> = Array.isArray(followUps) ? followUps : []
      fuList.forEach((fu) => {
        items.push({
          id: `fu-${fu.id as string}`,
          type: "follow-up",
          label: `Follow-up: ${fu.status as string || "Scheduled"}`,
          description: (fu.notes as string) || `Scheduled for ${fu.follow_up_date as string}`,
          date: fu.created_at as string,
          ...typeConfig["follow-up"],
          metadata: { status: fu.status, date: fu.follow_up_date },
        })
      })
    }

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return items
  }, [lead, calls, communications, followUps])

  if (!timelineItems.length) {
    return (
      <div className="py-12 text-center">
        <Activity className="h-10 w-10 mx-auto mb-3 text-[var(--ds-text-tertiary)]" />
        <p className="text-sm text-[var(--ds-text-tertiary)]">No timeline activity yet</p>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="absolute left-[19px] top-3 bottom-3 w-0.5 bg-[var(--ds-background-subtle)]" />
      <div className="space-y-0">
        {timelineItems.map((item, i) => {
          const Icon = item.icon
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03, duration: 0.3 }}
              className="relative flex gap-4 pb-5 last:pb-0"
            >
              <div className={`relative z-10 h-10 w-10 rounded-full ${item.bgColor} flex items-center justify-center shrink-0 ring-2 ring-white`}>
                <Icon className={`h-4 w-4 ${item.color}`} />
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-[var(--ds-text)]">{item.label}</span>
                  {item.type === "follow-up" && !!item.metadata?.status && (
                    <Badge variant={(() => {
                      const s = String(item.metadata?.status)
                      if (s === "COMPLETED") return "success" as const
                      if (s === "MISSED") return "danger" as const
                      return "warning" as const
                    })()}>
                      {String(item.metadata?.status)}
                    </Badge>
                  )}
                  {item.type === "communication" && (
                    <Badge variant="outline">{String(item.metadata?.channel || "")}</Badge>
                  )}
                </div>
                <p className="text-xs text-[var(--ds-text-secondary)] mt-0.5 line-clamp-2">{item.description}</p>
                <p className="text-[11px] text-[var(--ds-text-tertiary)] mt-1">
                  {format(new Date(item.date), "dd MMM yyyy, hh:mm a")}
                </p>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
