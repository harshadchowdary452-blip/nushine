import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { motion } from "framer-motion"
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck,
  Users, CalendarDays, Receipt, BarChart3,
} from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import { authApi } from "@/services/endpoints"
import { ToothLogo, BrandText } from "@/components/ui/brand-logo"

const features = [
  { icon: Users, title: "Patient Management", desc: "Centralized and secure patient records." },
  { icon: CalendarDays, title: "Smart Appointments", desc: "Manage appointments and reminders easily." },
  { icon: Receipt, title: "Billing & Invoices", desc: "Accurate billing with professional invoices." },
  { icon: BarChart3, title: "Insights & Reports", desc: "Track performance and grow your practice." },
]

function CapsLockIndicator({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="absolute right-12 top-1/2 -translate-y-1/2 text-[9px] font-semibold uppercase tracking-wider text-amber-600 bg-amber-50 px-1 py-0.5 rounded"
    >
      Caps
    </motion.span>
  )
}

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string })?.from || "/"

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      try { setCapsLock(e.getModifierState("CapsLock")) } catch { /* caps lock detection not supported */ }
    }
    document.addEventListener("keydown", handler)
    document.addEventListener("keyup", handler)
    return () => {
      document.removeEventListener("keydown", handler)
      document.removeEventListener("keyup", handler)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await authApi.login({ email, password })
      setAuth(res.user, res.access_token, res.refresh_token)
      navigate(from, { replace: true })
    } catch (err: unknown) {
      const apiErr = err as { code?: string; message?: string; response?: { data?: { detail?: string } } } | undefined
      if (apiErr?.code === "ECONNABORTED" || apiErr?.message?.includes("timeout")) {
        setError("Request timed out. The server may be busy — please try again.")
      } else {
        setError(apiErr?.response?.data?.detail || "Invalid credentials. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] font-['Poppins','Inter',sans-serif]">
      {/* LEFT PANEL */}
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden bg-gradient-to-br from-[#071B4D] to-[#0B1D3A]">
        {/* Gradient orbs */}
        <div className="absolute inset-0">
          <div className="absolute -top-24 -right-24 w-[600px] h-[600px] rounded-full bg-[#2563EB] opacity-20 blur-[140px]" />
          <div className="absolute bottom-0 -left-24 w-[500px] h-[500px] rounded-full bg-[#16D3C5] opacity-12 blur-[120px]" />
          <div className="absolute top-[30%] left-[30%] w-[350px] h-[350px] rounded-full bg-[#7C3AED] opacity-8 blur-[100px]" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
            }}
          />
        </div>

        {/* Floating shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[15%] -left-12 w-80 h-80 rounded-full border border-white/[0.07]" />
          <div className="absolute top-[50%] -right-8 w-60 h-60 rounded-full border border-white/[0.05]" />
          <div className="absolute bottom-[25%] left-[20%] w-44 h-44 rounded-full border border-white/[0.04]" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col w-full px-10 xl:px-14 pt-7 pb-5">
          {/* Brand header */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-2.5">
              <motion.div
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <ToothLogo size={27} />
              </motion.div>
              <div>
                <h1 className="text-[18px] font-bold leading-none tracking-tight text-white">
                  <span className="text-[#16D3C5]">Nu</span>Shine
                </h1>
                <p className="text-[9px] text-[#94A3B8] font-medium tracking-[0.25em] uppercase mt-0.5">
                  Dental Management System
                </p>
              </div>
            </div>
          </motion.div>

          {/* Hero */}
          <div className="flex-1 flex flex-col justify-center">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-[30px] leading-[1.15] font-extrabold text-white tracking-[-0.02em]"
            >
              Smarter Dental Care.
              <br />
              <span className="bg-gradient-to-r from-[#16D3C5] via-[#2563EB] to-[#7C3AED] bg-clip-text text-transparent">
                Stronger Practice.
              </span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.18 }}
              className="mt-4 text-[11px] text-[#CBD5E1] max-w-[480px] leading-relaxed"
            >
              NuShine helps dental clinics manage patients, appointments, treatments, billing, CRM, reports and operations in one intelligent platform.
            </motion.p>

            {/* Feature cards */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="mt-10 grid grid-cols-2 gap-3"
            >
              {features.map((f) => (
                <div
                  key={f.title}
                  className="group rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-xl transition-all duration-300 hover:bg-white/[0.08] hover:border-white/[0.18]"
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-[#16D3C5]/20 to-[#2563EB]/20 mb-2">
                    <f.icon className="w-[14px] h-[14px] text-[#16D3C5]" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-xs font-semibold text-white mb-0.5">{f.title}</h3>
                  <p className="text-[10px] text-white/45 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Bottom wave */}
          <div className="mt-6">
            <svg className="w-full h-auto" viewBox="0 0 560 32" fill="none" preserveAspectRatio="none" aria-hidden="true">
              <path
                d="M0 24c40-5 80-5 120 0s80 10 120 5 80-10 120-5 80 10 120 5 80-5 80-5v8H0V24z"
                fill="url(#wave-grad-login)"
                opacity="0.1"
              />
              <defs>
                <linearGradient id="wave-grad-login" x1="0" y1="0" x2="560" y2="0">
                  <stop offset="0%" stopColor="#16D3C5" />
                  <stop offset="50%" stopColor="#2563EB" />
                  <stop offset="100%" stopColor="#7C3AED" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE */}
      <div className="flex w-full md:w-1/2 items-center justify-center bg-[#F8FAFC] p-4 sm:p-5 lg:p-6 relative overflow-hidden">
        {/* Subtle decor */}
        <div className="absolute top-0 right-0 w-[450px] h-[450px] rounded-full bg-[#2563EB] opacity-[0.03] blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-[#16D3C5] opacity-[0.03] blur-[100px]" />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-[400px] relative z-10"
        >
          {/* Mobile / Tablet Logo */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6 flex md:hidden flex-col items-center gap-2"
          >
            <ToothLogo size={22} />
            <div className="text-center">
              <h1 className="text-base font-bold tracking-tight">
                <BrandText size="sm" />
              </h1>
              <p className="text-[9px] text-[#94A3B8] font-medium tracking-[0.25em] uppercase mt-0.5">
                Dental Management System
              </p>
            </div>
          </motion.div>

          {/* Login Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="rounded-[20px] border border-gray-200/80 bg-white p-6 sm:p-8 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08),0_2px_8px_-2px_rgba(0,0,0,0.03)]"
          >
            {/* Card header */}
            <div className="flex flex-col items-center text-center mb-5">
              <div className="mb-2">
                <ToothLogo size={22} />
              </div>
              <h2 className="text-base font-bold tracking-tight">
                <BrandText size="sm" />
              </h2>
              <p className="text-[9px] text-[#94A3B8] font-medium tracking-[0.25em] uppercase mt-0.5">
                Dental Management System
              </p>
              <div className="mt-3">
                <h3 className="text-base font-bold text-[#0B1D3A] tracking-tight">Welcome Back!</h3>
                <p className="text-xs text-[#64748B] mt-1">Sign in to access your NuShine account</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Email */}
              <div className="space-y-1">
                <label htmlFor="email" className="text-[11px] font-medium text-[#475569]">
                  Email Address
                </label>
                <div className="relative group">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94A3B8] group-focus-within:text-[#2563EB] transition-colors duration-200" strokeWidth={1.5} />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    autoComplete="email"
                    aria-label="Email address"
                    className="h-10 w-full rounded-[10px] border border-gray-200 bg-[#F8FAFC] pl-9 pr-3.5 text-xs text-[#0B1D3A] outline-none transition-all duration-200 placeholder:text-[#94A3B8] hover:border-gray-300 focus:border-[#2563EB] focus:bg-white focus:ring-3 focus:ring-[#2563EB]/10"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-[11px] font-medium text-[#475569]">
                    Password
                  </label>
                  <button
                    type="button"
                    aria-label="Forgot password"
                    title="Forgot password"
                    className="text-[11px] font-medium text-[#16D3C5] transition-all duration-200 hover:text-[#2563EB]"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94A3B8] group-focus-within:text-[#2563EB] transition-colors duration-200" strokeWidth={1.5} />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    aria-label="Password"
                    className="h-10 w-full rounded-[10px] border border-gray-200 bg-[#F8FAFC] pl-9 pr-11 text-xs text-[#0B1D3A] outline-none transition-all duration-200 placeholder:text-[#94A3B8] hover:border-gray-300 focus:border-[#2563EB] focus:bg-white focus:ring-3 focus:ring-[#2563EB]/10"
                  />
                  <CapsLockIndicator active={capsLock} />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#475569] transition-colors duration-200"
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" strokeWidth={1.5} /> : <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <div className="flex items-center">
                <label className="flex items-center gap-2 text-xs text-[#64748B] cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-[#2563EB] focus:ring-[#2563EB]/20 transition-all"
                  />
                  <span className="group-hover:text-[#0B1D3A] transition-colors">Remember me</span>
                </label>
              </div>

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 rounded-[10px] bg-red-50 px-3 py-2 text-xs text-red-600 border border-red-100"
                >
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                  {error}
                </motion.div>
              )}

              {/* Submit */}
              {loading ? (
                <button
                  disabled
                  aria-label="Signing in"
                  className="relative flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-gradient-to-r from-[#16D3C5] via-[#2563EB] to-[#7C3AED] text-white text-xs font-semibold shadow-md shadow-[#2563EB]/25 cursor-not-allowed overflow-hidden"
                >
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                  Signing In...
                </button>
              ) : (
                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  aria-label="Sign in"
                  title="Sign in to your account"
                  className="relative flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-gradient-to-r from-[#16D3C5] via-[#2563EB] to-[#7C3AED] text-white text-xs font-semibold shadow-md shadow-[#2563EB]/25 transition-all duration-300 hover:shadow-lg hover:shadow-[#2563EB]/30 overflow-hidden group"
                >
                  <span className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-all duration-300" />
                  <span className="relative flex items-center gap-1.5">
                    Sign In
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" strokeWidth={2} />
                  </span>
                </motion.button>
              )}
            </form>

            {/* Security */}
            <div className="mt-5 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-center gap-2 text-center">
                <ShieldCheck className="h-3.5 w-3.5 text-[#16D3C5]" strokeWidth={1.5} />
                <p className="text-[11px] text-[#94A3B8]">
                  Secure. Reliable. Trusted by dental professionals.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
