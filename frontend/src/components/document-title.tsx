import { useEffect } from "react"
import { useLocation } from "react-router-dom"

const APP_NAME = "Appointin"

const routeTitles: Record<string, string> = {
  "/": APP_NAME,
  "/login": `Login — ${APP_NAME}`,
  "/home": `Dashboard — ${APP_NAME}`,
  "/super-admin": `Super Admin Dashboard — ${APP_NAME}`,
  "/super-admin/demo-requests": `Demo Requests — ${APP_NAME}`,
  "/group-admin": `Group Admin Dashboard — ${APP_NAME}`,
  "/hospital-admin": `Hospital Admin Dashboard — ${APP_NAME}`,
  "/doctor": `Doctor Dashboard — ${APP_NAME}`,
  "/admin/groups": `Groups — ${APP_NAME}`,
  "/admin/hospitals": `Hospitals — ${APP_NAME}`,
  "/admin/doctors": `Doctors — ${APP_NAME}`,
  "/admin/expenses": `Expenses — ${APP_NAME}`,
  "/patients": `Patients — ${APP_NAME}`,
  "/appointments": `Appointments — ${APP_NAME}`,
  "/consultants": `Consultants — ${APP_NAME}`,
  "/cases": `Cases — ${APP_NAME}`,
  "/treatments": `Treatments — ${APP_NAME}`,
  "/treatments/workflow": `Treatment Workflow — ${APP_NAME}`,
  "/treatments/queue": `Doctor Queue — ${APP_NAME}`,
  "/billing": `Billing — ${APP_NAME}`,
  "/tasks": `Tasks — ${APP_NAME}`,
  "/performance": `Doctor Performance — ${APP_NAME}`,
  "/consent-forms": `Consent Forms — ${APP_NAME}`,
  "/communications": `Communication Center — ${APP_NAME}`,
  "/settings": `Settings — ${APP_NAME}`,
  "/settings/clinical": `Clinical Settings — ${APP_NAME}`,
  "/settings/whatsapp": `WhatsApp Config — ${APP_NAME}`,
  "/whatsapp/templates": `WhatsApp Templates — ${APP_NAME}`,
  "/whatsapp/broadcast": `WhatsApp Broadcast — ${APP_NAME}`,
  "/crm/dashboard": `CRM Dashboard — ${APP_NAME}`,
  "/crm/dashboard2": `CRM Dashboard — ${APP_NAME}`,
  "/crm/settings": `CRM Settings — ${APP_NAME}`,
  "/crm/enquiry-calendar": `Enquiry Calendar — ${APP_NAME}`,
  "/leads": `Leads — ${APP_NAME}`,
  "/inventory": `Inventory — ${APP_NAME}`,
  "/laboratory": `Laboratory — ${APP_NAME}`,
  "/exports": `Export Center — ${APP_NAME}`,
  "/doctors/availability": `Doctor Availability — ${APP_NAME}`,
  "/help": `Help Center — ${APP_NAME}`,
}

function resolveTitle(pathname: string): string {
  if (routeTitles[pathname]) return routeTitles[pathname]
  if (pathname.startsWith("/patients/")) return `Patient Details — ${APP_NAME}`
  if (pathname.startsWith("/appointments/")) return `Appointment Details — ${APP_NAME}`
  if (pathname.startsWith("/cases/")) return `Case Details — ${APP_NAME}`
  if (pathname.startsWith("/treatments/")) return `Treatment Details — ${APP_NAME}`
  if (pathname.startsWith("/billing/")) return `Invoice Details — ${APP_NAME}`
  if (pathname.startsWith("/leads/")) return `Lead Details — ${APP_NAME}`
  if (pathname.startsWith("/performance/")) return `Doctor Profile — ${APP_NAME}`
  if (pathname.startsWith("/consent-forms/")) return `Consent Form — ${APP_NAME}`
  return APP_NAME
}

export default function DocumentTitle() {
  const { pathname } = useLocation()

  useEffect(() => {
    document.title = resolveTitle(pathname)
  }, [pathname])

  return null
}
