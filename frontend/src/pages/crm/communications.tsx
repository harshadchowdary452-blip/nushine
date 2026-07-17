import { useState } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { MessageSquare, Mail, Phone, Search, Filter } from "lucide-react"
import { crmApi } from "@/services/endpoints"
import PageHeader from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }

interface CommunicationItem {
  id: string
  channel: string
  message: string
  subject?: string
  message_type?: string
  status: string
  sent_at?: string
}

const channelIcons: Record<string, React.ElementType> = {
  WHATSAPP: MessageSquare,
  EMAIL: Mail,
  SMS: Phone,
}

const channelColors: Record<string, string> = {
  WHATSAPP: "text-green-600 bg-green-50",
  EMAIL: "text-blue-600 bg-blue-50",
  SMS: "text-purple-600 bg-purple-50",
}

const statusBadge: Record<string, string> = {
  SENT: "bg-blue-50 text-blue-700",
  DELIVERED: "bg-green-50 text-green-700",
  READ: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-700",
}

export default function CommunicationHistory() {
  const [search, setSearch] = useState("")
  const [channelFilter, setChannelFilter] = useState("all")

  const { data, isLoading } = useQuery({
    queryKey: ["crm", "communications", channelFilter],
    queryFn: () => crmApi.communications.list({ channel: channelFilter !== "all" ? channelFilter : undefined }),
  })

  const items = data?.items || []

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="show">
      <PageHeader title="Communication History" description="View all communications sent to patients" />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg">All Communications</CardTitle>
            <div className="flex gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search messages..."
                  className="pl-10 w-60"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="w-36">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Channels</SelectItem>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                  <SelectItem value="EMAIL">Email</SelectItem>
                  <SelectItem value="SMS">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-gray-400">No communications found</div>
          ) : (
            <div className="space-y-3">
              {items
                .filter((c: CommunicationItem) => !search || c.message?.toLowerCase().includes(search.toLowerCase()) || c.subject?.toLowerCase().includes(search.toLowerCase()))
                .map((c: CommunicationItem) => {
                  const Icon = channelIcons[c.channel] || MessageSquare
                  return (
                    <div key={c.id} className="flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-gray-50">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${channelColors[c.channel] || "bg-gray-50 text-gray-500"}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">{c.channel}</span>
                          {c.message_type && (
                            <span className="text-xs text-gray-400">• {c.message_type.replace(/_/g, " ")}</span>
                          )}
                          <Badge className={`ml-auto text-xs ${statusBadge[c.status] || "bg-gray-50 text-gray-600"}`}>
                            {c.status}
                          </Badge>
                        </div>
                        {c.subject && <p className="mt-1 text-sm font-medium text-gray-900">{c.subject}</p>}
                        <p className="mt-0.5 text-sm text-gray-600 line-clamp-2">{c.message}</p>
                        <p className="mt-1 text-xs text-gray-400">
                          {c.sent_at ? new Date(c.sent_at).toLocaleString() : ""}
                        </p>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
