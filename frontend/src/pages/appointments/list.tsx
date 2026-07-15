import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { motion } from "framer-motion"
import {
  Plus, Search, Eye, Trash2, Calendar, List, ChevronLeft, ChevronRight,
  CalendarDays, User as UserIcon, X, Clock, SlidersHorizontal,
} from "lucide-react"
import { format, eachDayOfInterval, startOfMonth, endOfMonth, getDay, isSameDay } from "date-fns"
import PageHeader from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { appointmentsApi, patientsApi, doctorsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import QuickExport from "@/components/ui/quick-export"
import { useServerFilters } from "@/hooks/useServerFilters"
import { FilterChips } from "@/components/ui/filter-bar"
import AppointmentFilterBar from "./filter-bar"
import type { Appointment, Patient, User, PaginatedResponse, DoctorSlotResponse } from "@/types"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/store/authStore"

const DATE_PRESET_KEYS = new Set(["date_preset"])

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    SCHEDULED: "bg-blue-50 text-blue-700 border-blue-200",
    COMPLETED: "bg-green-50 text-green-700 border-green-200",
    CANCELLED: "bg-red-50 text-red-700 border-red-200",
    RESCHEDULED: "bg-orange-50 text-orange-700 border-orange-200",
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {status?.replace(/_/g, " ")}
    </span>
  )
}

interface AppointmentForm {
  patient_id: string; doctor_id: string; appointment_date: string;
  appointment_time: string; notes: string; appointment_type: string; duration_minutes: number
}

const APPOINTMENT_TYPES = [
  { value: "CONSULTATION", label: "Consultation", duration: 30 },
  { value: "FOLLOW_UP", label: "Follow Up", duration: 30 },
  { value: "TREATMENT", label: "Treatment", duration: 60 },
  { value: "EMERGENCY", label: "Emergency", duration: 30 },
  { value: "REVIEW", label: "Review", duration: 30 },
]

function getEmptyAppointmentForm(): AppointmentForm {
  return {
    patient_id: "", doctor_id: "", appointment_date: "", appointment_time: "",
    notes: "", appointment_type: "CONSULTATION", duration_minutes: 30,
  }
}

const SLOT_COLORS: Record<string, string> = {
  available: "bg-green-100 text-green-800 border-green-300 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700 cursor-pointer",
  booked: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700 cursor-not-allowed opacity-60",
  leave: "bg-gray-100 text-gray-400 border-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700 cursor-not-allowed opacity-50",
  blocked: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700 cursor-not-allowed opacity-60",
  past: "bg-gray-50 text-gray-300 border-gray-100 dark:bg-gray-900 dark:text-gray-600 dark:border-gray-800 cursor-not-allowed opacity-40",
  selected: "bg-blue-500 text-white border-blue-600 dark:bg-blue-600 dark:border-blue-700 cursor-pointer",
}

interface SlotGridProps {
  doctorId: string; date: string; durationMinutes: number;
  selectedTime: string; onSelect: (time: string) => void
}

function SlotGrid({ doctorId, date, durationMinutes, selectedTime, onSelect }: SlotGridProps) {
  const { data, isLoading, isError, error } = useQuery<DoctorSlotResponse>({
    queryKey: ["doctor-slots", doctorId, date, durationMinutes],
    queryFn: () => appointmentsApi.slots({ doctor_id: doctorId, date, duration_minutes: durationMinutes }),
    enabled: !!doctorId && !!date,
    retry: 0,
  })

  if (isLoading) {
    return (
      <div className="rounded-xl border p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
          Loading available slots...
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
        <p className="text-sm text-red-600 font-medium">Failed to load slots</p>
        <p className="text-xs text-red-500">{(error as any)?.response?.data?.detail || (error as any)?.message || "Unknown error"}</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold">
          {data.doctor_name} — {format(new Date(data.date), "MMM dd, yyyy")}
        </h4>
        {data.is_on_leave && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            On Leave{data.leave_reason ? `: ${data.leave_reason}` : ""}
          </span>
        )}
      </div>
      {data.working_hours && (
        <p className="text-xs text-muted-foreground mb-2">Working hours: {data.working_hours}</p>
      )}
      {data.slots.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No slots available for this date.</p>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-3 flex-wrap text-xs">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border border-green-300 bg-green-100 dark:bg-green-900/30 dark:border-green-700" /> Available</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border border-red-300 bg-red-100 dark:bg-red-900/30 dark:border-red-700" /> Booked</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border border-gray-200 bg-gray-100 dark:bg-gray-800 dark:border-gray-700" /> Unavailable</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500" /> Selected</span>
          </div>
          <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto">
            {data.slots.map((slot) => {
              const isSelected = selectedTime === slot.time
              const colorClass = isSelected ? SLOT_COLORS.selected : SLOT_COLORS[slot.status] || SLOT_COLORS.past
              return (
                <button
                  key={slot.time}
                  type="button"
                  disabled={slot.status !== "available" && !isSelected}
                  onClick={() => { if (slot.status === "available") onSelect(slot.time) }}
                  className={cn("px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors", colorClass)}
                  title={
                    slot.status === "booked" ? `Booked by ${slot.patient_name || "someone"}${slot.appointment_type ? ` (${slot.appointment_type})` : ""}`
                    : slot.status === "blocked" ? "Blocked"
                    : slot.status === "leave" ? "Doctor on leave"
                    : slot.status === "past" ? "Past time"
                    : `${slot.time} - Available`
                  }
                >
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {slot.time.slice(0, 5).replace(/^0(\d)/, "$1")}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default function AppointmentList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const {
    filters, setFilter, resetFilters, queryKey, activeFilters, hasActiveFilters,
    page, setPage, sortField, sortDir, toggleSort, activeChips,
  } = useServerFilters({ defaultSort: "appointment_date", defaultSortDir: "desc" })

  const [view, setView] = useState<"list" | "calendar">("list")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingAppointment, setDeletingAppointment] = useState<Appointment | null>(null)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [form, setForm] = useState<AppointmentForm>(getEmptyAppointmentForm)
  const [patientSearch, setPatientSearch] = useState("")
  const patientSearchRef = useRef<HTMLInputElement>(null)
  const [availability, setAvailability] = useState<{ available: boolean; current_count: number; max_allowed: number; message?: string } | null>(null)
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  const currentUser = useAuthStore((s) => s.user)

  const { data, isLoading } = useQuery<PaginatedResponse<Appointment>>({
    queryKey: ["appointments", "search", queryKey],
    queryFn: () => {
      const params: Record<string, any> = {
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

  const totalCount = useMemo(() => {
    if (Array.isArray(data)) return data.length
    return data?.total || 0
  }, [data])

  const totalPages = useMemo(() => {
    if (Array.isArray(data)) return 1
    return data?.total_pages || 1
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
    onError: (err: any) => {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to delete appointment", variant: "destructive" })
    },
  })

  function confirmDelete(appointment: Appointment) { setDeletingAppointment(appointment); setDeleteDialogOpen(true) }
  function handleDelete() { if (deletingAppointment) deleteMutation.mutate(deletingAppointment.id) }

  const createMutation = useMutation({
    mutationFn: (data: any) => appointmentsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["doctor-slots"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["patients"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      addToast({ title: "Success", description: "Appointment created successfully", variant: "success" })
      resetForm()
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail
      const msg = Array.isArray(detail) ? detail.map((d: any) => d.msg).join("; ") : detail || "Failed to create appointment"
      addToast({ title: "Error", description: msg, variant: "destructive" })
    },
  })

  function resetForm() { setForm(getEmptyAppointmentForm()); setPatientSearch(""); setDialogOpen(false) }
  function openDialog() { setForm(getEmptyAppointmentForm()); setPatientSearch(""); setDialogOpen(true) }
  function handleDialogOpenChange(open: boolean) { if (!open) resetForm(); setDialogOpen(open) }

  const columns = useMemo<ColumnDef<Appointment>[]>(
    () => [
      {
        accessorKey: "patient_name",
        header: () => (
          <button onClick={() => toggleSort("patient_name")} className="flex items-center gap-1 hover:text-foreground">
            Patient Name
            {sortField === "patient_name" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
          </button>
        ),
        cell: ({ row }) => <span className="font-medium">{row.original.patient_name || "—"}</span>,
      },
      {
        accessorKey: "doctor_name",
        header: () => (
          <button onClick={() => toggleSort("doctor_name")} className="flex items-center gap-1 hover:text-foreground">
            Doctor
            {sortField === "doctor_name" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
          </button>
        ),
        cell: ({ row }) => row.original.doctor_name || "—",
      },
      {
        accessorKey: "appointment_date",
        header: () => (
          <button onClick={() => toggleSort("appointment_date")} className="flex items-center gap-1 hover:text-foreground">
            Date
            {sortField === "appointment_date" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
          </button>
        ),
        cell: ({ row }) => format(new Date(row.original.appointment_date), "MMM dd, yyyy"),
      },
      {
        accessorKey: "appointment_time",
        header: "Time",
        cell: ({ row }) => row.original.appointment_time || "—",
      },
      {
        accessorKey: "status",
        header: () => (
          <button onClick={() => toggleSort("status")} className="flex items-center gap-1 hover:text-foreground">
            Status
            {sortField === "status" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
          </button>
        ),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => navigate(`/appointments/${row.original.id}`)}>
              <Eye className="h-4 w-4 mr-1" /> View
            </Button>
            <Button variant="ghost" size="icon" onClick={() => confirmDelete(row.original)}>
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </div>
        ),
      },
    ],
    [navigate, sortField, sortDir, toggleSort]
  )

  const table = useReactTable({
    data: appointments,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

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
    <div className="space-y-6">
      <PageHeader title="Appointments" description="Manage appointments">
        {currentUser?.role !== "DOCTOR" && (
          <Button onClick={openDialog}><Plus className="h-4 w-4" /> New Appointment</Button>
        )}
        <QuickExport module="appointments" label="appointments" />
      </PageHeader>

      <Card>
        <CardContent className="p-6">
          {/* Mobile filter trigger */}
          <div className="lg:hidden mb-4">
            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="w-full">
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  Filters {activeFilters > 0 && `(${activeFilters})`}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] sm:w-[360px] p-0">
                <SheetHeader className="p-4 pb-2 border-b">
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="p-4 overflow-y-auto h-[calc(100%-60px)]">
                  <AppointmentFilterBar
                    filters={filters} setFilter={setFilter} resetFilters={resetFilters}
                    activeCount={activeFilters} doctors={doctors}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Desktop filter bar */}
          <div className="hidden lg:block mb-4">
            {FilterBarDesktop}
          </div>

          {/* Active filter chips */}
          <div className="mb-4">
            <FilterChips chips={activeChips} onRemove={(k) => setFilter(k, "")} onClearAll={resetFilters} />
          </div>

          {/* View toggle + results count */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {totalCount} appointment{totalCount !== 1 ? "s" : ""} found
            </p>
            <div className="flex items-center gap-2">
              <Button variant={view === "list" ? "default" : "outline"} size="sm" onClick={() => setView("list")}>
                <List className="h-4 w-4" />
              </Button>
              <Button variant={view === "calendar" ? "default" : "outline"} size="sm" onClick={() => setView("calendar")}>
                <Calendar className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Calendar View */}
          {view === "calendar" && (
            <div className="mb-6">
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
            </div>
          )}

          {/* List View */}
          {view === "list" && (
            <>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : appointments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                    <CalendarDays className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold">No appointments found</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {hasActiveFilters ? "Try adjusting your filters." : "Schedule your first appointment."}
                  </p>
                  {hasActiveFilters ? (
                    <Button className="mt-4" variant="outline" onClick={resetFilters}>Clear Filters</Button>
                  ) : currentUser?.role !== "DOCTOR" ? (
                    <Button className="mt-4" onClick={openDialog}><Plus className="h-4 w-4" /> New Appointment</Button>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-md border mobile-card-view">
                    <table className="w-full text-sm">
                      <thead>
                        {table.getHeaderGroups().map((hg) => (
                          <tr key={hg.id} className="border-b bg-muted/50">
                            {hg.headers.map((header) => (
                              <th key={header.id} className="px-4 py-3 text-left font-medium text-muted-foreground">
                                {flexRender(header.column.columnDef.header, header.getContext())}
                              </th>
                            ))}
                          </tr>
                        ))}
                      </thead>
                      <tbody>
                        {table.getRowModel().rows.map((row) => (
                          <motion.tr key={row.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="border-b transition-colors hover:bg-muted/50">
                            {row.getVisibleCells().map((cell) => {
                              const header = cell.column.columnDef.header
                              const label = typeof header === "string" ? header : cell.column.id
                              return (
                                <td key={cell.id} className="px-4 py-3" data-label={label}>
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                              )
                            })}
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Server-side pagination */}
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Page {page} of {totalPages} ({totalCount} total)
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                        Previous
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
            <DialogTitle>New Appointment</DialogTitle>
            <DialogDescription>Schedule a new appointment for a patient.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
            <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
              <div className="grid gap-2">
                <Label>Patient</Label>
                {selectedPatient ? (
                  <div className="rounded-xl border border-border bg-white dark:bg-[#1E293B] p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                          <UserIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">{selectedPatient.full_name}</p>
                          <p className="text-xs text-[#64748B] dark:text-[#CBD5E1]">ID: {selectedPatient.id.slice(0, 8)}</p>
                        </div>
                      </div>
                      <button type="button" onClick={clearPatientSelection} className="text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#64748B] dark:text-[#CBD5E1]">
                      {selectedPatient.age && <span>Age: {selectedPatient.age}</span>}
                      {selectedPatient.gender && <span>Gender: {selectedPatient.gender}</span>}
                      {selectedPatient.phone && <span>Phone: {selectedPatient.phone}</span>}
                    </div>
                    <div className="mt-2"><StatusBadge status={selectedPatient.status} /></div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                      <Input ref={patientSearchRef} placeholder="Search by Name / Phone" value={patientSearch}
                        onChange={(e) => setPatientSearch(e.target.value)}
                        className="pl-10 bg-white dark:bg-[#1E293B] border-[#E2E8F0] dark:border-[#334155] text-[#0F172A] dark:text-[#F8FAFC]" />
                    </div>
                    {patientSearch && (
                      <div className="max-h-[260px] overflow-y-auto rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B]">
                        {filteredPatients.length === 0 ? (
                          <div className="p-6 text-center text-sm text-[#64748B]">No patients found</div>
                        ) : filteredPatients.map((p) => (
                          <button key={p.id} type="button"
                            className="w-full px-4 py-3 text-left border-b border-[#E2E8F0] dark:border-[#334155] last:border-0 hover:bg-gray-50 dark:hover:bg-[#334155] transition-colors"
                            onClick={() => handlePatientSelect(p.id)}>
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm text-[#0F172A] dark:text-[#F8FAFC]">{p.full_name}</span>
                              <StatusBadge status={p.status} />
                            </div>
                            <div className="flex items-center gap-3 text-xs text-[#64748B] dark:text-[#CBD5E1] mt-1">
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
              <div className="grid gap-2">
                <Label htmlFor="appointment_type">Appointment Type</Label>
                <Select value={form.appointment_type} onValueChange={(v) => {
                  const t = APPOINTMENT_TYPES.find((t) => t.value === v)
                  setForm({ ...form, appointment_type: v, duration_minutes: t?.duration || 30, appointment_time: "" })
                }}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>{APPOINTMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label} ({t.duration} min)</SelectItem>)}</SelectContent>
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
              {form.doctor_id && form.appointment_date && (
                <SlotGrid doctorId={form.doctor_id} date={form.appointment_date} durationMinutes={form.duration_minutes}
                  selectedTime={form.appointment_time} onSelect={(time) => setForm({ ...form, appointment_time: time })} />
              )}
              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter className="px-6 pb-6 pt-2 shrink-0 border-t border-gray-100">
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
    </div>
  )
}
