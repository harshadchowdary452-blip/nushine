import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import {
  Menu, X, ArrowRight, Check, ChevronDown, ChevronRight,
  Users, CalendarDays, FolderOpen, Receipt, BarChart3,
  MessageSquare, Clock, Activity, Building2, Building, Stethoscope,
  FileText, Pill, ClipboardList, IndianRupee, Settings, Zap,
  LineChart, UserCheck, Target, GitBranch, Layers, Brain,
  Lock, Globe,
} from "lucide-react"
import appointinLogo from "@/assets/appointin-logo.png"
import DemoForm from "./demo-form"
import ProductMockup from "./product-mockup"

const fadeUp = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } }
const stagger = { visible: { transition: { staggerChildren: 0.06 } } }

const platformNav = [
  { label: "Platform", href: "#platform" },
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "For Organizations", href: "#organizations" },
  { label: "Book a Demo", href: "#demo" },
]

const platformModules = [
  { icon: Users, title: "Patient Management", desc: "Centralized records, history, and communication for every patient.", color: "#1E3A5F" },
  { icon: Target, title: "CRM & Leads", desc: "Capture enquiries, track leads, and convert them into patients.", color: "#F97316" },
  { icon: CalendarDays, title: "Appointments", desc: "Smart scheduling connected to treatments and patient journeys.", color: "#2563EB" },
  { icon: FolderOpen, title: "Cases", desc: "Case creation, findings, tooth charts, and treatment planning.", color: "#0F766E" },
  { icon: Activity, title: "Treatments", desc: "Plan, assign, track visits, and manage treatment completion.", color: "#059669" },
  { icon: Receipt, title: "Billing", desc: "Invoices, payments, and financial tracking connected to care.", color: "#4F46E5" },
  { icon: BarChart3, title: "Doctor Performance", desc: "OPDs, treatments, and performance metrics per doctor.", color: "#7C3AED" },
  { icon: ClipboardList, title: "Inventory", desc: "Monthly indents, stock tracking, and procurement workflows.", color: "#D97706" },
  { icon: Stethoscope, title: "Laboratory", desc: "Connect treatment rooms with labs for materials and results.", color: "#0F766E" },
  { icon: MessageSquare, title: "WhatsApp & Communication", desc: "Patient messaging, follow-ups, and lab coordination.", color: "#25D366" },
  { icon: Zap, title: "Automation", desc: "Automate enquiries, follow-ups, recalls, and notifications.", color: "#D946EF" },
  { icon: LineChart, title: "Analytics & Reports", desc: "Revenue, patient, and operational insights in real time.", color: "#0EA5E9" },
  { icon: Building, title: "Hospital Management", desc: "Complete admin control for standalone hospitals.", color: "#1E3A5F" },
]

const howItWorks = [
  { num: "01", title: "Set Up Your Organization", desc: "Add your hospital, departments, and customize your workspace in minutes." },
  { num: "02", title: "Add Doctors & Staff", desc: "Create user accounts with role-based access for every team member." },
  { num: "03", title: "Manage Patients & Enquiries", desc: "Start registering patients, tracking enquiries, and scheduling appointments." },
  { num: "04", title: "Run Clinical & Operational Workflows", desc: "Handle cases, treatments, billing, inventory, and laboratory — all connected." },
  { num: "05", title: "Use Insights to Grow", desc: "Leverage analytics and performance data to improve care and expand your practice." },
]

const whyItems = [
  { icon: Layers, title: "One Platform", desc: "No more switching between spreadsheets, calendars, and billing tools." },
  { icon: GitBranch, title: "Connected Data", desc: "Every patient interaction links back to a single, complete record." },
  { icon: Clock, title: "Less Manual Work", desc: "Automation handles follow-ups, recalls, and routine tasks." },
  { icon: LineChart, title: "Better Visibility", desc: "Real-time dashboards for every role — from doctor to group admin." },
  { icon: Lock, title: "Role-Based Access", desc: "Everyone sees what they need — and only what they're authorized to." },
  { icon: Brain, title: "Scalable Architecture", desc: "From single clinics to multi-hospital groups, Appointin grows with you." },
]

export default function LandingPage() {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 font-['Inter',sans-serif] text-[#1E293B] dark:text-gray-100">
      {/* ═══════════════════ HEADER ═══════════════════ */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? "bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-100 dark:border-gray-700 dark:bg-gray-900/95" : "bg-transparent"}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 sm:h-20 lg:h-24 items-center justify-between">
            <Link to="/" className="flex items-center gap-2.5 shrink-0">
              <img src={appointinLogo} alt="Appointin" className="h-10 sm:h-14 lg:h-[5.25rem] w-auto object-contain" draggable={false} />
            </Link>

            <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
              {platformNav.map((l) => (
                <a key={l.href + l.label} href={l.href} className="px-2 sm:px-3 py-1.5 text-[11px] sm:text-[13px] font-medium text-gray-500 dark:text-gray-400 hover:text-[#1E3A5F] dark:hover:text-[#5B8DBF] transition-colors rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 whitespace-nowrap shrink-0">{l.label}</a>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <button onClick={() => navigate("/login")} className="inline-flex text-[13px] font-medium text-[#1E3A5F] dark:text-[#5B8DBF] hover:bg-blue-50 dark:hover:bg-white/5 px-4 py-2 rounded-lg transition-colors">
                Login
              </button>
              <a href="#demo" className="inline-flex items-center gap-1.5 bg-[#1E3A5F] hover:bg-[#163050] text-white text-[13px] font-semibold px-5 py-2 rounded-xl transition-all shadow-md shadow-[#1E3A5F]/20">
                Book a Demo <ArrowRight className="h-3.5 w-3.5" />
              </a>
              <button onClick={() => setMobileNav(!mobileNav)} className="p-2 text-gray-500 dark:text-gray-400 hover:text-[#1E3A5F] dark:hover:text-[#5B8DBF]" aria-label="Toggle menu">
                {mobileNav ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {mobileNav && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="lg:hidden bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 shadow-lg">
            <div className="px-4 py-3 space-y-1">
              {platformNav.map((l) => (
                <a key={l.href + l.label} href={l.href} onClick={() => setMobileNav(false)} className="block px-3 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 rounded-lg dark:bg-gray-700/50">{l.label}</a>
              ))}
              <hr className="my-2 border-gray-100 dark:border-gray-700" />
              <button onClick={() => { navigate("/login"); setMobileNav(false) }} className="w-full text-left px-3 py-2.5 text-sm font-medium text-[#1E3A5F] dark:text-[#5B8DBF] hover:bg-blue-50 dark:hover:bg-white/5 rounded-lg">Login</button>
              <a href="#demo" onClick={() => setMobileNav(false)} className="block px-3 py-2.5 text-sm font-semibold text-white bg-[#1E3A5F] rounded-lg text-center">Book a Demo</a>
            </div>
          </motion.div>
        )}
      </header>

      {/* ═══════════════════ HERO ═══════════════════ */}
      <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 right-0 w-[700px] h-[700px] rounded-full bg-[#1E3A5F]/[0.03] blur-3xl" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full bg-[#4F46E5]/[0.03] blur-3xl" />
          <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: "linear-gradient(#1E3A5F 1px, transparent 1px), linear-gradient(90deg, #1E3A5F 1px, transparent 1px)", backgroundSize: "64px 64px" }} />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="text-center max-w-4xl mx-auto mb-12">
            <motion.h1 variants={fadeUp} transition={{ duration: 0.6 }} className="text-[2.375rem] sm:text-[3.25rem] lg:text-[4rem] font-extrabold tracking-tight text-[#0F172A] dark:text-white leading-[1.1]">
              One Platform for Complete{" "}
              <span className="bg-gradient-to-r from-[#1E3A5F] via-[#4F46E5] to-[#0F766E] bg-clip-text text-transparent">
                Dental Operations
              </span>
            </motion.h1>
            <motion.p variants={fadeUp} transition={{ duration: 0.6 }} className="mt-6 text-[1.2rem] text-gray-500 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
              Appointin connects patients, CRM, appointments, cases, treatments, billing, laboratory, inventory, communication, and analytics in one platform built for dental practices.
            </motion.p>
            <motion.div variants={fadeUp} transition={{ duration: 0.5 }} className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a href="#demo" className="inline-flex items-center gap-2 bg-[#1E3A5F] hover:bg-[#163050] text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-[#1E3A5F]/25 text-sm">
                Book a Demo <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#platform" className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 hover:bg-gray-50 text-[#1E3A5F] dark:text-[#5B8DBF] font-semibold px-8 py-3.5 rounded-xl border border-gray-200 dark:border-gray-700 transition-all text-sm">
                Explore Platform
              </a>
            </motion.div>
            <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="mt-4">
              <Link to="/login" className="text-xs text-gray-400 dark:text-gray-300 hover:text-[#1E3A5F] dark:hover:text-[#5B8DBF] transition-colors underline underline-offset-2">
                Already using Appointin? Login
              </Link>
            </motion.p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.3 }}>
            <ProductMockup />
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════ WHY APPOINTIN (Value Props) ═══════════════════ */}
      <section id="why" className="py-20 sm:py-28 bg-gray-50/50 dark:bg-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger} className="text-center mb-16">
            <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-[#1E3A5F] dark:text-[#5B8DBF] mb-3">Why Appointin</motion.p>
            <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-[2rem] sm:text-[2.4rem] font-extrabold tracking-tight text-[#0F172A] dark:text-white">
              Built for Dental Practices. Designed for Scale.
            </motion.h2>
              <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="mt-5 text-[0.95rem] text-gray-500 dark:text-gray-400 leading-relaxed max-w-2xl mx-auto">
              Dental practices need a single platform that connects clinical workflows, patient management, operations, and analytics — not another disconnected tool.
            </motion.p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={stagger} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {whyItems.map((w) => (
              <motion.div key={w.title} variants={fadeUp} transition={{ duration: 0.3 }} className="bg-white rounded-2xl dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-6 hover:shadow-lg hover:shadow-gray-100/80 transition-all duration-300">
                <div className="w-10 h-10 rounded-xl bg-[#1E3A5F]/10 dark:bg-[#5B8DBF]/15 flex items-center justify-center mb-4">
                  <w.icon className="h-5 w-5 text-[#1E3A5F] dark:text-[#5B8DBF]" strokeWidth={1.5} />
                </div>
                <h3 className="text-[1.1rem] font-bold text-[#0F172A] dark:text-white mb-1.5">{w.title}</h3>
                <p className="text-[1.05rem] text-gray-500 dark:text-gray-400 leading-relaxed">{w.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════ COMPLETE PLATFORM ═══════════════════ */}
      <section id="platform" className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger} className="text-center mb-16">
            <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-[#4F46E5] dark:text-[#818CF8] mb-3">Platform</motion.p>
            <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-[2rem] sm:text-[2.4rem] font-extrabold tracking-tight text-[#0F172A] dark:text-white">
              Everything Your Organization Needs. Connected.
            </motion.h2>
              <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="mt-5 text-[0.95rem] text-gray-500 dark:text-gray-400 leading-relaxed max-w-2xl mx-auto">
              A comprehensive dental practice management platform covering every workflow — from patient registration to revenue analytics.
            </motion.p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={stagger} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {platformModules.map((m) => (
              <motion.div key={m.title} variants={fadeUp} transition={{ duration: 0.3 }} className="group bg-white rounded-2xl dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 hover:border-gray-200 dark:border-gray-700 hover:shadow-lg hover:shadow-gray-100/80 transition-all duration-300 cursor-default">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3 transition-colors" style={{ backgroundColor: m.color + "10" }}>
                  <m.icon className="h-4.5 w-4.5" style={{ color: m.color }} strokeWidth={1.5} />
                </div>
                <h3 className="text-[0.95rem] font-bold text-[#0F172A] dark:text-white mb-1">{m.title}</h3>
                <p className="text-[0.8rem] text-gray-400 dark:text-gray-300 leading-relaxed">{m.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>


      {/* ═══════════════════ AUTOMATION ═══════════════════ */}
      <section className="py-20 sm:py-28 bg-gray-50/50 dark:bg-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
              <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-[#D946EF] dark:text-[#E879F9] mb-3">Automation</motion.p>
              <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-[1.6rem] sm:text-[2rem] font-extrabold tracking-tight text-[#0F172A] dark:text-white mb-4">
                Reduce Manual Work. Automate Repetitive Tasks.
              </motion.h2>
              <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-gray-500 dark:text-gray-400 leading-relaxed">
                Automate enquiries, follow-ups, recalls, appointment reminders, treatment workflows, laboratory coordination, and notifications — so your team focuses on care.
              </motion.p>
            </motion.div>
          </div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={stagger} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { title: "Enquiry Automation", desc: "Auto-route and assign new enquiries" },
              { title: "Follow-Up Scheduling", desc: "Automatic follow-up creation" },
              { title: "Recall Workflows", desc: "Patient recall and re-engagement" },
              { title: "Notifications", desc: "Smart alerts for every role" },
            ].map((a) => (
              <motion.div key={a.title} variants={fadeUp} transition={{ duration: 0.3 }} className="bg-white rounded-2xl dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
                <div className="w-9 h-9 rounded-xl bg-[#D946EF]/10 dark:bg-[#E879F9]/15 flex items-center justify-center mb-3">
                  <Zap className="h-4 w-4 text-[#D946EF] dark:text-[#E879F9]" strokeWidth={1.5} />
                </div>
                <h3 className="text-sm font-bold text-[#0F172A] dark:text-white mb-1">{a.title}</h3>
                <p className="text-xs text-gray-400 dark:text-gray-300">{a.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════ MULTI-HOSPITAL ═══════════════════ */}
      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
              <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-[#7C3AED] dark:text-[#A78BFA] mb-3">Multi-Hospital</motion.p>
              <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-[1.6rem] sm:text-[2rem] font-extrabold tracking-tight text-[#0F172A] dark:text-white mb-4">
                Manage Multiple Locations From One Dashboard
              </motion.h2>
              <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-gray-500 dark:text-gray-400 leading-relaxed">
                Group-level oversight across multiple hospital locations with centralized visibility, consolidated reporting, and role-based access control.
              </motion.p>
            </motion.div>
          </div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={stagger} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { title: "Group-Level Dashboard", desc: "Centralized visibility across all hospitals" },
              { title: "Consolidated Reporting", desc: "Combined analytics across locations" },
              { title: "Role-Based Access", desc: "Granular permissions per role and location" },
              { title: "Scalable Architecture", desc: "Add hospitals as your organization grows" },
            ].map((item) => (
              <motion.div key={item.title} variants={fadeUp} transition={{ duration: 0.3 }} className="bg-white rounded-2xl dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
                <div className="w-9 h-9 rounded-xl bg-[#7C3AED]/10 dark:bg-[#A78BFA]/15 flex items-center justify-center mb-3">
                  <Building2 className="h-4 w-4 text-[#7C3AED] dark:text-[#A78BFA]" strokeWidth={1.5} />
                </div>
                <h3 className="text-sm font-bold text-[#0F172A] dark:text-white mb-1">{item.title}</h3>
                <p className="text-xs text-gray-400 dark:text-gray-300">{item.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════ STANDALONE + GROUP ═══════════════════ */}
      <section id="organizations" className="py-20 sm:py-28 bg-gray-50/50 dark:bg-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
              <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-[#1E3A5F] dark:text-[#5B8DBF] mb-3">Organization Models</motion.p>
              <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-[1.6rem] sm:text-[2rem] font-extrabold tracking-tight text-[#0F172A] dark:text-white">
                From Single Clinics to Multi-Hospital Groups
              </motion.h2>
              <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="mt-5 text-[1.05rem] text-gray-500 dark:text-gray-400 leading-relaxed">
                Appointin supports both standalone clinics and multi-hospital organizations with the same platform — scale as you grow.
              </motion.p>
            </motion.div>
          </div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={stagger} className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <motion.div variants={fadeUp} transition={{ duration: 0.4 }} className="bg-white rounded-2xl dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#1E3A5F]/10 dark:bg-[#5B8DBF]/15 flex items-center justify-center">
                  <Building className="h-5 w-5 text-[#1E3A5F] dark:text-[#5B8DBF]" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#0F172A] dark:text-white">Standalone Clinic / Hospital</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-300">Single location</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="bg-gray-50 rounded-lg dark:bg-gray-700/50 px-3 py-2 text-center">
                  <p className="text-xs font-bold text-[#1E3A5F] dark:text-[#5B8DBF]">Hospital Admin</p>
                </div>
                <div className="flex justify-center"><ChevronDown className="h-4 w-4 text-gray-300 dark:text-gray-500" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 rounded-lg dark:bg-gray-700/50 px-3 py-2 text-center">
                    <p className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Doctors</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg dark:bg-gray-700/50 px-3 py-2 text-center">
                    <p className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Staff</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-300 mt-4 text-center">Manage the complete organization without a separate Group Admin.</p>
            </motion.div>

            <motion.div variants={fadeUp} transition={{ duration: 0.4 }} className="bg-white rounded-2xl dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/10 dark:bg-[#A78BFA]/15 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-[#7C3AED] dark:text-[#A78BFA]" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#0F172A] dark:text-white">Multi-Hospital Group</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-300">Multiple locations</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="bg-gray-50 rounded-lg dark:bg-gray-700/50 px-3 py-2 text-center">
                  <p className="text-xs font-bold text-[#7C3AED] dark:text-[#A78BFA]">Group Admin</p>
                </div>
                <div className="flex justify-center"><ChevronDown className="h-4 w-4 text-gray-300 dark:text-gray-500" /></div>
                <div className="grid grid-cols-3 gap-1.5">
                  {["Hospital A", "Hospital B", "Hospital C"].map((h) => (
                    <div key={h} className="bg-gray-50 rounded-lg dark:bg-gray-700/50 px-2 py-2 text-center">
                      <p className="text-[10px] font-medium text-gray-600 dark:text-gray-300">{h}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-center"><ChevronDown className="h-4 w-4 text-gray-300 dark:text-gray-500" /></div>
                <div className="grid grid-cols-3 gap-1.5">
                  {["Admins", "Doctors", "Staff"].map((r) => (
                    <div key={r} className="bg-gray-50 rounded-lg dark:bg-gray-700/50 px-2 py-1.5 text-center">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">{r}</p>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-300 mt-4 text-center">Centralized visibility across all locations from one dashboard.</p>
            </motion.div>
          </motion.div>
        </div>
      </section>
      {/* ═══════════════════ PATIENT MANAGEMENT ═══════════════════ */}
      <section id="features" className="py-20 sm:py-28 bg-gray-50/50 dark:bg-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
              <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-[#1E3A5F] dark:text-[#5B8DBF] mb-3">Patient Management</motion.p>
              <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-[1.6rem] sm:text-[2rem] font-extrabold tracking-tight text-[#0F172A] dark:text-white mb-4">
                Every Patient&rsquo;s Journey, Connected.
              </motion.h2>
              <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-[0.95rem] text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
                Centralized patient records that bring together history, cases, treatments, appointments, billing, medications, and follow-ups in one place.
              </motion.p>
              <motion.div variants={fadeUp} transition={{ duration: 0.4 }} className="space-y-2">
                {["                Complete medical and dental history", "Cases and treatment records", "Appointment and follow-up tracking", "Billing and payment history", "Medication and prescription records", "Clinical notes and progress"].map((item) => (
                  <div key={item} className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-[#059669] shrink-0" />
                    <span className="text-[0.95rem] text-gray-600 dark:text-gray-300">{item}</span>
                  </div>
                ))}
              </motion.div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="bg-white rounded-2xl dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100 dark:border-gray-700">
                <div className="w-10 h-10 rounded-full bg-[#1E3A5F] flex items-center justify-center text-white text-xs font-bold">PS</div>
                <div>
                  <p className="text-sm font-bold text-[#0F172A] dark:text-white">Sample Patient</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-300">Patient ID: P-2024-0001</p>
                </div>
                <div className="ml-auto text-[10px] font-medium bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">Active</div>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: "Cases", value: "—", color: "#0F766E" },
                  { label: "Treatments", value: "—", color: "#059669" },
                  { label: "Billing", value: "—", color: "#4F46E5" },
                ].map((s) => (
                  <div key={s.label} className="bg-gray-50 rounded-lg dark:bg-gray-700/50 p-2 text-center">
                    <p className="text-[10px] text-gray-400 dark:text-gray-300">{s.label}</p>
                    <p className="text-sm font-bold" style={{ color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                {["Cases linked to treatments", "Visit tracking and scheduling", "Complete treatment history"].map((item) => (
                  <div key={item} className="flex items-center gap-2 bg-gray-50 rounded-lg dark:bg-gray-700/50 px-3 py-2">
                    <Check className="h-3.5 w-3.5 text-[#0F766E] shrink-0" />
                    <span className="text-xs text-gray-600 dark:text-gray-300">{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ CRM & LEAD MANAGEMENT ═══════════════════ */}
      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="bg-white rounded-2xl dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 order-2 lg:order-1">
              <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">Lead Pipeline Overview</p>
              <div className="flex gap-2 mb-4">
                {["New", "Contacted", "Interested", "Converted"].map((s, i) => (
                  <div key={s} className={`flex-1 text-center py-1.5 rounded-lg text-[9px] font-medium ${i === 0 ? "bg-blue-50 text-blue-600" : i === 1 ? "bg-amber-50 text-amber-600" : i === 2 ? "bg-purple-50 text-purple-600" : "bg-emerald-50 text-emerald-600"}`}>
                    {s}
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {["Enquiry capture and assignment", "Follow-up scheduling and reminders", "Lead-to-patient conversion tracking"].map((item) => (
                  <div key={item} className="flex items-center gap-3 bg-gray-50 rounded-lg dark:bg-gray-700/50 px-3 py-2">
                    <Check className="h-3.5 w-3.5 text-[#F97316] shrink-0" />
                    <span className="text-xs text-gray-600 dark:text-gray-300">{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger} className="order-1 lg:order-2">
              <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-[#F97316] mb-3">CRM & Lead Management</motion.p>
              <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-[1.6rem] sm:text-[2rem] font-extrabold tracking-tight text-[#0F172A] dark:text-white mb-4">
                Turn Enquiries Into Patient Relationships
              </motion.h2>
              <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-[0.95rem] text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
                Capture enquiries, track lead status, manage follow-ups, and convert leads into patients — with the original lead history preserved as a converted record.
              </motion.p>
              <motion.div variants={fadeUp} transition={{ duration: 0.4 }} className="space-y-2">
                {["Enquiry capture and tracking", "Follow-up scheduling and automation", "Lead-to-patient conversion", "Converted lead history preserved", "Recall and re-engagement workflows", "Conversion insights and analytics"].map((item) => (
                  <div key={item} className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-[#F97316] shrink-0" />
                    <span className="text-[0.95rem] text-gray-600 dark:text-gray-300">{item}</span>
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ APPOINTMENTS ═══════════════════ */}
      <section className="py-20 sm:py-28 bg-gray-50/50 dark:bg-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
              <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-[#2563EB] mb-3">Appointments</motion.p>
              <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-[1.6rem] sm:text-[2rem] font-extrabold tracking-tight text-[#0F172A] dark:text-white mb-4">
                Scheduling Connected to the Clinical Journey
              </motion.h2>
              <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-[0.95rem] text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
                Intelligent scheduling with doctor availability, treatment-linked appointments, follow-ups, and calendar-based visibility for the entire team.
              </motion.p>
              <motion.div variants={fadeUp} transition={{ duration: 0.4 }} className="space-y-2">
                {["Doctor availability and scheduling", "Patient and treatment-linked appointments", "Follow-up and recall workflows", "Calendar-based visibility", "Automated appointment reminders"].map((item) => (
                  <div key={item} className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-[#2563EB] shrink-0" />
                    <span className="text-[0.95rem] text-gray-600 dark:text-gray-300">{item}</span>
                  </div>
                ))}
              </motion.div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="bg-white rounded-2xl dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Schedule View</p>
              </div>
              <div className="space-y-2">
                {[
                  { time: "09:00", label: "Consultation", type: "Appointment" },
                  { time: "09:30", label: "Follow-up Visit", type: "Treatment" },
                  { time: "10:00", label: "Crown Fitting", type: "Treatment" },
                  { time: "10:30", label: "Consultation", type: "Appointment" },
                ].map((a, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 px-3 py-2">
                    <div className="text-[10px] font-bold text-[#2563EB] w-10">{a.time}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 truncate">{a.label}</p>
                      <p className="text-[9px] text-gray-400 dark:text-gray-300">{a.type}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ CASES ═══════════════════ */}
      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
              <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-[#0F766E] mb-3">Cases</motion.p>
              <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-[1.6rem] sm:text-[2rem] font-extrabold tracking-tight text-[#0F172A] dark:text-white mb-4">
                From Case Creation to Treatment Completion
              </motion.h2>
              <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-gray-500 dark:text-gray-400 leading-relaxed">
                Complete clinical workflow — create cases, document findings, plan treatments, track visits, manage laboratory coordination, and record completion.
              </motion.p>
            </motion.div>
          </div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-0 max-w-3xl mx-auto mb-12">
            {["Patient", "Case", "Treatment", "Visits", "Completion"].map((step, i) => (
              <motion.div key={step} variants={fadeUp} transition={{ duration: 0.3 }} className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-white border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 shadow-sm">
                  <div className="w-6 h-6 rounded-full bg-[#0F766E] text-white text-[10px] font-bold flex items-center justify-center">{i + 1}</div>
                  <span className="text-xs font-bold text-[#0F172A] dark:text-white">{step}</span>
                </div>
                {i < 4 && <ChevronRight className="h-4 w-4 text-gray-300 shrink-0 hidden sm:block" />}
              </motion.div>
            ))}
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={stagger} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { title: "Case Management", items: ["Case creation and findings", "Tooth chart documentation", "Case reports and timeline"] },
              { title: "Treatment Planning", items: ["Treatment plan creation", "Doctor assignments", "Primary doctor tracking"] },
              { title: "Treatment Visits", items: ["Visit tracking and sittings", "Medication prescriptions", "Laboratory coordination"] },
            ].map((card) => (
              <motion.div key={card.title} variants={fadeUp} transition={{ duration: 0.3 }} className="bg-white rounded-2xl dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
                <h3 className="text-sm font-bold text-[#0F172A] dark:text-white mb-3">{card.title}</h3>
                <ul className="space-y-1.5">
                  {card.items.map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-[#0F766E] shrink-0" />
                      <span className="text-[0.9rem] text-gray-500 dark:text-gray-400">{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════ TREATMENTS ═══════════════════ */}
      <section className="py-20 sm:py-28 bg-gray-50/50 dark:bg-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="bg-white rounded-2xl dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 order-2 lg:order-1">
              <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">Treatment Tracking</p>
              <div className="space-y-2">
                {[
                  { label: "Treatment Plan A", visits: "3 of 5 completed" },
                  { label: "Treatment Plan B", visits: "1 of 2 completed" },
                  { label: "Treatment Plan C", visits: "All visits completed" },
                ].map((t, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg dark:bg-gray-700/50 px-3 py-2">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">{t.label}</span>
                    </div>
                    <p className="text-[9px] text-gray-400 dark:text-gray-300">{t.visits}</p>
                  </div>
                ))}
              </div>
            </motion.div>
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger} className="order-1 lg:order-2">
              <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-[#059669] mb-3">Treatments</motion.p>
              <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-[1.6rem] sm:text-[2rem] font-extrabold tracking-tight text-[#0F172A] dark:text-white mb-4">
                Plan, Track, and Complete Treatments
              </motion.h2>
              <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-[0.95rem] text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
                Create treatment plans, assign doctors, track individual visits and sittings, manage medications, and record treatment completion — all connected to the patient record.
              </motion.p>
              <motion.div variants={fadeUp} transition={{ duration: 0.4 }} className="space-y-2">
                {["Treatment plan creation and management", "Visit and sitting tracking", "Medication and prescription management", "Doctor assignment and tracking", "Treatment status visibility"].map((item) => (
                  <div key={item} className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-[#059669] shrink-0" />
                    <span className="text-[0.95rem] text-gray-600 dark:text-gray-300">{item}</span>
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ BILLING ═══════════════════ */}
      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
              <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-[#4F46E5] mb-3">Billing</motion.p>
              <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-[1.6rem] sm:text-[2rem] font-extrabold tracking-tight text-[#0F172A] dark:text-white mb-4">
                Billing Connected to Clinical Workflow
              </motion.h2>
              <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-[0.95rem] text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
                Patient-based and case/treatment-linked billing with professional invoices, payment tracking, and financial reports — always connected to the care delivered.
              </motion.p>
              <motion.div variants={fadeUp} transition={{ duration: 0.4 }} className="space-y-2">
                {["Patient-based and case-linked billing", "Professional invoice generation", "Payment tracking and receipts", "Treatment and case financial views", "Revenue reports and analytics"].map((item) => (
                  <div key={item} className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-[#4F46E5] shrink-0" />
                    <span className="text-[0.95rem] text-gray-600 dark:text-gray-300">{item}</span>
                  </div>
                ))}
              </motion.div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="bg-white rounded-2xl dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Sample Invoice</p>
                <span className="text-[10px] font-medium bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">Paid</span>
              </div>
              <div className="bg-gray-50 rounded-lg dark:bg-gray-700/50 p-3 mb-3">
                <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-300 mb-1"><span>Patient</span><span>—</span></div>
                <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-300 mb-1"><span>Case</span><span>—</span></div>
                <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-300"><span>Date</span><span>—</span></div>
              </div>
              <div className="space-y-1.5 mb-3">
                {["Line items linked to treatments", "Professional invoice format", "Payment status tracking"].map((item) => (
                  <div key={item} className="flex items-center gap-2 bg-gray-50 rounded dark:bg-gray-700/50 px-3 py-1.5">
                    <Check className="h-3 w-3 text-[#4F46E5] shrink-0" />
                    <span className="text-[11px] text-gray-600 dark:text-gray-300">{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ DOCTOR PERFORMANCE ═══════════════════ */}
      <section className="py-20 sm:py-28 bg-gray-50/50 dark:bg-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="bg-white rounded-2xl dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 order-2 lg:order-1">
              <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">Performance Visibility</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  { label: "OPDs", desc: "Checked" },
                  { label: "Treatments", desc: "Completed" },
                  { label: "Cases", desc: "Managed" },
                  { label: "Revenue", desc: "Generated" },
                ].map((m) => (
                  <div key={m.label} className="bg-gray-50 rounded-lg dark:bg-gray-700/50 p-2.5">
                    <p className="text-[9px] text-gray-400 dark:text-gray-300">{m.label}</p>
                    <p className="text-xs font-bold text-gray-600 dark:text-gray-300">{m.desc}</p>
                  </div>
                ))}
              </div>
              <div className="bg-gray-50 rounded-lg dark:bg-gray-700/50 p-3">
                <p className="text-[9px] font-bold text-gray-600 dark:text-gray-300 mb-2">Role-Based Views</p>
                <div className="space-y-1.5">
                  {[
                    { role: "Group Admin", scope: "All hospitals and doctors" },
                    { role: "Hospital Admin", scope: "Their hospital" },
                    { role: "Doctor", scope: "Their personal performance" },
                  ].map((r) => (
                    <div key={r.role} className="flex items-center gap-2">
                      <UserCheck className="h-3 w-3 text-[#7C3AED] shrink-0" />
                      <span className="text-[10px] text-gray-600 dark:text-gray-300"><strong>{r.role}</strong> — {r.scope}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger} className="order-1 lg:order-2">
              <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-[#7C3AED] mb-3">Doctor Performance</motion.p>
              <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-[1.6rem] sm:text-[2rem] font-extrabold tracking-tight text-[#0F172A] dark:text-white mb-4">
                Every Role Sees Insights Relevant to Them
              </motion.h2>
              <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-[0.95rem] text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
                Appointin uses operational data to generate performance insights — no extra data entry required. Each role sees what matters to their scope.
              </motion.p>
              <motion.div variants={fadeUp} transition={{ duration: 0.4 }} className="space-y-2">
                {["OPD, treatment, and case metrics per doctor", "Role-based performance dashboards", "Revenue and operational insights", "Comparative analytics across periods", "Data-driven decision making"].map((item) => (
                  <div key={item} className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-[#7C3AED] shrink-0" />
                    <span className="text-[0.95rem] text-gray-600 dark:text-gray-300">{item}</span>
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ INVENTORY ═══════════════════ */}
      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
              <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-[#D97706] mb-3">Inventory & Indent</motion.p>
              <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-[1.6rem] sm:text-[2rem] font-extrabold tracking-tight text-[#0F172A] dark:text-white mb-4">
                Simple Monthly Inventory Workflow
              </motion.h2>
              <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-[0.95rem] text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
                Hospital Admins submit monthly indents with required quantities and estimated costs. Group Admins see combined requirements across all hospitals for consolidated procurement.
              </motion.p>
              <motion.div variants={fadeUp} transition={{ duration: 0.4 }} className="space-y-3">
                <div className="bg-white rounded-xl dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
                  <p className="text-xs font-bold text-[#0F172A] dark:text-white mb-2">Hospital Admin</p>
                  <ul className="space-y-1">
                    {["Views default inventory list with remaining stock", "Enters required quantity and estimated cost", "Submits monthly indent"].map((item) => (
                      <li key={item} className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#D97706] shrink-0" /><span className="text-xs text-gray-500 dark:text-gray-400">{item}</span></li>
                    ))}
                  </ul>
                </div>
                <div className="bg-white rounded-xl dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
                  <p className="text-xs font-bold text-[#0F172A] dark:text-white mb-2">Group Admin</p>
                  <ul className="space-y-1">
                    {["Sees combined requirements from all hospitals", "Views hospital-wise remaining stock", "Prepares consolidated procurement information", "Exports monthly requirement data"].map((item) => (
                      <li key={item} className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#D97706] shrink-0" /><span className="text-xs text-gray-500 dark:text-gray-400">{item}</span></li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="bg-white rounded-2xl dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
              <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">Monthly Indent View</p>
              <div className="space-y-1.5">
                {["Default inventory items with stock levels", "Required quantity entry", "Estimated cost tracking", "Consolidated procurement view"].map((item, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg dark:bg-gray-700/50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Check className="h-3 w-3 text-[#D97706] shrink-0" />
                      <span className="text-[11px] text-gray-600 dark:text-gray-300">{item}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ LABORATORY ═══════════════════ */}
      <section className="py-20 sm:py-28 bg-gray-50/50 dark:bg-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="bg-white rounded-2xl dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 order-2 lg:order-1">
              <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">Pending Lab Items</p>
              <div className="space-y-2">
                {[
                  { label: "Lab items linked to treatments", sub: "Patient, tooth, and material tracking" },
                  { label: "Status visibility", sub: "Pending, Sent, Ready" },
                  { label: "Monthly lab cost reporting", sub: "Hospital and group-level views" },
                ].map((l, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg dark:bg-gray-700/50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Check className="h-3 w-3 text-[#0F766E] shrink-0" />
                      <div>
                        <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">{l.label}</span>
                        <p className="text-[9px] text-gray-400 dark:text-gray-300">{l.sub}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger} className="order-1 lg:order-2">
              <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-[#0F766E] mb-3">Laboratory</motion.p>
              <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-[1.6rem] sm:text-[2rem] font-extrabold tracking-tight text-[#0F172A] dark:text-white mb-4">
                Connect the Treatment Room With the Laboratory
              </motion.h2>
              <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-[0.95rem] text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
                Treatment workflows identify waiting laboratory items. Staff can see patient, treatment, tooth number, lab material, and status — and coordinate through WhatsApp where configured.
              </motion.p>
              <motion.div variants={fadeUp} transition={{ duration: 0.4 }} className="space-y-2">
                {["Lab items linked to treatments", "Patient, tooth, and material tracking", "Pickup or delivery coordination", "Monthly lab cost reporting", "Hospital and group-level visibility"].map((item) => (
                  <div key={item} className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-[#0F766E] shrink-0" />
                    <span className="text-[0.95rem] text-gray-600 dark:text-gray-300">{item}</span>
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ WHATSAPP & COMMUNICATION ═══════════════════ */}
      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
              <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-[#25D366] mb-3">WhatsApp & Communication</motion.p>
              <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-[1.6rem] sm:text-[2rem] font-extrabold tracking-tight text-[#0F172A] dark:text-white mb-4">
                Connect Communication Workflows
              </motion.h2>
              <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-gray-500 dark:text-gray-400 leading-relaxed">
                Patient communication, appointment reminders, follow-ups, laboratory coordination, and CRM messaging — through WhatsApp where the integration is configured.
              </motion.p>
            </motion.div>
          </div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={stagger} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { title: "Patient Communication", desc: "Reminders, confirmations, and follow-ups" },
              { title: "Appointment Messaging", desc: "Scheduling and change notifications" },
              { title: "Laboratory Coordination", desc: "Pickup and delivery communication" },
              { title: "CRM Follow-Ups", desc: "Lead engagement and re-engagement" },
            ].map((c) => (
              <motion.div key={c.title} variants={fadeUp} transition={{ duration: 0.3 }} className="bg-white rounded-2xl dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
                <div className="w-9 h-9 rounded-xl bg-[#25D366]/10 flex items-center justify-center mb-3">
                  <MessageSquare className="h-4 w-4 text-[#25D366]" strokeWidth={1.5} />
                </div>
                <h3 className="text-sm font-bold text-[#0F172A] dark:text-white mb-1">{c.title}</h3>
                <p className="text-xs text-gray-400 dark:text-gray-300">{c.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════ ANALYTICS & REPORTS ═══════════════════ */}
      <section className="py-20 sm:py-28 bg-[#0F172A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
              <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-[#0EA5E9] mb-3">Analytics & Reports</motion.p>
              <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-4">
                Turn Daily Operations Into Actionable Insights
              </motion.h2>
              <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-gray-400 dark:text-gray-300 leading-relaxed">
                Appointin converts operational data into insights across patients, leads, appointments, cases, treatments, doctors, billing, inventory, laboratory, and hospital performance.
              </motion.p>
            </motion.div>
          </div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={stagger} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {["Patients", "Leads", "Appointments", "Cases", "Treatments", "Doctors", "Billing", "Inventory", "Laboratory", "Performance"].map((item) => (
              <motion.div key={item} variants={fadeUp} transition={{ duration: 0.3 }} className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 px-4 py-3 text-center">
                <span className="text-xs font-medium text-gray-300">{item}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════ HOW IT WORKS ═══════════════════ */}
      <section id="how-it-works" className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
              <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-[#0F766E] mb-3">How It Works</motion.p>
              <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-[2rem] sm:text-[2.4rem] font-extrabold tracking-tight text-[#0F172A] dark:text-white">
                Up and Running in Minutes
              </motion.h2>
            </motion.div>
          </div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={stagger} className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6 max-w-5xl mx-auto">
            {howItWorks.map((s) => (
              <motion.div key={s.num} variants={fadeUp} transition={{ duration: 0.4 }} className="relative text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1E3A5F] to-[#163050] text-white text-sm font-extrabold mb-4 shadow-lg shadow-[#1E3A5F]/20">
                  {s.num}
                </div>
                <h3 className="text-sm font-bold text-[#0F172A] dark:text-white mb-1.5">{s.title}</h3>
                <p className="text-xs text-gray-400 dark:text-gray-300 leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════ PRICING ═══════════════════ */}
      <section id="pricing" className="py-20 sm:py-28 bg-gray-50/50 dark:bg-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
              <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-[#4F46E5] mb-3">Simple Pricing</motion.p>
              <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-[2rem] sm:text-[2.4rem] font-extrabold tracking-tight text-[#0F172A] dark:text-white">
                Transparent Plans for Every Practice
              </motion.h2>
              <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="mt-5 text-gray-500 dark:text-gray-400 leading-relaxed">
                No hidden fees. No long-term contracts. Start with a 30-day free trial and scale as you grow.
              </motion.p>
            </motion.div>
          </div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={stagger} className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-12">
            {/* Standalone Hospital */}
            <motion.div variants={fadeUp} transition={{ duration: 0.4 }} className="relative bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-700 p-8 hover:shadow-xl transition-all duration-300">
              <div className="mb-6">
                <div className="w-12 h-12 rounded-2xl bg-[#1E3A5F]/10 flex items-center justify-center mb-4">
                  <Building className="h-6 w-6 text-[#1E3A5F]" strokeWidth={1.5} />
                </div>
                <h3 className="text-lg font-bold text-[#0F172A] dark:text-white mb-1">Single Hospital</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Perfect for independent dental practices</p>
              </div>
              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-[2.5rem] font-extrabold text-[#0F172A] dark:text-white">₹2,999</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">/month</span>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-300 mt-2">Billed monthly. Cancel anytime.</p>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  "Unlimited patients & appointments",
                  "All core modules (CRM, Billing, Cases, Treatments)",
                  "Doctor performance analytics",
                  "WhatsApp integration",
                  "Inventory management",
                  "Role-based access control",
                  "Email & phone support",
                  "30-day free trial",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-[#0F766E] mt-0.5 shrink-0" strokeWidth={2.5} />
                    <span className="text-sm text-gray-600 dark:text-gray-300">{f}</span>
                  </li>
                ))}
              </ul>
              <a href="#demo" className="block w-full text-center bg-[#1E3A5F] hover:bg-[#163050] text-white font-semibold py-3 rounded-xl transition-all text-sm">
                Start Free Trial
              </a>
            </motion.div>

            {/* Group Plan */}
            <motion.div variants={fadeUp} transition={{ duration: 0.4 }} className="relative bg-white dark:bg-gray-900 rounded-3xl border-2 border-[#4F46E5] p-8 hover:shadow-xl transition-all duration-300">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] text-white text-[10px] font-bold uppercase tracking-wider px-4 py-1.5 rounded-full shadow-lg">
                  Most Popular
                </span>
              </div>
              <div className="mb-6">
                <div className="w-12 h-12 rounded-2xl bg-[#4F46E5]/10 flex items-center justify-center mb-4">
                  <Building2 className="h-6 w-6 text-[#4F46E5]" strokeWidth={1.5} />
                </div>
                <h3 className="text-lg font-bold text-[#0F172A] dark:text-white mb-1">Multi-Hospital Group</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">For dental chains and hospital networks</p>
              </div>
              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-[2.5rem] font-extrabold text-[#0F172A] dark:text-white">₹4,999</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">/month base</span>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-300 mt-2">First hospital included. +₹2,999/mo per additional hospital.</p>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  "Everything in Single Hospital, plus:",
                  "Multi-hospital management from one dashboard",
                  "Group-level analytics & reporting",
                  "Cross-hospital patient records",
                  "Centralized inventory & procurement",
                  "Dedicated group admin portal",
                  "Priority support & onboarding",
                  "Custom role configurations",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-[#4F46E5] mt-0.5 shrink-0" strokeWidth={2.5} />
                    <span className="text-sm text-gray-600 dark:text-gray-300">{f}</span>
                  </li>
                ))}
              </ul>
              <a href="#demo" className="block w-full text-center bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] hover:from-[#4338CA] hover:to-[#6D28D9] text-white font-semibold py-3 rounded-xl transition-all text-sm shadow-lg shadow-[#4F46E5]/25">
                Start Free Trial
              </a>
            </motion.div>
          </motion.div>

          {/* Pricing Calculator */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={stagger} className="max-w-2xl mx-auto mb-16">
            <motion.div variants={fadeUp} transition={{ duration: 0.4 }} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 sm:p-8">
              <h3 className="text-base font-bold text-[#0F172A] dark:text-white mb-4 text-center">Group Pricing Calculator</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-6">See your monthly cost based on the number of hospitals in your group.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { hospitals: 1, price: "₹2,999" },
                  { hospitals: 2, price: "₹7,998" },
                  { hospitals: 3, price: "₹10,997" },
                  { hospitals: 5, price: "₹16,995" },
                ].map((t) => (
                  <div key={t.hospitals} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-center border border-gray-100 dark:border-gray-700">
                    <p className="text-2xl font-extrabold text-[#0F172A] dark:text-white">{t.hospitals}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t.hospitals === 1 ? "Hospital" : "Hospitals"}</p>
                    <p className="text-sm font-bold text-[#4F46E5]">{t.price}<span className="text-[10px] text-gray-400">/mo</span></p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-300 text-center mt-4">Formula: ₹4,999 base + (N−1) × ₹2,999. First hospital included in base price.</p>
            </motion.div>
          </motion.div>

          {/* Trust Signals */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="grid sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {[
              { icon: Lock, title: "No Hidden Fees", desc: "What you see is what you pay. No setup fees or surprise charges." },
              { icon: Clock, title: "30-Day Free Trial", desc: "Full access to all features. No credit card required to start." },
              { icon: Globe, title: "Cancel Anytime", desc: "No long-term contracts. Upgrade, downgrade, or cancel with one click." },
            ].map((t) => (
              <motion.div key={t.title} variants={fadeUp} transition={{ duration: 0.3 }} className="text-center p-4">
                <div className="w-10 h-10 rounded-xl bg-[#4F46E5]/10 flex items-center justify-center mx-auto mb-3">
                  <t.icon className="h-5 w-5 text-[#4F46E5]" strokeWidth={1.5} />
                </div>
                <h4 className="text-sm font-bold text-[#0F172A] dark:text-white mb-1">{t.title}</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{t.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════ WHY APPOINTIN (Benefits Recap) ═══════════════════ */}
      <section className="py-20 sm:py-28 bg-[#0F172A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
              <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-[#A78BFA] mb-3">Why Appointin</motion.p>
              <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-[2rem] sm:text-[2.4rem] font-extrabold tracking-tight text-white">
                One Platform. Complete Dental Operations.
              </motion.h2>
              <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="mt-5 text-gray-400 dark:text-gray-300 leading-relaxed">
                Stop managing your dental practice across disconnected tools. Appointin brings everything together.
              </motion.p>
            </motion.div>
          </div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={stagger} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Layers, title: "One Platform", desc: "No more switching between spreadsheets, calendars, and billing tools." },
              { icon: GitBranch, title: "Connected Data", desc: "Every patient interaction links back to a single, complete record." },
              { icon: Clock, title: "Less Manual Work", desc: "Automation handles follow-ups, recalls, and routine tasks." },
              { icon: LineChart, title: "Better Visibility", desc: "Real-time dashboards for every role — from doctor to group admin." },
              { icon: Lock, title: "Role-Based Access", desc: "Everyone sees what they need — and only what they're authorized to." },
              { icon: Brain, title: "Scalable Architecture", desc: "From single clinics to multi-hospital groups, Appointin grows with you." },
            ].map((w) => (
              <motion.div key={w.title} variants={fadeUp} transition={{ duration: 0.3 }} className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-5 hover:bg-white/10 transition-all duration-300">
                <div className="w-9 h-9 rounded-xl bg-[#7C3AED]/20 flex items-center justify-center mb-3">
                  <w.icon className="h-4 w-4 text-[#A78BFA]" strokeWidth={1.5} />
                </div>
                <h3 className="text-sm font-bold text-white mb-1">{w.title}</h3>
                <p className="text-xs text-gray-400 dark:text-gray-300 leading-relaxed">{w.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════ BOOK A DEMO ═══════════════════ */}
      <section id="demo" className="py-20 sm:py-28 bg-gray-50/50 dark:bg-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
              <motion.p variants={fadeUp} transition={{ duration: 0.4 }} className="text-[0.8rem] font-bold tracking-[0.2em] uppercase text-[#1E3A5F] mb-3">Get Started</motion.p>
              <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-[2rem] sm:text-[2.4rem] font-extrabold tracking-tight text-[#0F172A] dark:text-white mb-4">
                See Appointin in Action
              </motion.h2>
              <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-gray-500 dark:text-gray-400 leading-relaxed">
                Tell us about your clinic or hospital and we&rsquo;ll show you how Appointin can fit your workflow.
              </motion.p>
            </motion.div>
          </div>
          <DemoForm />
        </div>
      </section>

      {/* ═══════════════════ FINAL CTA ═══════════════════ */}
      <section className="py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1E3A5F] via-[#163050] to-[#0F172A] p-10 sm:p-16 text-center">
            <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
            <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-[#4F46E5]/20 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-[#7C3AED]/20 blur-3xl" />
            <div className="relative z-10">
              <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-[2rem] sm:text-[2.4rem] font-extrabold tracking-tight text-white max-w-2xl mx-auto">
                Ready to Connect Your Dental Operations?
              </motion.h2>
              <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="mt-4 text-gray-300 max-w-lg mx-auto">
                Discover how Appointin can simplify your clinic or hospital&rsquo;s complete workflow.
              </motion.p>
              <motion.div variants={fadeUp} transition={{ duration: 0.5 }} className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                <a href="#demo" className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 hover:bg-gray-50 text-[#1E3A5F] font-semibold px-8 py-3.5 rounded-xl transition-all shadow-lg text-sm">
                  Book a Demo <ArrowRight className="h-4 w-4" />
                </a>
                <Link to="/login" className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-3.5 rounded-xl border border-white/20 transition-all text-sm">
                  Login
                </Link>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════ FOOTER ═══════════════════ */}
      <footer className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <Link to="/" className="flex items-center gap-2 mb-4">
                <img src={appointinLogo} alt="Appointin" className="h-12 w-auto object-contain" draggable={false} />
              </Link>
              <p className="text-xs text-gray-400 dark:text-gray-300 leading-relaxed">One intelligent platform connecting the complete dental journey.</p>
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#0F172A] dark:text-white uppercase tracking-wider mb-3">Platform</h4>
              <ul className="space-y-2">
                {["Features", "Pricing", "Demo", "Login"].map((l) => (
                  <li key={l}><a href={l === "Demo" ? "#demo" : l === "Login" ? "/login" : `#${l.toLowerCase()}`} className="text-xs text-gray-400 dark:text-gray-300 hover:text-[#1E3A5F] transition-colors">{l}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#0F172A] dark:text-white uppercase tracking-wider mb-3">Company</h4>
              <ul className="space-y-2">
                {["About", "Contact", "Careers", "Blog"].map((l) => (
                  <li key={l}><a href="#" className="text-xs text-gray-400 dark:text-gray-300 hover:text-[#1E3A5F] transition-colors">{l}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#0F172A] dark:text-white uppercase tracking-wider mb-3">Legal</h4>
              <ul className="space-y-2">
                {["Privacy Policy", "Terms of Service", "Security"].map((l) => (
                  <li key={l}><a href="#" className="text-xs text-gray-400 dark:text-gray-300 hover:text-[#1E3A5F] transition-colors">{l}</a></li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[11px] text-gray-400 dark:text-gray-300">&copy; 2026 Appointin. All rights reserved.</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-300">Dental Practice Management Platform</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
