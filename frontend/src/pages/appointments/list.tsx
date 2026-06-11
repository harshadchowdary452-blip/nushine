import { useState, useMemo, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { motion } from "framer-motion"
import {
  Plus,
  Search,
  Eye,
  Calendar,
  List,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Phone,
  User as UserIcon,
  BadgeCheck,
  X,
} from "lucide-react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay } from "date-fns"
import PageHeader from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { appointmentsApi, patientsApi, doctorsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import type { Appointment, Patient, User, PaginatedResponse } from "@/types"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/store/authStore"

function StatusBadge({ status }: { status: string }) {
  const cls = `status-badge status-badge-${status?.toLowerCase().replace(/_/g, "_")}`;
  return <span className={cls}>{status?.replace(/_/g, " ")}</span>;
}

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive" | "success" | "warning"> = {
  SCHEDULED: "default",
  CONFIRMED: "success",
  IN_PROGRESS: "warning",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
  NO_SHOW: "outline",
}

interface AppointmentForm {
  patient_id: string
  doctor_id: string
  appointment_date: string
  appointment_time: string
  notes: string
}

function getEmptyAppointmentForm(): AppointmentForm {
  return { patient_id: "", doctor_id: "", appointment_date: "", appointment_time: "", notes: "" }
}

export default function AppointmentList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [view, setView] = useState<"list" | "calendar">("list")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [form, setForm] = useState<AppointmentForm>(getEmptyAppointmentForm)

  const { data, isLoading } = useQuery<PaginatedResponse<Appointment>>({
    queryKey: ["appointments"],
    queryFn: () => appointmentsApi.list({ page_size: 100 }),
  })

  const currentUser = useAuthStore((s) => s.user)
  const { data: patientsData } = useQuery<PaginatedResponse<Patient>>({
    queryKey: ["patients", "dropdown"],
    queryFn: () => patientsApi.list({ page_size: 200, hospital_id: currentUser?.hospital_id || undefined }),
  })

  const { data: doctorsData } = useQuery<PaginatedResponse<User>>({
    queryKey: ["doctors", "dropdown"],
    queryFn: () => doctorsApi.list({ page_size: 200, hospital_id: currentUser?.hospital_id || undefined }),
  })

  const [patientSearch, setPatientSearch] = useState("")
  const [patientPopoverOpen, setPatientPopoverOpen] = useState(false)
  const patientSearchRef = useRef<HTMLInputElement>(null)

  const patients: Patient[] = useMemo(
    () => {
      if (Array.isArray(patientsData)) return patientsData
      return patientsData?.items || []
    },
    [patientsData]
  )

  const doctors: User[] = useMemo(
    () => {
      if (Array.isArray(doctorsData)) return doctorsData
      return doctorsData?.items || []
    },
    [doctorsData]
  )

  const filteredPatients = useMemo(() => {
    if (!patientSearch) return patients
    const q = patientSearch.toLowerCase()
    return patients.filter(
      (p) =>
        p.full_name.toLowerCase().includes(q) ||
        (p.phone && p.phone.includes(q)) ||
        p.id.toLowerCase().includes(q)
    )
  }, [patients, patientSearch])

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === form.patient_id),
    [patients, form.patient_id]
  )

  function handlePatientSelect(patientId: string) {
    setForm({ ...form, patient_id: patientId })
    setPatientPopoverOpen(false)
    setPatientSearch("")
  }

  function handlePatientPopoverOpen(open: boolean) {
    setPatientPopoverOpen(open)
    if (open) {
      setTimeout(() => patientSearchRef.current?.focus(), 50)
    } else {
      setPatientSearch("")
    }
  }

  const createMutation = useMutation({
    mutationFn: (data: any) => appointmentsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      addToast({ title: "Success", description: "Appointment created successfully", variant: "success" })
      resetForm()
    },
    onError: (err: any) => {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to create appointment", variant: "destructive" })
    },
  })

  function resetForm() {
    setForm(getEmptyAppointmentForm())
    setPatientSearch("")
    setDialogOpen(false)
  }

  function openDialog() {
    setForm(getEmptyAppointmentForm())
    setPatientSearch("")
    setDialogOpen(true)
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open) resetForm()
    setDialogOpen(open)
  }

  const appointments: Appointment[] = useMemo(
    () => {
      if (Array.isArray(data)) return data
      return data?.items || []
    },
    [data]
  )

  const columns = useMemo<ColumnDef<Appointment>[]>(
    () => [
      {
        accessorKey: "patient_name",
        header: "Patient Name",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.patient_name || "—"}</span>
        ),
      },
      {
        accessorKey: "doctor_name",
        header: "Doctor",
        cell: ({ row }) => row.original.doctor_name || "—",
      },
      {
        accessorKey: "appointment_date",
        header: "Date",
        cell: ({ row }) =>
          format(new Date(row.original.appointment_date), "MMM dd, yyyy"),
      },
      {
        accessorKey: "appointment_time",
        header: "Time",
        cell: ({ row }) => row.original.appointment_time || "—",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <Button variant="outline" size="sm" onClick={() => navigate(`/appointments/${row.original.id}`)}>
            <Eye className="h-4 w-4 mr-1" /> View
          </Button>
        ),
      },
    ],
    []
  )

  const table = useReactTable({
    data: appointments,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  })

  const monthDays = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  })

  const startDay = getDay(startOfMonth(currentMonth))
  const calendarDays: (Date | null)[] = [
    ...Array.from({ length: startDay }, () => null),
    ...monthDays,
  ]

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
    if (!form.appointment_date || !form.appointment_time) {
      addToast({ title: "Validation Error", description: "Please select both date and time", variant: "destructive" })
      return
    }
    const cleaned: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(form)) {
      if (value !== "" && value !== undefined) {
        cleaned[key] = value
      }
    }
    createMutation.mutate(cleaned)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Appointments" description="Manage appointments">
        {currentUser?.role !== "DOCTOR" && (
          <Button onClick={openDialog}>
            <Plus className="h-4 w-4" /> New Appointment
          </Button>
        )}
      </PageHeader>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search appointments..."
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={view === "list" ? "default" : "outline"}
                size="sm"
                onClick={() => setView("list")}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={view === "calendar" ? "default" : "outline"}
                size="sm"
                onClick={() => setView("calendar")}
              >
                <Calendar className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {view === "calendar" && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  {format(currentMonth, "MMMM yyyy")}
                </h3>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      setCurrentMonth(
                        new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
                      )
                    }
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentMonth(new Date())}
                  >
                    <CalendarDays className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      setCurrentMonth(
                        new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
                      )
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div
                    key={d}
                    className="py-2 text-center text-xs font-medium text-muted-foreground"
                  >
                    {d}
                  </div>
                ))}
                {calendarDays.map((day, i) => {
                  if (!day) return <div key={`empty-${i}`} />
                  const key = format(day, "yyyy-MM-dd")
                  const count = appointmentsByDate[key]
                  const isToday = isSameDay(day, new Date())
                  return (
                    <div
                      key={key}
                      className={cn(
                        "relative flex h-16 flex-col items-center justify-center rounded-lg border text-sm transition-colors hover:bg-muted/50 cursor-pointer",
                        isToday && "border-primary bg-primary/5"
                      )}
                    >
                      <span className="text-xs">{format(day, "d")}</span>
                      {count && (
                        <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">
                          {count}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {view === "list" && (
            <>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : appointments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                    <CalendarDays className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold">No appointments yet</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Schedule your first appointment.
                  </p>
                  {currentUser?.role !== "DOCTOR" && (
                    <Button className="mt-4" onClick={openDialog}>
                      <Plus className="h-4 w-4" /> New Appointment
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-md border mobile-card-view">
                    <table className="w-full text-sm">
                      <thead>
                        {table.getHeaderGroups().map((hg) => (
                          <tr key={hg.id} className="border-b bg-muted/50">
                            {hg.headers.map((header) => (
                              <th
                                key={header.id}
                                className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none"
                                onClick={header.column.getToggleSortingHandler()}
                              >
                                <div className="flex items-center gap-1">
                                  {flexRender(header.column.columnDef.header, header.getContext())}
                                  {{
                                    asc: " ↑",
                                    desc: " ↓",
                                  }[header.column.getIsSorted() as string] ?? null}
                                </div>
                              </th>
                            ))}
                          </tr>
                        ))}
                      </thead>
                      <tbody>
                        {table.getRowModel().rows.map((row) => (
                          <motion.tr
                            key={row.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="border-b transition-colors hover:bg-muted/50"
                          >
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

                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                      >
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

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
            <DialogTitle>New Appointment</DialogTitle>
            <DialogDescription>
              Schedule a new appointment for a patient.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
            <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
              <div className="grid gap-2">
                <Label htmlFor="patient">Patient</Label>
                <Popover open={patientPopoverOpen} onOpenChange={handlePatientPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-start text-left font-normal"
                    >
                      {selectedPatient ? (
                        <div className="flex items-center gap-2 truncate w-full">
                          <UserIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{selectedPatient.full_name}</span>
                          <Badge variant="outline" className="ml-auto shrink-0 text-[10px] px-1 py-0">
                            {selectedPatient.status}
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Select patient...</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <div className="p-3 border-b">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          ref={patientSearchRef}
                          placeholder="Search by name, phone or ID..."
                          value={patientSearch}
                          onChange={(e) => setPatientSearch(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto">
                      {filteredPatients.length === 0 ? (
                        <div className="p-6 text-center text-sm text-muted-foreground">
                          No patients found
                        </div>
                      ) : (
                        filteredPatients.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className={`w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors flex flex-col gap-1 ${
                              form.patient_id === p.id ? "bg-muted" : ""
                            }`}
                            onClick={() => handlePatientSelect(p.id)}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm">{p.full_name}</span>
                              <Badge variant="outline" className="text-[10px] px-1 py-0">
                                {p.status}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              {p.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" /> {p.phone}
                                </span>
                              )}
                              <span>ID: {p.id.slice(0, 8)}</span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="doctor">Doctor</Label>
                <Select
                  value={form.doctor_id}
                  onValueChange={(v) => setForm({ ...form, doctor_id: v })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    {doctors.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={form.appointment_date}
                    onChange={(e) =>
                      setForm({ ...form, appointment_date: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="time">Time</Label>
                  <Input
                    id="time"
                    type="time"
                    value={form.appointment_time}
                    onChange={(e) =>
                      setForm({ ...form, appointment_time: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter className="px-6 pb-6 pt-2 shrink-0 border-t border-gray-100">
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
