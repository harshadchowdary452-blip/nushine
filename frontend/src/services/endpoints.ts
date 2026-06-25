import api from "./api";
import type { LoginRequest, LoginResponse, PaginationParams, User, Lead, LeadCall, LeadCommunication } from "@/types";

function withPagination(params?: PaginationParams) {
  if (!params) return undefined;
  const { page, page_size, ...rest } = params;
  const result: Record<string, unknown> = { ...rest };
  if (page_size != null) result.limit = page_size;
  if (page != null) result.skip = (page - 1) * (page_size ?? 10);
  return result;
}

export const authApi = {
  login: (data: LoginRequest) => api.post<LoginResponse>("/auth/login", data, { timeout: 30000 }).then((r) => r.data),
  refresh: (refresh_token: string) =>
    api.post<{ access_token: string; refresh_token: string }>("/auth/refresh", { refresh_token }).then((r) => r.data),
  logout: (refresh_token: string) => api.post("/auth/logout", { refresh_token }),
  me: () => api.get<User>("/auth/me").then((r) => r.data),
  changePassword: (data: { current_password: string; new_password: string }) =>
    api.post("/auth/change-password", data).then((r) => r.data),
  updateProfile: (data: { full_name: string; phone?: string; specialization?: string; license_number?: string }) =>
    api.put("/auth/me", data).then((r) => r.data),
};

export const groupsApi = {
  list: (params?: PaginationParams) => api.get("/admin-groups", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/admin-groups/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/admin-groups", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/admin-groups/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/admin-groups/${id}`).then((r) => r.data),
  createAdmin: (groupId: string, data: any) => api.post(`/admin-groups/${groupId}/admins`, data).then((r) => r.data),
};

export const hospitalsApi = {
  list: (params?: PaginationParams) => api.get("/hospitals", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/hospitals/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/hospitals", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/hospitals/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/hospitals/${id}`).then((r) => r.data),
  createAdmin: (hospitalId: string, data: any) => api.post(`/hospitals/${hospitalId}/admins`, data).then((r) => r.data),
};

export const usersApi = {
  list: (params?: PaginationParams) => api.get("/users", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/users/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/users", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/users/${id}`).then((r) => r.data),
};

export const doctorsApi = {
  list: (params?: PaginationParams) => api.get("/doctors", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/doctors/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/doctors", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/doctors/${id}`, data).then((r) => r.data),
  deactivate: (id: string) => api.post(`/doctors/${id}/deactivate`),
  activate: (id: string) => api.post(`/doctors/${id}/activate`),
};

export const patientsApi = {
  list: (params?: PaginationParams) => api.get("/patients", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/patients/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/patients", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/patients/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/patients/${id}`).then((r) => r.data),
  search: (params?: PaginationParams) => api.get("/patients/search", { params: withPagination(params) }).then((r) => r.data),
};

export const casesApi = {
  list: (params?: PaginationParams) => api.get("/cases", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/cases/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/cases", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/cases/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/cases/${id}`).then((r) => r.data),
  getTimeline: (id: string, params?: Record<string, unknown>) =>
    api.get(`/cases/${id}/timeline`, { params }).then((r) => r.data),
};

export const appointmentsApi = {
  list: (params?: PaginationParams) => api.get("/appointments", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/appointments/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/appointments", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/appointments/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/appointments/${id}`).then((r) => r.data),
  checkAvailability: (params: { doctor_id: string; appointment_date: string; appointment_time: string }) =>
    api.get("/appointments/availability", { params }).then((r) => r.data),
  reassignDoctor: (id: string, data: { doctor_id: string; reason?: string }) =>
    api.post(`/appointments/${id}/reassign-doctor`, data).then((r) => r.data),
  slots: (params: { doctor_id: string; date: string; duration_minutes?: number }) =>
    api.get("/appointments/slots", { params }).then((r) => r.data),
};

export const doctorWorkingHoursApi = {
  get: (doctorId: string) => api.get(`/doctors/${doctorId}/working-hours/`).then((r) => r.data),
  bulkUpdate: (doctorId: string, data: { schedules: any[] }) => api.post(`/doctors/${doctorId}/working-hours/bulk`, data).then((r) => r.data),
};

export const doctorAvailabilityApi = {
  list: (doctorId: string) => api.get(`/doctors/${doctorId}/availability/`).then((r) => r.data),
  get: (doctorId: string, overrideId: string) => api.get(`/doctors/${doctorId}/availability/${overrideId}`).then((r) => r.data),
  create: (doctorId: string, data: any) => api.post(`/doctors/${doctorId}/availability/`, data).then((r) => r.data),
  update: (doctorId: string, overrideId: string, data: any) => api.put(`/doctors/${doctorId}/availability/${overrideId}`, data).then((r) => r.data),
  delete: (doctorId: string, overrideId: string) => api.delete(`/doctors/${doctorId}/availability/${overrideId}`).then((r) => r.data),
};

export const doctorLeavesApi = {
  list: (doctorId: string) => api.get(`/doctors/${doctorId}/leaves/`).then((r) => r.data),
  create: (doctorId: string, data: any) => api.post(`/doctors/${doctorId}/leaves/`, data).then((r) => r.data),
  update: (doctorId: string, leaveId: string, data: any) => api.put(`/doctors/${doctorId}/leaves/${leaveId}`, data).then((r) => r.data),
  delete: (doctorId: string, leaveId: string) => api.delete(`/doctors/${doctorId}/leaves/${leaveId}`).then((r) => r.data),
};

export const doctorBlockedSlotsApi = {
  list: (doctorId: string) => api.get(`/doctors/${doctorId}/blocked-slots/`).then((r) => r.data),
  create: (doctorId: string, data: any) => api.post(`/doctors/${doctorId}/blocked-slots/`, data).then((r) => r.data),
  delete: (doctorId: string, slotId: string) => api.delete(`/doctors/${doctorId}/blocked-slots/${slotId}`).then((r) => r.data),
};

export const consultantsApi = {
  list: (params?: PaginationParams) => api.get("/consultants", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/consultants/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/consultants", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/consultants/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/consultants/${id}`).then((r) => r.data),
};

export const consultantNotesApi = {
  listByCase: (caseId: string) => api.get(`/consultant-notes/by-case/${caseId}`).then((r) => r.data),
  create: (data: { case_id: string; consultant_id: string; notes: string }) =>
    api.post("/consultant-notes", data).then((r) => r.data),
};

export const treatmentApi = {
  list: (params?: PaginationParams) => api.get("/treatment-plans", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/treatment-plans/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/treatment-plans", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/treatment-plans/${id}`, data).then((r) => r.data),
  updateStatus: (id: string, status: string) => api.put(`/treatment-plans/${id}/status`, null, { params: { status } }).then((r) => r.data),
  delete: (id: string) => api.delete(`/treatment-plans/${id}`).then((r) => r.data),
};

export const treatmentSittingsApi = {
  listByPlan: (planId: string) => api.get(`/treatment-sittings/by-plan/${planId}`).then((r) => r.data),
  get: (id: string) => api.get(`/treatment-sittings/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/treatment-sittings", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/treatment-sittings/${id}`, data).then((r) => r.data),
};

export const billingApi = {
  list: (params?: PaginationParams) => api.get("/billings", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/billings/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/billings", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/billings/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/billings/${id}`).then((r) => r.data),
  updatePayment: (id: string, data: any) => api.put(`/billings/${id}/payment`, data).then((r) => r.data),
  getPdf: (id: string) => api.get(`/billings/${id}/pdf`, { responseType: "blob" }).then((r) => r.data),
  getTransactions: (id: string) => api.get(`/billings/${id}/transactions`).then((r) => r.data),
  getHistory: (id: string) => api.get(`/billings/${id}/history`).then((r) => r.data),
  applyDiscount: (id: string, data: { discount_type?: string; discount_percent?: number; discount_amount?: number; discount_reason?: string }) =>
    api.put(`/billings/${id}/discount`, data).then((r) => r.data),
};

export const dashboardApi = {
  superAdmin: (params?: { period?: string; start_date?: string; end_date?: string }) =>
    api.get("/dashboards/super-admin", { params }).then((r) => r.data),
  groupAdmin: (params?: { period?: string; start_date?: string; end_date?: string; hospital_id?: string }) =>
    api.get("/dashboards/group-admin", { params }).then((r) => r.data),
  hospitalAdmin: (params?: { period?: string; start_date?: string; end_date?: string }) =>
    api.get("/dashboards/hospital-admin", { params }).then((r) => r.data),
  doctor: (params?: { period?: string; start_date?: string; end_date?: string }) =>
    api.get("/dashboards/doctor", { params }).then((r) => r.data),
  quickViewAdminGroup: (id: string, params?: { period?: string; start_date?: string; end_date?: string }) =>
    api.get(`/dashboards/quick-view/admin-group/${id}`, { params }).then((r) => r.data),
  quickViewHospital: (id: string, params?: { period?: string; start_date?: string; end_date?: string }) =>
    api.get(`/dashboards/quick-view/hospital/${id}`, { params }).then((r) => r.data),
  quickViewDoctor: (id: string, params?: { period?: string; start_date?: string; end_date?: string }) =>
    api.get(`/dashboards/quick-view/doctor/${id}`, { params }).then((r) => r.data),
  quickViewPatient: (id: string) => api.get(`/dashboards/quick-view/patient/${id}`).then((r) => r.data),
};

export const expensesApi = {
  list: (params?: Record<string, unknown>) => api.get("/expenses", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/expenses/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/expenses", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/expenses/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/expenses/${id}`).then((r) => r.data),
  analytics: () => api.get("/expenses/analytics").then((r) => r.data),
  calendar: (params?: { month?: number; year?: number; hospital_id?: string }) => api.get("/expenses/calendar", { params }).then((r) => r.data),
  calendarDay: (date: string) => api.get(`/expenses/calendar/${date}`).then((r) => r.data),
};

export const reportsApi = {
  revenue: (params?: { format?: string; period?: string; start_date?: string; end_date?: string }) =>
    api.get("/reports/revenue", { params, responseType: "blob" }).then((r) => r.data),
  expenses: (params?: { format?: string; period?: string; start_date?: string; end_date?: string }) =>
    api.get("/reports/expenses", { params, responseType: "blob" }).then((r) => r.data),
  profit: (params?: { format?: string; period?: string; start_date?: string; end_date?: string }) =>
    api.get("/reports/profit", { params, responseType: "blob" }).then((r) => r.data),
  hospitals: (params?: { format?: string; period?: string; start_date?: string; end_date?: string }) =>
    api.get("/reports/hospitals", { params, responseType: "blob" }).then((r) => r.data),
  doctors: (params?: { format?: string; period?: string; start_date?: string; end_date?: string }) =>
    api.get("/reports/doctors", { params, responseType: "blob" }).then((r) => r.data),
  adminGroups: (params?: { format?: string; period?: string; start_date?: string; end_date?: string }) =>
    api.get("/reports/admin-groups", { params, responseType: "blob" }).then((r) => r.data),
};

export const notificationsApi = {
  list: () => api.get("/notifications").then((r) => r.data),
  markRead: (id: string) => api.post(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.post("/notifications/read-all").then((r) => r.data),
  unreadCount: () => api.get("/notifications/unread-count").then((r) => r.data),
  delete: (id: string) => api.delete(`/notifications/${id}`).then((r) => r.data),
  deleteAll: () => api.delete("/notifications").then((r) => r.data),
};

export const whatsappApi = {
  send: (data: { phone: string; message: string; patient_id?: string }) =>
    api.post("/whatsapp/send", data).then((r) => r.data),
  broadcast: (data: { patient_ids: string[]; message: string }) =>
    api.post("/whatsapp/broadcast", data).then((r) => r.data),
};

export const whatsappV2Api = {
  preview: (data: { patient_id: string; message: string; message_type?: string }) =>
    api.post("/whatsapp/preview", data).then((r) => r.data),
  send: (data: { patient_id: string; message: string; message_type?: string; send_mode?: string; template_id?: string; template_name?: string; rendered_variables?: Record<string, string> }) =>
    api.post("/whatsapp/send", data).then((r) => r.data),
  bulkPreview: (data: { patient_ids: string[]; message: string; message_type?: string }) =>
    api.post("/whatsapp/bulk-preview", data).then((r) => r.data),
  bulkSend: (data: { items: any[] }) =>
    api.post("/whatsapp/bulk-send", data).then((r) => r.data),
  history: (params?: { patient_id?: string; message_type?: string; status?: string; sent_via?: string; start_date?: string; end_date?: string; page?: number; page_size?: number }) =>
    api.get("/whatsapp/history", { params }).then((r) => r.data),
  getMessage: (id: string) =>
    api.get(`/whatsapp/history/${id}`).then((r) => r.data),
  messageTypes: () =>
    api.get("/whatsapp/message-types").then((r) => r.data),
  confirmDelivery: (id: string) =>
    api.post(`/whatsapp/confirm-delivery/${id}`).then((r) => r.data),
};

export const campaignsApi = {
  list: (params?: { skip?: number; limit?: number }) =>
    api.get("/campaigns", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/campaigns/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/campaigns", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/campaigns/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/campaigns/${id}`).then((r) => r.data),
  launch: (id: string) => api.post(`/campaigns/${id}/launch`).then((r) => r.data),
  recipients: (id: string) => api.get(`/campaigns/${id}/recipients`).then((r) => r.data),
  analytics: {
    overview: () => api.get("/campaigns/analytics/overview").then((r) => r.data),
    retention: () => api.get("/campaigns/analytics/retention").then((r) => r.data),
    followUpSuggestions: () => api.get("/campaigns/analytics/follow-up-suggestions").then((r) => r.data),
    followUpCalendar: (start: string, end: string) =>
      api.get("/campaigns/analytics/follow-up-calendar", { params: { start, end } }).then((r) => r.data),
    patientInteractions: (patientId: string) =>
      api.get(`/campaigns/analytics/patient-interactions/${patientId}`).then((r) => r.data),
  },
};

export const whatsappConfigApi = {
  get: (hospitalId: string) => api.get(`/whatsapp-config/${hospitalId}`).then((r) => r.data),
  update: (hospitalId: string, data: Record<string, any>) => api.put(`/whatsapp-config/${hospitalId}`, data).then((r) => r.data),
};

export const whatsappTemplatesApi = {
  list: (params?: Record<string, any>) => api.get("/crm/whatsapp-templates", { params }).then((r) => r.data),
  create: (data: { name: string; message: string }) => api.post("/crm/whatsapp-templates", data).then((r) => r.data),
  update: (id: string, data: { name?: string; message?: string; is_active?: boolean }) =>
    api.put(`/crm/whatsapp-templates/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/crm/whatsapp-templates/${id}`).then((r) => r.data),
};

export const leadsApi = {
  list: (params?: PaginationParams) => api.get("/leads", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get<Lead>(`/leads/${id}`).then((r) => r.data),
  create: (data: Partial<Lead>) => api.post<Lead>("/leads", data).then((r) => r.data),
  update: (id: string, data: Partial<Lead>) => api.put<Lead>(`/leads/${id}`, data).then((r) => r.data),
  updateStatus: (id: string, status: string) => api.put<Lead>(`/leads/${id}/status`, { status }).then((r) => r.data),
  delete: (id: string) => api.delete(`/leads/${id}`).then((r) => r.data),
  getCommunications: (id: string) => api.get<LeadCommunication[]>(`/leads/${id}/communications`).then((r) => r.data),
  addCommunication: (id: string, data: { channel: string; message: string }) =>
    api.post<LeadCommunication>(`/leads/${id}/communications`, data).then((r) => r.data),
  getCalls: (id: string) => api.get<LeadCall[]>(`/leads/${id}/calls`).then((r) => r.data),
  addCall: (id: string, data: { outcome?: string; notes?: string; follow_up_date?: string; duration_seconds?: number }) =>
    api.post<LeadCall>(`/leads/${id}/calls`, data).then((r) => r.data),
  convert: (id: string, data?: Record<string, any>) =>
    api.post(`/leads/${id}/convert`, data || {}).then((r) => r.data),
  createFollowUp: (id: string, data: { follow_up_date: string; follow_up_time?: string; priority?: string; reason?: string; notes?: string }) =>
    api.post(`/leads/${id}/follow-ups`, data).then((r) => r.data),
  getFollowUps: (id: string) => api.get(`/leads/${id}/follow-ups`).then((r) => r.data),
  bookAppointment: (id: string, data: { appointment_date: string; appointment_time?: string; doctor_id?: string; notes?: string }) =>
    api.post(`/leads/${id}/appointments`, data).then((r) => r.data),
  analytics: () => api.get("/leads/analytics/summary").then((r) => r.data),
};

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
    update: (id: string, data: { name?: string; subject?: string; body?: string; is_active?: boolean }) =>
      api.put(`/crm/templates/${id}`, data).then((r) => r.data),
    delete: (id: string) => api.delete(`/crm/templates/${id}`).then((r) => r.data),
  },
  followUps: {
    list: (params?: { patient_id?: string; status?: string }) =>
      api.get("/crm/follow-ups", { params }).then((r) => r.data),
    create: (data: { patient_id: string; follow_up_date: string; notes?: string; doctor_id?: string; case_id?: string }) =>
      api.post("/crm/follow-ups", data).then((r) => r.data),
    update: (id: string, data: {
      status?: string; notes?: string; patient_feedback?: string;
      staff_notes?: string; response_summary?: string; response_status?: string;
      next_action?: string; contact_channel?: string;
      follow_up_date?: string; follow_up_time?: string;
      appointment_id?: string;
    }) => api.put(`/crm/follow-ups/${id}`, data).then((r) => r.data),
    delete: (id: string) => api.delete(`/crm/follow-ups/${id}`).then((r) => r.data),
    feedback: (id: string, data: {
      response_status: string; patient_feedback?: string; staff_notes?: string;
      response_summary?: string; next_action?: string; contact_channel?: string;
    }) => api.post(`/crm/follow-ups/${id}/feedback`, data).then((r) => r.data),
    createAppointment: (id: string, data: {
      doctor_id: string; appointment_date: string; appointment_time: string;
      appointment_type?: string;
    }) => api.post(`/crm/follow-ups/${id}/create-appointment`, data).then((r) => r.data),
    reschedule: (id: string, data: { follow_up_date: string; follow_up_time?: string }) =>
      api.post(`/crm/follow-ups/${id}/reschedule`, data).then((r) => r.data),
    markCompleted: (id: string) =>
      api.post(`/crm/follow-ups/${id}/mark-completed`).then((r) => r.data),
  },
  followUpsFiltered: (params?: {
    filter?: string; follow_up_type?: string; status?: string; patient_id?: string;
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
  campaignSendWhatsApp: (data: { campaign_id: string; template_id?: string; custom_message?: string }) =>
    api.post("/crm/campaigns/send-whatsapp", data).then((r) => r.data),
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
    submit: (data: { patient_id: string; rating: number; review?: string; doctor_id?: string; case_id?: string }) =>
      api.post("/crm/feedback", data).then((r) => r.data),
  },
  segments: () => api.get("/crm/segments").then((r) => r.data),
  analytics: () => api.get("/crm/analytics").then((r) => r.data),
  preview: (data: {
    message: string; filter_type: string;
    patient_ids?: string[]; appointment_date?: string;
    doctor_id?: string; status?: string;
  }) => api.post("/crm/whatsapp/preview", data).then((r) => r.data),
  sendWhatsApp: (data: { patient_id?: string; lead_id?: string; message: string; message_type?: string }) =>
    api.post("/crm/whatsapp/send", data).then((r) => r.data),
  followUpResponses: {
    record: (followUpId: string, data: { patient_id: string; response_message?: string; response_status: string }) =>
      api.post(`/crm/follow-ups/${followUpId}/response`, data).then((r) => r.data),
    listByPatient: (patientId: string) =>
      api.get(`/crm/follow-up-responses/${patientId}`).then((r) => r.data),
  },
  broadcastWhatsApp: (data: {
    message: string; message_type?: string; filter_type: string;
    patient_ids?: string[]; lead_ids?: string[]; appointment_date?: string;
    doctor_id?: string; status?: string;
  }) => api.post("/crm/whatsapp/broadcast", data).then((r) => r.data),
  createFollowUpFromEnquiry: (data: {
    patient_id: string; response_id: string; follow_up_reason: string;
    priority?: string; doctor_id: string; follow_up_date: string;
    follow_up_time?: string; notes?: string;
  }) => api.post("/crm/enquiry/create-follow-up", data).then((r) => r.data),
  getEnquiryDashboard: () => api.get("/crm/enquiry/dashboard").then((r) => r.data),
  sourceAnalytics: () => api.get("/crm/source-analytics").then((r) => r.data),
  getTodaysEnquiries: (tab?: string, calendarDate?: string) => api.get("/crm/enquiry/today", { params: { tab, calendar_date: calendarDate } }).then((r) => r.data),
  dashboard2: (params?: { period?: string; start_date?: string; end_date?: string; doctor?: string; source?: string; campaign?: string; staff?: string; lead_status?: string; follow_up_status?: string; priority?: string; enquiry_type?: string; treatment?: string }) =>
    api.get("/crm/dashboard2", { params }).then((r) => r.data),
  quickView: {
    leads: (params?: { period?: string; start_date?: string; end_date?: string }) =>
      api.get("/crm/quick-view/leads", { params }).then((r) => r.data),
    convertedLeads: (params?: { period?: string; start_date?: string; end_date?: string }) =>
      api.get("/crm/quick-view/converted-leads", { params }).then((r) => r.data),
    followUps: (params?: { period?: string; start_date?: string; end_date?: string }) =>
      api.get("/crm/quick-view/follow-ups", { params }).then((r) => r.data),
    campaigns: () => api.get("/crm/quick-view/campaigns").then((r) => r.data),
    patientAcquisition: (params?: { period?: string; start_date?: string; end_date?: string }) =>
      api.get("/crm/quick-view/patient-acquisition", { params }).then((r) => r.data),
    leadSources: (params?: { period?: string; start_date?: string; end_date?: string }) =>
      api.get("/crm/quick-view/lead-sources", { params }).then((r) => r.data),
  },
  revenueByDoctor: () => api.get("/crm/analytics/revenue-by-doctor").then((r) => r.data),
  enhancedDashboard: (params?: {
    period?: string; start_date?: string; end_date?: string;
    doctor?: string; type?: string; status?: string; source?: string;
  }) => api.get("/crm/enhanced-dashboard", { params }).then((r) => r.data),
};

export const enquiriesApi = {
  list: (params?: { status?: string; patient_id?: string }) =>
    api.get("/crm/enquiries", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/crm/enquiries/${id}`).then((r) => r.data),
  create: (data: { patient_id: string; treatment_interest?: string; notes?: string; assigned_staff_id?: string; next_follow_up_date?: string }) =>
    api.post("/crm/enquiries", data).then((r) => r.data),
  update: (id: string, data: { treatment_interest?: string; status?: string; notes?: string; assigned_staff_id?: string; next_follow_up_date?: string }) =>
    api.put(`/crm/enquiries/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/crm/enquiries/${id}`).then((r) => r.data),
  createFollowUp: (id: string, data: { action: string; notes?: string; next_follow_up_date?: string }) =>
    api.post(`/crm/enquiries/${id}/follow-ups`, data).then((r) => r.data),
  listFollowUps: (id: string) => api.get(`/crm/enquiries/${id}/follow-ups`).then((r) => r.data),
  calendar: (params: { start_date: string; end_date: string; status?: string; type?: string }) =>
    api.get("/crm/enquiries/calendar", { params }).then((r) => r.data),
};

export const treatmentFollowUpsApi = {
  list: (params?: { type?: string; status?: string; doctor_id?: string }) =>
    api.get("/crm/treatment-follow-ups", { params }).then((r) => r.data),
  autoCreate: (treatmentId: string) =>
    api.post(`/crm/treatment-follow-ups/auto-create/${treatmentId}`).then((r) => r.data),
  complete: (id: string, data: { outcome: string; notes?: string }) =>
    api.put(`/crm/treatment-follow-ups/${id}/complete`, data).then((r) => r.data),
  doctorFollowUps: () => api.get("/crm/treatment-follow-ups/doctor").then((r) => r.data),
  doctorRecallPatients: () => api.get("/crm/treatment-follow-ups/doctor/recall-patients").then((r) => r.data),
  stats: () => api.get("/crm/treatment-follow-ups/stats").then((r) => r.data),
};

export const recallsApi = {
  list: (params?: { type?: string; status?: string; overdue_only?: boolean }) =>
    api.get("/crm/recalls", { params }).then((r) => r.data),
  complete: (id: string, data: { outcome: string; notes?: string; next_recall_date?: string }) =>
    api.put(`/crm/recalls/${id}/complete`, data).then((r) => r.data),
  stats: () => api.get("/crm/recalls/stats").then((r) => r.data),
  calendar: (params: { start_date: string; end_date: string }) =>
    api.get("/crm/recalls/calendar", { params }).then((r) => r.data),
  generate: () => api.post("/crm/recalls/generate").then((r) => r.data),
};

export const treatmentTypesApi = {
  list: (hospitalId?: string) => api.get("/treatment-types", { params: hospitalId ? { hospital_id: hospitalId } : {} }).then((r) => r.data),
  get: (id: string) => api.get(`/treatment-types/${id}`).then((r) => r.data),
  create: (data: { name: string; description?: string; hospital_id?: string }) =>
    api.post("/treatment-types", data).then((r) => r.data),
  update: (id: string, data: { name?: string; description?: string; is_active?: boolean }) =>
    api.put(`/treatment-types/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/treatment-types/${id}`).then((r) => r.data),
  seed: (hospitalId?: string) => api.post("/treatment-types/seed", {}, { params: hospitalId ? { hospital_id: hospitalId } : {} }).then((r) => r.data),
};

export const crmSettingsApi = {
  rules: {
    list: () => api.get("/crm/settings/rules").then((r) => r.data),
    create: (data: { treatment_type_id: string; treatment_name?: string; follow_up_1_day?: boolean; follow_up_7_day?: boolean; recall_6_month?: boolean; recall_12_month?: boolean; custom_recall_days?: number }) =>
      api.post("/crm/settings/rules", data).then((r) => r.data),
    update: (id: string, data: { treatment_type_id?: string; treatment_name?: string; follow_up_1_day?: boolean; follow_up_7_day?: boolean; recall_6_month?: boolean; recall_12_month?: boolean; custom_recall_days?: number; is_active?: boolean }) =>
      api.put(`/crm/settings/rules/${id}`, data).then((r) => r.data),
    delete: (id: string) => api.delete(`/crm/settings/rules/${id}`).then((r) => r.data),
  },
  summary: () => api.get("/crm/settings/summary").then((r) => r.data),
};

export const consentFormsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get("/consent-forms", { params }).then((r) => r.data),
  get: (id: string) =>
    api.get(`/consent-forms/${id}`).then((r) => r.data),
  create: (data: FormData) =>
    api.post("/consent-forms", data, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/consent-forms/${id}`, data).then((r) => r.data),
  replacePdf: (id: string, data: FormData) =>
    api.post(`/consent-forms/${id}/replace-pdf`, data, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data),
  delete: (id: string) =>
    api.delete(`/consent-forms/${id}`).then((r) => r.data),
  restore: (id: string) =>
    api.post(`/consent-forms/${id}/restore`).then((r) => r.data),
  getPdf: (id: string) =>
    api.get(`/consent-forms/${id}/pdf`, { responseType: "blob" }).then((r) => r.data),
  getPdfUrl: (id: string) => `/api/v1/consent-forms/${id}/pdf`,
  downloadPdf: (id: string) =>
    api.get(`/consent-forms/${id}/download`, { responseType: "blob" }).then((r) => r.data),
  getByPatient: (patientId: string) =>
    api.get(`/consent-forms/patient/${patientId}`).then((r) => r.data),
  getByCase: (caseId: string) =>
    api.get(`/consent-forms/by-case/${caseId}`).then((r) => r.data),
  getByTreatment: (treatmentPlanId: string) =>
    api.get(`/consent-forms/by-treatment/${treatmentPlanId}`).then((r) => r.data),
  getStats: (hospitalId: string) =>
    api.get(`/consent-forms/stats/hospital/${hospitalId}`).then((r) => r.data),
};

export const exportsApi = {
  listModules: () => api.get("/exports/modules").then((r) => r.data),
  exportData: (module: string, format: string, params?: Record<string, string>) =>
    api.get(`/exports/${module}`, { params: { format, ...params }, responseType: "blob" }).then((r) => r.data),
  exportBackground: (module: string, format: string, params?: Record<string, string>) =>
    api.get(`/exports/${module}`, { params: { format, background: "true", ...params } }).then((r) => r.data),
  getJob: (jobId: string) => api.get(`/exports/jobs/${jobId}`).then((r) => r.data),
  downloadJob: (jobId: string) =>
    api.post(`/exports/jobs/${jobId}/download`, {}, { responseType: "blob" }).then((r) => r.data),
  exportDashboardPdf: (params?: Record<string, string>) =>
    api.get("/exports/dashboard/pdf", { params, responseType: "blob" }).then((r) => r.data),
  exportFinancialPdf: (params?: Record<string, string>) =>
    api.get("/exports/financial/pdf", { params, responseType: "blob" }).then((r) => r.data),
  exportMonthlyPdf: (params?: Record<string, string>) =>
    api.get("/exports/monthly/pdf", { params, responseType: "blob" }).then((r) => r.data),
};


