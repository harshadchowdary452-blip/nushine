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
  hospital_count: number;
  hospital_names: string[];
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
  patient_source: string | null;
  source_campaign_name: string | null;
  source_campaign_id: string | null;
  source_campaign_date: string | null;
  address: string | null;
  medical_history: string | null;
  diagnosis: string | null;
  photo_url: string | null;
  status: PatientStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CaseStatus = "NEW" | "DIAGNOSIS_PENDING" | "TREATMENT_PLANNED" | "IN_PROGRESS" | "FOLLOW_UP" | "COMPLETED" | "CANCELLED";

export type PatientStatus = "NEW" | "ACTIVE" | "UNDER_TREATMENT" | "FOLLOW_UP" | "COMPLETED" | "INACTIVE";

export interface Case {
  id: string;
  patient_id: string;
  doctor_id: string | null;
  consultant_id: string | null;
  appointment_id?: string | null;
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

export type TreatmentPlanStatus = "PLANNED" | "SCHEDULED" | "IN_PROGRESS" | "FOLLOW_UP" | "COMPLETED" | "CANCELLED";

export interface TreatmentPlan {
  id: string;
  treatment_number: string | null;
  case_id: string;
  treatment_name: string;
  description: string | null;
  cost: number;
  paid_amount: number;
  pending_amount: number;
  duration_minutes: number | null;
  start_date: string | null;
  expected_completion_date: string | null;
  next_appointment_date: string | null;
  status: TreatmentPlanStatus;
  notes: string | null;
  is_active: boolean;
  total_sittings: number;
  completed_sittings: number;
  remaining_sittings: number;
  progress: number;
  patient_name?: string;
  patient_id?: string;
  doctor_name?: string;
  case_number?: string;
  case_status?: string;
  hospital_name?: string;
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
  original_amount: number;
  total_amount: number;
  paid_amount: number;
  pending_amount: number;
  discount_type: string;
  discount_percent: number;
  discount_amount: number;
  discount_reason?: string;
  payment_status: PaymentStatus;
  payment_method: string | null;
  paid_at?: string | null;
  notes: string | null;
  invoice_number?: string;
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

export interface HospitalMonthlyExpense {
  id: string;
  hospital_id: string;
  expense_month: number;
  expense_year: number;
  expense_category: string;
  expense_name: string;
  description: string | null;
  amount: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCreate {
  hospital_id?: string;
  expense_month: number;
  expense_year: number;
  expense_category: string;
  expense_name: string;
  description?: string;
  amount: number;
}

export interface ExpenseUpdate {
  expense_month?: number;
  expense_year?: number;
  expense_category?: string;
  expense_name?: string;
  description?: string;
  amount?: number;
}

export interface TrendPoint {
  month: string;
  revenue?: number;
  count?: number;
  patients?: number;
}

export interface RevenueExpenseTrendPoint {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
  profit_margin: number;
}

export interface ExpenseTrendPoint {
  month: string;
  expenses: number;
}

export interface ProfitTrendPoint {
  month: string;
  profit: number;
  profit_margin?: number;
}

export interface ExpenseBreakdownItem {
  category: string;
  amount: number;
}

export interface Performer {
  id?: string;
  name: string;
  value: number;
}

export interface DashboardStats {
  total_groups?: number;
  total_hospitals?: number;
  total_doctors?: number;
  total_patients?: number;
  total_active_cases?: number;
  total_appointments?: number;
  total_revenue?: number;
  monthly_revenue?: number;
  yearly_revenue?: number;
  period_revenue?: number;
  total_expenses?: number;
  net_profit?: number;
  profit_margin?: number;
  revenue_this_month?: number;
  revenue_this_quarter?: number;
  revenue_this_year?: number;
  revenue_growth?: number;
  patient_growth?: number;
  hospital_growth?: number;
  doctor_growth?: number;
  my_patients?: number;
  active_cases?: number;
  total_cases?: number;
  cases_completed?: number;
  today_appointments?: number;
  personal_revenue?: number;
  treatment_success_rate?: number;
  follow_up_rate?: number;
  pending_follow_ups?: number;
  revenue_trend?: TrendPoint[];
  patient_growth_trend?: TrendPoint[];
  monthly_growth_trend?: TrendPoint[];
  case_completion_trend?: TrendPoint[];
  revenue_expense_trend?: RevenueExpenseTrendPoint[];
  expense_trend?: ExpenseTrendPoint[];
  profit_trend?: ProfitTrendPoint[];
  expense_breakdown?: ExpenseBreakdownItem[];
  admin_group_performance?: Performer[];
  hospital_performance?: Performer[];
  doctor_performance?: Performer[];
  treatment_performance?: Performer[];
  treatment_trend?: Performer[];
  top_groups?: Performer[];
  top_hospitals?: Performer[];
  top_doctors?: Performer[];
  top_treatments?: Performer[];
}

export interface QuickViewAdminGroup {
  id: string;
  name: string;
  total_hospitals: number;
  total_doctors: number;
  total_patients: number;
  total_revenue: number;
  total_active_cases: number;
  total_expenses?: number;
  net_profit?: number;
  profit_margin?: number;
  top_doctors: Performer[];
}

export interface QuickViewHospital {
  id: string;
  name: string;
  total_doctors: number;
  total_patients: number;
  total_revenue: number;
  total_active_cases: number;
  total_billings: number;
  total_pending: number;
  today_appointments: number;
  total_expenses?: number;
  net_profit?: number;
  profit_margin?: number;
  expense_breakdown?: ExpenseBreakdownItem[];
}

export interface QuickViewDoctor {
  id: string;
  name: string;
  total_patients: number;
  today_appointments: number;
  total_cases: number;
  active_cases: number;
  completed_cases: number;
  total_revenue: number;
  period_revenue?: number;
  active_patients: number;
  completed_patients: number;
  contribution_to_profit?: number;
}

export interface QuickViewPatientCase {
  id: string;
  chief_complaint: string;
  status: string;
  diagnosis: string | null;
  created_at: string;
}

export interface QuickViewPatientTreatment {
  id: string;
  treatment_name: string;
  cost: number;
  status: string;
}

export interface QuickViewPatientAppointment {
  id: string;
  date: string;
  time: string;
  status: string;
  appointment_type: string | null;
}

export interface QuickViewPatientBilling {
  id: string;
  total_amount: number;
  paid_amount: number;
  pending_amount: number;
  payment_status: string;
  created_at: string;
}

export interface QuickViewPatientTimeline {
  date: string;
  event: string;
  type: string;
}

export interface QuickViewPatientFollowUp {
  id: string;
  date: string;
  time: string | null;
  doctor_id: string | null;
  appointment_id: string | null;
  status: string | null;
  notes?: string | null;
}

export interface QuickViewPatient {
  id: string;
  name: string;
  total_cases: number;
  total_treatments: number;
  total_appointments: number;
  total_follow_ups: number;
  next_follow_up: QuickViewPatientFollowUp | null;
  follow_up_history: QuickViewPatientFollowUp[];
  total_billed: number;
  total_paid: number;
  total_pending: number;
  cases: QuickViewPatientCase[];
  treatments: QuickViewPatientTreatment[];
  appointments: QuickViewPatientAppointment[];
  billings: QuickViewPatientBilling[];
  timeline: QuickViewPatientTimeline[];
}
