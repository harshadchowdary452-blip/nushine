/* eslint-disable react-refresh/only-export-components */
import { createBrowserRouter, Navigate, Outlet, useLocation } from "react-router-dom"
import { lazy, Suspense } from "react"
import type { ReactElement } from "react"
import { useAuthStore } from "@/store/authStore"
import type { Role } from "@/types"
import { getHospitalOverride, setHospitalOverride } from "@/lib/hospital-override"
// Deep import: the @/design-system barrel also re-exports the dashboard chart
// modules (recharts), which would statically bundle ~450KB into the entry chunk.
import EnterpriseAppLayout from "@/design-system/components/app-layout"

const Login = lazy(() => import("@/pages/auth/login"))
const SuperAdminDashboard = lazy(() => import("@/pages/dashboard/super-admin"))
const GroupAdminDashboard = lazy(() => import("@/pages/dashboard/group-admin"))
const HospitalAdminDashboard = lazy(() => import("@/pages/dashboard/hospital-admin"))
const DoctorDashboard = lazy(() => import("@/pages/dashboard/doctor"))
const AdminGroups = lazy(() => import("@/pages/admin/groups"))
const AdminHospitals = lazy(() => import("@/pages/admin/hospitals"))
const AdminDoctors = lazy(() => import("@/pages/admin/doctors"))
const AdminExpenses = lazy(() => import("@/pages/admin/expenses"))
const PatientList = lazy(() => import("@/pages/patients/list"))
const PatientDetail = lazy(() => import("@/pages/patients/detail"))
const CaseList = lazy(() => import("@/pages/cases/list"))
const CaseDetail = lazy(() => import("@/pages/cases/detail"))
const CasePrintPreview = lazy(() => import("@/pages/cases/print-preview"))
const AppointmentList = lazy(() => import("@/pages/appointments/list"))
const AppointmentDetail = lazy(() => import("@/pages/appointments/detail"))
const ConsultantList = lazy(() => import("@/pages/consultants/list"))
const TreatmentList = lazy(() => import("@/pages/treatments/list"))
const TreatmentDetail = lazy(() => import("@/pages/treatments/detail"))
const TreatmentPlanApproval = lazy(() => import("@/pages/treatments/approval"))
const ScheduleFirstAppointment = lazy(() => import("@/pages/treatments/schedule-first"))
const TreatmentWorkflowBoard = lazy(() => import("@/pages/treatments/workflow-board"))
const DoctorQueue = lazy(() => import("@/pages/treatments/doctor-queue"))
const TaskCenter = lazy(() => import("@/pages/tasks/task-center"))
const BillingList = lazy(() => import("@/pages/billing/list"))
const BillingDetail = lazy(() => import("@/pages/billing/detail"))
const WhatsAppMessaging = lazy(() => import("@/pages/whatsapp/messaging"))
const CommunicationCenter = lazy(() => import("@/pages/communications/center"))

const EnquiryCalendar = lazy(() => import("@/pages/crm/enquiry-calendar"))
const LeadList = lazy(() => import("@/pages/leads/list"))
const LeadDetail = lazy(() => import("@/pages/leads/detail"))
const Settings = lazy(() => import("@/pages/settings/profile"))
const WhatsAppConfigPage = lazy(() => import("@/pages/settings/whatsapp-config"))
const WhatsAppTemplates = lazy(() => import("@/pages/whatsapp/templates"))
const WhatsAppBroadcast = lazy(() => import("@/pages/whatsapp/broadcast"))
const DoctorAvailability = lazy(() => import("@/pages/doctors/availability"))
const CrmDashboard = lazy(() => import("@/pages/dashboard/crm-dashboard"))
const CrmSettings = lazy(() => import("@/pages/crm/crm-settings"))
const ConsentFormList = lazy(() => import("@/pages/consent-forms/list"))
const ConsentFormView = lazy(() => import("@/pages/consent-forms/view"))
const ExportCenter = lazy(() => import("@/pages/exports/export-center"))
const ClinicalSettings = lazy(() => import("@/pages/clinical-settings"))
const DoctorPerformanceOverview = lazy(() => import("@/pages/performance/overview"))
const DoctorPerformanceProfile = lazy(() => import("@/pages/performance/doctor-profile"))
const InventoryPage = lazy(() => import("@/pages/inventory/index"))
const LaboratoryPage = lazy(() => import("@/pages/laboratory/index"))
const NotFoundPage = lazy(() => import("@/pages/errors/not-found"))
const RouteErrorPage = lazy(() => import("@/pages/errors/route-error"))

const dashboardByRole: Record<Role, string> = {
  SUPER_ADMIN: "/super-admin",
  GROUP_ADMIN: "/group-admin",
  HOSPITAL_ADMIN: "/hospital-admin",
  DOCTOR: "/doctor",
}

function getDashboardPath(role?: Role) {
  return role ? dashboardByRole[role] || "/doctor" : "/doctor"
}

function DashboardRedirect() {
  const { user } = useAuthStore()
  if (!user) return null
  const override = getHospitalOverride()
  if (override && (user.role === "HOSPITAL_ADMIN" || user.role === "DOCTOR")) {
    setHospitalOverride(null)
  } else if (override && (user.role === "SUPER_ADMIN" || user.role === "GROUP_ADMIN")) {
    return <Navigate to="/hospital-admin" replace />
  }
  return <Navigate to={getDashboardPath(user.role)} replace />
}

function PageLoader() {
  return (
    <div
      className="flex flex-1 items-center justify-center py-24"
      role="status"
      aria-label="Loading page"
    >
      <div className="spinner" />
    </div>
  )
}

function ProtectedLayout() {
  const location = useLocation()
  const { user, accessToken, refreshToken } = useAuthStore()
  const isAuthenticated = !!user && !!accessToken && !!refreshToken
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return (
    <EnterpriseAppLayout>
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </EnterpriseAppLayout>
  )
}

function PublicRoute() {
  const { user, accessToken, refreshToken } = useAuthStore()
  const isAuthenticated = !!user && !!accessToken && !!refreshToken
  if (isAuthenticated) return <Navigate to={getDashboardPath(user?.role)} replace />
  return (
    <Suspense fallback={<PageLoader />}>
      <Outlet />
    </Suspense>
  )
}

function RoleGuard({ allowedRoles, children }: { allowedRoles: Role[]; children: ReactElement }) {
  const { user } = useAuthStore()
  if (!user) return null
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={getDashboardPath(user.role)} replace />
  }
  return children
}

function withRoles(element: ReactElement, allowedRoles: Role[]) {
  return <RoleGuard allowedRoles={allowedRoles}>{element}</RoleGuard>
}

const ADMIN_ROLES: Role[] = ["SUPER_ADMIN", "GROUP_ADMIN", "HOSPITAL_ADMIN"]
const CARE_ROLES: Role[] = ["HOSPITAL_ADMIN", "DOCTOR"]
const INVENTORY_ROLES: Role[] = [...ADMIN_ROLES, "DOCTOR"]

export const router = createBrowserRouter([
  {
    element: <PublicRoute />,
    errorElement: (
      <Suspense fallback={<PageLoader />}>
        <RouteErrorPage />
      </Suspense>
    ),
    children: [{ path: "/login", element: <Login /> }],
  },
  {
    element: <ProtectedLayout />,
    // Route-level crashes (render errors, failed lazy chunks after a deploy)
    // degrade to a classified, recoverable error screen — never a white page.
    errorElement: (
      <Suspense fallback={<PageLoader />}>
        <RouteErrorPage />
      </Suspense>
    ),
    children: [
      { index: true, element: <DashboardRedirect /> },
      { path: "/super-admin", element: withRoles(<SuperAdminDashboard />, ["SUPER_ADMIN"]) },
      { path: "/group-admin", element: withRoles(<GroupAdminDashboard />, ["GROUP_ADMIN"]) },
      {
        path: "/hospital-admin",
        element: withRoles(<HospitalAdminDashboard />, [
          "SUPER_ADMIN",
          "GROUP_ADMIN",
          "HOSPITAL_ADMIN",
        ]),
      },
      { path: "/doctor", element: withRoles(<DoctorDashboard />, ["DOCTOR"]) },
      { path: "/admin/groups", element: withRoles(<AdminGroups />, ["SUPER_ADMIN"]) },
      {
        path: "/admin/hospitals",
        element: withRoles(<AdminHospitals />, ["SUPER_ADMIN", "GROUP_ADMIN"]),
      },
      {
        path: "/admin/doctors",
        element: withRoles(<AdminDoctors />, ["SUPER_ADMIN", "GROUP_ADMIN", "HOSPITAL_ADMIN"]),
      },
      {
        path: "/admin/expenses",
        element: withRoles(<AdminExpenses />, ["SUPER_ADMIN", "GROUP_ADMIN", "HOSPITAL_ADMIN"]),
      },
      {
        path: "/exports",
        element: withRoles(<ExportCenter />, ["SUPER_ADMIN", "GROUP_ADMIN", "HOSPITAL_ADMIN"]),
      },
      { path: "/patients", element: withRoles(<PatientList />, CARE_ROLES) },
      { path: "/patients/:id", element: withRoles(<PatientDetail />, CARE_ROLES) },
      { path: "/appointments", element: withRoles(<AppointmentList />, CARE_ROLES) },
      { path: "/appointments/:id", element: withRoles(<AppointmentDetail />, CARE_ROLES) },
      { path: "/doctors/availability", element: withRoles(<DoctorAvailability />, ["DOCTOR"]) },
      { path: "/consultants", element: withRoles(<ConsultantList />, ["HOSPITAL_ADMIN"]) },
      { path: "/billing", element: withRoles(<BillingList />, CARE_ROLES) },
      { path: "/billing/:id", element: withRoles(<BillingDetail />, CARE_ROLES) },
      { path: "/whatsapp", element: withRoles(<WhatsAppMessaging />, ["HOSPITAL_ADMIN"]) },
      { path: "/crm/dashboard", element: withRoles(<CrmDashboard />, ADMIN_ROLES) },
      { path: "/crm/dashboard2", element: withRoles(<CrmDashboard />, ADMIN_ROLES) },
      { path: "/crm/settings", element: withRoles(<CrmSettings />, ["HOSPITAL_ADMIN"]) },

      {
        path: "/crm/enquiry-calendar",
        element: withRoles(<EnquiryCalendar />, ["HOSPITAL_ADMIN"]),
      },
      { path: "/leads", element: withRoles(<LeadList />, ADMIN_ROLES) },
      { path: "/leads/:id", element: withRoles(<LeadDetail />, ADMIN_ROLES) },
      { path: "/cases", element: withRoles(<CaseList />, CARE_ROLES) },
      { path: "/cases/:id/print", element: withRoles(<CasePrintPreview />, CARE_ROLES) },
      { path: "/cases/:id", element: withRoles(<CaseDetail />, CARE_ROLES) },
      { path: "/treatments", element: withRoles(<TreatmentList />, CARE_ROLES) },
      { path: "/treatments/:id", element: withRoles(<TreatmentDetail />, CARE_ROLES) },
      {
        path: "/treatments/approve/:caseId",
        element: withRoles(<TreatmentPlanApproval />, CARE_ROLES),
      },
      {
        path: "/treatments/schedule-first/:caseId",
        element: withRoles(<ScheduleFirstAppointment />, CARE_ROLES),
      },
      { path: "/treatments/workflow", element: withRoles(<TreatmentWorkflowBoard />, ADMIN_ROLES) },
      { path: "/treatments/queue", element: withRoles(<DoctorQueue />, CARE_ROLES) },
      { path: "/tasks", element: withRoles(<TaskCenter />, [...ADMIN_ROLES, "DOCTOR"]) },
      {
        path: "/performance",
        element: withRoles(<DoctorPerformanceOverview />, [...ADMIN_ROLES, "DOCTOR"]),
      },
      {
        path: "/performance/:doctorId",
        element: withRoles(<DoctorPerformanceProfile />, [...ADMIN_ROLES, "DOCTOR"]),
      },
      { path: "/consent-forms", element: withRoles(<ConsentFormList />, CARE_ROLES) },
      { path: "/consent-forms/view/:id", element: withRoles(<ConsentFormView />, CARE_ROLES) },
      {
        path: "/communications",
        element: withRoles(<CommunicationCenter />, ["SUPER_ADMIN", "GROUP_ADMIN", "HOSPITAL_ADMIN"]),
      },
      { path: "/settings/clinical", element: withRoles(<ClinicalSettings />, ["HOSPITAL_ADMIN"]) },
      { path: "/settings", element: withRoles(<Settings />, [...ADMIN_ROLES, "DOCTOR"]) },
      { path: "/settings/whatsapp", element: withRoles(<WhatsAppConfigPage />, ADMIN_ROLES) },
      { path: "/whatsapp/templates", element: withRoles(<WhatsAppTemplates />, ADMIN_ROLES) },
      { path: "/whatsapp/broadcast", element: withRoles(<WhatsAppBroadcast />, ADMIN_ROLES) },
      {
        path: "/inventory",
        element: withRoles(<InventoryPage />, INVENTORY_ROLES),
      },
      {
        path: "/laboratory",
        element: withRoles(<LaboratoryPage />, INVENTORY_ROLES),
      },
      // Unmatched routes render an explanatory 404 rather than silently
      // redirecting — a redirect hides broken links from users and telemetry.
      { path: "*", element: <NotFoundPage /> },
    ],
  },
])
