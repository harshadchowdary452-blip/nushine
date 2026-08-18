import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { motion } from "framer-motion"
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck,
  Users, CalendarDays, Receipt, BarChart3,
} from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import { authApi } from "@/services/endpoints"
import { WordmarkLogo } from "@/components/ui/brand-logo"
import { useFormValidation } from "@/hooks/use-form-validation"
import { getApiErrorMessage } from "@/lib/api-errors"

const features = [
  { icon: Users, title: "Patient Management", desc: "Centralized and secure patient records." },
  { icon: CalendarDays, title: "Smart Appointments", desc: "Manage appointments and reminders easily." },
  { icon: Receipt, title: "Billing & Invoices", desc: "Accurate billing with professional invoices." },
  { icon: BarChart3, title: "Insights & Reports", desc: "Track performance and grow your practice." },
]

type LoginFormValues = {
  email: string
  password: string
}

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

  const validate = (values: LoginFormValues) => {
    const errs: Record<string, string> = {}
    if (!values.email.trim()) {
      errs.email = "Email is required"
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      errs.email = "Please enter a valid email address"
    }
    if (!values.password) {
      errs.password = "Password is required"
    } else if (values.password.length < 6) {
      errs.password = "Password must be at least 6 characters"
    }
    return errs
  }

  const { getError, handleBlur, validateAll, firstErrorRef } =
    useFormValidation<LoginFormValues>({ validate })

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

    const values: LoginFormValues = { email, password }
    if (!validateAll(values)) {
      const firstField = firstErrorRef.current
      if (firstField) {
        document.getElementById(`login-${firstField}`)?.focus()
      }
      return
    }

    setLoading(true)
    try {
      const res = await authApi.login({ email, password })
      setAuth(res.user, res.access_token, res.refresh_token)
      navigate(from, { replace: true })
    } catch (err: unknown) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const emailError = getError("email")
  const passwordError = getError("password")

  return (
    <div className="flex min-h-screen bg-[var(--ds-background)] font-['Poppins','Inter',sans-serif]">
      {/* LEFT PANEL */}
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden bg-gradient-to-br from-[var(--ds-sidebar-bg)] to-[var(--ds-primary-950)]">
        {/* Gradient orbs */}
        <div className="absolute inset-0">
          <div className="absolute -top-24 -right-24 w-[600px] h-[600px] rounded-full bg-[var(--ds-primary-600)] opacity-20 blur-[140px]" />
          <div className="absolute bottom-0 -left-24 w-[500px] h-[500px] rounded-full bg-[var(--ds-primary-400)] opacity-12 blur-[120px]" />
          <div className="absolute top-[30%] left-[30%] w-[350px] h-[350px] rounded-full bg-[var(--ds-plum-500)] opacity-8 blur-[100px]" />
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
          {/* Hero */}
          <div className="flex-1 flex flex-col items-center justify-center">
            {/* Feature cards */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35 }}
              className="w-full grid grid-cols-2 gap-3"
            >
              {features.map((f) => (
                <div
                  key={f.title}
                  className="group rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-xl transition-all duration-300 hover:bg-[var(--ds-surface)]/[0.08] hover:border-white/[0.18]"
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--ds-primary-300)]/20 to-[var(--ds-primary-400)]/20 mb-2">
                    <f.icon className="w-[14px] h-[14px] text-[var(--ds-primary-300)]" strokeWidth={1.5} />
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
                  <stop offset="0%" style={{ stopColor: "var(--ds-primary-400)" }} />
                  <stop offset="50%" style={{ stopColor: "var(--ds-primary-600)" }} />
                  <stop offset="100%" style={{ stopColor: "var(--ds-accent-500)" }} />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE */}
      <div className="flex w-full md:w-1/2 items-center justify-center bg-[var(--ds-background)] p-4 sm:p-5 lg:p-6 relative overflow-hidden">
        {/* Subtle decor */}
        <div className="absolute top-0 right-0 w-[450px] h-[450px] rounded-full bg-[var(--ds-primary-600)] opacity-[0.03] blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-[var(--ds-primary-400)] opacity-[0.03] blur-[100px]" />

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
            <WordmarkLogo height={22} />
          </motion.div>

          {/* Login Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="rounded-[20px] border border-[var(--ds-border)]/80 bg-[var(--ds-surface)] p-6 sm:p-8 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08),0_2px_8px_-2px_rgba(0,0,0,0.03)]"
          >
            {/* Card header */}
            <div className="flex flex-col items-center text-center mb-5">
              <div className="mb-2">
                <WordmarkLogo height={22} />
              </div>
              <div className="mt-3">
                <h3 className="text-base font-bold text-[var(--ds-text)] tracking-tight">Welcome Back!</h3>
                <p className="text-xs text-[var(--ds-text-secondary)] mt-1">Sign in to access your Appointin account</p>
              </div>
            </div>

            <form noValidate onSubmit={handleSubmit} className="space-y-3">
              {/* Email */}
              <div className="space-y-1">
                <label htmlFor="login-email" className="text-[11px] font-medium text-[var(--ds-text-secondary)]">
                  Email Address
                </label>
                <div className="relative group">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ds-text-placeholder)] group-focus-within:text-[var(--ds-primary)] transition-colors duration-200" strokeWidth={1.5} />
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => handleBlur("email", email, { email, password })}
                    required
                    autoFocus
                    autoComplete="email"
                    aria-invalid={!!emailError}
                    aria-describedby={emailError ? "login-email-error" : undefined}
                    className="h-10 w-full rounded-[10px] border-[var(--ds-input-border)] bg-[var(--ds-background-subtle)] pl-9 pr-3.5 text-xs text-[var(--ds-input-text)] outline-none transition-all duration-200 placeholder:text-[var(--ds-input-placeholder)] hover:border-[var(--ds-input-border-hover)] focus:border-[var(--ds-primary)] focus:bg-[var(--ds-surface)] focus:ring-3 focus:ring-[var(--ds-primary)]/10"
                  />
                </div>
                {emailError && (
                  <p id="login-email-error" className="text-[10px] text-red-500 mt-0.5" role="alert">
                    {emailError}
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="login-password" className="text-[11px] font-medium text-[var(--ds-text-secondary)]">
                    Password
                  </label>
                  <button
                    type="button"
                    aria-label="Forgot password"
                    title="Forgot password"
                    className="text-[11px] font-medium text-[var(--ds-primary)] transition-all duration-200 hover:text-[var(--ds-primary-hover)]"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ds-text-placeholder)] group-focus-within:text-[var(--ds-primary)] transition-colors duration-200" strokeWidth={1.5} />
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => handleBlur("password", password, { email, password })}
                    required
                    autoComplete="current-password"
                    aria-invalid={!!passwordError}
                    aria-describedby={passwordError ? "login-password-error" : undefined}
                    className="h-10 w-full rounded-[10px] border-[var(--ds-input-border)] bg-[var(--ds-background-subtle)] pl-9 pr-11 text-xs text-[var(--ds-input-text)] outline-none transition-all duration-200 placeholder:text-[var(--ds-input-placeholder)] hover:border-[var(--ds-input-border-hover)] focus:border-[var(--ds-primary)] focus:bg-[var(--ds-surface)] focus:ring-3 focus:ring-[var(--ds-primary)]/10"
                  />
                  <CapsLockIndicator active={capsLock} />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--ds-text-placeholder)] hover:text-[var(--ds-text-secondary)] transition-colors duration-200"
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" strokeWidth={1.5} /> : <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />}
                  </button>
                </div>
                {passwordError && (
                  <p id="login-password-error" className="text-[10px] text-red-500 mt-0.5" role="alert">
                    {passwordError}
                  </p>
                )}
              </div>

              {/* Remember me */}
              <div className="flex items-center">
                <label className="flex items-center gap-2 text-xs text-[var(--ds-text-secondary)] cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-[var(--ds-border-strong)] text-[var(--ds-primary)] focus:ring-[var(--ds-primary)]/20 transition-all"
                  />
                  <span className="group-hover:text-[var(--ds-text)] transition-colors">Remember me</span>
                </label>
              </div>

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 rounded-[10px] bg-red-50 px-3 py-2 text-xs text-red-600 border border-red-100"
                  role="alert"
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
                  className="relative flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-gradient-to-r from-[var(--ds-primary)] via-[var(--ds-primary-600)] to-[var(--ds-primary-800)] text-white text-xs font-semibold shadow-md shadow-[var(--ds-primary)]/25 cursor-not-allowed overflow-hidden"
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
                  className="relative flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-gradient-to-r from-[var(--ds-primary)] via-[var(--ds-primary-600)] to-[var(--ds-primary-800)] text-white text-xs font-semibold shadow-md shadow-[var(--ds-primary)]/25 transition-all duration-300 hover:shadow-lg hover:shadow-[var(--ds-primary)]/30 overflow-hidden group"
                >
                  <span className="absolute inset-0 bg-white/0 group-hover:bg-[var(--ds-surface)]/10 transition-all duration-300" />
                  <span className="relative flex items-center gap-1.5">
                    Sign In
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" strokeWidth={2} />
                  </span>
                </motion.button>
              )}
            </form>

            {/* Security */}
            <div className="mt-5 pt-4 border-t border-[var(--ds-border-light)]">
              <div className="flex items-center justify-center gap-2 text-center">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--ds-primary)]" strokeWidth={1.5} />
                <p className="text-[11px] text-[var(--ds-text-placeholder)]">
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
