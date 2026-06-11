export type Role = "SUPER_ADMIN" | "GROUP_ADMIN" | "HOSPITAL_ADMIN" | "DOCTOR";

export interface User {
  id: string;
  hospital_id: string | null;
  admin_group_id: string | null;
  email: string;
  full_name: string;
  phone: string | null;
  role: Role;
  is_active: boolean;
  specialization: string | null;
  license_number: string | null;
  is_verified: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface LoginResponse extends AuthTokens {
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PaginationParams {
  page?: number;
  page_size?: number;
  search?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  [key: string]: any;
}

export interface AdminGroup {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Hospital {
  id: string;
  admin_group_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  registration_number: string | null;
  is_active: boolean;
  settings: string | null;
  created_at: string;
  updated_at: string;
}

export type PatientGender = "MALE" | "FEMALE" | "OTHER";

export interface Patient {
  id: string;
  hospital_id: string;
  doctor_id: string | null;
  full_name: string;
  gender: PatientGender | null;
  date_of_birth: string | null;
  age: number | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  medical_history: string | null;
  photo_url: string | null;
  status: PatientStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CaseStatus = "NEW" | "DIAGNOSIS_PENDING" | "TREATMENT_PLANNED" | "IN_PROGRESS" | "FOLLOW_UP" | "COMPLETED" | "CANCELLED";

export type PatientStatus = "ACTIVE" | "INACTIVE" | "TREATMENT_COMPLETED" | "FOLLOW_UP" | "DISCONTINUED";

export interface Case {
  id: string;
  patient_id: string;
  doctor_id: string | null;
  consultant_id: string | null;
  patient_name?: string;
  doctor_name?: string;
  chief_complaint: string;
  diagnosis: string | null;
  status: CaseStatus;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  patient?: Patient;
  doctor?: User;
  consultant?: Consultant;
}

export interface Consultant {
  id: string;
  hospital_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  specialization: string | null;
  license_number: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConsultantNote {
  id: string;
  case_id: string;
  consultant_id: string;
  notes: string;
  created_at: string;
  updated_at: string;
  consultant?: Consultant;
}

export type TreatmentPlanStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface TreatmentPlan {
  id: string;
  case_id: string;
  treatment_name: string;
  description: string | null;
  cost: number;
  duration_minutes: number | null;
  status: TreatmentPlanStatus;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sittings?: TreatmentSitting[];
}

export type TreatmentSittingStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface TreatmentSitting {
  id: string;
  treatment_plan_id: string;
  sitting_number: number;
  work_done: string | null;
  status: TreatmentSittingStatus;
  doctor_notes: string | null;
  next_appointment_date: string | null;
  created_at: string;
  updated_at: string;
}

export type AppointmentStatus = "SCHEDULED" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

export interface Appointment {
  id: string;
  patient_id: string;
  doctor_id: string;
  patient_name?: string;
  doctor_name?: string;
  appointment_date: string;
  appointment_time: string;
  status: AppointmentStatus;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  patient?: Patient;
  doctor?: User;
}

export type PaymentStatus = "PENDING" | "PARTIAL" | "PAID" | "OVERDUE";

export interface Billing {
  id: string;
  case_id: string;
  patient_name?: string;
  case_chief_complaint?: string;
  total_amount: number;
  paid_amount: number;
  pending_amount: number;
  payment_status: PaymentStatus;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  case?: Case;
}

export interface PreOp {
  id: string;
  case_id: string;
  notes: string | null;
  photo_urls: string | null;
  xray_urls: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostOp {
  id: string;
  case_id: string;
  notes: string | null;
  report: string | null;
  photo_urls: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface DashboardStats {
  total_groups?: number;
  total_hospitals?: number;
  total_doctors?: number;
  total_patients?: number;
  total_revenue?: number;
  revenue_this_month?: number;
  revenue_this_quarter?: number;
  revenue_this_year?: number;
  revenue_growth?: number;
  patient_growth?: number;
  hospital_growth?: number;
  doctor_growth?: number;
  my_patients?: number;
  active_cases?: number;
  cases_completed?: number;
  today_appointments?: number;
  personal_revenue?: number;
  treatment_success_rate?: number;
  follow_up_rate?: number;
  pending_follow_ups?: number;
  top_groups?: { name: string; value: number }[];
  top_hospitals?: { name: string; value: number }[];
  top_doctors?: { name: string; value: number }[];
  top_treatments?: { name: string; value: number }[];
}
