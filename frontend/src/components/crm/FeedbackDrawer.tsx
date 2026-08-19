import { useState, useEffect } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet"
import { ScrollArea } from "../ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import { Loader2, FileText, ClipboardList } from "lucide-react"
import { LeadFeedbackForm } from "./LeadFeedbackForm"
import { PatientFeedbackForm } from "./PatientFeedbackForm"
import { NotesTimeline } from "./NotesTimeline"
import { crmApi } from "../../services/endpoints"
import { useToast } from "../ui/toast"
import { showErrorToast } from "@/utils/showErrorToast"

interface FeedbackEnquiry {
  id: string
  enquiry_type?: string
  display_name?: string
  patient_name?: string
  lead?: {
    id: string
    name: string
    mobile: string
    source?: string
    interested_treatment?: string
    status?: string
  }
  patient?: {
    id: string
    name: string
    phone?: string
  }
  doctor?: {
    name?: string
  }
  treatment?: {
    treatment_name?: string
  }
  case?: {
    case_number?: string
  }
}

interface FeedbackSummary {
  enquiry_type?: string
  feedback?: Record<string, unknown> | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  enquiry: FeedbackEnquiry | null
  onSaved: () => void
}

export function FeedbackDrawer({ open, onOpenChange, enquiry, onSaved }: Props) {
  const { addToast } = useToast()
  const [tab, setTab] = useState("form")
  const isLead = enquiry?.enquiry_type === "LEAD_FOLLOW_UP"
  const [summary, setSummary] = useState<FeedbackSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [feedbackId, setFeedbackId] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !enquiry) return
    setTab("form")
    setSummary(null)
    setFeedbackId(null)
    setSummaryLoading(true)
    crmApi.feedbackSummary(enquiry.id)
      .then((data: FeedbackSummary) => {
        setSummary(data)
        if (data?.feedback && "id" in data.feedback) {
          setFeedbackId(data.feedback.id as string)
        }
      })
      .catch((err: unknown) => showErrorToast(err, addToast))
      .finally(() => setSummaryLoading(false))
  }, [open, enquiry, addToast])

  function handleSaved() {
    // Re-fetch summary after save
    if (enquiry) {
      crmApi.feedbackSummary(enquiry.id).then((data: FeedbackSummary) => {
        setSummary(data)
        if (data?.feedback && "id" in data.feedback) {
          setFeedbackId(data.feedback.id as string)
        }
      }).catch((err: unknown) => showErrorToast(err, addToast))
    }
    onSaved()
  }

  const displayName = enquiry?.display_name || enquiry?.patient_name || "-"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0">
        <SheetHeader className="px-5 pt-5 pb-0">
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            {isLead ? "Lead Feedback" : "Patient Feedback"} — {displayName}
          </SheetTitle>
          <SheetDescription>
            {isLead
              ? "Record feedback to help convert this lead into a patient."
              : "Record patient satisfaction and service quality feedback."}
          </SheetDescription>
        </SheetHeader>

        <Tabs value={tab} onValueChange={setTab} className="px-5 pt-3">
          <TabsList className="w-full">
            <TabsTrigger value="form" className="flex-1 text-xs">
              <ClipboardList className="h-3.5 w-3.5 mr-1" />
              Feedback Form
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 text-xs">
              <FileText className="h-3.5 w-3.5 mr-1" />
              History & Notes
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[calc(100vh-11rem)] pr-1">
            <TabsContent value="form" className="mt-4 pb-6">
              {summaryLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : enquiry ? (
                isLead ? (
                  <LeadFeedbackForm enquiry={enquiry} onSaved={handleSaved} onCancel={() => onOpenChange(false)} />
                ) : (
                  <PatientFeedbackForm enquiry={enquiry} onSaved={handleSaved} onCancel={() => onOpenChange(false)} />
                )
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No enquiry selected.</p>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-4 pb-6">
              {summaryLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : summary?.feedback ? (
                <div className="space-y-4">
                  {/* Previous feedback summary */}
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Latest Feedback</p>
                    {Object.entries(summary.feedback).map(([key, val]) => {
                      if (key === "id" || key === "enquiry_id" || key === "patient_id" || key === "lead_id" || key === "created_at" || key === "feedback_date") return null
                      if (val === null || val === undefined) return null
                      const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                      return (
                        <div key={key} className="flex items-start justify-between gap-2">
                          <span className="text-muted-foreground text-xs">{label}</span>
                          <span className="text-xs font-medium text-right max-w-[60%] truncate">{String(val)}</span>
                        </div>
                      )
                    })}
                  </div>
                  <NotesTimeline
                    feedbackId={feedbackId}
                    feedbackType={isLead ? "lead" : "patient"}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No feedback recorded yet. Use the Feedback Form tab to submit one.
                </p>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
