import { createBrowserRouter, Navigate, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import type { ReactElement } from "react";
import { useAuthStore } from "@/store/authStore";
import type { Role } from "@/types";
import AppLayout from "@/components/layout/app-layout";
import Login from "@/pages/auth/login";
import SuperAdminDashboard from "@/pages/dashboard/super-admin";
import GroupAdminDashboard from "@/pages/dashboard/group-admin";
import HospitalAdminDashboard from "@/pages/dashboard/hospital-admin";
import DoctorDashboard from "@/pages/dashboard/doctor";
import AdminGroups from "@/pages/admin/groups";
import AdminHospitals from "@/pages/admin/hospitals";
import AdminDoctors from "@/pages/admin/doctors";
import AdminExpenses from "@/pages/admin/expenses";
import PatientList from "@/pages/patients/list";
import PatientDetail from "@/pages/patients/detail";
import CaseList from "@/pages/cases/list";
import CaseDetail from "@/pages/cases/detail";
import AppointmentList from "@/pages/appointments/list";
import AppointmentDetail from "@/pages/appointments/detail";
import ConsultantList from "@/pages/consultants/list";
import TreatmentList from "@/pages/treatments/list";
import BillingList from "@/pages/billing/list";
import BillingDetail from "@/pages/billing/detail";
import WhatsAppMessaging from "@/pages/whatsapp/messaging";
import CommunicationHistory from "@/pages/crm/communications";
import EmailTemplates from "@/pages/crm/email-templates";
import FollowUps from "@/pages/crm/follow-ups";
import Settings from "@/pages/settings/profile";

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

function ProtectedLayout() {
  const location = useLocation();
  const { user, accessToken, refreshToken } = useAuthStore();
  const isAuthenticated = !!user && !!accessToken && !!refreshToken;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return (
    <AppLayout>
      <AnimatePresence mode="wait">
        <Outlet key={location.pathname} />
      </AnimatePresence>
    </AppLayout>
  );
}

function PublicRoute() {
  const { user, accessToken, refreshToken } = useAuthStore();
  const isAuthenticated = !!user && !!accessToken && !!refreshToken;
  if (isAuthenticated) return <Navigate to={getDashboardPath(user?.role)} replace />;
  return <Outlet />;
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
      { path: "/consultants", element: withRoles(<ConsultantList />, ["HOSPITAL_ADMIN"]) },
      { path: "/billing", element: withRoles(<BillingList />, CARE_ROLES) },
      { path: "/billing/:id", element: withRoles(<BillingDetail />, CARE_ROLES) },
      { path: "/whatsapp", element: withRoles(<WhatsAppMessaging />, ["HOSPITAL_ADMIN"]) },
      { path: "/crm/communications", element: withRoles(<CommunicationHistory />, ["HOSPITAL_ADMIN"]) },
      { path: "/crm/templates", element: withRoles(<EmailTemplates />, ["HOSPITAL_ADMIN"]) },
      { path: "/crm/follow-ups", element: withRoles(<FollowUps />, ["HOSPITAL_ADMIN"]) },
      { path: "/cases", element: withRoles(<CaseList />, CARE_ROLES) },
      { path: "/cases/:id", element: withRoles(<CaseDetail />, CARE_ROLES) },
      { path: "/treatments", element: withRoles(<TreatmentList />, CARE_ROLES) },
      { path: "/settings", element: withRoles(<Settings />, [...ADMIN_ROLES, "DOCTOR"]) },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
