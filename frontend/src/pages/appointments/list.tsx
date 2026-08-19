import { useState, useMemo, useRef, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef, SortingState } from "@tanstack/react-table"
import {
  Plus, Search, Eye, Trash2, Calendar, List, ChevronLeft, ChevronRight,
  CalendarDays, User as UserIcon, X,
} from "lucide-react"
import { format, eachDayOfInterval, startOfMonth, endOfMonth, getDay, isSameDay } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { appointmentsApi, patientsApi, doctorsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import QuickExport from "@/components/ui/quick-export"
import { useServerFilters } from "@/hooks/useServerFilters"
import AppointmentFilterBar from "./filter-bar"
import AppointmentScheduler from "@/components/appointments/AppointmentScheduler"
import { EnterpriseWorkspace, DataTable, StatusBadge, WorkflowSummaryPanel } from "@/design-system"
import type { Appointment, Patient, User, PaginatedResponse } from "@/types"
import { showErrorToast } from "@/utils/showErrorToast"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/store/authStore"
import { useCreateParam } from "@/lib/use-create-param"

const DATE_PRESET_KEYS = new Set(["date_preset"])

interface AppointmentForm {
  patient_id: string; doctor_id: string; appointment_date: string;
  appointment_time: string; notes: string; duration_minutes: number
}

function getEmptyAppointmentForm(): AppointmentForm {
  return {
    patient_id: "", doctor_id: "", appointment_date: "", appointment_time: "",
    notes: "", duration_minutes: 30,
  }
}

export default function AppointmentList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const {
    filters, setFilter, resetFilters, queryKey, activeFilters, hasActiveFilters,
    page, setPage, sortField, sortDir, setSort, activeChips,
  } = useServerFilters({ defaultSort: "appointment_date", defaultSortDir: "desc" })

  const [view, setView] = useState<"list" | "calendar">("list")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingAppointment, setDeletingAppointment] = useState<Appointment | null>(null)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [form, setForm] = useState<AppointmentForm>(getEmptyAppointmentForm)
  const [patientSearch, setPatientSearch] = useState("")
  const patientSearchRef = useRef<HTMLInputElement>(null)
  const [, setAvailability] = useState<{ available: boolean; current_count: number; max_allowed: number; message?: string } | null>(null)
  const [, setCheckingAvailability] = useState(false)
  const [contextPatient, setContextPatient] = useState<Patient | null>(null)
  const prefillHandledRef = useRef(false)
  const [searchParams] = useSearchParams()

  useCreateParam(() => openDialog())

  const currentUser = useAuthStore((s) => s.user)

  const { data, isLoading } = useQuery<PaginatedResponse<Appointment>>({
    queryKey: ["appointments", "search", queryKey, page],
    queryFn: () => {
      const params: Record<string, string | number> = {
        page, page_size: 10,
        sort_by: sortField, sort_order: sortDir,
      }
      for (const [k, v] of Object.entries(filters)) {
        if (v !== "" && v !== undefined && !DATE_PRESET_KEYS.has(k)) params[k] = v
      }
      return appointmentsApi.search(params)
    },
    placeholderData: (prev) => prev,
  })

  const { data: doctorsData } = useQuery<PaginatedResponse<User>>({
    queryKey: ["doctors", "appointments-dropdown"],
    queryFn: () => doctorsApi.list({ page_size: 200, admin_group_id: currentUser?.admin_group_id || undefined }),
  })

  const doctors: User[] = useMemo(() => {
    if (Array.isArray(doctorsData)) return doctorsData
    return doctorsData?.items || []
  }, [doctorsData])

  const appointments: Appointment[] = useMemo(() => {
    if (Array.isArray(data)) return data
    return data?.items || []
  }, [data])

  const totalPages = useMemo(() => {
    if (Array.isArray(data)) return 1
    return data?.total_pages || data?.pages || 1
  }, [data])

  const totalCount = useMemo(() => {
    if (Array.isArray(data)) return data.length
    return data?.total ?? 0
  }, [data])

  // Patient data for create dialog
  const { data: patientsData } = useQuery<PaginatedResponse<Patient>>({
    queryKey: ["patients", "dropdown"],
    queryFn: () => patientsApi.list({ page_size: 200, hospital_id: currentUser?.hospital_id || undefined }),
  })

  const patients: Patient[] = useMemo(() => {
    if (Array.isArray(patientsData)) return patientsData
    return patientsData?.items || []
  }, [patientsData])

  const filteredPatients = useMemo(() => {
    if (!patientSearch) return patients
    const q = patientSearch.toLowerCase()
    return patients.filter(
      (p) => p.full_name.toLowerCase().includes(q) || (p.phone && p.phone.includes(q)) || p.id.toLowerCase().includes(q)
    )
  }, [patients, patientSearch])

  const selectedPatient = useMemo(() => patients.find((p) => p.id === form.patient_id), [patients, form.patient_id])

  // Context-aware forms: opening /appointments?patient_id=X (e.g. from a
  // patient's "Schedule Appointment" action) auto-fills the patient and opens
  // the create dialog with the inherited record.
  useEffect(() => {
    const pid = searchParams.get("patient_id")
    if (!pid || prefillHandledRef.current) return
    const patient = patients.find((p) => p.id === pid)
    if (!patient) return
    prefillHandledRef.current = true
    setContextPatient(patient)
    const doctorId = searchParams.get("doctor_id")
    setForm((f) => ({ ...f, patient_id: pid, doctor_id: doctorId ?? f.doctor_id }))
    setPatientSearch("")
    setDialogOpen(true)
  }, [searchParams, patients])

  useEffect(() => {
    if (form.doctor_id && form.appointment_date && form.appointment_time) {
      setCheckingAvailability(true)
      setAvailability(null)
      const timer = setTimeout(async () => {
        try {
          const res = await appointmentsApi.checkAvailability({
            doctor_id: form.doctor_id, appointment_date: form.appointment_date, appointment_time: form.appointment_time,
          })
          setAvailability(res)
        } catch { setAvailability(null) } finally { setCheckingAvailability(false) }
      }, 400)
      return () => clearTimeout(timer)
    } else {
      setAvailability(null)
      setCheckingAvailability(false)
    }
  }, [form.doctor_id, form.appointment_date, form.appointment_time])

  function handlePatientSelect(patientId: string) { setForm({ ...form, patient_id: patientId }); setPatientSearch("") }
  function clearPatientSelection() { setForm({ ...form, patient_id: "" }) }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => appointmentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["doctor-slots"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["patients"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      addToast({ title: "Success", description: "Appointment deleted successfully", variant: "success" })
      setDeleteDialogOpen(false); setDeletingAppointment(null)
    },
    onError: (err: unknown) => {
      showErrorToast(err, addToast)
    },
  })

  function confirmDelete(appointment: Appointment) { setDeletingAppointment(appointment); setDeleteDialogOpen(true) }
  function handleDelete() { if (deletingAppointment) deleteMutation.mutate(deletingAppointment.id) }

  function applySavedFilters(saved: Record<string, string>) {
    resetFilters()
    for (const [k, v] of Object.entries(saved)) setFilter(k, v)
  }

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => appointmentsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["doctor-slots"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["patients"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      addToast({ title: "Success", description: "Appointment created successfully", variant: "success" })
      resetForm()
    },
    onError: (err: unknown) => {
      showErrorToast(err, addToast)
    },
  })

  function resetForm() { setForm(getEmptyAppointmentForm()); setPatientSearch(""); setContextPatient(null); prefillHandledRef.current = false; setDialogOpen(false) }
  function openDialog() { setForm(getEmptyAppointmentForm()); setPatientSearch(""); setContextPatient(null); setDialogOpen(true) }
  function handleDialogOpenChange(open: boolean) { if (!open) resetForm(); setDialogOpen(open) }

  const columns = useMemo<ColumnDef<Appointment>[]>(
    () => [
      {
        accessorKey: "patient_name",
        header: "Patient Name",
        enableSorting: true,
        cell: ({ row }) => <span className="font-medium">{row.original.patient_name || "—"}</span>,
      },
      {
        accessorKey: "doctor_name",
        header: "Doctor",
        enableSorting: true,
        cell: ({ row }) => row.original.doctor_name || "—",
      },
      {
        accessorKey: "appointment_date",
        header: "Date",
        enableSorting: true,
        cell: ({ row }) => format(new Date(row.original.appointment_date), "MMM dd, yyyy"),
      },
      {
        accessorKey: "appointment_time",
        header: "Time",
        enableSorting: false,
        cell: ({ row }) => row.original.appointment_time || "—",
      },
      {
        accessorKey: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/appointments/${row.original.id}`) }}>
              <Eye className="h-4 w-4 mr-1" /> View
            </Button>
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); confirmDelete(row.original) }}>
              <Trash2 className="h-4 w-4 text-[var(--ds-danger)]" />
            </Button>
          </div>
        ),
      },
    ],
    [navigate]
  )

  function handleSortingChange(sorting: SortingState) {
    const f = sorting[0]
    setSort(f?.id ?? "", f?.desc ? "desc" : "asc")
  }

  const monthDays = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) })
  const startDay = getDay(startOfMonth(currentMonth))
  const calendarDays: (Date | null)[] = [...Array.from({ length: startDay }, () => null), ...monthDays]

  const appointmentsByDate = useMemo(() => {
    const map: Record<string, number> = {}
    appointments.forEach((a) => {
      const key = format(new Date(a.appointment_date), "yyyy-MM-dd")
      map[key] = (map[key] || 0) + 1
    })
    return map
  }, [appointments])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.patient_id) { addToast({ title: "Validation Error", description: "Please select a patient", variant: "destructive" }); return }
    if (!form.appointment_date || !form.appointment_time) { addToast({ title: "Validation Error", description: "Please select both date and time", variant: "destructive" }); return }
    const cleaned: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(form)) { if (value !== "" && value !== undefined) cleaned[key] = value }
    createMutation.mutate(cleaned)
  }

  const FilterBarDesktop = (
    <AppointmentFilterBar
      filters={filters} setFilter={setFilter} resetFilters={resetFilters}
      activeCount={activeFilters} doctors={doctors}
    />
  )

  return (
    <>
      <EnterpriseWorkspace
        title="Appointments"
        description="Manage appointments"
        headerActions={
          currentUser?.role !== "DOCTOR" && (
            <Button onClick={openDialog}><Plus className="h-4 w-4" /> New Appointment</Button>
          )
        }
        toolbarActions={<>
          <div className="flex items-center gap-2">
            <Button variant={view === "list" ? "default" : "outline"} size="sm" onClick={() => setView("list")} aria-label="List view">
              <List className="h-4 w-4" />
            </Button>
            <Button variant={view === "calendar" ? "default" : "outline"} size="sm" onClick={() => setView("calendar")} aria-label="Calendar view">
              <Calendar className="h-4 w-4" />
            </Button>
          </div>
          <QuickExport module="appointments" label="appointments" />
        </>}
        filters={{
          fields: FilterBarDesktop,
          chips: activeChips,
          activeCount: activeFilters,
          onRemoveChip: (k) => setFilter(k, ""),
          onClearAll: resetFilters,
          savedStorageKey: "appointments-list",
          savedCurrent: filters,
          onApplySaved: applySavedFilters,
        }}
        totalCount={totalCount}
        totalLabel="appointments"
      >
        {view === "calendar" ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{format(currentMonth, "MMMM yyyy")}</h3>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setCurrentMonth(new Date())}>
                    <CalendarDays className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
                ))}
                {calendarDays.map((day, i) => {
                  if (!day) return <div key={`empty-${i}`} />
                  const key = format(day, "yyyy-MM-dd")
                  const count = appointmentsByDate[key]
                  const isToday = isSameDay(day, new Date())
                  return (
                    <div key={key} className={cn(
                      "relative flex h-16 flex-col items-center justify-center rounded-lg border text-sm transition-colors hover:bg-muted/50 cursor-pointer",
                      isToday && "border-primary bg-primary/5"
                    )}>
                      <span className="text-xs">{format(day, "d")}</span>
                      {count && (
                        <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">{count}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        ) : (
          <DataTable
            key={queryKey}
            columns={columns}
            data={appointments}
            loading={isLoading}
            pagination
            pageSize={10}
            manualPagination
            pageCount={totalPages}
            onPageChange={(pageIndex) => setPage(pageIndex + 1)}
            manualSorting
            initialSorting={sortField ? [{ id: sortField, desc: sortDir === "desc" }] : []}
            onSortingChange={handleSortingChange}
            emptyIcon={CalendarDays}
            emptyTitle="No appointments found"
            emptyDescription={hasActiveFilters ? "Try adjusting your filters." : "Schedule your first appointment."}
            emptyAction={
              hasActiveFilters ? (
                <Button variant="outline" onClick={resetFilters}>Clear Filters</Button>
              ) : currentUser?.role !== "DOCTOR" ? (
                <Button onClick={openDialog}><Plus className="h-4 w-4" /> New Appointment</Button>
              ) : undefined
            }
            mobileCard={(row) => (
              <div className="flex items-center justify-between gap-3">
                <div className="ds-min-w-0">
                  <p className="ds-body font-medium text-[var(--ds-text)]">{row.patient_name || "—"}</p>
                  <p className="ds-caption text-[var(--ds-text-secondary)]">
                    {row.doctor_name || "—"} · {format(new Date(row.appointment_date), "dd MMM")} {row.appointment_time || ""}
                  </p>
                </div>
                <StatusBadge status={row.status} />
              </div>
            )}
            onRowClick={(row) => navigate(`/appointments/${row.id}`)}
          />
        )}
      </EnterpriseWorkspace>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
            <DialogTitle>New Appointment</DialogTitle>
            <DialogDescription>Schedule a new appointment for a patient.</DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={handleSubmit} className="flex flex-col min-h-0">
            <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
              {contextPatient && (
                <WorkflowSummaryPanel
                  title="Opened from patient context"
                  items={[
                    { label: "Patient", value: contextPatient.full_name },
                    { label: "Phone", value: contextPatient.phone || "—" },
                    { label: "Age", value: contextPatient.age ? `${contextPatient.age} yrs` : "—" },
                    { label: "Doctor", value: doctors.find((d) => d.id === form.doctor_id)?.full_name || "Not selected" },
                    { label: "Date", value: form.appointment_date || "Not selected" },
                  ]}
                />
              )}
              <div className="grid gap-2">
                <Label>Patient</Label>
                {selectedPatient ? (
                  <div className="rounded-xl border border-border bg-[var(--ds-surface)]  p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                          <UserIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--ds-text)] ">{selectedPatient.full_name}</p>
                          <p className="text-xs text-[var(--ds-text-muted)] ">ID: {selectedPatient.id.slice(0, 8)}</p>
                        </div>
                      </div>
                      <button type="button" onClick={clearPatientSelection} className="text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--ds-text-muted)] ">
                      {selectedPatient.age && <span>Age: {selectedPatient.age}</span>}
                      {selectedPatient.gender && <span>Gender: {selectedPatient.gender}</span>}
                      {selectedPatient.phone && <span>Phone: {selectedPatient.phone}</span>}
                    </div>
                    <div className="mt-2"><StatusBadge status={selectedPatient.status} /></div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-muted)]" />
                      <Input ref={patientSearchRef} placeholder="Search by Name / Phone" value={patientSearch}
                        onChange={(e) => setPatientSearch(e.target.value)}
                        className="pl-10 bg-[var(--ds-surface)]  border-[var(--ds-border)]  text-[var(--ds-text)] " />
                    </div>
                    {patientSearch && (
                      <div className="max-h-[260px] overflow-y-auto rounded-xl border border-[var(--ds-border)]  bg-[var(--ds-surface)] ">
                        {filteredPatients.length === 0 ? (
                          <div className="p-6 text-center text-sm text-[var(--ds-text-muted)]">No patients found</div>
                        ) : filteredPatients.map((p) => (
                          <button key={p.id} type="button"
                            className="w-full px-4 py-3 text-left border-b border-[var(--ds-border)]  last:border-0 hover:bg-[var(--ds-surface-hover)] transition-colors"
                            onClick={() => handlePatientSelect(p.id)}>
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm text-[var(--ds-text)] ">{p.full_name}</span>
                              <StatusBadge status={p.status} />
                            </div>
                            <div className="flex items-center gap-3 text-xs text-[var(--ds-text-muted)]  mt-1">
                              {p.phone && <span>{p.phone}</span>}
                              <span>ID: {p.id.slice(0, 8)}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="doctor">Doctor</Label>
                <Select value={form.doctor_id} onValueChange={(v) => setForm({ ...form, doctor_id: v })} required>
                  <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                  <SelectContent>{doctors.map((d) => <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="date">Date</Label>
                  <Input id="date" type="date" value={form.appointment_date}
                    onChange={(e) => setForm({ ...form, appointment_date: e.target.value, appointment_time: "" })} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="duration">Duration (min)</Label>
                  <Select value={String(form.duration_minutes)} onValueChange={(v) => setForm({ ...form, duration_minutes: Number(v), appointment_time: "" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 min</SelectItem><SelectItem value="30">30 min</SelectItem>
                      <SelectItem value="45">45 min</SelectItem><SelectItem value="60">60 min</SelectItem>
                      <SelectItem value="90">90 min</SelectItem><SelectItem value="120">120 min</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              {form.doctor_id && form.appointment_date && (
                <AppointmentScheduler
                  doctorId={form.doctor_id}
                  date={form.appointment_date}
                  selectedTime={form.appointment_time}
                  showDoctorSelector={false}
                  onSelect={(data) => setForm({
                    ...form,
                    appointment_time: data.appointment_time,
                    duration_minutes: data.duration_minutes,
                  })}
                />
              )}
            </div>
            <DialogFooter className="px-6 pb-6 pt-2 shrink-0 border-t border-[var(--ds-border-light)]">
              <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Appointment</DialogTitle>
            <DialogDescription>Are you sure you want to delete this appointment? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
