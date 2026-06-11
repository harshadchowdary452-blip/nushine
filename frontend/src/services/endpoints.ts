import api from "./api";
import type { LoginRequest, LoginResponse, PaginationParams, User } from "@/types";

function withPagination(params?: PaginationParams) {
  if (!params) return undefined;
  const { page, page_size, ...rest } = params;
  const result: Record<string, unknown> = { ...rest };
  if (page_size != null) result.limit = page_size;
  if (page != null) result.skip = (page - 1) * (page_size ?? 10);
  return result;
}

export const authApi = {
  login: (data: LoginRequest) => api.post<LoginResponse>("/auth/login", data).then((r) => r.data),
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
  delete: (id: string) => api.delete(`/admin-groups/${id}`),
  createAdmin: (groupId: string, data: any) => api.post(`/admin-groups/${groupId}/admins`, data).then((r) => r.data),
};

export const hospitalsApi = {
  list: (params?: PaginationParams) => api.get("/hospitals", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/hospitals/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/hospitals", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/hospitals/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/hospitals/${id}`),
  createAdmin: (hospitalId: string, data: any) => api.post(`/hospitals/${hospitalId}/admins`, data).then((r) => r.data),
};

export const usersApi = {
  list: (params?: PaginationParams) => api.get("/users", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/users/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/users", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/users/${id}`),
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
  delete: (id: string) => api.delete(`/patients/${id}`),
  search: (params?: PaginationParams) => api.get("/patients/search", { params: withPagination(params) }).then((r) => r.data),
};

export const casesApi = {
  list: (params?: PaginationParams) => api.get("/cases", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/cases/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/cases", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/cases/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/cases/${id}`),
};

export const appointmentsApi = {
  list: (params?: PaginationParams) => api.get("/appointments", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/appointments/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/appointments", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/appointments/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/appointments/${id}`),
};

export const consultantsApi = {
  list: (params?: PaginationParams) => api.get("/consultants", { params: withPagination(params) }).then((r) => r.data),
  get: (id: string) => api.get(`/consultants/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/consultants", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/consultants/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/consultants/${id}`),
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
  delete: (id: string) => api.delete(`/treatment-plans/${id}`),
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
  updatePayment: (id: string, data: any) => api.put(`/billings/${id}/payment`, data).then((r) => r.data),
};

export const dashboardApi = {
  superAdmin: () => api.get("/dashboards/super-admin").then((r) => r.data),
  groupAdmin: () => api.get("/dashboards/group-admin").then((r) => r.data),
  hospitalAdmin: () => api.get("/dashboards/hospital-admin").then((r) => r.data),
  doctor: () => api.get("/dashboards/doctor").then((r) => r.data),
};

export const notificationsApi = {
  list: () => api.get("/notifications").then((r) => r.data),
};

export const whatsappApi = {
  send: (data: { phone: string; message: string; patient_id?: string }) =>
    api.post("/whatsapp/send", data).then((r) => r.data),
  broadcast: (data: { patient_ids: string[]; message: string }) =>
    api.post("/whatsapp/broadcast", data).then((r) => r.data),
};
