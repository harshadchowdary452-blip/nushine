import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { motion } from "framer-motion"
import {
  Mail, Lock, Eye, EyeOff, LogIn, ShieldCheck, Activity, CalendarRange,
  Users, IndianRupee, MessageSquare, Building2, BarChart3, Sparkles,
  CheckCircle, Star, Quote,
} from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import { authApi } from "@/services/endpoints"
import { cn } from "@/lib/utils"

const features = [
  { icon: Users, label: "Patient Management", desc: "Complete patient lifecycle management" },
  { icon: CalendarRange, label: "Appointment Automation", desc: "Smart scheduling & reminders" },
  { icon: IndianRupee, label: "Revenue & Billing", desc: "End-to-end payment tracking" },
  { icon: MessageSquare, label: "CRM & Follow-Ups", desc: "Automated patient engagement" },
  { icon: Building2, label: "Multi-Clinic Management", desc: "Centralized multi-branch control" },
  { icon: BarChart3, label: "Advanced Analytics", desc: "Real-time business intelligence" },
]

const testimonials = [
  { text: "Reduced our administrative workload by 60%. The automation is incredible.", name: "Dr. Priya Sharma", role: "Dental Surgeon, Mumbai" },
  { text: "The CRM and follow-up system transformed how we engage with patients.", name: "Dr. Rajesh Kumar", role: "Clinic Owner, Delhi" },
]

const stats = [
  { value: "10,000+", label: "Patients" },
  { value: "500+", label: "Doctors" },
  { value: "50+", label: "Clinics" },
  { value: "99.9%", label: "Uptime" },
]

function CapsLockIndicator({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
      className="absolute right-10 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wider text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
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
    const handler = (e: KeyboardEvent) => { try { setCapsLock(e.getModifierState("CapsLock")) } catch {} }
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
    } catch (err: any) {
      if (err?.code === "ECONNABORTED" || err?.message?.includes("timeout")) {
        setError("Request timed out. The server may be busy — please try again.")
      } else {
        setError(err?.response?.data?.detail || "Invalid credentials. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      {/* LEFT PANEL - Premium Branding */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden bg-gradient-to-br from-[#4F46E5] via-[#7C3AED] to-[#A855F7]">
        {/* Floating shapes */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-20 -left-20 w-[400px] h-[400px] rounded-full bg-white/5 blur-[80px] animate-float" />
          <div className="absolute top-1/3 -right-20 w-[300px] h-[300px] rounded-full bg-purple-300/10 blur-[60px] animate-float-delayed" />
          <div className="absolute bottom-20 left-1/3 w-[200px] h-[200px] rounded-full bg-indigo-300/10 blur-[50px] animate-float" style={{ animationDelay: "2s" }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-white/5" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-white/5" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] rounded-full border border-white/10" />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          {/* Logo */}
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-lg">
                <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
                  <path d="M24 10c-3 0-5.5 2-6.5 5.5C16.5 18 16 22 16 26s.5 7 1.5 8.5c.8 1.2 2 2 3.5 2.5.8.2 1.5.6 2 1.2l1 1.3c.5.7 1.5.7 2 0l1-1.3c.5-.6 1.2-1 2-1.2 1.5-.5 2.7-1.3 3.5-2.5 1-1.5 1.5-4.5 1.5-8.5s-.5-8-1.5-10.5C29.5 12 27 10 24 10z" fill="#4F46E5" />
                  <path d="M22 18l-3 6h3l-1 6 5-7h-3l3-5h-4z" fill="white" />
                </svg>
              </div>
              <div>
                <h1 className="text-[28px] font-bold text-white leading-none tracking-tight">NUSHINE</h1>
                <p className="text-indigo-200/80 text-xs font-medium tracking-widest uppercase -mt-0.5">Dental</p>
              </div>
            </div>
          </motion.div>

          {/* Hero Content */}
          <div className="flex-1 flex flex-col justify-center py-8">
            <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }}
              className="text-[32px] font-bold text-white leading-tight max-w-lg">
              Enterprise Dental Practice<br />Management Platform
            </motion.h2>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-3 text-sm text-indigo-200/70 max-w-md leading-relaxed">
              Streamline operations, enhance patient care, and grow your practice with our all-in-one healthcare SaaS platform.
            </motion.p>

            {/* Feature Grid */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.25 }}
              className="mt-8 grid grid-cols-2 gap-2.5">
              {features.map((f) => (
                <div key={f.label} className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-indigo-200">
                    <f.icon className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">{f.label}</p>
                    <p className="text-[10px] text-indigo-200/50 mt-0.5">{f.desc}</p>
                  </div>
                </div>
              ))}
            </motion.div>

            {/* Testimonial */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <Quote className="h-5 w-5 text-indigo-300/50 mb-2" />
              <p className="text-sm text-indigo-100 leading-relaxed italic">"{testimonials[0].text}"</p>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-300/20 text-[10px] font-bold text-white">PS</div>
                <div>
                  <p className="text-xs font-medium text-white">{testimonials[0].name}</p>
                  <p className="text-[10px] text-indigo-200/50">{testimonials[0].role}</p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Bottom Stats */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.5 }}
            className="flex items-center justify-between border-t border-white/10 pt-4">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-base font-bold text-white">{s.value}</p>
                <p className="text-[10px] text-indigo-200/50 uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* RIGHT PANEL - Login Form */}
      <div className="flex w-full items-center justify-center lg:w-[55%] bg-[#F8FAFC] p-6 sm:p-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="w-full max-w-[420px]">
          {/* Mobile Logo */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8 flex lg:hidden justify-center">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
                <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
                  <path d="M24 10c-3 0-5.5 2-6.5 5.5C16.5 18 16 22 16 26s.5 7 1.5 8.5c.8 1.2 2 2 3.5 2.5.8.2 1.5.6 2 1.2l1 1.3c.5.7 1.5.7 2 0l1-1.3c.5-.6 1.2-1 2-1.2 1.5-.5 2.7-1.3 3.5-2.5 1-1.5 1.5-4.5 1.5-8.5s-.5-8-1.5-10.5C29.5 12 27 10 24 10z" fill="white" />
                </svg>
              </div>
              <span className="text-lg font-bold text-gray-900">NUSHINE</span>
            </div>
          </motion.div>

          {/* Login Card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <div className="mb-6">
              <h1 className="text-page-title text-gray-900">Welcome back</h1>
              <p className="text-sm text-text-secondary mt-1">Sign in to your account to continue.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-gray-700">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                  <input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    autoComplete="email"
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 hover:border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-gray-700">Password</label>
                  <button type="button" className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors">
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-10 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 hover:border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                  />
                  <CapsLockIndicator active={capsLock} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <div className="flex items-center">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500/20" />
                  Remember me
                </label>
              </div>

              {/* Error */}
              {error && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-600 border border-red-100">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  {error}
                </motion.div>
              )}

              {/* Submit */}
              {loading ? (
                <button disabled aria-label="Signing in"
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow-sm cursor-not-allowed">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                  Signing In...
                </button>
              ) : (
                <motion.button type="submit" whileHover={{ scale: 1.005 }} whileTap={{ scale: 0.995 }}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow-sm transition-all hover:bg-indigo-700 active:shadow-none">
                  <LogIn className="h-4 w-4" />
                  Sign In
                </motion.button>
              )}
            </form>

            <div className="mt-6 text-center">
              <p className="text-xs text-text-muted flex items-center justify-center gap-1.5">
                <ShieldCheck className="h-3 w-3" />
                Protected by enterprise-grade security
              </p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
