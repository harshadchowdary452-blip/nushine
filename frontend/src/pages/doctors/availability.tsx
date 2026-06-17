import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { Clock, Plus, X, CalendarDays, Ban, CalendarOff, RotateCcw, Loader2, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import PageHeader from "@/components/layout/page-header"
import { doctorWorkingHoursApi, doctorAvailabilityApi, doctorLeavesApi, doctorBlockedSlotsApi } from "@/services/endpoints"
import { useAuthStore } from "@/store/authStore"
import { useToast } from "@/components/ui/toast"
import type { DoctorWorkingHour, DoctorAvailability, DoctorLeave, DoctorBlockedSlot } from "@/types"

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

const leaveStatusVariant: Record<string, "default" | "warning" | "success" | "destructive"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
}

type TabId = "hours" | "overrides" | "leaves" | "blocks"

const defaultSchedule = (dayOfWeek: number): Partial<DoctorWorkingHour> => ({
  day_of_week: dayOfWeek,
  start_time: "09:00",
  end_time: "21:00",
  lunch_start: "13:00",
  lunch_end: "14:00",
  is_available: dayOfWeek < 5,
})

export default function DoctorAvailability() {
  const { user } = useAuthStore()
  const doctorId = user?.id || ""
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [activeTab, setActiveTab] = useState<TabId>("hours")

  const [showOverrideDialog, setShowOverrideDialog] = useState(false)
  const [overrideForm, setOverrideForm] = useState({ date: "", start_time: "09:00", end_time: "21:00", lunch_start: "13:00", lunch_end: "14:00", is_available: "true", reason: "" })
  const [editingOverride, setEditingOverride] = useState<DoctorAvailability | null>(null)

  const [showLeaveDialog, setShowLeaveDialog] = useState(false)
  const [leaveForm, setLeaveForm] = useState({ start_date: "", end_date: "", reason: "" })

  const [showBlockDialog, setShowBlockDialog] = useState(false)
  const [blockForm, setBlockForm] = useState({ date: "", start_time: "09:00", end_time: "10:00", reason: "" })

  const workingHoursQuery = useQuery<DoctorWorkingHour[]>({
    queryKey: ["doctorWorkingHours", doctorId],
    queryFn: () => doctorWorkingHoursApi.get(doctorId),
    enabled: !!doctorId,
  })

  const overridesQuery = useQuery<DoctorAvailability[]>({
    queryKey: ["doctorAvailability", doctorId],
    queryFn: () => doctorAvailabilityApi.list(doctorId),
    enabled: !!doctorId,
  })

  const leavesQuery = useQuery<DoctorLeave[]>({
    queryKey: ["doctorLeaves", doctorId],
    queryFn: () => doctorLeavesApi.list(doctorId),
    enabled: !!doctorId,
  })

  const blockedSlotsQuery = useQuery<DoctorBlockedSlot[]>({
    queryKey: ["doctorBlockedSlots", doctorId],
    queryFn: () => doctorBlockedSlotsApi.list(doctorId),
    enabled: !!doctorId,
  })

  const schedules = workingHoursQuery.data || []

  const bulkUpdateMutation = useMutation({
    mutationFn: (schedulesData: Partial<DoctorWorkingHour>[]) => doctorWorkingHoursApi.bulkUpdate(doctorId, { schedules: schedulesData }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctorWorkingHours", doctorId] })
      addToast({ title: "Success", description: "Working hours updated", variant: "success" })
    },
    onError: () => addToast({ title: "Error", description: "Failed to update working hours", variant: "destructive" }),
  })

  const createOverrideMutation = useMutation({
    mutationFn: (data: any) => doctorAvailabilityApi.create(doctorId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctorAvailability", doctorId] })
      addToast({ title: "Success", description: "Override created", variant: "success" })
      setShowOverrideDialog(false)
      setEditingOverride(null)
    },
    onError: () => addToast({ title: "Error", description: "Failed to create override", variant: "destructive" }),
  })

  const updateOverrideMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => doctorAvailabilityApi.update(doctorId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctorAvailability", doctorId] })
      addToast({ title: "Success", description: "Override updated", variant: "success" })
      setShowOverrideDialog(false)
      setEditingOverride(null)
    },
    onError: () => addToast({ title: "Error", description: "Failed to update override", variant: "destructive" }),
  })

  const deleteOverrideMutation = useMutation({
    mutationFn: (id: string) => doctorAvailabilityApi.delete(doctorId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctorAvailability", doctorId] })
      addToast({ title: "Deleted", description: "Override deleted", variant: "success" })
    },
    onError: () => addToast({ title: "Error", description: "Failed to delete", variant: "destructive" }),
  })

  const createLeaveMutation = useMutation({
    mutationFn: (data: any) => doctorLeavesApi.create(doctorId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctorLeaves", doctorId] })
      addToast({ title: "Success", description: "Leave request submitted", variant: "success" })
      setShowLeaveDialog(false)
      setLeaveForm({ start_date: "", end_date: "", reason: "" })
    },
    onError: () => addToast({ title: "Error", description: "Failed to create leave", variant: "destructive" }),
  })

  const deleteLeaveMutation = useMutation({
    mutationFn: (id: string) => doctorLeavesApi.delete(doctorId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctorLeaves", doctorId] })
      addToast({ title: "Deleted", description: "Leave deleted", variant: "success" })
    },
    onError: () => addToast({ title: "Error", description: "Failed to delete leave", variant: "destructive" }),
  })

  const createBlockMutation = useMutation({
    mutationFn: (data: any) => doctorBlockedSlotsApi.create(doctorId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctorBlockedSlots", doctorId] })
      addToast({ title: "Success", description: "Blocked slot created", variant: "success" })
      setShowBlockDialog(false)
      setBlockForm({ date: "", start_time: "09:00", end_time: "10:00", reason: "" })
    },
    onError: () => addToast({ title: "Error", description: "Failed to create blocked slot", variant: "destructive" }),
  })

  const deleteBlockMutation = useMutation({
    mutationFn: (id: string) => doctorBlockedSlotsApi.delete(doctorId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctorBlockedSlots", doctorId] })
      addToast({ title: "Deleted", description: "Blocked slot deleted", variant: "success" })
    },
    onError: () => addToast({ title: "Error", description: "Failed to delete", variant: "destructive" }),
  })

  const handleDayToggle = (dayOfWeek: number, available: boolean) => {
    const existing = schedules.find((s) => s.day_of_week === dayOfWeek)
    if (existing) {
      bulkUpdateMutation.mutate(
        schedules.map((s) => (s.day_of_week === dayOfWeek ? { ...s, is_available: available } : s))
      )
    } else {
      bulkUpdateMutation.mutate([
        ...schedules,
        { ...defaultSchedule(dayOfWeek), is_available: available } as DoctorWorkingHour,
      ])
    }
  }

  const handleTimeChange = (dayOfWeek: number, field: string, value: string) => {
    const existing = schedules.find((s) => s.day_of_week === dayOfWeek)
    if (existing) {
      bulkUpdateMutation.mutate(
        schedules.map((s) => (s.day_of_week === dayOfWeek ? { ...s, [field]: value || null } : s))
      )
    } else {
      bulkUpdateMutation.mutate([
        ...schedules,
        { ...defaultSchedule(dayOfWeek), [field]: value || null } as DoctorWorkingHour,
      ])
    }
  }

  const handleOverrideSubmit = () => {
    const payload = {
      date: overrideForm.date,
      start_time: overrideForm.start_time || null,
      end_time: overrideForm.end_time || null,
      lunch_start: overrideForm.lunch_start || null,
      lunch_end: overrideForm.lunch_end || null,
      is_available: overrideForm.is_available === "true",
      reason: overrideForm.reason || null,
    }
    if (editingOverride) {
      updateOverrideMutation.mutate({ id: editingOverride.id, data: payload })
    } else {
      createOverrideMutation.mutate(payload)
    }
  }

  const openEditOverride = (ov: DoctorAvailability) => {
    setEditingOverride(ov)
    setOverrideForm({
      date: ov.date,
      start_time: ov.start_time || "09:00",
      end_time: ov.end_time || "21:00",
      lunch_start: ov.lunch_start || "13:00",
      lunch_end: ov.lunch_end || "14:00",
      is_available: ov.is_available ? "true" : "false",
      reason: ov.reason || "",
    })
    setShowOverrideDialog(true)
  }

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: "hours", label: "Working Hours", icon: Clock },
    { id: "overrides", label: "Date Overrides", icon: CalendarDays },
    { id: "leaves", label: "Leaves", icon: CalendarOff },
    { id: "blocks", label: "Blocked Slots", icon: Ban },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="My Availability" description="Manage your working hours, leaves, and blocked slots" />

      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.id ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === "hours" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Weekly Working Hours</span>
              <Button variant="outline" size="sm" onClick={() => {
                const defaults = DAY_NAMES.map((_, i) => defaultSchedule(i))
                bulkUpdateMutation.mutate(defaults as DoctorWorkingHour[])
              }} disabled={bulkUpdateMutation.isPending}>
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset to Defaults
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {DAY_NAMES.map((name, i) => {
                const s = schedules.find((s) => s.day_of_week === i)
                return (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-3 sm:w-40">
                      <Switch checked={s ? s.is_available : i < 5}
                        onCheckedChange={(v) => handleDayToggle(i, v)} />
                      <span className={`text-sm font-medium ${s && !s.is_available ? "text-gray-400 line-through" : "text-gray-900"}`}>
                        {name}
                      </span>
                    </div>
                    {(s ? s.is_available : i < 5) && (
                      <div className="flex flex-wrap items-center gap-2 flex-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs text-gray-500">From</Label>
                          <Input type="time" value={s?.start_time || "09:00"}
                            onChange={(e) => handleTimeChange(i, "start_time", e.target.value)}
                            className="h-8 w-28 text-xs" />
                        </div>
                        <div className="flex items-center gap-1">
                          <Label className="text-xs text-gray-500">To</Label>
                          <Input type="time" value={s?.end_time || "21:00"}
                            onChange={(e) => handleTimeChange(i, "end_time", e.target.value)}
                            className="h-8 w-28 text-xs" />
                        </div>
                        <Separator orientation="vertical" className="h-6 hidden sm:block" />
                        <div className="flex items-center gap-1">
                          <Label className="text-xs text-gray-500">Lunch</Label>
                          <Input type="time" value={s?.lunch_start || "13:00"}
                            onChange={(e) => handleTimeChange(i, "lunch_start", e.target.value)}
                            className="h-8 w-24 text-xs" />
                          <span className="text-xs text-gray-400">to</span>
                          <Input type="time" value={s?.lunch_end || "14:00"}
                            onChange={(e) => handleTimeChange(i, "lunch_end", e.target.value)}
                            className="h-8 w-24 text-xs" />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "overrides" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Date Overrides</span>
              <Button size="sm" onClick={() => {
                setEditingOverride(null)
                setOverrideForm({ date: "", start_time: "09:00", end_time: "21:00", lunch_start: "13:00", lunch_end: "14:00", is_available: "true", reason: "" })
                setShowOverrideDialog(true)
              }}>
                <Plus className="h-4 w-4 mr-1" /> Add Override
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overridesQuery.isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : overridesQuery.data?.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">No date overrides set</p>
            ) : (
              <div className="space-y-2">
                {overridesQuery.data?.map((ov) => (
                  <div key={ov.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-3">
                      <Badge variant={ov.is_available ? "success" : "destructive"} className="w-16 justify-center">
                        {ov.is_available ? "Available" : "Unavailable"}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{format(new Date(ov.date), "MMM dd, yyyy")}</p>
                        {ov.is_available && (
                          <p className="text-xs text-gray-500">
                            {ov.start_time?.slice(0, 5)} - {ov.end_time?.slice(0, 5)}
                            {ov.lunch_start && ` | Lunch: ${ov.lunch_start.slice(0, 5)}-${ov.lunch_end?.slice(0, 5)}`}
                          </p>
                        )}
                        {ov.reason && <p className="text-xs text-gray-400 mt-0.5">{ov.reason}</p>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditOverride(ov)}>
                        <Clock className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => deleteOverrideMutation.mutate(ov.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "leaves" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Leave Requests</span>
              <Button size="sm" onClick={() => setShowLeaveDialog(true)}>
                <Plus className="h-4 w-4 mr-1" /> Request Leave
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leavesQuery.isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : leavesQuery.data?.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">No leave requests</p>
            ) : (
              <div className="space-y-2">
                {leavesQuery.data?.map((leave) => (
                  <div key={leave.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-3">
                      <Badge variant={leaveStatusVariant[leave.status]} className="w-20 justify-center">
                        {leave.status}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {format(new Date(leave.start_date), "MMM dd")} - {format(new Date(leave.end_date), "MMM dd, yyyy")}
                        </p>
                        {leave.reason && <p className="text-xs text-gray-500">{leave.reason}</p>}
                      </div>
                    </div>
                    {leave.status === "PENDING" && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => deleteLeaveMutation.mutate(leave.id)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "blocks" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Blocked Slots</span>
              <Button size="sm" onClick={() => setShowBlockDialog(true)}>
                <Plus className="h-4 w-4 mr-1" /> Block Slot
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {blockedSlotsQuery.isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : blockedSlotsQuery.data?.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">No blocked slots</p>
            ) : (
              <div className="space-y-2">
                {blockedSlotsQuery.data?.map((block) => (
                  <div key={block.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-3">
                      <Badge variant="destructive" className="w-16 justify-center">Blocked</Badge>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{format(new Date(block.date), "MMM dd, yyyy")}</p>
                        <p className="text-xs text-gray-500">{block.start_time.slice(0, 5)} - {block.end_time.slice(0, 5)}{block.reason ? ` - ${block.reason}` : ""}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => deleteBlockMutation.mutate(block.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={showOverrideDialog} onOpenChange={(open) => { if (!open) { setShowOverrideDialog(false); setEditingOverride(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingOverride ? "Edit Override" : "Add Date Override"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Date</Label>
              <Input type="date" value={overrideForm.date}
                onChange={(e) => setOverrideForm({ ...overrideForm, date: e.target.value })} />
            </div>
            <div>
              <Label>Availability</Label>
              <Select value={overrideForm.is_available} onValueChange={(v) => setOverrideForm({ ...overrideForm, is_available: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Available</SelectItem>
                  <SelectItem value="false">Unavailable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {overrideForm.is_available === "true" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Start Time</Label>
                    <Input type="time" value={overrideForm.start_time}
                      onChange={(e) => setOverrideForm({ ...overrideForm, start_time: e.target.value })} />
                  </div>
                  <div>
                    <Label>End Time</Label>
                    <Input type="time" value={overrideForm.end_time}
                      onChange={(e) => setOverrideForm({ ...overrideForm, end_time: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Lunch Start</Label>
                    <Input type="time" value={overrideForm.lunch_start}
                      onChange={(e) => setOverrideForm({ ...overrideForm, lunch_start: e.target.value })} />
                  </div>
                  <div>
                    <Label>Lunch End</Label>
                    <Input type="time" value={overrideForm.lunch_end}
                      onChange={(e) => setOverrideForm({ ...overrideForm, lunch_end: e.target.value })} />
                  </div>
                </div>
              </>
            )}
            <div>
              <Label>Reason (optional)</Label>
              <Textarea value={overrideForm.reason}
                onChange={(e) => setOverrideForm({ ...overrideForm, reason: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowOverrideDialog(false); setEditingOverride(null); }}>Cancel</Button>
            <Button onClick={handleOverrideSubmit} disabled={!overrideForm.date || createOverrideMutation.isPending || updateOverrideMutation.isPending}>
              {editingOverride ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLeaveDialog} onOpenChange={(open) => { if (!open) { setShowLeaveDialog(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Leave</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={leaveForm.start_date}
                  onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })} />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="date" value={leaveForm.end_date}
                  onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Reason (optional)</Label>
              <Textarea value={leaveForm.reason}
                onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveDialog(false)}>Cancel</Button>
            <Button onClick={() => createLeaveMutation.mutate(leaveForm)}
              disabled={!leaveForm.start_date || !leaveForm.end_date || createLeaveMutation.isPending}>
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBlockDialog} onOpenChange={(open) => { if (!open) { setShowBlockDialog(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block Time Slot</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Date</Label>
              <Input type="date" value={blockForm.date}
                onChange={(e) => setBlockForm({ ...blockForm, date: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Time</Label>
                <Input type="time" value={blockForm.start_time}
                  onChange={(e) => setBlockForm({ ...blockForm, start_time: e.target.value })} />
              </div>
              <div>
                <Label>End Time</Label>
                <Input type="time" value={blockForm.end_time}
                  onChange={(e) => setBlockForm({ ...blockForm, end_time: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Reason (optional)</Label>
              <Textarea value={blockForm.reason}
                onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBlockDialog(false)}>Cancel</Button>
            <Button onClick={() => createBlockMutation.mutate(blockForm)}
              disabled={!blockForm.date || !blockForm.start_time || !blockForm.end_time || createBlockMutation.isPending}>
              Block Slot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
