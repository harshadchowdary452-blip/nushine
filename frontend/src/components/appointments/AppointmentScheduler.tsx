import { useState, useEffect, useMemo, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { Clock, Calendar, AlertCircle, User as UserIcon, Stethoscope } from "lucide-react"
import { appointmentsApi, doctorsApi } from "@/services/endpoints"
import { useAuthStore } from "@/store/authStore"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { DoctorSlotResponse, User, PaginatedResponse } from "@/types"
import { extractDetail } from "@/types"

const SLOT_COLORS: Record<string, string> = {
  available: "bg-green-100 text-green-800 border-green-300 hover:bg-green-200 cursor-pointer",
  booked: "bg-red-100 text-red-800 border-red-300 cursor-not-allowed opacity-60",
  leave: "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-50",
  blocked: "bg-orange-100 text-orange-700 border-orange-300 cursor-not-allowed opacity-60",
  past: "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed opacity-40",
  selected: "bg-blue-500 text-white border-blue-600 cursor-pointer",
  "consecutive-selected": "bg-blue-400 text-white border-blue-500 cursor-pointer",
}

export interface AppointmentSchedulerProps {
  doctorId?: string
  patientId?: string
  procedureName?: string
  appointmentType?: string
  date?: string
  selectedTime?: string
  onSelect: (data: {
    doctor_id: string
    appointment_date: string
    appointment_time: string
    duration_minutes: number
    procedure_name?: string
    appointment_type: string
  }) => void
  showDoctorSelector?: boolean
  showTypeSelector?: boolean
  showProcedureSelector?: boolean
  procedureOptions?: Array<{ value: string; label: string }>
  typeOptions?: Array<{ value: string; label: string; duration: number }>
  className?: string
}

export default function AppointmentScheduler({
  doctorId: initialDoctorId,
  procedureName: initialProcedureName,
  appointmentType: initialAppointmentType,
  date: initialDate,
  selectedTime,
  onSelect,
  showDoctorSelector = false,
  showTypeSelector = true,
  showProcedureSelector = false,
  procedureOptions,
  typeOptions,
  className,
}: AppointmentSchedulerProps) {
  const currentUser = useAuthStore((s) => s.user)
  const [doctorId, setDoctorId] = useState(initialDoctorId || "")
  const [appointmentDate, setAppointmentDate] = useState(initialDate || "")
  const [appointmentType, setAppointmentType] = useState(initialAppointmentType || "CONSULTATION")
  const [procedureName, setProcedureName] = useState(initialProcedureName || "")
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [internalSelectedTime, setInternalSelectedTime] = useState(selectedTime || "")
  const [durationManuallyOverridden, setDurationManuallyOverridden] = useState(false)

  useEffect(() => { if (initialDoctorId) setDoctorId(initialDoctorId) }, [initialDoctorId])
  useEffect(() => { if (initialDate) setAppointmentDate(initialDate) }, [initialDate])
  useEffect(() => { if (initialProcedureName) setProcedureName(initialProcedureName) }, [initialProcedureName])
  useEffect(() => { if (initialAppointmentType) setAppointmentType(initialAppointmentType) }, [initialAppointmentType])
  useEffect(() => { if (selectedTime) setInternalSelectedTime(selectedTime) }, [selectedTime])

  const { data: doctorsData } = useQuery<PaginatedResponse<User>>({
    queryKey: ["doctors", "appointment-scheduler"],
    queryFn: () => doctorsApi.list({
      page_size: 200,
      admin_group_id: currentUser?.admin_group_id || undefined,
      hospital_id: currentUser?.hospital_id || undefined,
    }),
    enabled: showDoctorSelector,
  })

  const doctors: User[] = useMemo(() => {
    if (Array.isArray(doctorsData)) return doctorsData
    return doctorsData?.items || []
  }, [doctorsData])

  const { data: slotData, isLoading: slotsLoading, isError: slotsError, error: slotError } = useQuery<DoctorSlotResponse>({
    queryKey: ["doctor-slots", doctorId, appointmentDate, durationMinutes, procedureName],
    queryFn: () => appointmentsApi.slots({
      doctor_id: doctorId,
      date: appointmentDate,
      duration_minutes: durationMinutes,
      procedure_name: procedureName || undefined,
    }),
    enabled: !!doctorId && !!appointmentDate,
    retry: 0,
  })

  useEffect(() => {
    if (slotData?.duration_minutes && !durationManuallyOverridden) {
      setDurationMinutes(slotData.duration_minutes)
    }
  }, [slotData?.duration_minutes, durationManuallyOverridden])

  const handleProcedureChange = useCallback((name: string) => {
    setProcedureName(name)
    setDurationManuallyOverridden(false)
    setInternalSelectedTime("")
  }, [])

  const handleTypeChange = useCallback((type: string) => {
    setAppointmentType(type)
    if (!durationManuallyOverridden) {
      const found = typeOptions?.find((t) => t.value === type)
      if (found) setDurationMinutes(found.duration)
    }
    setInternalSelectedTime("")
  }, [typeOptions, durationManuallyOverridden])

  const handleDurationChange = useCallback((mins: number) => {
    setDurationMinutes(mins)
    setDurationManuallyOverridden(true)
    setInternalSelectedTime("")
  }, [])

  const handleDateChange = useCallback((date: string) => {
    setAppointmentDate(date)
    setInternalSelectedTime("")
  }, [])

  const handleDoctorChange = useCallback((id: string) => {
    setDoctorId(id)
    setInternalSelectedTime("")
  }, [])

  const handleSlotSelect = useCallback((time: string) => {
    setInternalSelectedTime(time)
    onSelect({
      doctor_id: doctorId,
      appointment_date: appointmentDate,
      appointment_time: time,
      duration_minutes: durationMinutes,
      procedure_name: procedureName || undefined,
      appointment_type: appointmentType,
    })
  }, [doctorId, appointmentDate, durationMinutes, procedureName, appointmentType, onSelect])

  const groupedSlotTimes = useMemo(() => {
    if (!internalSelectedTime || !slotData?.slots || durationMinutes <= 30) return new Set<string>()
    const times = new Set<string>([internalSelectedTime])
    const slotMins = (h: string) => parseInt(h.split(":")[0]) * 60 + parseInt(h.split(":")[1])
    const selectedMins = slotMins(internalSelectedTime)
    for (const slot of slotData.slots) {
      const diff = slotMins(slot.time) - selectedMins
      if (diff > 0 && diff < durationMinutes && diff % 30 === 0 && slot.status === "available") {
        times.add(slot.time)
      }
    }
    return times
  }, [internalSelectedTime, slotData?.slots, durationMinutes])

  const formatSlotTime = (time: string) => {
    return time.slice(0, 5).replace(/^0(\d)/, "$1")
  }

  const today = format(new Date(), "yyyy-MM-dd")

  return (
    <div className={cn("rounded-xl border border-[var(--ds-border)] bg-white p-4 space-y-4", className)}>
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-[var(--ds-text-muted)]" />
        <h4 className="text-sm font-semibold text-[var(--ds-text)]">Schedule Appointment</h4>
      </div>

      {showDoctorSelector && !doctorId && (
        <div className="grid gap-2">
          <Label className="text-xs">Doctor</Label>
          <Select value={doctorId} onValueChange={handleDoctorChange}>
            <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
            <SelectContent>
              {doctors.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showProcedureSelector && (
        <div className="grid gap-2">
          <Label className="text-xs">Procedure</Label>
          <Select value={procedureName} onValueChange={handleProcedureChange}>
            <SelectTrigger><SelectValue placeholder="Select procedure" /></SelectTrigger>
            <SelectContent>
              {procedureOptions?.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showTypeSelector && (
        <div className="grid gap-2">
          <Label className="text-xs">Appointment Type</Label>
          <Select value={appointmentType} onValueChange={handleTypeChange}>
            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              {(typeOptions || [
                { value: "CONSULTATION", label: "Consultation", duration: 20 },
                { value: "FOLLOW_UP", label: "Follow Up", duration: 30 },
                { value: "TREATMENT", label: "Treatment", duration: 60 },
                { value: "EMERGENCY", label: "Emergency", duration: 30 },
                { value: "REVIEW", label: "Review", duration: 30 },
              ]).map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label} ({t.duration} min)</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label className="text-xs">Date</Label>
          <Input
            type="date"
            value={appointmentDate}
            min={today}
            onChange={(e) => handleDateChange(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label className="text-xs">Duration</Label>
          <Select value={String(durationMinutes)} onValueChange={(v) => handleDurationChange(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[15, 20, 30, 45, 60, 90, 120].map((m) => (
                <SelectItem key={m} value={String(m)}>{m} min</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {procedureName && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 text-xs text-blue-700">
          <Stethoscope className="h-3 w-3" />
          <span className="font-medium">{procedureName}</span>
          <span className="text-blue-500">—</span>
          <Clock className="h-3 w-3" />
          <span>{durationMinutes} min estimated</span>
        </div>
      )}

      {doctorId && appointmentDate && (
        slotsLoading ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-[var(--ds-text-muted)]">
              <div className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
              Loading available slots...
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-16 rounded-lg" />
              ))}
            </div>
          </div>
        ) : slotsError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
            <p className="text-sm text-red-600 font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> Failed to load slots
            </p>
            <p className="text-xs text-red-500">
              {extractDetail(slotError) || slotError?.message || "Unknown error"}
            </p>
          </div>
        ) : slotData ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-[var(--ds-text)]">
                {slotData.doctor_name} — {format(new Date(slotData.date), "MMM dd, yyyy")}
              </h4>
              {slotData.is_on_leave && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  On Leave{slotData.leave_reason ? `: ${slotData.leave_reason}` : ""}
                </span>
              )}
            </div>

            {slotData.working_hours && (
              <p className="text-xs text-[var(--ds-text-muted)]">
                Working hours: {slotData.working_hours}
              </p>
            )}

            {durationMinutes > 30 && (
              <p className="text-xs text-[var(--ds-text-muted)]">
                Selecting a start time will reserve {Math.ceil(durationMinutes / 30)} consecutive slot{durationMinutes > 30 ? "s" : ""} ({durationMinutes} min)
              </p>
            )}

            <div className="flex items-center gap-3 mb-2 flex-wrap text-xs">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded border border-green-300 bg-green-100" />
                Available
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded border border-red-300 bg-red-100" />
                Booked
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded border border-gray-200 bg-gray-100" />
                Unavailable
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-blue-500" />
                Selected
              </span>
            </div>

            {slotData.slots.length === 0 ? (
              <p className="text-sm text-[var(--ds-text-muted)] py-4 text-center">
                No slots available for this date.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto">
                {slotData.slots.map((slot) => {
                  const isSelected = internalSelectedTime === slot.time
                  const isInGroup = groupedSlotTimes.has(slot.time)
                  const colorKey = isSelected ? "selected" : isInGroup ? "consecutive-selected" : slot.status
                  const colorClass = SLOT_COLORS[colorKey] || SLOT_COLORS.past

                  return (
                    <button
                      key={slot.time}
                      type="button"
                      disabled={slot.status !== "available" && !isSelected}
                      onClick={() => {
                        if (slot.status === "available") handleSlotSelect(slot.time)
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                        colorClass
                      )}
                      title={
                        slot.status === "booked"
                          ? `Booked by ${slot.patient_name || "someone"}${slot.appointment_type ? ` (${slot.appointment_type})` : ""}`
                          : slot.status === "blocked"
                          ? "Blocked"
                          : slot.status === "leave"
                          ? "Doctor on leave"
                          : slot.status === "past"
                          ? "Past time"
                          : isInGroup
                          ? `${slot.time} — Reserved for ${procedureName || "procedure"}`
                          : `${slot.time} - Available`
                      }
                    >
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatSlotTime(slot.time)}
                        {isInGroup && slot.time !== internalSelectedTime && (
                          <span className="text-[10px] opacity-70">+</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : null
      )}

      {!doctorId && showDoctorSelector && (
        <div className="text-center py-6 text-xs text-[var(--ds-text-muted)]">
          <UserIcon className="h-5 w-5 mx-auto mb-2 opacity-40" />
          Select a doctor to view available slots
        </div>
      )}

      {!doctorId && !showDoctorSelector && (
        <div className="text-center py-6 text-xs text-[var(--ds-text-muted)]">
          <Stethoscope className="h-5 w-5 mx-auto mb-2 opacity-40" />
          Doctor will be assigned during scheduling
        </div>
      )}
    </div>
  )
}
