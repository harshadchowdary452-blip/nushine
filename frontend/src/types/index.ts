export type Role = "SUPER_ADMIN" | "GROUP_ADMIN" | "HOSPITAL_ADMIN" | "DOCTOR";

export interface User {
  id: string;
  hospital_id: string | null;
  hospital_name?: string | null;
  admin_group_id: string | null;
  admin_group_name?: string | null;
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
  height: number | null;
  weight: number | null;
  bp: string | null;
  sugar: string | null;
  spo2: string | null;
  medical_history: string | null;
  abha_id: string | null;
  op_no: string | null;
  emergency_contact: string | null;
  photo_url: string | null;
  status: PatientStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CaseStatus = "NEW" | "DIAGNOSIS_PENDING" | "TREATMENT_PLANNED" | "IN_PROGRESS" | "FOLLOW_UP" | "COMPLETED" | "CANCELLED";

export type PatientStatus = "NEW" | "ACTIVE" | "INACTIVE" | "UNDER_TREATMENT" | "TREATMENT_ONGOING" | "FOLLOW_UP" | "COMPLETED" | "OPD" | "LOST" | "ARCHIVED";

export interface ClinicalFinding {
  id?: string | number;
  case_id?: string;
  finding_type: string;
  tooth_number: string | null;
  surface?: string;
  notes: string | null;
  created_at?: string;
}

export interface Case {
  id: string;
  case_number?: string | null;
  patient_id: string;
  doctor_id: string | null;
  consultant_id: string | null;
  appointment_id?: string | null;
  patient_name?: string;
  doctor_name?: string;
  created_by?: { id: string; full_name?: string; role?: string } | null;
  updated_by?: { id: string; full_name?: string; role?: string } | null;
  chief_complaint: string;
  chief_complaint_duration?: string | null;
  chief_complaint_severity?: string | null;
  chief_complaint_associated_symptoms?: string | null;
  hpi?: string | null;
  personal_history?: string | null;
  family_history?: string | null;
  medical_history?: string | null;
  dental_history?: string | null;
  extra_oral_examination?: string | null;
  intra_oral_examination?: string | null;
  clinical_findings_summary?: string | null;
  periodontal_examination?: string | null;
  investigations?: string | null;
  provisional_diagnosis?: string | null;
  final_diagnosis?: string | null;
  diagnosis: string | null;
  initial_treatment_plan?: string | null;
  treatment_plan_estimated_cost?: number | null;
  treatment_plan_estimated_visits?: number | null;
  patient_instructions?: string | null;
  medicines_prescribed?: string | null;
  follow_up_instructions?: string | null;
  next_review_date?: string | null;
  doctor_registration_number?: string | null;
  doctor_specialization?: string | null;
  status: CaseStatus;
  notes: string | null;
  findings?: ClinicalFinding[] | null;
  appointment_date?: string | null;
  appointment_time?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  patient?: Patient;
  doctor?: User;
  consultant?: Consultant;
}

export interface CaseTimeline {
  id: string;
  case_id: string;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  performed_by: string | null;
  performer_name: string | null;
  performer_role: string | null;
  created_at: string;
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
  next_appointment_time: string | null;
  created_at: string;
  updated_at: string;
}

export type AppointmentStatus = "SCHEDULED" | "CONFIRMED" | "CHECKED_IN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW" | "RESCHEDULED";

export interface Appointment {
  id: string;
  patient_id: string;
  doctor_id: string;
  patient_name?: string;
  doctor_name?: string;
  appointment_date: string;
  appointment_time: string;
  duration_minutes: number;
  end_time: string;
  appointment_type: string;
  status: AppointmentStatus;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  patient?: Patient;
  doctor?: User;
}

export interface TimeSlot {
  time: string;
  available: boolean;
  status: "available" | "booked" | "leave" | "blocked" | "past" | "selected";
  patient_name?: string;
  appointment_type?: string;
  duration_minutes?: number;
  appointment_id?: string;
}

export interface DoctorSlotResponse {
  doctor_id: string;
  doctor_name: string;
  date: string;
  slots: TimeSlot[];
  is_on_leave: boolean;
  leave_reason?: string;
  working_hours?: string;
}

export interface DoctorWorkingHour {
  id: string;
  doctor_id: string;
  hospital_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  lunch_start?: string | null;
  lunch_end?: string | null;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface DoctorAvailability {
  id: string;
  doctor_id: string;
  hospital_id: string;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  lunch_start?: string | null;
  lunch_end?: string | null;
  is_available: boolean;
  reason?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DoctorLeave {
  id: string;
  doctor_id: string;
  hospital_id: string;
  start_date: string;
  end_date: string;
  reason?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DoctorBlockedSlot {
  id: string;
  doctor_id: string;
  hospital_id: string;
  date: string;
  start_time: string;
  end_time: string;
  reason?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
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
  expense_date: string;
  expense_month: number;
  expense_year: number;
  expense_category: string;
  expense_name: string;
  description: string | null;
  amount: number;
  payment_method: string | null;
  vendor: string | null;
  invoice_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCreate {
  hospital_id?: string;
  expense_date: string;
  expense_category: string;
  expense_name: string;
  description?: string;
  amount: number;
  payment_method?: string;
  vendor?: string;
  invoice_number?: string;
  notes?: string;
}

export interface ExpenseUpdate {
  expense_date?: string;
  expense_category?: string;
  expense_name?: string;
  description?: string;
  amount?: number;
  payment_method?: string;
  vendor?: string;
  invoice_number?: string;
  notes?: string;
}

export interface ExpenseAnalytics {
  today_total: number;
  this_week_total: number;
  this_month_total: number;
  year_to_date_total: number;
  category_breakdown: { category: string; amount: number }[];
  total_expenses: number;
}

export interface CalendarDay {
  date: string;
  count: number;
  total: number;
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

export interface PatientTimelineEntry {
  id: string;
  patient_id: string;
  action: string;
  description: string | null;
  module: string | null;
  performed_by: string | null;
  user_name: string | null;
  user_role: string | null;
  hospital_id: string | null;
  hospital_name: string | null;
  changes: Array<{ field: string; old_value: string | null; new_value: string | null }> | [];
  created_at: string;
}

export interface PatientTimelineResponse {
  entries: PatientTimelineEntry[];
  total: number;
  skip: number;
  limit: number;
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

export interface QuickViewPatientPreOp {
  id: string;
  case_id: string;
  notes: string | null;
  photo_urls: string | null;
  xray_urls: string | null;
  created_at: string;
}

export interface QuickViewPatientPostOp {
  id: string;
  case_id: string;
  notes: string | null;
  report: string | null;
  photo_urls: string | null;
  created_at: string;
}

export type LeadSource =
  | "GOOGLE_SEARCH" | "GOOGLE_MAPS" | "INSTAGRAM" | "FACEBOOK"
  | "WHATSAPP" | "WEBSITE" | "WALK_IN" | "REFERRAL"
  | "DOCTOR_REFERRAL" | "CLINIC_REFERRAL" | "CAMPAIGN"
  | "ADVERTISEMENT" | "BANNER" | "NEWSPAPER" | "YOUTUBE"
  | "EVENT" | "OTHER";

export type LeadStatus =
  | "NEW" | "CONTACTED" | "INTERESTED" | "FOLLOW_UP_REQUIRED"
  | "APPOINTMENT_BOOKED" | "VISITED" | "CONVERTED"
  | "LOST" | "NOT_INTERESTED" | "NO_RESPONSE";

export type LeadCallOutcome =
  | "INTERESTED" | "NOT_INTERESTED" | "NO_ANSWER" | "BUSY"
  | "CALL_BACK_LATER" | "APPOINTMENT_REQUESTED" | "CONVERTED";

export interface Lead {
  id: string;
  hospital_id: string;
  assigned_staff_id: string | null;
  assigned_doctor_id: string | null;
  converted_patient_id: string | null;
  lead_name: string;
  mobile: string;
  alternate_mobile: string | null;
  email: string | null;
  age: number | null;
  gender: string | null;
  city: string | null;
  source: LeadSource;
  interested_treatment: string | null;
  budget: number | null;
  preferred_visit_date: string | null;
  notes: string | null;
  status: LeadStatus;
  lead_score: number | null;
  last_contacted_at: string | null;
  next_follow_up_date: string | null;
  priority: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadCall {
  id: string;
  lead_id: string;
  called_by: string | null;
  outcome: string | null;
  notes: string | null;
  follow_up_date: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface LeadCommunication {
  id: string;
  lead_id: string;
  channel: string;
  message: string;
  status: string;
  sent_at: string | null;
  created_at: string;
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
  pre_ops: QuickViewPatientPreOp[];
  post_ops: QuickViewPatientPostOp[];
  treatment_progress: { total: number; completed: number };
}

export interface ConsentForm {
  id: string;
  patient_id: string | null;
  patient_name: string;
  op_number: string | null;
  phone: string | null;
  doctor_id: string | null;
  doctor_name: string | null;
  consent_type: string;
  remarks: string | null;
  pdf_path: string | null;
  hospital_id: string;
  uploaded_by: string | null;
  uploader_name: string | null;
  case_id: string | null;
  treatment_plan_id: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}
