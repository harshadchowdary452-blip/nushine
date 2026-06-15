import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { ArrowLeft, Calendar, Clock, User, Stethoscope, FileText, Edit, X, FilePlus, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import PageHeader from "@/components/layout/page-header"
import { appointmentsApi, casesApi, doctorsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import type { Appointment } from "@/types"

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive" | "success" | "warning"> = {
  SCHEDULED: "default",
  CONFIRMED: "success",
  IN_PROGRESS: "warning",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
  NO_SHOW: "outline",
}

export default function AppointmentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [editOpen, setEditOpen] = useState(false)
  const [editStatus, setEditStatus] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [createCaseOpen, setCreateCaseOpen] = useState(false)
  const [caseComplaint, setCaseComplaint] = useState("")
  const [reassignOpen, setReassignOpen] = useState(false)
  const [newDoctorId, setNewDoctorId] = useState("")
  const [reassignReason, setReassignReason] = useState("")

  const { data: appointment, isLoading } = useQuery<Appointment>({
    queryKey: ["appointment", id],
    queryFn: () => appointmentsApi.get(id!),
    enabled: !!id,
  })

  const { data: doctors } = useQuery({
    queryKey: ["doctors", "reassign"],
    queryFn: () => doctorsApi.list({ page_size: 200 }),
  })
  const doctorList: any[] = doctors?.items || doctors || []

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => appointmentsApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointment", id] })
      queryClient.invalidateQueries({ queryKey: ["appointments"] })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      addToast({ title: "Success", description: "Appointment updated", variant: "success" })
      setEditOpen(false)
    },
    onError: () => {
      addToast({ title: "Error", description: "Failed to update appointment", variant: "destructive" })
    },
  })

  const reassignMutation = useMutation({
    mutationFn: (data: { doctor_id: string; reason?: string }) =>
      appointmentsApi.reassignDoctor(id!, data),
    onSuccess: (resp: any) => {
      queryClient.invalidateQueries({ queryKey: ["appointment", id] })
      queryClient.invalidateQueries({ queryKey: ["appointments"] })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      addToast({
        title: "Doctor Reassigned",
        description: `Changed to ${resp.new_doctor_name}`,
        variant: "success"
      })
      setReassignOpen(false); setNewDoctorId(""); setReassignReason("")
    },
    onError: () => {
      addToast({ title: "Error", description: "Failed to reassign doctor", variant: "destructive" })
    },
  })

  const createCaseMutation = useMutation({
    mutationFn: (data: { patient_id: string; doctor_id: string; appointment_id: string; chief_complaint: string }) =>
      casesApi.create(data),
    onSuccess: (newCase: any) => {
      addToast({ title: "Success", description: "Case created from appointment", variant: "success" })
      setCreateCaseOpen(false)
      setCaseComplaint("")
      navigate(`/cases/${newCase.id}`)
    },
    onError: () => {
      addToast({ title: "Error", description: "Failed to create case", variant: "destructive" })
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }

  if (!appointment) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">Appointment not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/appointments")}>
          Back to Appointments
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Appointment" description="View and manage appointment details">
        <Button variant="outline" onClick={() => navigate("/appointments")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-xl font-bold">Appointment</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  ID: {appointment.id.slice(0, 8)}...
                </p>
              </div>
              <Badge variant={statusVariant[appointment.status] || "default"}>
                {appointment.status.replace(/_/g, " ")}
              </Badge>
            </div>
            {appointment.status === "COMPLETED" && (
              <Button variant="outline" size="sm" onClick={() => { setCaseComplaint(""); setCreateCaseOpen(true) }}>
                <FilePlus className="h-4 w-4 mr-1" /> Create Case
              </Button>
            )}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Edit className="h-4 w-4 mr-1" /> Update Status
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Update Appointment</DialogTitle>
                </DialogHeader>
                <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
                  <div className="grid gap-2">
                    <Label>Status</Label>
                    <Select value={editStatus} onValueChange={setEditStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                        <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                        <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                        <SelectItem value="COMPLETED">Completed</SelectItem>
                        <SelectItem value="CANCELLED">Cancelled</SelectItem>
                        <SelectItem value="NO_SHOW">No Show</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Notes</Label>
                    <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Add notes..." />
                  </div>
                </div>
                <div className="flex justify-end gap-2 px-6 py-4 border-t">
                  <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                  <Button
                    onClick={() => {
                      const data: Record<string, unknown> = {}
                      if (editStatus) data.status = editStatus
                      if (editNotes) data.notes = editNotes
                      updateMutation.mutate(data)
                    }}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Appointment Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <div className="flex justify-between items-center">
                <dt className="text-sm text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" /> Date
                </dt>
                <dd className="text-sm font-medium">
                  {appointment.appointment_date
                    ? format(new Date(appointment.appointment_date), "MMM dd, yyyy")
                    : "—"}
                </dd>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <dt className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" /> Time
                </dt>
                <dd className="text-sm font-medium">{appointment.appointment_time || "—"}</dd>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <dt className="text-sm text-muted-foreground flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" /> Status
                </dt>
                <dd>
                  <Badge variant={statusVariant[appointment.status] || "default"}>
                    {appointment.status.replace(/_/g, " ")}
                  </Badge>
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              People
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              {appointment.patient_name && (
                <>
                  <div className="flex justify-between items-center">
                    <dt className="text-sm text-muted-foreground flex items-center gap-2">
                      <User className="h-3.5 w-3.5" /> Patient
                    </dt>
                    <dd className="text-sm font-medium">{appointment.patient_name}</dd>
                  </div>
                  <Separator />
                </>
              )}
              {appointment.doctor_name && (
                <div className="flex justify-between items-center">
                  <dt className="text-sm text-muted-foreground flex items-center gap-2">
                    <Stethoscope className="h-3.5 w-3.5" /> Doctor
                  </dt>
                  <dd className="flex items-center gap-2">
                    <span className="text-sm font-medium">{appointment.doctor_name}</span>
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground"
                      onClick={() => { setNewDoctorId(""); setReassignReason(""); setReassignOpen(true) }}
                      title="Change Doctor">
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {appointment.notes && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{appointment.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={createCaseOpen} onOpenChange={setCreateCaseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Case from Appointment</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
            <div className="grid gap-2">
              <Label>Patient</Label>
              <p className="text-sm font-medium text-gray-900">{appointment.patient_name || appointment.patient_id}</p>
            </div>
            <div className="grid gap-2">
              <Label>Doctor</Label>
              <p className="text-sm font-medium text-gray-900">{appointment.doctor_name || appointment.doctor_id}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="complaint">Chief Complaint</Label>
              <Input id="complaint" placeholder="e.g. Tooth pain, routine checkup" value={caseComplaint} onChange={(e) => setCaseComplaint(e.target.value)} required />
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t">
            <Button variant="outline" onClick={() => setCreateCaseOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createCaseMutation.mutate({
                patient_id: appointment.patient_id,
                doctor_id: appointment.doctor_id,
                appointment_id: appointment.id,
                chief_complaint: caseComplaint || `Follow-up from ${appointment.appointment_date}`,
              })}
              disabled={createCaseMutation.isPending}
            >
              {createCaseMutation.isPending ? "Creating..." : "Create Case"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reassign Doctor Dialog */}
      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Doctor</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
            <div className="grid gap-2">
              <Label>Current Doctor</Label>
              <p className="text-sm font-medium text-gray-900">{appointment.doctor_name || appointment.doctor_id}</p>
            </div>
            <div className="grid gap-2">
              <Label>New Doctor *</Label>
              <Select value={newDoctorId} onValueChange={setNewDoctorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a doctor..." />
                </SelectTrigger>
                <SelectContent>
                  {doctorList.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Reason for change</Label>
              <Textarea value={reassignReason} onChange={(e) => setReassignReason(e.target.value)}
                rows={2} placeholder="e.g. Doctor unavailable, schedule conflict..." />
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t">
            <Button variant="outline" onClick={() => { setReassignOpen(false); setNewDoctorId(""); setReassignReason("") }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!newDoctorId) {
                  addToast({ title: "Required", description: "New Doctor ID is required", variant: "destructive" })
                  return
                }
                reassignMutation.mutate({ doctor_id: newDoctorId, reason: reassignReason || undefined })
              }}
              disabled={reassignMutation.isPending || !newDoctorId}
            >
              {reassignMutation.isPending ? "Reassigning..." : "Reassign Doctor"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
