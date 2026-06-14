import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Eye, EyeOff, Mail, Lock, Users, CalendarRange, IndianRupee, MessageSquare, Building2, BarChart3, LogIn, Sparkles, ShieldCheck, Activity } from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import { authApi } from "@/services/endpoints"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Logo from "@/components/ui/logo"
import { cn } from "@/lib/utils"

const features = [
  { icon: Users, label: "Patient Management", desc: "Complete patient lifecycle management" },
  { icon: CalendarRange, label: "Appointment Automation", desc: "Smart scheduling & reminders" },
  { icon: IndianRupee, label: "Revenue & Billing", desc: "End-to-end payment tracking" },
  { icon: MessageSquare, label: "CRM & Follow-Ups", desc: "Automated patient engagement" },
  { icon: Building2, label: "Multi-Clinic Management", desc: "Centralized multi-branch control" },
  { icon: BarChart3, label: "Advanced Analytics", desc: "Real-time business intelligence" },
]

const stats = [
  { value: "10,000+", label: "Patients Managed" },
  { value: "500+", label: "Doctors" },
  { value: "50+", label: "Clinics" },
  { value: "99.9%", label: "Uptime" },
]

function CapsLockIndicator({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
      className="absolute right-10 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wider text-warning bg-warning-soft px-1.5 py-0.5 rounded">
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
  const [mounted, setMounted] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string })?.from || "/"

  useEffect(() => { setMounted(true) }, [])

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
      setError(err?.response?.data?.detail || "Invalid credentials. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-bg dark:bg-[#0F172A]">
      {/* LEFT PANEL - Brand Experience */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="hidden lg:flex lg:w-[40%] relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)" }}
      >
        {/* Subtle floating gradient shapes */}
        <div className="absolute inset-0">
          <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-[120px]" />
          <div className="absolute -bottom-40 -right-40 h-[400px] w-[400px] rounded-full bg-indigo-500/10 blur-[100px]" />
          <div className="absolute top-1/3 left-1/2 h-[300px] w-[300px] rounded-full bg-sky-500/8 blur-[80px]" />
        </div>

        {/* Grid overlay for premium texture */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="flex items-center gap-3">
              <svg width="44" height="44" viewBox="0 0 48 48" fill="none">
                <rect width="48" height="48" rx="12" fill="white" />
                <path d="M24 10c-3 0-5.5 2-6.5 5.5C16.5 18 16 22 16 26s.5 7 1.5 8.5c.8 1.2 2 2 3.5 2.5.8.2 1.5.6 2 1.2l1 1.3c.5.7 1.5.7 2 0l1-1.3c.5-.6 1.2-1 2-1.2 1.5-.5 2.7-1.3 3.5-2.5 1-1.5 1.5-4.5 1.5-8.5s-.5-8-1.5-10.5C29.5 12 27 10 24 10z" fill="#1E3A8A" opacity="0.95" />
                <path d="M22 18l-3 6h3l-1 6 5-7h-3l3-5h-4z" fill="white" opacity="0.9" />
              </svg>
              <div>
                <h1 className="text-[42px] font-bold text-white leading-none tracking-tight" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  NUSHINE
                </h1>
                <p className="text-blue-200/70 text-sm font-medium tracking-widest uppercase -mt-1">Dental</p>
              </div>
            </div>
          </motion.div>

          {/* Content area */}
          <div className="flex-1 flex flex-col justify-center py-12">
            {/* Tagline */}
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-2xl font-semibold text-white leading-tight max-w-md"
            >
              Transforming Dental Care Through Intelligent Practice Management
            </motion.h2>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-4 text-sm text-blue-200/60 max-w-md leading-relaxed"
            >
              Manage Patients, Appointments, Cases, Treatments, Billing, CRM, Follow-Ups and Analytics from one unified platform.
            </motion.p>

            {/* Feature highlight cards */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="mt-8 grid grid-cols-2 gap-3"
            >
              {features.map((f) => (
                <motion.div
                  key={f.label}
                  whileHover={{ scale: 1.02, y: -1 }}
                  className="group flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3 transition-all duration-300 hover:border-white/20 hover:bg-white/10 hover:shadow-[0_0_20px_rgba(59,130,246,0.15)]"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary-light">
                    <f.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">{f.label}</p>
                    <p className="text-[10px] text-blue-200/50 mt-0.5">{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Platform stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mt-8 flex gap-8"
            >
              {stats.map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-lg font-bold text-white">{s.value}</p>
                  <p className="text-[10px] text-blue-200/50 mt-0.5 uppercase tracking-wider">{s.label}</p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Footer */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.7 }}
            className="text-xs text-blue-200/30 text-center"
          >
            &copy; 2026 NuShine Dental. Enterprise Healthcare Platform.
          </motion.p>
        </div>
      </motion.div>

      {/* RIGHT PANEL - Login */}
      <div className="flex w-full items-center justify-center lg:w-[60%] bg-bg dark:bg-[#0F172A] p-6 sm:p-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="w-full max-w-[480px]"
        >
          {/* Mobile logo */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="mb-8 flex lg:hidden justify-center"
          >
            <Logo size="lg" />
          </motion.div>

          {/* Login card */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-[24px] border border-border bg-card p-10 shadow-[0_2px_40px_-12px_rgba(0,0,0,0.12)] dark:border-[#1E293B] dark:bg-[#1E293B] dark:shadow-[0_2px_40px_-12px_rgba(0,0,0,0.4)]"
          >
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25 }}
              className="mb-8"
            >
              <h1 className="text-[32px] font-bold text-text-primary dark:text-[#F8FAFC] leading-tight">
                Welcome Back
              </h1>
              <p className="mt-2 text-sm text-text-secondary dark:text-[#94A3B8]">
                Sign in to continue managing your dental practice.
              </p>
            </motion.div>

            {/* Form */}
            <motion.form
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              {/* Email field */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium text-text-primary dark:text-[#F8FAFC]">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className={cn(
                    "absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200",
                    emailFocused ? "text-primary" : "text-text-muted dark:text-[#64748B]"
                  )} />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                    required
                    autoFocus
                    autoComplete="email"
                    className="h-[52px] w-full rounded-[14px] border-border bg-card pl-11 pr-4 text-sm text-text-primary shadow-sm transition-all duration-200 placeholder:text-text-muted hover:border-gray-300 focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15 dark:border-[#334155] dark:bg-[#1E293B] dark:text-[#F8FAFC] dark:placeholder:text-[#64748B] dark:hover:border-[#475569] dark:focus:border-primary dark:focus:ring-primary/20"
                  />
                </div>
              </div>

              {/* Password field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium text-text-primary dark:text-[#F8FAFC]">
                    Password
                  </Label>
                  <button type="button" className="text-xs font-medium text-primary hover:text-primary-hover dark:text-primary dark:hover:text-primary-hover transition-colors">
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className={cn(
                    "absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200",
                    passwordFocused ? "text-primary" : "text-text-muted dark:text-[#64748B]"
                  )} />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    required
                    autoComplete="current-password"
                    className="h-[52px] w-full rounded-[14px] border-border bg-card pl-11 pr-12 text-sm text-text-primary shadow-sm transition-all duration-200 placeholder:text-text-muted hover:border-gray-300 focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15 dark:border-[#334155] dark:bg-[#1E293B] dark:text-[#F8FAFC] dark:placeholder:text-[#64748B] dark:hover:border-[#475569] dark:focus:border-primary dark:focus:ring-primary/20"
                  />
                  <CapsLockIndicator active={capsLock} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary dark:text-[#64748B] dark:hover:text-[#94A3B8] transition-colors">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <div className="flex items-center">
                <label className="flex items-center gap-2.5 text-sm text-text-secondary dark:text-[#94A3B8] cursor-pointer select-none">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="peer sr-only"
                    />
                    <div className={cn(
                      "h-5 w-5 rounded-md border-2 transition-all duration-200",
                      remember
                        ? "border-primary bg-primary"
                        : "border-border bg-transparent dark:border-[#475569]",
                      "peer-focus-visible:ring-2 peer-focus-visible:ring-primary/30 peer-focus-visible:ring-offset-1"
                    )}>
                      {remember && (
                        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full p-0.5">
                          <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </div>
                  Remember me
                </label>
              </div>

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 rounded-[14px] bg-danger-soft dark:bg-red-950/30 px-4 py-3 text-sm text-danger dark:text-red-400 border border-danger/10 dark:border-red-900/30"
                >
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  {error}
                </motion.div>
              )}

              {/* Submit button */}
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.button
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    disabled
                    className="relative h-[54px] w-full rounded-[14px] bg-gradient-to-r from-primary to-secondary text-white font-semibold text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-primary/25 cursor-not-allowed overflow-hidden"
                  >
                    <span className="h-[18px] w-[18px] animate-spin rounded-full border-[2.5px] border-white border-t-transparent" />
                    Signing In...
                  </motion.button>
                ) : (
                  <motion.button
                    key="submit"
                    type="submit"
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    className="relative h-[54px] w-full rounded-[14px] bg-gradient-to-r from-primary to-secondary text-white font-semibold text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-primary/25 transition-all duration-300 hover:shadow-xl hover:shadow-primary/30 hover:from-primary-hover hover:to-secondary-hover active:shadow-md"
                  >
                    <LogIn className="h-[18px] w-[18px]" />
                    Sign In
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.form>

            {/* Footer text */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.5 }}
              className="mt-8 text-center text-xs text-text-muted dark:text-[#64748B]"
            >
              Protected by enterprise-grade security &bull; HIPAA compliant
            </motion.p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}