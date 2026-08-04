export type Role = "SUPER_ADMIN" | "GROUP_ADMIN" | "HOSPITAL_ADMIN" | "DOCTOR"

export interface User {
  id: string
  hospital_id: string | null
  hospital_name?: string | null
  admin_group_id: string | null
  admin_group_name?: string | null
  email: string
  full_name: string
  phone: string | null
  role: Role
  is_active: boolean
  specialization: string | null
  license_number: string | null
  is_verified: boolean
  last_login: string | null
  created_at: string
  updated_at: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface LoginResponse extends AuthTokens {
  user: User
}

export interface LoginRequest {
  email: string
  password: string
}

export interface ContextSwitchResponse {
  scope: "global" | "group" | "hospital"
  hospital_id: string | null
  hospital_name: string | null
  admin_group_id: string | null
  admin_group_name: string | null
}

export interface RefreshRequest {
  refresh_token: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size?: number
  size?: number
  total_pages?: number
  pages?: number
}

export interface PaginationParams {
  page?: number
  page_size?: number
  search?: string
  sort_by?: string
  sort_order?: "asc" | "desc"
  [key: string]: unknown
}

export interface AdminGroup {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  hospital_count: number
  hospital_names: string[]
}

export interface Hospital {
  id: string
  admin_group_id: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  registration_number: string | null
  is_active: boolean
  settings: string | null
  created_at: string
  updated_at: string
}

export type PatientGender = "MALE" | "FEMALE" | "OTHER"

export type PatientType = "ADULT" | "CHILD"

export interface Patient {
  id: string
  hospital_id: string
  hospital_name?: string | null
  doctor_id: string | null
  full_name: string
  gender: PatientGender | null
  patient_type?: PatientType
  guardian_name?: string | null
  guardian_relationship?: string | null
  guardian_phone?: string | null
  date_of_birth: string | null
  age: number | null
  phone: string | null
  email: string | null
  patient_source: string | null
  patient_name?: string | null
  source_campaign_name: string | null
  source_campaign_id: string | null
  source_campaign_date: string | null
  address: string | null
  height: number | null
  weight: number | null
  bp: string | null
  sugar: string | null
  spo2: string | null
  medical_history: string | null
  abha_id: string | null
  op_no: string | null
  emergency_contact: string | null
  photo_url: string | null
  allergies?: string | null
  blood_group?: string | null
  status: PatientStatus
  is_active: boolean
  latest_satisfaction_rating?: number | null
  latest_feedback_date?: string | null
  latest_feedback_comments?: string | null
  latest_recovery_status?: string | null
  latest_recommendation_status?: boolean | null
  created_at: string
  updated_at: string
}

export type CaseStatus = "OPEN" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CANCELLED"

export type PatientStatus =
  | "NEW"
  | "ACTIVE"
  | "INACTIVE"
  | "UNDER_TREATMENT"
  | "TREATMENT_ONGOING"
  | "FOLLOW_UP"
  | "COMPLETED"
  | "OPD"
  | "LOST"
  | "ARCHIVED"

export interface ClinicalFinding {
  id?: string | number
  case_id?: string
  finding_type: string
  tooth_number: string | null
  surface?: string
  severity?: string | null
  doctor_id?: string | null
  doctor_name?: string | null
  notes: string | null
  created_at?: string
}

export interface ClinicalProgressNote {
  id: string
  case_id: string
  doctor_id: string
  doctor_name?: string | null
  note_date: string
  clinical_note: string
  attachments_json?: string | null
  digital_signature_url?: string | null
  created_at: string
  updated_at: string
}

export interface Case {
  id: string
  case_number?: string | null
  patient_id: string
  doctor_id: string | null
  consultant_id: string | null
  appointment_id?: string | null
  patient_name?: string
  doctor_name?: string
  created_by?: { id: string; full_name?: string; role?: string } | null
  updated_by?: { id: string; full_name?: string; role?: string } | null
  chief_complaint: string
  chief_complaint_duration?: string | null
  chief_complaint_severity?: string | null
  chief_complaint_associated_symptoms?: string | null
  hpi?: string | null
  personal_history?: string | null
  family_history?: string | null
  medical_history?: string | null
  dental_history?: string | null
  extra_oral_examination?: string | null
  intra_oral_examination?: string | null
  clinical_findings_summary?: string | null
  periodontal_examination?: string | null
  investigations?: string | null
  provisional_diagnosis?: string | null
  final_diagnosis?: string | null
  diagnosis: string | null
  initial_treatment_plan?: string | null
  treatment_plan_estimated_cost?: number | null
  treatment_plan_estimated_visits?: number | null
  patient_instructions?: string | null
  medicines_prescribed?: string | null
  follow_up_instructions?: string | null
  next_review_date?: string | null
  doctor_registration_number?: string | null
  doctor_specialization?: string | null
  status: CaseStatus
  notes: string | null
  findings?: ClinicalFinding[] | null
  appointment_date?: string | null
  appointment_time?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  patient?: Patient
  doctor?: User
  consultant?: Consultant
  treatment_plans?: TreatmentPlan[] | null
  treatment_plan_items?: TreatmentPlanItem[] | null
  clinical_progress_notes?: ClinicalProgressNote[] | null
  treatment_plan_status?: string | null
  treatment_plan_version?: number
  treatment_plan_approved?: boolean
  treatment_plan_approved_by_id?: string | null
  treatment_plan_approved_at?: string | null
  treatment_plan_rejection_reason?: string | null
}

export interface CaseTimeline {
  id: string
  case_id: string
  action: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  performed_by: string | null
  performer_name: string | null
  performer_role: string | null
  created_at: string
}

export interface Consultant {
  id: string
  hospital_id: string
  full_name: string
  email: string | null
  phone: string | null
  specialization: string | null
  license_number: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ConsultantNote {
  id: string
  case_id: string
  consultant_id: string
  notes: string
  created_at: string
  updated_at: string
  consultant?: Consultant
}

export type TreatmentPlanStatus =
  | "GENERATED"
  | "ASSIGNED"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "WAITING_PATIENT"
  | "WAITING_LAB"
  | "ON_HOLD"
  | "COMPLETED"
  | "CANCELLED"
  | "OVERDUE"

export interface TreatmentPlanItem {
  id: string
  case_id: string
  version: number
  is_current: boolean
  procedure_name: string
  tooth_numbers: string[] | null
  estimated_visits: number
  estimated_cost: number
  remarks: string | null
  sequence_order: number
  dependency_item_id: string | null
  reason_for_change?: string | null
  generated_treatment_id: string | null
  assigned_doctor_id: string | null
  assistant_doctor_id: string | null
  created_by_id: string | null
  assigned_doctor_name?: string | null
  assistant_doctor_name?: string | null
  created_by_name?: string | null
  priority?: string
  created_at: string
  updated_at: string
}

export interface TreatmentPlan {
  id: string
  treatment_number: string | null
  case_id: string
  treatment_name: string
  description: string | null
  cost: number
  paid_amount: number
  pending_amount: number
  duration_minutes: number | null
  start_date: string | null
  expected_completion_date: string | null
  next_appointment_date: string | null
  status: TreatmentPlanStatus
  notes: string | null
  is_active: boolean
  total_sittings: number
  completed_sittings: number
  remaining_sittings: number
  progress: number
  patient_name?: string
  patient_id?: string
  patient_op_no?: string | null
  doctor_name?: string
  assigned_doctor_id?: string | null
  assistant_doctor_id?: string | null
  assigned_doctor_name?: string | null
  assistant_doctor_name?: string | null
  tooth_numbers?: string[] | null
  priority?: string | null
  sequence_order?: number
  dependency_treatment_id?: string | null
  treatment_plan_item_id?: string | null
  overdue_reason?: string | null
  overdue_delay_type?: string | null
  started_at?: string | null
  completed_at?: string | null
  auto_created?: boolean
  treatment_type_name?: string | null
  case_number?: string
  case_status?: string
  hospital_name?: string
  patient?: Patient
  created_at: string
  updated_at: string
  sittings?: TreatmentSitting[]
}

export type TreatmentSittingStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"

export interface TreatmentSitting {
  id: string
  treatment_plan_id: string
  sitting_number: number
  sitting_date?: string | null
  doctor_id?: string | null
  work_done: string | null
  status: TreatmentSittingStatus
  doctor_notes: string | null
  procedure_performed?: string | null
  clinical_notes?: string | null
  prescription?: string | null
  next_appointment_date: string | null
  next_appointment_time: string | null
  next_appointment_doctor_id?: string | null
  next_appointment_doctor_name?: string | null
  next_visit_required?: boolean
  materials_used?: string | null
  duration_minutes?: number | null
  attachments_json?: string | null
  images_json?: string | null
  digital_signature_url?: string | null
  lab_tracking_status?: string | null
  lab_tracking_notes?: string | null
  lab_tracking_due_date?: string | null
  lab_name?: string | null
  lab_order_number?: string | null
  lab_sent_date?: string | null
  lab_return_date?: string | null
  lab_cost?: number | null
  completed_by_id?: string | null
  completed_at?: string | null
  doctor_name?: string | null
  completed_by_name?: string | null
  created_at: string
  updated_at: string
}

export type AppointmentStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "RESCHEDULED"

export interface Appointment {
  id: string
  appointment_number?: string
  patient_id: string
  doctor_id: string
  patient_name?: string
  doctor_name?: string
  appointment_date: string
  appointment_time: string
  duration_minutes: number
  end_time: string
  appointment_type: string
  status: AppointmentStatus
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  created_by_name?: string
  updated_by_name?: string
  previous_date?: string
  previous_time?: string
  rescheduled_by_name?: string
  rescheduled_at?: string
  reschedule_reason?: string
  cancelled_by_name?: string
  cancelled_at?: string
  cancellation_reason?: string
  completed_by_name?: string
  completed_at?: string
  patient?: Patient
  doctor?: User
}

export interface TimeSlot {
  time: string
  available: boolean
  status: "available" | "booked" | "leave" | "blocked" | "past" | "selected"
  patient_name?: string
  appointment_type?: string
  duration_minutes?: number
  appointment_id?: string
}

export interface DoctorSlotResponse {
  doctor_id: string
  doctor_name: string
  date: string
  slots: TimeSlot[]
  is_on_leave: boolean
  leave_reason?: string
  working_hours?: string
  duration_minutes?: number
  procedure_name?: string
}

export interface DoctorWorkingHour {
  id: string
  doctor_id: string
  hospital_id: string
  day_of_week: number
  start_time: string
  end_time: string
  lunch_start?: string | null
  lunch_end?: string | null
  is_available: boolean
  created_at: string
  updated_at: string
}

export interface DoctorAvailability {
  id: string
  doctor_id: string
  hospital_id: string
  date: string
  start_time?: string | null
  end_time?: string | null
  lunch_start?: string | null
  lunch_end?: string | null
  is_available: boolean
  reason?: string | null
  created_by?: string | null
  updated_by?: string | null
  created_at: string
  updated_at: string
}

export interface DoctorLeave {
  id: string
  doctor_id: string
  hospital_id: string
  start_date: string
  end_date: string
  reason?: string | null
  status: "PENDING" | "APPROVED" | "REJECTED"
  created_by?: string | null
  updated_by?: string | null
  created_at: string
  updated_at: string
}

export interface DoctorBlockedSlot {
  id: string
  doctor_id: string
  hospital_id: string
  date: string
  start_time: string
  end_time: string
  reason?: string | null
  created_by?: string | null
  updated_by?: string | null
  created_at: string
  updated_at: string
}

export type PaymentStatus = "PENDING" | "PARTIAL" | "PAID" | "OVERDUE" | "DRAFT" | "CANCELLED" | "UNPAID" | "NO_BILLING"

export interface BillingItem {
  id: string
  billing_id: string
  treatment_plan_id?: string | null
  treatment_sitting_id?: string | null
  description?: string | null
  quantity: number
  unit_price: number
  amount: number
  discount_amount: number
  net_amount: number
  paid_amount: number
  pending_amount: number
  treatment_plan_name?: string | null
  treatment_sitting_number?: number | null
  created_at: string
  updated_at: string
}

export interface FinancialSummary {
  total_billed: number
  total_paid: number
  outstanding_balance: number
  payment_status: string
}

export interface BillingSearchCase {
  id: string
  case_number?: string | null
  chief_complaint: string
  doctor_name?: string | null
  status: string
  created_at?: string | null
  estimated_cost?: number | null
  total_billed?: number
  total_paid?: number
  outstanding_balance?: number
  payment_status?: string | null
}

export interface BillingPatientSearchResult {
  id: string
  full_name: string
  op_no?: string | null
  phone?: string | null
  gender?: string | null
  age?: number | null
  status?: string | null
  financial_summary: FinancialSummary
  active_cases: BillingSearchCase[]
}

export interface BillableSitting {
  id: string
  sitting_number: number
  sitting_date?: string | null
  status: string
  charge?: number | null
  paid_amount: number
  invoice_status: string
}

export interface BillableTreatmentPlan {
  id: string
  treatment_name: string
  description?: string | null
  cost: number
  paid_amount: number
  pending_amount: number
  status: string
  total_sittings: number
  completed_sittings: number
  remaining_sittings: number
  sittings: BillableSitting[]
}

export interface CaseBillable {
  case: {
    id: string
    case_number?: string | null
    patient_id: string
    patient_name?: string | null
    chief_complaint: string
    doctor_name?: string | null
    status: string
    created_at?: string | null
    estimated_cost?: number | null
    total_billed?: number
    total_paid?: number
    outstanding_balance?: number
    payment_status?: string | null
  }
  treatment_plans: BillableTreatmentPlan[]
}

export interface Billing {
  id: string
  case_id: string
  patient_name?: string
  case_chief_complaint?: string
  original_amount: number
  total_amount: number
  paid_amount: number
  pending_amount: number
  discount_type: string
  discount_percent: number
  discount_amount: number
  discount_reason?: string
  payment_status: PaymentStatus
  payment_method: string | null
  paid_at?: string | null
  notes: string | null
  invoice_number?: string
  items?: BillingItem[] | null
  created_at: string
  updated_at: string
  case?: Case
}

export interface PreOp {
  id: string
  case_id: string
  notes: string | null
  photo_urls: string | null
  xray_urls: string | null
  created_at: string
  updated_at: string
}

export interface PostOp {
  id: string
  case_id: string
  notes: string | null
  report: string | null
  photo_urls: string | null
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  user_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  details: string | null
  ip_address: string | null
  created_at: string
}

export interface HospitalMonthlyExpense {
  id: string
  hospital_id: string
  expense_date: string
  expense_month: number
  expense_year: number
  expense_category: string
  expense_name: string
  description: string | null
  amount: number
  payment_method: string | null
  vendor: string | null
  invoice_number: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ExpenseCreate {
  hospital_id?: string
  expense_date: string
  expense_category: string
  expense_name: string
  description?: string
  amount: number
  payment_method?: string
  vendor?: string
  invoice_number?: string
  notes?: string
}

export interface ExpenseUpdate {
  expense_date?: string
  expense_category?: string
  expense_name?: string
  description?: string
  amount?: number
  payment_method?: string
  vendor?: string
  invoice_number?: string
  notes?: string
}

export interface ExpenseAnalytics {
  today_total: number
  this_week_total: number
  this_month_total: number
  year_to_date_total: number
  category_breakdown: { category: string; amount: number }[]
  total_expenses: number
}

export interface CalendarDay {
  date: string
  count: number
  total: number
}

export interface TrendPoint {
  month: string
  revenue?: number
  count?: number
  patients?: number
}

export interface RevenueExpenseTrendPoint {
  month: string
  revenue: number
  expenses: number
  profit: number
  profit_margin: number
}

export interface ExpenseTrendPoint {
  month: string
  expenses: number
}

export interface ProfitTrendPoint {
  month: string
  profit: number
  profit_margin?: number
}

export interface ExpenseBreakdownItem {
  category: string
  amount: number
}

export interface Performer {
  id?: string
  name: string
  value: number
}

export interface DashboardStats {
  total_groups?: number
  total_hospitals?: number
  total_doctors?: number
  total_patients?: number
  total_active_cases?: number
  total_appointments?: number
  total_revenue?: number
  monthly_revenue?: number
  yearly_revenue?: number
  period_revenue?: number
  total_expenses?: number
  net_profit?: number
  profit_margin?: number
  revenue_this_month?: number
  revenue_this_quarter?: number
  revenue_this_year?: number
  revenue_growth?: number
  patient_growth?: number
  hospital_growth?: number
  doctor_growth?: number
  my_patients?: number
  active_cases?: number
  total_cases?: number
  cases_completed?: number
  today_appointments?: number
  personal_revenue?: number
  treatment_success_rate?: number
  follow_up_rate?: number
  pending_follow_ups?: number
  revenue_trend?: TrendPoint[]
  patient_growth_trend?: TrendPoint[]
  monthly_growth_trend?: TrendPoint[]
  case_completion_trend?: TrendPoint[]
  revenue_expense_trend?: RevenueExpenseTrendPoint[]
  expense_trend?: ExpenseTrendPoint[]
  profit_trend?: ProfitTrendPoint[]
  expense_breakdown?: ExpenseBreakdownItem[]
  admin_group_performance?: Performer[]
  hospital_performance?: Performer[]
  doctor_performance?: Performer[]
  treatment_performance?: Performer[]
  treatment_trend?: Performer[]
  top_groups?: Performer[]
  top_hospitals?: Performer[]
  top_doctors?: Performer[]
  top_treatments?: Performer[]
}

export interface QuickViewAdminGroup {
  id: string
  name: string
  total_hospitals: number
  total_doctors: number
  total_patients: number
  total_revenue: number
  total_active_cases: number
  total_expenses?: number
  net_profit?: number
  profit_margin?: number
  top_doctors: Performer[]
}

export interface QuickViewHospital {
  id: string
  name: string
  total_doctors: number
  total_patients: number
  total_revenue: number
  total_active_cases: number
  total_billings: number
  total_pending: number
  today_appointments: number
  total_expenses?: number
  net_profit?: number
  profit_margin?: number
  expense_breakdown?: ExpenseBreakdownItem[]
}

export interface QuickViewDoctor {
  id: string
  name: string
  total_patients: number
  today_appointments: number
  total_cases: number
  active_cases: number
  completed_cases: number
  total_revenue: number
  period_revenue?: number
  active_patients: number
  completed_patients: number
  contribution_to_profit?: number
}

export interface QuickViewPatientCase {
  id: string
  chief_complaint: string
  status: string
  diagnosis: string | null
  created_at: string
}

export interface QuickViewPatientTreatment {
  id: string
  treatment_name: string
  cost: number
  status: string
}

export interface QuickViewPatientAppointment {
  id: string
  date: string
  time: string
  status: string
  appointment_type: string | null
}

export interface QuickViewPatientBilling {
  id: string
  total_amount: number
  paid_amount: number
  pending_amount: number
  payment_status: string
  created_at: string
}

export interface PatientTimelineEntry {
  id: string
  patient_id: string
  action: string
  description: string | null
  module: string | null
  performed_by: string | null
  user_name: string | null
  user_role: string | null
  hospital_id: string | null
  hospital_name: string | null
  changes: Array<{ field: string; old_value: string | null; new_value: string | null }> | []
  created_at: string
}

export interface PatientTimelineResponse {
  entries: PatientTimelineEntry[]
  total: number
  skip: number
  limit: number
}

export interface QuickViewPatientTimeline {
  date: string
  event: string
  type: string
}

export interface QuickViewPatientFollowUp {
  id: string
  date: string
  time: string | null
  doctor_id: string | null
  appointment_id: string | null
  status: string | null
  notes?: string | null
}

export interface QuickViewPatientPreOp {
  id: string
  case_id: string
  notes: string | null
  photo_urls: string | null
  xray_urls: string | null
  created_at: string
}

export interface QuickViewPatientPostOp {
  id: string
  case_id: string
  notes: string | null
  report: string | null
  photo_urls: string | null
  created_at: string
}

export type LeadSource =
  | "GOOGLE_SEARCH"
  | "GOOGLE_MAPS"
  | "INSTAGRAM"
  | "FACEBOOK"
  | "WHATSAPP"
  | "WEBSITE"
  | "WALK_IN"
  | "REFERRAL"
  | "DOCTOR_REFERRAL"
  | "CLINIC_REFERRAL"
  | "CAMPAIGN"
  | "ADVERTISEMENT"
  | "BANNER"
  | "NEWSPAPER"
  | "YOUTUBE"
  | "EVENT"
  | "OTHER"

export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "INTERESTED"
  | "FOLLOW_UP_REQUIRED"
  | "APPOINTMENT_BOOKED"
  | "VISITED"
  | "CONVERTED"
  | "LOST"
  | "NOT_INTERESTED"
  | "NO_RESPONSE"

export type LeadCallOutcome =
  | "INTERESTED"
  | "NOT_INTERESTED"
  | "NO_ANSWER"
  | "BUSY"
  | "CALL_BACK_LATER"
  | "APPOINTMENT_REQUESTED"
  | "CONVERTED"

export interface Lead {
  id: string
  hospital_id: string
  hospital_name: string | null
  assigned_staff_id: string | null
  assigned_doctor_id: string | null
  converted_patient_id: string | null
  lead_name: string
  mobile: string
  alternate_mobile: string | null
  email: string | null
  age: number | null
  gender: string | null
  city: string | null
  source: LeadSource
  interested_treatment: string | null
  budget: number | null
  preferred_visit_date: string | null
  notes: string | null
  status: LeadStatus
  lead_score: number | null
  last_contacted_at: string | null
  next_follow_up_date: string | null
  priority: string | null
  automation_status: string | null
  current_attempt: number | null
  total_attempts: number | null
  automation_closed_at: string | null
  automation_closed_by: string | null
  automation_closure_reason: string | null
  created_at: string
  updated_at: string
}

export interface LeadCall {
  id: string
  lead_id: string
  called_by: string | null
  outcome: string | null
  notes: string | null
  follow_up_date: string | null
  duration_seconds: number | null
  created_at: string
}

export interface LeadCommunication {
  id: string
  lead_id: string
  hospital_id: string | null
  sent_by: string | null
  sent_by_name: string | null
  channel: string
  message_type: string
  template_name: string | null
  message: string
  message_preview: string | null
  status: string
  delivery_status: string | null
  provider_message_id: string | null
  direction: string
  sent_at: string | null
  created_at: string
}

export interface QuickViewPatient {
  id: string
  name: string
  total_cases: number
  total_treatments: number
  total_appointments: number
  total_follow_ups: number
  next_follow_up: QuickViewPatientFollowUp | null
  follow_up_history: QuickViewPatientFollowUp[]
  total_billed: number
  total_paid: number
  total_pending: number
  cases: QuickViewPatientCase[]
  treatments: QuickViewPatientTreatment[]
  appointments: QuickViewPatientAppointment[]
  billings: QuickViewPatientBilling[]
  timeline: QuickViewPatientTimeline[]
  pre_ops: QuickViewPatientPreOp[]
  post_ops: QuickViewPatientPostOp[]
  treatment_progress: { total: number; completed: number }
}

export interface ConsentForm {
  id: string
  patient_id: string | null
  patient_name: string
  op_number: string | null
  phone: string | null
  doctor_id: string | null
  doctor_name: string | null
  consent_type: string
  remarks: string | null
  pdf_path: string | null
  hospital_id: string
  uploaded_by: string | null
  uploader_name: string | null
  case_id: string | null
  treatment_plan_id: string | null
  is_deleted: boolean
  created_at: string
  updated_at: string
}

export interface AppointmentFullDetail {
  appointment: Appointment
  patient: Patient
  cases: CaseReport[]
  treatments: TreatmentPlanSummary[]
  billings: BillingSummary[]
  timeline: TimelineEvent[]
  related_appointments: RelatedAppointment[]
}

export interface CaseReport {
  id: string
  case_number: string | null
  chief_complaint: string
  status: string
  created_at: string
  doctor_name: string | null
  diagnosis: string | null
}

export interface TreatmentPlanSummary {
  id: string
  treatment_number: string | null
  treatment_name: string
  status: string
  cost: number
  paid_amount: number
  total_sittings: number
  completed_sittings: number
  case_id: string
  case_number: string | null
  doctor_name: string | null
}

export interface BillingSummary {
  id: string
  invoice_number: string | null
  total_amount: number
  paid_amount: number
  pending_amount: number
  payment_status: string
  created_at: string
  case_number: string | null
}

export interface TimelineEvent {
  id: string
  action: string
  description: string | null
  module: string | null
  user_name: string | null
  created_at: string
  changes: Array<{ field: string; old_value: string | null; new_value: string | null }> | null
}

export interface RelatedAppointment {
  id: string
  appointment_number: string | null
  appointment_date: string
  appointment_time: string
  status: string
  appointment_type: string
  doctor_name: string | null
  case_number: string | null
}

export interface AppointmentSchedulerSelectData {
  doctor_id: string
  appointment_date: string
  appointment_time: string
  duration_minutes: number
  procedure_name?: string
  appointment_type: string
}

export interface DoctorListItem {
  id: string
  full_name?: string
  name?: string
  email?: string
  specialization: string | null
  is_active?: boolean
}

export interface DoctorOption {
  id: string
  name: string
  specialization: string | null
}

export interface FollowUpResponse {
  id: string
  patient_id?: string
  follow_up_type?: string
  response_message?: string
  response_status?: string
  feedback?: string
  follow_up_required?: boolean
  appointment_id?: string | null
  doctor_name?: string | null
  created_by_name?: string | null
  created_at?: string
}

export interface WaitingPayload {
  reason: string
  expected_followup?: string
  lab_name?: string
  lab_order_number?: string
  lab_sent_date?: string
  lab_return_date?: string
  lab_cost?: number
  lab_tracking_notes?: string
  next_appointment_date?: string
  next_appointment_time?: string
  next_appointment_doctor_id?: string
}

export interface VisitPayload {
  [key: string]: unknown
  treatment_plan_id: string
  sitting_number: number
  status: string
  clinical_notes: string | null
  procedure_performed: string | null
  prescription: string | null
  materials_used: string | null
  duration_minutes: number | null
  work_done: string | null
  doctor_notes: string | null
  next_visit_required: boolean
  sitting_date: string
  next_appointment_date?: string
  next_appointment_time?: string
  next_appointment_doctor_id?: string
}

export interface ParsedTreatmentItem {
  id: string
  name: string
  toothNumbers: string[]
  estimatedVisits: number | ""
  estimatedCost: number | ""
  remarks: string
  status?: string
  assignedDoctor?: string | null
}

export interface CasePayload {
  patient_id?: string
  doctor_id?: string
  appointment_id?: string
  chief_complaint: string
  diagnosis?: string
  notes?: string
  [key: string]: unknown
}

export interface AppointmentCreatePayload {
  [key: string]: unknown
  patient_id: string
  doctor_id: string
  appointment_date: string
  appointment_time: string
  appointment_type?: string
  notes?: string
  duration_minutes?: number
}

export interface ReassignDoctorResponse {
  new_doctor_name: string
  [key: string]: unknown
}

export interface ApiError extends Error {
  response?: {
    data?: {
      detail?: string | Array<{ msg?: string; type?: string; loc?: string[] }>
    }
    status?: number
  }
}

export function extractDetail(err: unknown): string {
  const apiErr = err as ApiError
  const detail = apiErr?.response?.data?.detail
  if (typeof detail === "string") return detail
  if (Array.isArray(detail) && detail.length > 0)
    return detail
      .map((e) => e.msg)
      .filter(Boolean)
      .join(", ")
  return "An unexpected error occurred"
}

export interface TreatmentCrmRule {
  id: string
  hospital_id: string
  treatment_type_id: string
  treatment_name: string
  is_active: boolean
  follow_up_1_day: boolean
  follow_up_7_day: boolean
  recall_6_month: boolean
  recall_12_month: boolean
  custom_recall_days: number | null
  enquiry_enabled: boolean
  auto_appointment_enabled: boolean
  assigned_doctor_id: string | null
  visit_enabled: boolean
  visit_trigger: string
  visit_specific_number: number | null
  visit_delay_days: number
  visit_enquiry_type: string
  visit_whatsapp_enabled: boolean
  visit_whatsapp_template_id: string | null
  visit_notes: string | null
  reminder_enabled: boolean
  reminder_days_before: string
  reminder_whatsapp_enabled: boolean
  reminder_whatsapp_template_id: string | null
  reminder_notes: string | null
  completion_enabled: boolean
  completion_delay_days: number
  completion_enquiry_type: string
  completion_whatsapp_enabled: boolean
  completion_whatsapp_template_id: string | null
  completion_notes: string | null
  recall_enabled: boolean
  recall_days: number
  recall_enquiry_type: string
  recall_whatsapp_enabled: boolean
  recall_whatsapp_template_id: string | null
  recall_notes: string | null
  missed_enabled: boolean
  missed_delay_days: number
  missed_whatsapp_enabled: boolean
  missed_whatsapp_template_id: string | null
  missed_notes: string | null
  auto_assign_role: string
  priority: string
  whatsapp_template_id: string | null
  email_template_id: string | null
  sms_template_id: string | null
  created_at: string | null
  updated_at: string | null
}

export interface GeneratedEnquiry {
  id: string
  hospital_id: string
  patient_id: string
  lead_id: string | null
  treatment_plan_id: string | null
  treatment_type_id: string | null
  appointment_id: string | null
  case_id: string | null
  doctor_id: string | null
  assigned_staff_id: string | null
  rule_id: string | null
  trigger_event: string
  treatment_name: string | null
  visit_number: number | null
  total_visits: number | null
  visit_stage: string | null
  enquiry_type: string
  notes: string | null
  due_date: string
  priority: string
  follow_up_id: string | null
  status: string
  occurrence_number: number | null
  total_attempts: number | null
  recurrence_interval_days: number | null
  chain_id: string | null
  is_recurring: boolean | null
  created_at: string | null
  lead?: { id: string; lead_name: string; mobile: string } | null
  patient?: { id: string; name: string; phone: string } | null
  patient_phone?: string | null
}

export interface GeneratedEnquiriesDashboard {
  by_status: Record<string, number>
  today_due: number
  overdue: number
  by_enquiry_type: Record<string, number>
  by_trigger_event: Record<string, number>
  total: number
}
