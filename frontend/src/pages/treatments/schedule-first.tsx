/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Calendar, Loader2, CheckCircle2 } from "lucide-react"
import PageHeader from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { casesApi, treatmentApi, usersApi, appointmentsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import { formatIndianRupees } from "@/lib/currency"

export default function ScheduleFirstAppointment() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [form, setForm] = useState({
    appointment_date: "",
    appointment_time: "09:00",
    doctor_id: "",
    notes: "",
  })

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["treatment-plans-by-case", caseId],
    queryFn: () => treatmentApi.listByCase(caseId!),
    enabled: !!caseId,
  })

  const plan = useMemo(() => {
    const list = Array.isArray(plans) ? plans : (plans?.items || [])
    return list[0] || null
  }, [plans])

  const { data: caseData } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => casesApi.get(caseId!),
    enabled: !!caseId,
  })

  const { data: doctors } = useQuery({
    queryKey: ["users-doctors"],
    queryFn: () => usersApi.list({ role: "DOCTOR" }),
  })

  const doctorList = useMemo(() => {
    const raw = Array.isArray(doctors) ? doctors : (doctors?.items || [])
    return raw.map((d: any) => ({ id: d.id, name: `${d.first_name || ""} ${d.last_name || ""}`.trim() || d.email }))
  }, [doctors])

  const scheduleMutation = useMutation({
    mutationFn: (data: any) => appointmentsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-plans-by-case", caseId] })
      addToast({ title: "First Appointment Scheduled", variant: "success" })
      navigate(`/cases/${caseId}`)
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to schedule", variant: "destructive" }),
  })

  if (plansLoading) return <div className="p-6 space-y-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
  if (!caseData) return <div className="py-20 text-center text-muted-foreground">Case not found</div>

  const c = caseData as any
  const totalCost = plan?.cost || 0

  return (
    <div className="space-y-6">
      <PageHeader title="Schedule First Appointment" description={c.case_number || caseId!.slice(0, 8)}>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* Case Summary */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Case Summary</CardTitle>
            </CardHeader>
            <CardContent className="py-2 text-sm space-y-1">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Patient:</span> <span className="font-medium">{c.patient_name || "—"}</span></div>
                <div><span className="text-muted-foreground">Case:</span> <span className="font-medium">#{c.case_number || "—"}</span></div>
                {plan && (
                  <>
                    <div><span className="text-muted-foreground">Treatment:</span> <span className="font-medium">{plan.treatment_name}</span></div>
                    <div><span className="text-muted-foreground">Cost:</span> <span className="font-medium">{formatIndianRupees(totalCost)}</span></div>
                    <div><span className="text-muted-foreground">Visits Planned:</span> <span className="font-medium">{plan.total_sittings || 0}</span></div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Schedule Form */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Appointment Details
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input
                    type="date"
                    value={form.appointment_date}
                    onChange={(e) => setForm(p => ({ ...p, appointment_date: e.target.value }))}
                    min={new Date().toISOString().split("T")[0]}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Time *</Label>
                  <Input
                    type="time"
                    value={form.appointment_time}
                    onChange={(e) => setForm(p => ({ ...p, appointment_time: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Doctor *</Label>
                <Select value={form.doctor_id} onValueChange={(val) => setForm(p => ({ ...p, doctor_id: val }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    {doctorList.map((doc: any) => (
                      <SelectItem key={doc.id} value={doc.id}>Dr. {doc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Any special instructions..."
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full"
                onClick={() => scheduleMutation.mutate({
                  patient_id: c.patient_id,
                  doctor_id: form.doctor_id,
                  appointment_date: form.appointment_date,
                  appointment_time: form.appointment_time,
                  appointment_type: "TREATMENT",
                  notes: form.notes,
                })}
                disabled={!form.appointment_date || !form.appointment_time || !form.doctor_id || scheduleMutation.isPending}
              >
                {scheduleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Schedule Appointment
              </Button>
              <Button variant="outline" className="w-full" onClick={() => navigate(`/cases/${caseId}`)}>
                Skip for Now
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
