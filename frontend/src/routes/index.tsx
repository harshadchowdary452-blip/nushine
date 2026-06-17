import { createBrowserRouter, Navigate, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { lazy, Suspense } from "react";
import type { ReactElement } from "react";
import { useAuthStore } from "@/store/authStore";
import type { Role } from "@/types";
import AppLayout from "@/components/layout/app-layout";

const Login = lazy(() => import("@/pages/auth/login"));
const SuperAdminDashboard = lazy(() => import("@/pages/dashboard/super-admin"));
const GroupAdminDashboard = lazy(() => import("@/pages/dashboard/group-admin"));
const HospitalAdminDashboard = lazy(() => import("@/pages/dashboard/hospital-admin"));
const DoctorDashboard = lazy(() => import("@/pages/dashboard/doctor"));
const AdminGroups = lazy(() => import("@/pages/admin/groups"));
const AdminHospitals = lazy(() => import("@/pages/admin/hospitals"));
const AdminDoctors = lazy(() => import("@/pages/admin/doctors"));
const AdminExpenses = lazy(() => import("@/pages/admin/expenses"));
const PatientList = lazy(() => import("@/pages/patients/list"));
const PatientDetail = lazy(() => import("@/pages/patients/detail"));
const CaseList = lazy(() => import("@/pages/cases/list"));
const CaseDetail = lazy(() => import("@/pages/cases/detail"));
const AppointmentList = lazy(() => import("@/pages/appointments/list"));
const AppointmentDetail = lazy(() => import("@/pages/appointments/detail"));
const ConsultantList = lazy(() => import("@/pages/consultants/list"));
const TreatmentList = lazy(() => import("@/pages/treatments/list"));
const TreatmentDetail = lazy(() => import("@/pages/treatments/detail"));
const BillingList = lazy(() => import("@/pages/billing/list"));
const BillingDetail = lazy(() => import("@/pages/billing/detail"));
const WhatsAppMessaging = lazy(() => import("@/pages/whatsapp/messaging"));
const CommunicationHistory = lazy(() => import("@/pages/crm/communications"));
const EmailTemplates = lazy(() => import("@/pages/crm/email-templates"));
const FollowUps = lazy(() => import("@/pages/crm/follow-ups"));
const Campaigns = lazy(() => import("@/pages/crm/campaigns"));
const EnquiryCalendar = lazy(() => import("@/pages/crm/enquiry-calendar"));
const LeadAnalytics = lazy(() => import("@/pages/crm/lead-analytics"));
const RevenueAttribution = lazy(() => import("@/pages/crm/revenue-attribution"));
const LeadList = lazy(() => import("@/pages/leads/list"));
const LeadDetail = lazy(() => import("@/pages/leads/detail"));
const Settings = lazy(() => import("@/pages/settings/profile"));
const WhatsAppConfigPage = lazy(() => import("@/pages/settings/whatsapp-config"));
const WhatsAppTemplates = lazy(() => import("@/pages/whatsapp/templates"));
const WhatsAppBroadcast = lazy(() => import("@/pages/whatsapp/broadcast"));
const DoctorAvailability = lazy(() => import("@/pages/doctors/availability"));
const CrmDashboard = lazy(() => import("@/pages/dashboard/crm-dashboard"));

const dashboardByRole: Record<Role, string> = {
  SUPER_ADMIN: "/super-admin",
  GROUP_ADMIN: "/group-admin",
  HOSPITAL_ADMIN: "/hospital-admin",
  DOCTOR: "/doctor",
};

function getDashboardPath(role?: Role) {
  return role ? dashboardByRole[role] || "/doctor" : "/doctor";
}

function DashboardRedirect() {
  const { user } = useAuthStore();
  if (!user) return null;
  return <Navigate to={getDashboardPath(user.role)} replace />;
}

function PageLoader() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
      }}
    >
      <div className="spinner" />
    </div>
  );
}

function ProtectedLayout() {
  const location = useLocation();
  const { user, accessToken, refreshToken } = useAuthStore();
  const isAuthenticated = !!user && !!accessToken && !!refreshToken;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return (
    <AppLayout>
      <Suspense fallback={<PageLoader />}>
        <AnimatePresence mode="wait">
          <Outlet key={location.pathname} />
        </AnimatePresence>
      </Suspense>
    </AppLayout>
  );
}

function PublicRoute() {
  const { user, accessToken, refreshToken } = useAuthStore();
  const isAuthenticated = !!user && !!accessToken && !!refreshToken;
  if (isAuthenticated) return <Navigate to={getDashboardPath(user?.role)} replace />;
  return (
    <Suspense fallback={<PageLoader />}>
      <Outlet />
    </Suspense>
  );
}

function RoleGuard({ allowedRoles, children }: { allowedRoles: Role[]; children: ReactElement }) {
  const { user } = useAuthStore();
  if (!user) return null;
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={getDashboardPath(user.role)} replace />;
  }
  return children;
}

function withRoles(element: ReactElement, allowedRoles: Role[]) {
  return <RoleGuard allowedRoles={allowedRoles}>{element}</RoleGuard>;
}

const ADMIN_ROLES: Role[] = ["SUPER_ADMIN", "GROUP_ADMIN", "HOSPITAL_ADMIN"];
const CARE_ROLES: Role[] = ["HOSPITAL_ADMIN", "DOCTOR"];

export const router = createBrowserRouter([
  {
    element: <PublicRoute />,
    children: [{ path: "/login", element: <Login /> }],
  },
  {
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <DashboardRedirect /> },
      { path: "/super-admin", element: withRoles(<SuperAdminDashboard />, ["SUPER_ADMIN"]) },
      { path: "/group-admin", element: withRoles(<GroupAdminDashboard />, ["GROUP_ADMIN"]) },
      { path: "/hospital-admin", element: withRoles(<HospitalAdminDashboard />, ["HOSPITAL_ADMIN"]) },
      { path: "/doctor", element: withRoles(<DoctorDashboard />, ["DOCTOR"]) },
      { path: "/admin/groups", element: withRoles(<AdminGroups />, ["SUPER_ADMIN"]) },
      { path: "/admin/hospitals", element: withRoles(<AdminHospitals />, ["SUPER_ADMIN", "GROUP_ADMIN"]) },
      { path: "/admin/doctors", element: withRoles(<AdminDoctors />, ["SUPER_ADMIN", "GROUP_ADMIN", "HOSPITAL_ADMIN"]) },
      { path: "/admin/expenses", element: withRoles(<AdminExpenses />, ["SUPER_ADMIN", "GROUP_ADMIN", "HOSPITAL_ADMIN"]) },
      { path: "/patients", element: withRoles(<PatientList />, CARE_ROLES) },
      { path: "/patients/:id", element: withRoles(<PatientDetail />, CARE_ROLES) },
      { path: "/appointments", element: withRoles(<AppointmentList />, CARE_ROLES) },
      { path: "/appointments/:id", element: withRoles(<AppointmentDetail />, CARE_ROLES) },
      { path: "/doctors/availability", element: withRoles(<DoctorAvailability />, ["DOCTOR"]) },
      { path: "/consultants", element: withRoles(<ConsultantList />, ["HOSPITAL_ADMIN"]) },
      { path: "/billing", element: withRoles(<BillingList />, CARE_ROLES) },
      { path: "/billing/:id", element: withRoles(<BillingDetail />, CARE_ROLES) },
      { path: "/whatsapp", element: withRoles(<WhatsAppMessaging />, ["HOSPITAL_ADMIN"]) },
      { path: "/crm/communications", element: withRoles(<CommunicationHistory />, ["HOSPITAL_ADMIN"]) },
      { path: "/crm/templates", element: withRoles(<EmailTemplates />, ["HOSPITAL_ADMIN"]) },
      { path: "/crm/dashboard", element: withRoles(<CrmDashboard />, ADMIN_ROLES) },
      { path: "/crm/dashboard2", element: withRoles(<CrmDashboard />, ADMIN_ROLES) },
      { path: "/crm/follow-ups", element: withRoles(<FollowUps />, ["HOSPITAL_ADMIN"]) },
      { path: "/crm/campaigns", element: withRoles(<Campaigns />, ["HOSPITAL_ADMIN"]) },
      { path: "/crm/enquiry-calendar", element: withRoles(<EnquiryCalendar />, ["HOSPITAL_ADMIN"]) },
      { path: "/crm/lead-analytics", element: withRoles(<LeadAnalytics />, ADMIN_ROLES) },
      { path: "/crm/revenue-attribution", element: withRoles(<RevenueAttribution />, ADMIN_ROLES) },
      { path: "/leads", element: withRoles(<LeadList />, ADMIN_ROLES) },
      { path: "/leads/:id", element: withRoles(<LeadDetail />, ADMIN_ROLES) },
      { path: "/cases", element: withRoles(<CaseList />, CARE_ROLES) },
      { path: "/cases/:id", element: withRoles(<CaseDetail />, CARE_ROLES) },
      { path: "/treatments", element: withRoles(<TreatmentList />, CARE_ROLES) },
      { path: "/treatments/:id", element: withRoles(<TreatmentDetail />, CARE_ROLES) },
      { path: "/settings", element: withRoles(<Settings />, [...ADMIN_ROLES, "DOCTOR"]) },
      { path: "/settings/whatsapp", element: withRoles(<WhatsAppConfigPage />, ADMIN_ROLES) },
      { path: "/whatsapp/templates", element: withRoles(<WhatsAppTemplates />, ADMIN_ROLES) },
      { path: "/whatsapp/broadcast", element: withRoles(<WhatsAppBroadcast />, ADMIN_ROLES) },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
