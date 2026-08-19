import api from "./api"
import type {
  LoginRequest,
  LoginResponse,
  ContextSwitchResponse,
  PaginationParams,
  User,
  Lead,
  LeadCall,
  LeadCommunication,
} from "@/types"

function withPagination(params?: PaginationParams) {
  if (!params) return undefined
  const { page, page_size, ...rest } = params
  const result: Record<string, unknown> = { ...rest }
  if (page_size != null) result.limit = page_size
  if (page != null) result.skip = (page - 1) * (page_size ?? 10)
  return result
}

export const authApi = {
  login: (data: LoginRequest) =>
    api.post<LoginResponse>("/auth/login", data, { timeout: 30000 }).then((r) => r.data),
  refresh: (refresh_token: string) =>
    api
      .post<{ access_token: string; refresh_token: string }>("/auth/refresh", { refresh_token })
      .then((r) => r.data),
  logout: (refresh_token: string) => api.post("/auth/logout", { refresh_token }),
  me: () => api.get<User>("/auth/me").then((r) => r.data),
  changePassword: (data: { current_password: string; new_password: string }) =>
    api.post("/auth/change-password", data).then((r) => r.data),
  updateProfile: (data: {
    full_name: string
    phone?: string
    specialization?: string
    license_number?: string
  }) => api.put("/auth/me", data).then((r) => r.data),
  switchContext: (data: { hospital_id?: string | null }) =>
    api.post<ContextSwitchResponse>("/auth/context/switch", data).then((r) => r.data),
}

export const groupsApi = {
  list: (params?: PaginationParams) =>
    api.get("/admin-groups", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/admin-groups/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post("/admin-groups", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/admin-groups/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/admin-groups/${id}`).then((r) => r.data),
  createAdmin: (groupId: string, data: Record<string, unknown>) =>
    api.post(`/admin-groups/${groupId}/admins`, data).then((r) => r.data),
}

export const hospitalsApi = {
  list: (params?: PaginationParams) =>
    api.get("/hospitals", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/hospitals/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post("/hospitals", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/hospitals/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/hospitals/${id}`).then((r) => r.data),
  createAdmin: (hospitalId: string, data: Record<string, unknown>) =>
    api.post(`/hospitals/${hospitalId}/admins`, data).then((r) => r.data),
}

export const usersApi = {
  list: (params?: PaginationParams) =>
    api.get("/users", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/users/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post("/users", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/users/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/users/${id}`).then((r) => r.data),
}

export const doctorsApi = {
  list: (params?: PaginationParams) =>
    api.get("/doctors", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/doctors/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post("/doctors", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/doctors/${id}`, data).then((r) => r.data),
  deactivate: (id: string) => api.post(`/doctors/${id}/deactivate`),
  activate: (id: string) => api.post(`/doctors/${id}/activate`),
  delete: (id: string) => api.delete(`/doctors/${id}`).then((r) => r.data),
  listMemberships: (id: string) => api.get(`/doctors/${id}/memberships`).then((r) => r.data),
  setHospitalActive: (id: string, hospitalId: string, active: boolean) =>
    api.post(`/doctors/${id}/hospitals/${hospitalId}/${active ? "activate" : "deactivate"}`).then((r) => r.data),
}

export const patientsApi = {
  list: (params?: PaginationParams) =>
    api.get("/patients", { params: withPagination(params) }).then((r) => r.data),
  searchAdvanced: (params?: Record<string, unknown>) =>
    api.get("/patients/search-advanced", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/patients/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post("/patients", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/patients/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/patients/${id}`).then((r) => r.data),
  search: (params?: PaginationParams) =>
    api.get("/patients/search", { params: withPagination(params) }).then((r) => r.data),
  checkDuplicates: (params?: { full_name?: string; phone?: string; email?: string; hospital_id?: string; limit?: number }) =>
    api.get("/patients/duplicates", { params }).then((r) => r.data),
  getPatientTimeline: (patientId: string, params?: Record<string, unknown>) =>
    api.get(`/patients/${patientId}/timeline`, { params }).then((r) => r.data),
  getMedications: (patientId: string) =>
    api.get(`/patients/${patientId}/medications`).then((r) => r.data),
}

export const casesApi = {
  list: async (params?: Record<string, unknown>) => {
    const r = await api.get("/cases", { params })
    const items = r.data
    const total = Number(r.headers?.["x-total-count"]) || items?.length || 0
    const limit = Number(params?.limit) || Number(params?.page_size) || items?.length || 0
    const skip = Number(params?.skip) || 0
    return {
      items,
      total,
      page: limit > 0 ? Math.floor(skip / limit) + 1 : 1,
      page_size: limit,
    }
  },
  get: (id: string) => api.get(`/cases/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post("/cases", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/cases/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/cases/${id}`).then((r) => r.data),
  getTimeline: (id: string, params?: Record<string, unknown>) =>
    api.get(`/cases/${id}/timeline`, { params }).then((r) => r.data),
  getOdontogramBlob: (id: string) =>
    api.get(`/cases/${id}/odontogram`, { responseType: "blob" }).then((r) => r.data),
  submitTreatmentPlan: (id: string) =>
    api.post(`/cases/${id}/submit-treatment-plan`).then((r) => r.data),
  approveTreatmentPlan: (id: string) =>
    api.post(`/cases/${id}/approve-treatment-plan`).then((r) => r.data),
  rejectTreatmentPlan: (id: string, reason: string) =>
    api
      .post(`/cases/${id}/reject-treatment-plan`, null, { params: { reason } })
      .then((r) => r.data),
}

export const appointmentsApi = {
  list: (params?: PaginationParams) =>
    api.get("/appointments", { params: withPagination(params) }).then((r) => r.data),
  search: (params?: Record<string, unknown>) =>
    api.get("/appointments/search", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/appointments/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post("/appointments", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/appointments/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/appointments/${id}`).then((r) => r.data),
  cancel: (id: string, data: { reason?: string }) =>
    api.post(`/appointments/${id}/cancel`, data).then((r) => r.data),
  complete: (id: string, data?: { notes?: string }) =>
    api.post(`/appointments/${id}/complete`, data || {}).then((r) => r.data),
  reschedule: (
    id: string,
    data: { appointment_date: string; appointment_time: string; reason?: string },
  ) => api.post(`/appointments/${id}/reschedule`, data).then((r) => r.data),
  checkAvailability: (params: {
    doctor_id: string
    appointment_date: string
    appointment_time: string
  }) => api.get("/appointments/availability", { params }).then((r) => r.data),
  reassignDoctor: (id: string, data: { doctor_id: string; reason?: string }) =>
    api.post(`/appointments/${id}/reassign-doctor`, data).then((r) => r.data),
  slots: (params: {
    doctor_id: string
    date: string
    duration_minutes?: number
    procedure_name?: string
  }) => api.get("/appointments/slots", { params }).then((r) => r.data),
  procedureDurations: () => api.get("/appointments/procedure-durations").then((r) => r.data),
  fullDetail: (id: string) => api.get(`/appointments/${id}/full-detail`).then((r) => r.data),
}

export const doctorWorkingHoursApi = {
  get: (doctorId: string) => api.get(`/doctors/${doctorId}/working-hours/`).then((r) => r.data),
  bulkUpdate: (doctorId: string, data: { schedules: Record<string, unknown>[] }) =>
    api.post(`/doctors/${doctorId}/working-hours/bulk`, data).then((r) => r.data),
}

export const doctorAvailabilityApi = {
  list: (doctorId: string) => api.get(`/doctors/${doctorId}/availability/`).then((r) => r.data),
  get: (doctorId: string, overrideId: string) =>
    api.get(`/doctors/${doctorId}/availability/${overrideId}`).then((r) => r.data),
  create: (doctorId: string, data: Record<string, unknown>) =>
    api.post(`/doctors/${doctorId}/availability/`, data).then((r) => r.data),
  update: (doctorId: string, overrideId: string, data: Record<string, unknown>) =>
    api.put(`/doctors/${doctorId}/availability/${overrideId}`, data).then((r) => r.data),
  delete: (doctorId: string, overrideId: string) =>
    api.delete(`/doctors/${doctorId}/availability/${overrideId}`).then((r) => r.data),
}

export const doctorLeavesApi = {
  list: (doctorId: string) => api.get(`/doctors/${doctorId}/leaves/`).then((r) => r.data),
  create: (doctorId: string, data: Record<string, unknown>) =>
    api.post(`/doctors/${doctorId}/leaves/`, data).then((r) => r.data),
  update: (doctorId: string, leaveId: string, data: Record<string, unknown>) =>
    api.put(`/doctors/${doctorId}/leaves/${leaveId}`, data).then((r) => r.data),
  delete: (doctorId: string, leaveId: string) =>
    api.delete(`/doctors/${doctorId}/leaves/${leaveId}`).then((r) => r.data),
}

export const doctorBlockedSlotsApi = {
  list: (doctorId: string) => api.get(`/doctors/${doctorId}/blocked-slots/`).then((r) => r.data),
  create: (doctorId: string, data: Record<string, unknown>) =>
    api.post(`/doctors/${doctorId}/blocked-slots/`, data).then((r) => r.data),
  delete: (doctorId: string, slotId: string) =>
    api.delete(`/doctors/${doctorId}/blocked-slots/${slotId}`).then((r) => r.data),
}

export const consultantsApi = {
  list: (params?: PaginationParams) =>
    api.get("/consultants", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/consultants/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post("/consultants", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/consultants/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/consultants/${id}`).then((r) => r.data),
}

export const consultantNotesApi = {
  listByCase: (caseId: string) =>
    api.get(`/consultant-notes/by-case/${caseId}`).then((r) => r.data),
  create: (data: { case_id: string; consultant_id: string; notes: string }) =>
    api.post("/consultant-notes", data).then((r) => r.data),
}

export const treatmentApi = {
  list: (params?: {
    skip?: number
    limit?: number
    search?: string
    status?: string
    doctor_id?: string
    hospital_id?: string
    case_id?: string
    patient_id?: string
    date_from?: string
    date_to?: string
  }) => api.get("/treatment-plans", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/treatment-plans/${id}`).then((r) => r.data),
  listByCase: (caseId: string) => api.get(`/treatment-plans/by-case/${caseId}`).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post("/treatment-plans", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/treatment-plans/${id}`, data).then((r) => r.data),
  updateStatus: (id: string, status: string) =>
    api.put(`/treatment-plans/${id}/status`, null, { params: { status } }).then((r) => r.data),
  applyDiscount: (id: string, data: { discount_type?: string; discount_percent?: number; discount_amount?: number; discount_reason?: string }) =>
    api.put(`/treatment-plans/${id}/discount`, data).then((r) => r.data),
  start: (id: string) => api.post(`/treatment-plans/${id}/start`).then((r) => r.data),
  complete: (id: string, data?: { outcome?: string; notes?: string }) =>
    api.post(`/treatment-plans/${id}/complete`, data || {}).then((r) => r.data),
  extraVisit: (id: string, data?: { reason?: string }) =>
    api.post(`/treatment-plans/${id}/extra-visit`, data || {}).then((r) => r.data),
  transfer: (
    id: string,
    data: {
      target_plan_id: string
      appointment_date?: string
      appointment_time?: string
      notes?: string
    },
  ) => api.post(`/treatment-plans/${id}/transfer`, data).then((r) => r.data),
  setWaiting: (
    id: string,
    waitingType: string,
    data?: {
      reason?: string
      expected_followup?: string
      lab_name?: string
      lab_order_number?: string
      lab_sent_date?: string
      lab_return_date?: string
      lab_cost?: number
      lab_tracking_notes?: string
    },
  ) =>
    api
      .post(`/treatment-plans/${id}/set-waiting`, data || {}, {
        params: { waiting_type: waitingType },
      })
      .then((r) => r.data),
  reportOverdue: (id: string, params: { reason: string; delay_type: string }) =>
    api.post(`/treatment-plans/${id}/report-overdue`, null, { params }).then((r) => r.data),
  suggestAppointment: (id: string) =>
    api.get(`/treatment-plans/${id}/suggest-appointment`).then((r) => r.data),
  checkDependency: (id: string) =>
    api.get(`/treatment-plans/${id}/check-dependency`).then((r) => r.data),
  delete: (id: string) => api.delete(`/treatment-plans/${id}`).then((r) => r.data),
}

export const treatmentPlanItemsApi = {
  listByCase: (caseId: string, params?: { version?: number }) =>
    api.get(`/treatment-plan-items/by-case/${caseId}`, { params }).then((r) => r.data),
  getVersions: (caseId: string) =>
    api.get(`/treatment-plan-items/versions/${caseId}`).then((r) => r.data),
  create: (data: { case_id: string; items: Record<string, unknown>[] }) =>
    api.post("/treatment-plan-items/", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/treatment-plan-items/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/treatment-plan-items/${id}`).then((r) => r.data),
  assignDoctors: (
    assignments: {
      item_id: string
      assigned_doctor_id?: string
      assistant_doctor_id?: string
      priority?: string
    }[],
  ) => api.post("/treatment-plan-items/assign-doctors", { assignments }).then((r) => r.data),
}

export const clinicalProgressNotesApi = {
  listByCase: (caseId: string) =>
    api.get(`/clinical-progress-notes/by-case/${caseId}`).then((r) => r.data),
  get: (id: string) => api.get(`/clinical-progress-notes/${id}`).then((r) => r.data),
  create: (data: {
    case_id: string
    note_date: string
    clinical_note: string
    attachments_json?: string
    digital_signature_url?: string
  }) => api.post("/clinical-progress-notes/", data).then((r) => r.data),
  update: (
    id: string,
    data: { clinical_note?: string; attachments_json?: string; digital_signature_url?: string },
  ) => api.put(`/clinical-progress-notes/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/clinical-progress-notes/${id}`).then((r) => r.data),
}

export const doctorQueueApi = {
  get: (doctorId: string, params?: { hospital_id?: string }) =>
    api.get(`/doctor-queue/${doctorId}`, { params }).then((r) => r.data),
}

export const treatmentSittingsApi = {
  listByPlan: (planId: string) =>
    api.get(`/treatment-sittings/by-plan/${planId}`).then((r) => r.data),
  get: (id: string) => api.get(`/treatment-sittings/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) =>
    api.post("/treatment-sittings", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/treatment-sittings/${id}`, data).then((r) => r.data),
}

export const billingApi = {
  list: (params?: PaginationParams) =>
    api.get("/billings", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/billings/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post("/billings", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/billings/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/billings/${id}`).then((r) => r.data),
  updatePayment: (id: string, data: Record<string, unknown>) =>
    api.put(`/billings/${id}/payment`, data).then((r) => r.data),
  getPdf: (id: string) =>
    api.get(`/billings/${id}/pdf`, { responseType: "blob" }).then((r) => r.data),
  getTransactions: (id: string) => api.get(`/billings/${id}/transactions`).then((r) => r.data),
  getHistory: (id: string) => api.get(`/billings/${id}/history`).then((r) => r.data),
  applyDiscount: (
    id: string,
    data: {
      discount_type?: string
      discount_percent?: number
      discount_amount?: number
      discount_reason?: string
    },
  ) => api.put(`/billings/${id}/discount`, data).then((r) => r.data),
  searchPatients: (params: { q: string; limit?: number }) =>
    api.get("/billings/search", { params }).then((r) => r.data),
  unbilled: (params?: { page_size?: number; hospital_id?: string }) =>
    api.get("/billings/unbilled", { params }).then((r) => r.data),
  getCaseBillable: (caseId: string) =>
    api.get(`/billings/cases/${caseId}/billable`).then((r) => r.data),
}

export const dashboardApi = {
  superAdmin: (params?: { period?: string; start_date?: string; end_date?: string }) =>
    api.get("/dashboards/super-admin", { params }).then((r) => r.data),
  groupAdmin: (params?: {
    period?: string
    start_date?: string
    end_date?: string
    hospital_id?: string
  }) => api.get("/dashboards/group-admin", { params }).then((r) => r.data),
  hospitalAdmin: (params?: {
    period?: string
    start_date?: string
    end_date?: string
    doctor_id?: string
  }) => api.get("/dashboards/hospital-admin", { params }).then((r) => r.data),
  doctor: (params?: { period?: string; start_date?: string; end_date?: string }) =>
    api.get("/dashboards/doctor", { params }).then((r) => r.data),
  quickViewAdminGroup: (
    id: string,
    params?: { period?: string; start_date?: string; end_date?: string },
  ) => api.get(`/dashboards/quick-view/admin-group/${id}`, { params }).then((r) => r.data),
  quickViewHospital: (
    id: string,
    params?: { period?: string; start_date?: string; end_date?: string },
  ) => api.get(`/dashboards/quick-view/hospital/${id}`, { params }).then((r) => r.data),
  quickViewDoctor: (
    id: string,
    params?: { period?: string; start_date?: string; end_date?: string },
  ) => api.get(`/dashboards/quick-view/doctor/${id}`, { params }).then((r) => r.data),
  quickViewPatient: (id: string) =>
    api.get(`/dashboards/quick-view/patient/${id}`).then((r) => r.data),
}

export interface DoctorPerformanceParams {
  period?: string
  start_date?: string
  end_date?: string
  group_id?: string
  search?: string
  department?: string
  sort_by?: string
  sort_order?: "asc" | "desc"
  page?: number
  page_size?: number
}

export interface DoctorPerformanceSummary {
  doctors: number
  patients_seen: number
  new_patients: number
  returning_patients: number
  appointments_total: number
  appointments_completed: number
  appointments_cancelled: number
  appointments_rescheduled: number
  cases_created: number
  cases_completed: number
  active_cases: number
  treatment_plans_created: number
  treatments_completed: number
  treatments_active: number
  sittings_completed: number
  revenue: number
  avg_revenue_per_patient: number
  avg_revenue_per_appointment: number
  case_completion_rate: number
  treatment_completion_rate: number
  treatment_acceptance_rate: number
  attendance_rate: number
  retention_rate: number
  recall_success_rate: number
  avg_rating: number | null
  no_shows: number
  outstanding_amount: number
  cases_with_reports: number
}

export interface DoctorPerformanceTreatmentAnalytics {
  name: string
  count: number
  total_cost: number
  total_paid: number
  completed: number
  completion_rate: number
}

export interface DoctorPerformanceRow {
  id: string
  name: string
  email: string
  qualification: string | null
  specialization: string | null
  designation: string
  department: string
  hospital_id: string | null
  hospital_name: string | null
  admin_group_id: string | null
  admin_group_name: string | null
  is_active: boolean
  patients_seen: number
  new_patients: number
  returning_patients: number
  appointments_total: number
  appointments_completed: number
  appointments_cancelled: number
  appointments_rescheduled: number
  cases_created: number
  cases_completed: number
  active_cases: number
  treatment_plans_created: number
  treatments_completed: number
  treatments_active: number
  sittings_completed: number
  revenue: number
  avg_revenue_per_patient: number
  avg_revenue_per_appointment: number
  case_completion_rate: number
  treatment_completion_rate: number
  treatment_acceptance_rate: number
  attendance_rate: number
  retention_rate: number
  recall_success_rate: number
  avg_rating: number | null
  treatment_breakdown: { name: string; value: number }[]
  no_shows: number
  outstanding_amount: number
  cases_with_reports: number
  individual_treatments: number
  treatment_analytics: DoctorPerformanceTreatmentAnalytics[]
}

export interface DoctorPerformanceOverview {
  period: string
  scope: {
    role: string
    hospital_id: string | null
    admin_group_id: string | null
    group_id: string | null
  }
  summary: DoctorPerformanceSummary
  previous: {
    revenue: number
    patients_seen: number
    appointments_completed: number
  }
  deltas: {
    revenue_pct: number
    patients_pct: number
    appointments_pct: number
  }
  doctors: DoctorPerformanceRow[]
  total_doctors: number
  page: number
  page_size: number
  departments: string[]
  treatment_breakdown: { name: string; value: number }[]
  treatment_analytics: DoctorPerformanceTreatmentAnalytics[]
}

export interface DoctorPerformanceInsight {
  type: "positive" | "warning" | "info" | "neutral"
  text: string
}

export interface DoctorPerformanceInsightsResponse {
  doctor_id: string
  period: string
  insights: DoctorPerformanceInsight[]
}

export interface DoctorPerformanceDetail extends DoctorPerformanceRow {
  phone: string | null
  license_number: string | null
  period: string
  metrics: DoctorPerformanceRow
  summary: DoctorPerformanceSummary
  revenue_trend: { month: string; revenue: number }[]
  appointment_trend: { month: string; n: number }[]
  treatment_breakdown: { name: string; value: number }[]
  recent_appointments: {
    id: string
    appointment_number: string
    patient_name: string
    appointment_date: string
    appointment_time: string
    status: string
  }[]
}

export const doctorPerformanceApi = {
  overview: (params?: DoctorPerformanceParams) =>
    api.get<DoctorPerformanceOverview>("/doctor-performance", { params }).then((r) => r.data),
  detail: (doctorId: string, params?: DoctorPerformanceParams) =>
    api
      .get<DoctorPerformanceDetail>(`/doctor-performance/${doctorId}`, { params })
      .then((r) => r.data),
  insights: (doctorId: string, params?: DoctorPerformanceParams) =>
    api
      .get<DoctorPerformanceInsightsResponse>(`/doctor-performance/${doctorId}/insights`, { params })
      .then((r) => r.data),
}

export const expensesApi = {
  list: (params?: Record<string, unknown>) => api.get("/expenses", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/expenses/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post("/expenses", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/expenses/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/expenses/${id}`).then((r) => r.data),
  analytics: () => api.get("/expenses/analytics").then((r) => r.data),
  calendar: (params?: { month?: number; year?: number; hospital_id?: string }) =>
    api.get("/expenses/calendar", { params }).then((r) => r.data),
  calendarDay: (date: string) => api.get(`/expenses/calendar/${date}`).then((r) => r.data),
}

export const inventoryCategoriesApi = {
  list: (params?: Record<string, unknown>) =>
    api.get("/inventory/categories", { params }).then((r) => r.data),
  tree: (params?: Record<string, unknown>) =>
    api.get("/inventory/categories/tree", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/inventory/categories/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) =>
    api.post("/inventory/categories", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/inventory/categories/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/inventory/categories/${id}`).then((r) => r.data),
}

export const suppliersApi = {
  list: (params?: Record<string, unknown>) =>
    api.get("/inventory/suppliers", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/inventory/suppliers/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) =>
    api.post("/inventory/suppliers", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/inventory/suppliers/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/inventory/suppliers/${id}`).then((r) => r.data),
}

export const inventoryItemsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get("/inventory/items", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/inventory/items/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) =>
    api.post("/inventory/items", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/inventory/items/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/inventory/items/${id}`).then((r) => r.data),
}

export const hospitalInventoryApi = {
  list: (params?: Record<string, unknown>) =>
    api.get("/inventory/hospital", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/inventory/hospital/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) =>
    api.post("/inventory/hospital", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/inventory/hospital/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/inventory/hospital/${id}`).then((r) => r.data),
}

export const inventoryTransactionsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get("/inventory/transactions", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/inventory/transactions/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) =>
    api.post("/inventory/transactions", data).then((r) => r.data),
}

export const monthlyOrdersApi = {
  suggestions: (params: { hospital_id?: string; order_period?: string }) =>
    api.get("/inventory/monthly-orders/suggestions", { params }).then((r) => r.data),
  list: (params?: Record<string, unknown>) =>
    api.get("/inventory/monthly-orders", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/inventory/monthly-orders/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) =>
    api.post("/inventory/monthly-orders", data).then((r) => r.data),
  submit: (data: Record<string, unknown>) =>
    api.post("/inventory/monthly-orders/submit", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/inventory/monthly-orders/${id}`, data).then((r) => r.data),
  transition: (id: string, data: Record<string, unknown>) =>
    api.post(`/inventory/monthly-orders/${id}/transition`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/inventory/monthly-orders/${id}`).then((r) => r.data),
  consolidated: (params: { order_period: string; hospital_ids?: string }) =>
    api.get("/inventory/monthly-orders/consolidated", { params }).then((r) => r.data),
  overview: (params: { order_period: string; hospital_ids?: string }) =>
    api.get("/inventory/monthly-orders/overview", { params }).then((r) => r.data),
  validate: (params: { order_period: string }) =>
    api.get("/inventory/monthly-orders/validate", { params }).then((r) => r.data),
  generate: (params: { order_period: string }) =>
    api.post("/inventory/monthly-orders/generate", null, { params }).then((r) => r.data),
  audit: (params: { page?: number; page_size?: number; order_period?: string }) =>
    api.get("/inventory/monthly-orders/audit", { params }).then((r) => r.data),
}

export const pendingInventoryItemsApi = {
  create: (data: Record<string, unknown>) =>
    api.post("/inventory/pending-items", data).then((r) => r.data),
  list: (params?: {
    page?: number
    page_size?: number
    hospital_id?: string
    status?: string
    order_period?: string
  }) => api.get("/inventory/pending-items", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/inventory/pending-items/${id}`).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/inventory/pending-items/${id}`, data).then((r) => r.data),
  review: (id: string, data: Record<string, unknown>) =>
    api.post(`/inventory/pending-items/${id}/review`, data).then((r) => r.data),
  duplicates: (name: string) =>
    api.get("/inventory/pending-items/duplicates", { params: { name } }).then((r) => r.data),
}

export const inventoryInsightsApi = {
  item: (params: { hospital_id?: string; item_id?: string }) =>
    api.get("/inventory/insights/item", { params }).then((r) => r.data),
  stock: (params: { hospital_id?: string; item_ids?: string }) =>
    api.get("/inventory/insights/stock", { params }).then((r) => r.data),
  transferSuggestions: (params: { hospital_ids?: string; item_ids?: string }) =>
    api.get("/inventory/insights/transfer-suggestions", { params }).then((r) => r.data),
}

export const inventoryReportApi = {
  get: (params: {
    report_type: string
    format?: string
    hospital_id?: string
    category_id?: string
    supplier_id?: string
    date_from?: string
    date_to?: string
    status?: string
    order_period?: string
    search?: string
  }) => api.get("/reports/inventory", { params, responseType: "blob" }).then((r) => r.data),
}

export const reportsApi = {
  revenue: (params?: {
    format?: string
    period?: string
    start_date?: string
    end_date?: string
  }) => api.get("/reports/revenue", { params, responseType: "blob" }).then((r) => r.data),
  expenses: (params?: {
    format?: string
    period?: string
    start_date?: string
    end_date?: string
  }) => api.get("/reports/expenses", { params, responseType: "blob" }).then((r) => r.data),
  profit: (params?: { format?: string; period?: string; start_date?: string; end_date?: string }) =>
    api.get("/reports/profit", { params, responseType: "blob" }).then((r) => r.data),
  hospitals: (params?: {
    format?: string
    period?: string
    start_date?: string
    end_date?: string
  }) => api.get("/reports/hospitals", { params, responseType: "blob" }).then((r) => r.data),
  doctors: (params?: {
    format?: string
    period?: string
    start_date?: string
    end_date?: string
  }) => api.get("/reports/doctors", { params, responseType: "blob" }).then((r) => r.data),
  adminGroups: (params?: {
    format?: string
    period?: string
    start_date?: string
    end_date?: string
  }) => api.get("/reports/admin-groups", { params, responseType: "blob" }).then((r) => r.data),
}

export const notificationsApi = {
  list: (params?: { type?: string; unread?: boolean; entity_type?: string }) =>
    api.get("/notifications", { params }).then((r) => r.data),
  markRead: (id: string) => api.post(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.post("/notifications/read-all").then((r) => r.data),
  unreadCount: () => api.get("/notifications/unread-count").then((r) => r.data),
  delete: (id: string) => api.delete(`/notifications/${id}`).then((r) => r.data),
  deleteAll: () => api.delete("/notifications").then((r) => r.data),
}

export interface TaskItem {
  id: string
  title: string
  description?: string | null
  due_date?: string | null
  priority: string
  status: string
  assignee_id?: string | null
  assignee_name?: string | null
  created_by: string
  created_by_name?: string | null
  entity_type?: string | null
  entity_id?: string | null
  completed_at?: string | null
  created_at: string
  updated_at: string
  is_overdue: boolean
}

export interface TaskStats {
  total: number
  open: number
  in_progress: number
  completed: number
  overdue: number
  due_today: number
  upcoming: number
  by_priority: Record<string, number>
}

export const tasksApi = {
  list: (params?: {
    status?: string
    priority?: string
    assignee_id?: string
    view?: "today" | "overdue" | "upcoming" | "all"
    entity_type?: string
    entity_id?: string
    search?: string
    limit?: number
    offset?: number
  }) => api.get("/tasks", { params }).then((r) => r.data as TaskItem[]),
  stats: () => api.get("/tasks/stats").then((r) => r.data as TaskStats),
  get: (id: string) => api.get(`/tasks/${id}`).then((r) => r.data as TaskItem),
  create: (data: Partial<TaskItem> & { title: string }) =>
    api.post("/tasks", data).then((r) => r.data as TaskItem),
  update: (id: string, data: Partial<TaskItem>) =>
    api.put(`/tasks/${id}`, data).then((r) => r.data as TaskItem),
  setStatus: (id: string, status: string) =>
    api.patch(`/tasks/${id}/status`, { status }).then((r) => r.data as TaskItem),
  setAssignee: (id: string, assignee_id: string | null) =>
    api.patch(`/tasks/${id}/assignee`, { assignee_id }).then((r) => r.data as TaskItem),
  delete: (id: string) => api.delete(`/tasks/${id}`).then((r) => r.data),
}

export const whatsappApi = {
  send: (data: { phone: string; message: string; patient_id?: string }) =>
    api.post("/whatsapp/send", data).then((r) => r.data),
  broadcast: (data: { patient_ids: string[]; message: string }) =>
    api.post("/whatsapp/broadcast", data).then((r) => r.data),
}

export const whatsappV2Api = {
  preview: (data: { patient_id: string; message: string; message_type?: string }) =>
    api.post("/whatsapp/preview", data).then((r) => r.data),
  send: (data: {
    patient_id: string
    message: string
    message_type?: string
    send_mode?: string
    template_id?: string
    template_name?: string
    rendered_variables?: Record<string, string>
  }) => api.post("/whatsapp/send", data).then((r) => r.data),
  bulkPreview: (data: { patient_ids: string[]; message: string; message_type?: string }) =>
    api.post("/whatsapp/bulk-preview", data).then((r) => r.data),
  bulkSend: (data: { items: Record<string, unknown>[] }) =>
    api.post("/whatsapp/bulk-send", data).then((r) => r.data),
  history: (params?: {
    patient_id?: string
    message_type?: string
    status?: string
    sent_via?: string
    start_date?: string
    end_date?: string
    page?: number
    page_size?: number
  }) => api.get("/whatsapp/history", { params }).then((r) => r.data),
  getMessage: (id: string) => api.get(`/whatsapp/history/${id}`).then((r) => r.data),
  messageTypes: () => api.get("/whatsapp/message-types").then((r) => r.data),
  confirmDelivery: (id: string) => api.post(`/whatsapp/confirm-delivery/${id}`).then((r) => r.data),
}

export const whatsappConfigApi = {
  get: (hospitalId: string) => api.get(`/whatsapp-config/${hospitalId}`).then((r) => r.data),
  update: (hospitalId: string, data: Record<string, unknown>) =>
    api.put(`/whatsapp-config/${hospitalId}`, data).then((r) => r.data),
}

export const whatsappTemplatesApi = {
  list: (params?: Record<string, unknown>) =>
    api.get("/crm/whatsapp-templates", { params }).then((r) => r.data),
  create: (data: { name: string; message: string }) =>
    api.post("/crm/whatsapp-templates", data).then((r) => r.data),
  update: (id: string, data: { name?: string; message?: string; is_active?: boolean }) =>
    api.put(`/crm/whatsapp-templates/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/crm/whatsapp-templates/${id}`).then((r) => r.data),
}

export const leadsApi = {
  list: (params?: PaginationParams) =>
    api.get("/leads", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get<Lead>(`/leads/${id}`).then((r) => r.data),
  create: (data: Partial<Lead>) => api.post<Lead>("/leads", data).then((r) => r.data),
  update: (id: string, data: Partial<Lead>) =>
    api.put<Lead>(`/leads/${id}`, data).then((r) => r.data),
  updateStatus: (id: string, status: string) =>
    api.put<Lead>(`/leads/${id}/status`, { status }).then((r) => r.data),
  delete: (id: string) => api.delete(`/leads/${id}`).then((r) => r.data),
  getCommunications: (id: string) =>
    api.get<LeadCommunication[]>(`/leads/${id}/communications`).then((r) => r.data),
  addCommunication: (
    id: string,
    data: { channel: string; message: string; template_name?: string },
  ) => api.post<LeadCommunication>(`/leads/${id}/communications`, data).then((r) => r.data),
  getCalls: (id: string) => api.get<LeadCall[]>(`/leads/${id}/calls`).then((r) => r.data),
  addCall: (
    id: string,
    data: { outcome?: string; notes?: string; follow_up_date?: string; duration_seconds?: number },
  ) => api.post<LeadCall>(`/leads/${id}/calls`, data).then((r) => r.data),
  convert: (id: string, data?: Record<string, unknown>) =>
    api.post(`/leads/${id}/convert`, data || {}).then((r) => r.data),
  createFollowUp: (
    id: string,
    data: {
      follow_up_date: string
      follow_up_time?: string
      priority?: string
      reason?: string
      notes?: string
    },
  ) => api.post(`/leads/${id}/follow-ups`, data).then((r) => r.data),
  getFollowUps: (id: string) => api.get(`/leads/${id}/follow-ups`).then((r) => r.data),
  bookAppointment: (
    id: string,
    data: {
      appointment_date: string
      appointment_time?: string
      doctor_id?: string
      notes?: string
    },
  ) => api.post(`/leads/${id}/appointments`, data).then((r) => r.data),
  analytics: () => api.get("/leads/analytics/summary").then((r) => r.data),
}

export const crmApi = {
  communications: {
    list: (params?: { patient_id?: string; channel?: string; limit?: number; offset?: number }) =>
      api.get("/crm/communications", { params }).then((r) => r.data),
    getByPatient: (patientId: string) =>
      api.get(`/crm/communications/${patientId}`).then((r) => r.data),
  },
  templates: {
    list: () => api.get("/crm/templates").then((r) => r.data),
    create: (data: { name: string; subject: string; body: string }) =>
      api.post("/crm/templates", data).then((r) => r.data),
    update: (
      id: string,
      data: { name?: string; subject?: string; body?: string; is_active?: boolean },
    ) => api.put(`/crm/templates/${id}`, data).then((r) => r.data),
    delete: (id: string) => api.delete(`/crm/templates/${id}`).then((r) => r.data),
  },
  followUps: {
    list: (params?: { patient_id?: string; status?: string }) =>
      api.get("/crm/follow-ups", { params }).then((r) => r.data),
    create: (data: {
      patient_id: string
      follow_up_date: string
      notes?: string
      doctor_id?: string
      case_id?: string
    }) => api.post("/crm/follow-ups", data).then((r) => r.data),
    update: (
      id: string,
      data: {
        status?: string
        notes?: string
        patient_feedback?: string
        staff_notes?: string
        response_summary?: string
        response_status?: string
        next_action?: string
        contact_channel?: string
        follow_up_date?: string
        follow_up_time?: string
        appointment_id?: string
        interested_to_visit_again?: boolean | string
        whatsapp_message?: string
      },
    ) => api.put(`/crm/follow-ups/${id}`, data).then((r) => r.data),
    delete: (id: string) => api.delete(`/crm/follow-ups/${id}`).then((r) => r.data),
    feedback: (
      id: string,
      data: {
        response_status: string
        patient_feedback?: string
        staff_notes?: string
        response_summary?: string
        next_action?: string
        contact_channel?: string
      },
    ) => api.post(`/crm/follow-ups/${id}/feedback`, data).then((r) => r.data),
    createAppointment: (
      id: string,
      data: {
        doctor_id: string
        appointment_date: string
        appointment_time: string
      },
    ) => api.post(`/crm/follow-ups/${id}/create-appointment`, data).then((r) => r.data),
    reschedule: (id: string, data: { follow_up_date: string; follow_up_time?: string }) =>
      api.post(`/crm/follow-ups/${id}/reschedule`, data).then((r) => r.data),
    markCompleted: (id: string) =>
      api.post(`/crm/follow-ups/${id}/mark-completed`).then((r) => r.data),
  },
  followUpsFiltered: (params?: {
    filter?: string
    follow_up_type?: string
    status?: string
    patient_id?: string
  }) => api.get("/crm/follow-ups/list", { params }).then((r) => r.data),
  markDone: (id: string, data?: { notes?: string }) =>
    api.post(`/crm/follow-ups/${id}/mark-done`, data || {}).then((r) => r.data),
  communicate: (id: string, data: { channel: string; message: string; notes?: string }) =>
    api.post(`/crm/follow-ups/${id}/communicate`, data).then((r) => r.data),
  recordResponse: (id: string, data: { response_message?: string; response_status: string }) =>
    api.post(`/crm/follow-ups/${id}/record-response`, data).then((r) => r.data),
  dashboard: () => api.get("/crm/dashboard").then((r) => r.data),
  recalls: () => api.get("/crm/recalls").then((r) => r.data),
  patientFollowUpHistory: (patientId: string) =>
    api.get(`/crm/patients/${patientId}/follow-up-history`).then((r) => r.data),
  whatsappTemplates: {
    list: () => api.get("/crm/whatsapp-templates").then((r) => r.data),
    create: (data: { name: string; message: string }) =>
      api.post("/crm/whatsapp-templates", data).then((r) => r.data),
    update: (id: string, data: { name?: string; message?: string; is_active?: boolean }) =>
      api.put(`/crm/whatsapp-templates/${id}`, data).then((r) => r.data),
    delete: (id: string) => api.delete(`/crm/whatsapp-templates/${id}`).then((r) => r.data),
  },
  feedback: {
    list: (params?: { hospital_id?: string; doctor_id?: string }) =>
      api.get("/crm/feedback", { params }).then((r) => r.data),
    submit: (data: {
      patient_id: string
      rating: number
      review?: string
      doctor_id?: string
      case_id?: string
    }) => api.post("/crm/feedback", data).then((r) => r.data),
  },
  // Context-aware feedback (Lead vs Patient)
  leadFeedback: {
    submit: (enquiryId: string, data: Record<string, unknown>) =>
      api.post(`/crm/feedback/lead/${enquiryId}`, data).then((r) => r.data),
    list: (enquiryId: string) => api.get(`/crm/feedback/lead/${enquiryId}`).then((r) => r.data),
    latest: (enquiryId: string) =>
      api.get(`/crm/feedback/lead/${enquiryId}/latest`).then((r) => r.data),
  },
  patientFeedback: {
    submit: (enquiryId: string, data: Record<string, unknown>) =>
      api.post(`/crm/feedback/patient/${enquiryId}`, data).then((r) => r.data),
    list: (enquiryId: string) => api.get(`/crm/feedback/patient/${enquiryId}`).then((r) => r.data),
    latest: (enquiryId: string) =>
      api.get(`/crm/feedback/patient/${enquiryId}/latest`).then((r) => r.data),
  },
  feedbackNotes: {
    add: (feedbackId: string, content: string) =>
      api.post(`/crm/feedback/${feedbackId}/notes`, { content }).then((r) => r.data),
    list: (feedbackId: string) => api.get(`/crm/feedback/${feedbackId}/notes`).then((r) => r.data),
    update: (noteId: string, content: string) =>
      api.patch(`/crm/feedback/notes/${noteId}`, { content }).then((r) => r.data),
  },
  feedbackSummary: (enquiryId: string) =>
    api.get(`/crm/feedback/${enquiryId}/summary`).then((r) => r.data),
  segments: () => api.get("/crm/segments").then((r) => r.data),
  analytics: () => api.get("/crm/analytics").then((r) => r.data),
  preview: (data: {
    message: string
    filter_type: string
    patient_ids?: string[]
    appointment_date?: string
    doctor_id?: string
    status?: string
  }) => api.post("/crm/whatsapp/preview", data).then((r) => r.data),
  sendWhatsApp: (data: {
    patient_id?: string
    lead_id?: string
    message: string
    message_type?: string
  }) => api.post("/crm/whatsapp/send", data).then((r) => r.data),
  followUpResponses: {
    record: (
      followUpId: string,
      data: { patient_id: string; response_message?: string; response_status: string },
    ) => api.post(`/crm/follow-ups/${followUpId}/response`, data).then((r) => r.data),
    listByPatient: (patientId: string) =>
      api.get(`/crm/follow-up-responses/${patientId}`).then((r) => r.data),
  },
  broadcastWhatsApp: (data: {
    message: string
    message_type?: string
    filter_type: string
    patient_ids?: string[]
    lead_ids?: string[]
    appointment_date?: string
    doctor_id?: string
    status?: string
  }) => api.post("/crm/whatsapp/broadcast", data).then((r) => r.data),
  createFollowUpFromEnquiry: (data: {
    patient_id: string
    response_id: string
    follow_up_reason: string
    priority?: string
    doctor_id: string
    follow_up_date: string
    follow_up_time?: string
    notes?: string
  }) => api.post("/crm/enquiry/create-follow-up", data).then((r) => r.data),
  getEnquiryDashboard: () => api.get("/crm/enquiry/dashboard").then((r) => r.data),
  sourceAnalytics: () => api.get("/crm/source-analytics").then((r) => r.data),
  getTodaysEnquiries: (tab?: string, calendarDate?: string) =>
    api
      .get("/crm/enquiry/today", { params: { tab, calendar_date: calendarDate } })
      .then((r) => r.data),
  dashboard2: (params?: {
    period?: string
    start_date?: string
    end_date?: string
    doctor?: string
    source?: string
    staff?: string
    lead_status?: string
    follow_up_status?: string
    priority?: string
    enquiry_type?: string
    treatment?: string
  }) => api.get("/crm/dashboard2", { params }).then((r) => r.data),
  quickView: {
    leads: (params?: { period?: string; start_date?: string; end_date?: string }) =>
      api.get("/crm/quick-view/leads", { params }).then((r) => r.data),
    convertedLeads: (params?: { period?: string; start_date?: string; end_date?: string }) =>
      api.get("/crm/quick-view/converted-leads", { params }).then((r) => r.data),
    followUps: (params?: { period?: string; start_date?: string; end_date?: string }) =>
      api.get("/crm/quick-view/follow-ups", { params }).then((r) => r.data),
    patientAcquisition: (params?: { period?: string; start_date?: string; end_date?: string }) =>
      api.get("/crm/quick-view/patient-acquisition", { params }).then((r) => r.data),
    leadSources: (params?: { period?: string; start_date?: string; end_date?: string }) =>
      api.get("/crm/quick-view/lead-sources", { params }).then((r) => r.data),
  },
  revenueByDoctor: () => api.get("/crm/analytics/revenue-by-doctor").then((r) => r.data),
  enhancedDashboard: (params?: {
    period?: string
    start_date?: string
    end_date?: string
    doctor?: string
    type?: string
    status?: string
    source?: string
  }) => api.get("/crm/enhanced-dashboard", { params }).then((r) => r.data),
  commandCenter: (params?: {
    period?: string
    start_date?: string
    end_date?: string
    doctor?: string
    source?: string
    staff?: string
    lead_status?: string
  }) => api.get("/crm/command-center", { params }).then((r) => r.data),
}

export const enquiriesApi = {
  list: (params?: { status?: string; patient_id?: string }) =>
    api.get("/crm/enquiries", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/crm/enquiries/${id}`).then((r) => r.data),
  create: (data: {
    patient_id: string
    treatment_interest?: string
    notes?: string
    assigned_staff_id?: string
    next_follow_up_date?: string
  }) => api.post("/crm/enquiries", data).then((r) => r.data),
  update: (
    id: string,
    data: {
      treatment_interest?: string
      status?: string
      notes?: string
      assigned_staff_id?: string
      next_follow_up_date?: string
    },
  ) => api.put(`/crm/enquiries/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/crm/enquiries/${id}`).then((r) => r.data),
  createFollowUp: (
    id: string,
    data: { action: string; notes?: string; next_follow_up_date?: string },
  ) => api.post(`/crm/enquiries/${id}/follow-ups`, data).then((r) => r.data),
  listFollowUps: (id: string) => api.get(`/crm/enquiries/${id}/follow-ups`).then((r) => r.data),
  getDetail: (id: string) => api.get(`/crm/enquiries/${id}/detail`).then((r) => r.data),
  whatsappPreview: (id: string, body?: { template_message?: string; template_id?: string }) =>
    api
      .post(`/crm/enquiries/${id}/whatsapp-preview`, body ?? {})
      .then((r) => r.data),
  calendar: (params: {
    start_date: string
    end_date: string
    status?: string
    type?: string
    search?: string
    doctor_id?: string
    patient_id?: string
    priority?: string
    include_terminal?: boolean
    page?: number
    page_size?: number
  }) => api.get("/crm/enquiries/calendar", { params }).then((r) => r.data),
  calendarSummary: (params: { start_date: string; end_date: string; include_terminal?: boolean }) =>
    api.get("/crm/enquiries/calendar/summary", { params }).then((r) => r.data),
  calendarOverdue: (params: {
    type?: string
    doctor_id?: string
    patient_id?: string
    include_terminal?: boolean
    page?: number
    page_size?: number
  }) => api.get("/crm/enquiries/calendar/overdue", { params }).then((r) => r.data),
  reschedule: (id: string, data: { new_date: string }) =>
    api.patch(`/crm/enquiries/${id}/reschedule`, data).then((r) => r.data),
  updateStatus: (id: string, data: { status: string }) =>
    api.patch(`/crm/enquiries/${id}/status`, data).then((r) => r.data),
  assign: (id: string, data: { assigned_staff_id: string }) =>
    api.patch(`/crm/enquiries/${id}/assign`, data).then((r) => r.data),
}

export const recallsApi = {
  list: (params?: { type?: string; status?: string; overdue_only?: boolean }) =>
    api.get("/crm/recalls", { params }).then((r) => r.data),
  complete: (id: string, data: { outcome: string; notes?: string; next_recall_date?: string }) =>
    api.put(`/crm/recalls/${id}/complete`, data).then((r) => r.data),
  stats: () => api.get("/crm/recalls/stats").then((r) => r.data),
  calendar: (params: { start_date: string; end_date: string }) =>
    api.get("/crm/recalls/calendar", { params }).then((r) => r.data),
  generate: () => api.post("/crm/recalls/generate").then((r) => r.data),
}

export const treatmentTypesApi = {
  list: (hospitalId?: string) =>
    api
      .get("/treatment-types", { params: hospitalId ? { hospital_id: hospitalId } : {} })
      .then((r) => r.data),
  get: (id: string) => api.get(`/treatment-types/${id}`).then((r) => r.data),
  create: (data: {
    name: string
    description?: string
    hospital_id?: string
    treatment_category_id?: string
    estimated_duration?: number
    default_cost?: number
  }) => api.post("/treatment-types", data).then((r) => r.data),
  update: (
    id: string,
    data: {
      name?: string
      description?: string
      is_active?: boolean
      treatment_category_id?: string
      estimated_duration?: number
      default_cost?: number
    },
  ) => api.put(`/treatment-types/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/treatment-types/${id}`).then((r) => r.data),
  seed: (hospitalId?: string) =>
    api
      .post("/treatment-types/seed", {}, { params: hospitalId ? { hospital_id: hospitalId } : {} })
      .then((r) => r.data),
}

export const consentFormsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get("/consent-forms", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/consent-forms/${id}`).then((r) => r.data),
  create: (data: FormData) =>
    api
      .post("/consent-forms", data, { headers: { "Content-Type": "multipart/form-data" } })
      .then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/consent-forms/${id}`, data).then((r) => r.data),
  replacePdf: (id: string, data: FormData) =>
    api
      .post(`/consent-forms/${id}/replace-pdf`, data, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data),
  delete: (id: string) => api.delete(`/consent-forms/${id}`).then((r) => r.data),
  restore: (id: string) => api.post(`/consent-forms/${id}/restore`).then((r) => r.data),
  getPdf: (id: string) =>
    api.get(`/consent-forms/${id}/pdf`, { responseType: "blob" }).then((r) => r.data),
  getPdfUrl: (id: string) => `/api/v1/consent-forms/${id}/pdf`,
  downloadPdf: (id: string) =>
    api.get(`/consent-forms/${id}/download`, { responseType: "blob" }).then((r) => r.data),
  getByPatient: (patientId: string) =>
    api.get(`/consent-forms/patient/${patientId}`).then((r) => r.data),
  getByCase: (caseId: string) => api.get(`/consent-forms/by-case/${caseId}`).then((r) => r.data),
  getByTreatment: (treatmentPlanId: string) =>
    api.get(`/consent-forms/by-treatment/${treatmentPlanId}`).then((r) => r.data),
  getStats: (hospitalId: string) =>
    api.get(`/consent-forms/stats/hospital/${hospitalId}`).then((r) => r.data),
}

export const exportsApi = {
  listModules: () => api.get("/exports/modules").then((r) => r.data),
  exportData: (module: string, format: string, params?: Record<string, string>) =>
    api
      .get(`/exports/${module}`, { params: { format, ...params }, responseType: "blob" })
      .then((r) => r.data),
  exportBackground: (module: string, format: string, params?: Record<string, string>) =>
    api
      .get(`/exports/${module}`, {
        params: { format, background: "true", ...params },
        responseType: "blob",
      })
      .then((r) => r.data),
  getJob: (jobId: string) => api.get(`/exports/jobs/${jobId}`).then((r) => r.data),
  downloadJob: (jobId: string) =>
    api.post(`/exports/jobs/${jobId}/download`, {}, { responseType: "blob" }).then((r) => r.data),
  exportDashboardPdf: (params?: Record<string, string>) =>
    api.get("/exports/dashboard/pdf", { params, responseType: "blob" }).then((r) => r.data),
  exportFinancialPdf: (params?: Record<string, string>) =>
    api.get("/exports/financial/pdf", { params, responseType: "blob" }).then((r) => r.data),
  exportMonthlyPdf: (params?: Record<string, string>) =>
    api.get("/exports/monthly/pdf", { params, responseType: "blob" }).then((r) => r.data),
}

export const auditLogApi = {
  getForEntity: (entityType: string, entityId: string, limit?: number) =>
    api
      .get("/status/audit-logs", {
        params: { entity_type: entityType, entity_id: entityId, limit: limit || 50 },
      })
      .then((r) => r.data),
}

export const crmEventsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get("/crm/events", { params }).then((r) => r.data),
  get: (eventId: string) => api.get(`/crm/events/${eventId}`).then((r) => r.data),
  pending: (params?: Record<string, unknown>) =>
    api.get("/crm/events/pending", { params }).then((r) => r.data),
  failed: (params?: Record<string, unknown>) =>
    api.get("/crm/events/failed", { params }).then((r) => r.data),
  retry: (eventId: string) => api.post(`/crm/events/retry/${eventId}`).then((r) => r.data),
  replay: (eventId: string) => api.post(`/crm/events/replay/${eventId}`).then((r) => r.data),
  statistics: () => api.get("/crm/events/statistics").then((r) => r.data),
}

export const crmV2Api = {
  templates: {
    list: (params?: Record<string, unknown>) =>
      api.get("/crm/templates/follow-up", { params }).then((r) => r.data),
    create: (data: Record<string, unknown>) =>
      api.post("/crm/templates/follow-up", data).then((r) => r.data),
    update: (id: string, data: Record<string, unknown>) =>
      api.put(`/crm/templates/follow-up/${id}`, data).then((r) => r.data),
    delete: (id: string) => api.delete(`/crm/templates/follow-up/${id}`).then((r) => r.data),
  },
  rules: {
    list: (params?: Record<string, unknown>) =>
      api.get("/crm/automation-rules", { params }).then((r) => r.data),
    create: (data: Record<string, unknown>) =>
      api.post("/crm/automation-rules", data).then((r) => r.data),
    update: (id: string, data: Record<string, unknown>) =>
      api.put(`/crm/automation-rules/${id}`, data).then((r) => r.data),
    delete: (id: string) => api.delete(`/crm/automation-rules/${id}`).then((r) => r.data),
    toggle: (id: string) => api.post(`/crm/automation-rules/${id}/toggle`).then((r) => r.data),
  },
  dashboard: () => api.get("/crm/follow-ups/dashboard").then((r) => r.data),
  escalate: (id: string) => api.post(`/crm/follow-ups/${id}/escalate`).then((r) => r.data),
  patientTimeline: (patientId: string) =>
    api.get(`/crm/follow-ups/patient/${patientId}`).then((r) => r.data),
  reports: {
    performance: (params?: Record<string, unknown>) =>
      api.get("/crm/reports/performance", { params }).then((r) => r.data),
    recallEffectiveness: (params?: Record<string, unknown>) =>
      api.get("/crm/reports/recall-effectiveness", { params }).then((r) => r.data),
  },
}

export const crmSettingsApi = {
  crmConfig: {
    getGeneral: () => api.get("/crm-config/general").then((r) => r.data),
    updateGeneral: (data: Record<string, string>) =>
      api.put("/crm-config/general", data).then((r) => r.data),
    getLead: () => api.get("/crm-config/lead").then((r) => r.data),
    updateLead: (data: {
      enabled: boolean
      start_delay_days: number
      auto_close_on_completion: boolean
      skip_wellness_if_appointment: boolean
      max_attempts: number
      days_between_attempts: number
      auto_close_after_final: boolean
      auto_close_action: string
      stop_automation_on: string
    }) => api.put("/crm-config/lead", data).then((r) => r.data),
    getOpd: () => api.get("/crm-config/opd").then((r) => r.data),
    updateOpd: (data: {
      enabled: boolean
      start_delay_days: number
      auto_close_on_completion: boolean
      skip_wellness_if_appointment: boolean
      max_attempts: number
      days_between_attempts: number
      auto_close_after_final: boolean
      auto_close_action: string
      stop_automation_on: string
    }) => api.put("/crm-config/opd", data).then((r) => r.data),
    getTreatment: () => api.get("/crm-config/treatment").then((r) => r.data),
    updateTreatment: (
      treatmentTypeId: string,
      data: {
        enabled: boolean
        start_delay_days: number
        auto_close_on_completion: boolean
        skip_wellness_if_appointment: boolean
      },
    ) => api.put(`/crm-config/treatment/${treatmentTypeId}`, data).then((r) => r.data),
    updateTreatmentDefaults: (data: {
      enabled: boolean
      start_delay_days: number
      auto_close_on_completion: boolean
      skip_wellness_if_appointment: boolean
    }) => api.put("/crm-config/treatment/defaults", data).then((r) => r.data),
    updateTreatmentBulk: (
      items: {
        treatment_type_id: string
        enabled: boolean
        start_delay_days: number
        auto_close_on_completion: boolean
        skip_wellness_if_appointment: boolean
      }[],
    ) => api.put("/crm-config/treatment", items).then((r) => r.data),
    getCase: () => api.get("/crm-config/case").then((r) => r.data),
    updateCase: (
      section: string,
      data: {
        enabled: boolean
        start_delay_days: number
        auto_close_on_completion: boolean
        skip_wellness_if_appointment: boolean
      },
    ) => api.put(`/crm-config/case/${section}`, data).then((r) => r.data),
  },
  inlineList: {
    get: (listKey: string) => api.get(`/master-data/inline/${listKey}`).then((r) => r.data),
    add: (listKey: string, name: string) =>
      api.post(`/master-data/inline/${listKey}`, { name }).then((r) => r.data),
    update: (listKey: string, itemId: string, name: string) =>
      api.put(`/master-data/inline/${listKey}/${itemId}`, { name }).then((r) => r.data),
    remove: (listKey: string, itemId: string) =>
      api.delete(`/master-data/inline/${listKey}/${itemId}`).then((r) => r.data),
    seed: (listKey: string) => api.post(`/master-data/inline/${listKey}/seed`).then((r) => r.data),
  },
}

export const crmRulesApi = {
  lead: {
    list: () => api.get("/crm/rules/lead").then((r) => r.data),
    add: (data: {
      name: string
      trigger: string
      wait_time: string
      action: string
      assign_to: string
      send_whatsapp: boolean
      send_notification: boolean
    }) => api.post("/crm/rules/lead", data).then((r) => r.data),
    update: (id: string, data: Record<string, unknown>) =>
      api.put(`/crm/rules/lead/${id}`, data).then((r) => r.data),
    remove: (id: string) => api.delete(`/crm/rules/lead/${id}`).then((r) => r.data),
  },
  treatment: {
    list: (treatmentTypeId?: string) =>
      api
        .get("/crm/rules/treatment", {
          params: treatmentTypeId ? { treatment_type_id: treatmentTypeId } : {},
        })
        .then((r) => r.data),
    listAll: () => api.get("/crm/rules/treatment").then((r) => r.data),
    add: (data: {
      name: string
      treatment_type_id: string
      trigger: string
      visit?: string
      wait_time: string
      action: string
      assign_to: string
      send_whatsapp: boolean
      send_notification: boolean
    }) => api.post("/crm/rules/treatment", data).then((r) => r.data),
    update: (id: string, data: Record<string, unknown>) =>
      api.put(`/crm/rules/treatment/${id}`, data).then((r) => r.data),
    remove: (id: string) => api.delete(`/crm/rules/treatment/${id}`).then((r) => r.data),
  },
  test: (data: {
    rule_type: string
    trigger: string
    patient_id: string
    treatment_type_id?: string
  }) => api.post("/crm/rules/test", data).then((r) => r.data),
  policies: {
    getLeadPolicy: () => api.get("/crm/rules/policies/lead").then((r) => r.data),
    saveLeadPolicy: (data: {
      follow_ups: {
        delay_days: number
        enabled: boolean
        send_whatsapp: boolean
        send_notification: boolean
      }[]
      auto_close_days: number
    }) => api.put("/crm/rules/policies/lead", data).then((r) => r.data),
    getTreatmentJourneys: () =>
      api.get("/crm/rules/policies/treatment-journeys").then((r) => r.data),
    saveTreatmentJourney: (
      treatmentTypeId: string,
      data: {
        steps: {
          milestone: string
          delay_days: number
          enabled: boolean
          send_whatsapp: boolean
          send_notification: boolean
          label: string
          visit_stage?: string
          action?: string
        }[]
        notes: string
      },
    ) =>
      api
        .put(`/crm/rules/policies/treatment-journeys/${treatmentTypeId}`, data)
        .then((r) => r.data),
    getCaseJourney: () => api.get("/crm/rules/policies/case-journey").then((r) => r.data),
    saveCaseJourney: (data: {
      steps: {
        milestone: string
        delay_days: number
        enabled: boolean
        send_whatsapp: boolean
        send_notification: boolean
        label: string
      }[]
    }) => api.put("/crm/rules/policies/case-journey", data).then((r) => r.data),
  },
}

export const laboratoriesApi = {
  list: (params?: PaginationParams) =>
    api.get("/laboratories/", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/laboratories/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post("/laboratories/", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/laboratories/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/laboratories/${id}`).then((r) => r.data),
}

export const labCasesApi = {
  list: (params?: PaginationParams) =>
    api.get("/lab-cases/", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/lab-cases/${id}`).then((r) => r.data),
  candidates: (params?: PaginationParams) =>
    api.get("/lab-cases/candidates", { params }).then((r) => r.data),
  byTreatment: (planId: string) => api.get(`/lab-cases/by-treatment/${planId}`).then((r) => r.data),
  fromTreatment: (planId: string, data: Record<string, unknown>) =>
    api.post(`/lab-cases/from-treatment/${planId}`, data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/lab-cases/${id}`, data).then((r) => r.data),
  setStatus: (id: string, status: string, note?: string) =>
    api.post(`/lab-cases/${id}/status`, { status, note }).then((r) => r.data),
  events: (id: string) => api.get(`/lab-cases/${id}/events`).then((r) => r.data),
  addEvent: (id: string, data: { event_type: string; note?: string }) =>
    api.post(`/lab-cases/${id}/events`, data).then((r) => r.data),
  whatsapp: (id: string, data: { message: string; phone?: string }) =>
    api.post(`/lab-cases/${id}/whatsapp`, data).then((r) => r.data),
  call: (id: string, data: { note?: string; duration_seconds?: number }) =>
    api.post(`/lab-cases/${id}/call`, data).then((r) => r.data),
  batchSend: (data: {
    treatment_plan_ids: string[]
    laboratory_id: string
    due_date?: string | null
    phone?: string | null
    order_number?: string | null
    message?: string | null
  }) => api.post("/lab-cases/batch-send", data).then((r) => r.data),
  remove: (id: string) => api.delete(`/lab-cases/${id}`).then((r) => r.data),
  report: (month: string) =>
    api.get("/lab-cases/report", { params: { month, format: "json" } }).then((r) => r.data),
  reportBlob: (month: string, format: "csv" | "excel" | "pdf") =>
    api
      .get("/lab-cases/report", { params: { month, format }, responseType: "blob" })
      .then((r) => r.data),
}

export const communicationCenterApi = {
  list: (params?: Record<string, unknown>) =>
    api.get("/communication-center/communications", { params }).then((r) => r.data),
  stats: (params?: Record<string, unknown>) =>
    api.get("/communication-center/communications/stats", { params }).then((r) => r.data),
  get: (sourceModule: string, sourceId: string) =>
    api.get(`/communication-center/communications/${sourceModule}/${sourceId}`).then((r) => r.data),
  preview: (sourceModule: string, sourceId: string) =>
    api.get(`/communication-center/communications/${sourceModule}/${sourceId}/preview`).then((r) => r.data),
  resend: (sourceModule: string, sourceId: string, data?: { message?: string }) =>
    api.post(`/communication-center/communications/${sourceModule}/${sourceId}/resend`, data).then((r) => r.data),
  download: (sourceModule: string, sourceId: string, print = false) =>
    api
      .get(`/communication-center/communications/${sourceModule}/${sourceId}/download`, {
        params: { print },
        responseType: "blob",
      })
      .then((r) => r.data as Blob),
  patientTimeline: (patientId: string, params?: Record<string, unknown>) =>
    api.get(`/communication-center/patients/${patientId}/communications`, { params }).then((r) => r.data),
  export: (data: Record<string, unknown>) =>
    api.post("/communication-center/export", data).then((r) => r.data),
  exportBlob: (data: Record<string, unknown>) =>
    api
      .post("/communication-center/export", data, { responseType: "blob" })
      .then((r) => r.data as Blob),
  activities: (params?: Record<string, unknown>) =>
    api.get("/communication-center/activities", { params }).then((r) => r.data),
  meta: () => api.get("/communication-center/meta").then((r) => r.data),
}

export const subscriptionsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get("/subscriptions", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/subscriptions/${id}`).then((r) => r.data),
  plans: (activeOnly = false) =>
    api.get("/subscriptions/plans", { params: { active_only: activeOnly } }).then((r) => r.data),
  dashboardStats: () =>
    api.get("/subscriptions/dashboard/stats").then((r) => r.data),
  history: (id: string) => api.get(`/subscriptions/${id}/history`).then((r) => r.data),
  payments: (id: string) => api.get(`/subscriptions/${id}/payments`).then((r) => r.data),
  create: (data: Record<string, unknown>) =>
    api.post("/subscriptions", data).then((r) => r.data),
  recordPayment: (id: string, data: Record<string, unknown>) =>
    api.post(`/subscriptions/${id}/record-payment`, data).then((r) => r.data),
  renew: (id: string, data?: Record<string, unknown>) =>
    api.post(`/subscriptions/${id}/renew`, data ?? {}).then((r) => r.data),
  extend: (id: string, data: Record<string, unknown>) =>
    api.post(`/subscriptions/${id}/extend`, data).then((r) => r.data),
  grantFree: (id: string, data: Record<string, unknown>) =>
    api.post(`/subscriptions/${id}/grant-free`, data).then((r) => r.data),
  changePlan: (id: string, data: Record<string, unknown>) =>
    api.post(`/subscriptions/${id}/change-plan`, data).then((r) => r.data),
  cancel: (id: string, data?: Record<string, unknown>) =>
    api.post(`/subscriptions/${id}/cancel`, data ?? {}).then((r) => r.data),
  reactivate: (id: string, data?: Record<string, unknown>) =>
    api.post(`/subscriptions/${id}/reactivate`, data ?? {}).then((r) => r.data),
}
