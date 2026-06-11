import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { motion } from "framer-motion"
import { Eye, EyeOff, LogIn, Shield, Sparkles, Stethoscope, Activity, Droplets, Zap, Heart, Smile } from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import { authApi } from "@/services/endpoints"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Logo from "@/components/ui/logo"

const floatingIcons = [
  { Icon: Smile, x: "15%", y: "18%", delay: 0, size: 28, opacity: 0.12 },
  { Icon: Stethoscope, x: "80%", y: "25%", delay: 0.5, size: 24, opacity: 0.08 },
  { Icon: Activity, x: "70%", y: "70%", delay: 1, size: 20, opacity: 0.07 },
  { Icon: Shield, x: "25%", y: "75%", delay: 1.5, size: 32, opacity: 0.06 },
  { Icon: Droplets, x: "85%", y: "55%", delay: 2, size: 22, opacity: 0.09 },
  { Icon: Sparkles, x: "10%", y: "45%", delay: 0.8, size: 18, opacity: 0.10 },
]

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string })?.from || "/"

  useEffect(() => { setMounted(true) }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await authApi.login({ email, password })
      setAuth(res.user, res.access_token, res.refresh_token)
      navigate(from, { replace: true })
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Invalid credentials")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}
        className="hidden lg:flex lg:w-[55%] relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0F172A 0%, #0F4C81 40%, #00B8D9 100%)" }}>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_50%,rgba(14,165,164,0.2),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,rgba(255,255,255,0.08),transparent_50%)]" />
        <div className="absolute top-1/4 -left-20 h-96 w-96 rounded-full bg-white/3 blur-3xl" />
        <div className="absolute bottom-1/4 -right-20 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />

        {floatingIcons.map(({ Icon, x, y, delay, size, opacity }, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity, y: [0, -15, 0], x: [0, 10, 0] }}
            transition={{ duration: 6, delay, repeat: Infinity, ease: "easeInOut" }}
            className="absolute pointer-events-none"
            style={{ left: x, top: y }}
          >
            <Icon size={size} className="text-white" />
          </motion.div>
        ))}
        <div className="absolute right-10 bottom-10 opacity-[0.04] pointer-events-none">
          <svg width="280" height="280" viewBox="0 0 100 100" fill="white" xmlns="http://www.w3.org/2000/svg">
            <path d="M50 10C38 10 28 18 25 30C22 42 20 55 22 65C24 72 28 78 34 82C38 85 42 88 46 92C48 95 49 98 50 100C51 98 52 95 54 92C58 88 62 85 66 82C72 78 76 72 78 65C80 55 78 42 75 30C72 18 62 10 50 10Z"/>
          </svg>
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none">
          <svg width="400" height="400" viewBox="0 0 100 100" fill="none" stroke="white" strokeWidth="1.5" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="40"/>
            <circle cx="50" cy="50" r="28"/>
            <circle cx="50" cy="50" r="16"/>
            <line x1="50" y1="10" x2="50" y2="90"/>
            <line x1="10" y1="50" x2="90" y2="50"/>
            <line x1="21.7" y1="21.7" x2="78.3" y2="78.3"/>
            <line x1="21.7" y1="78.3" x2="78.3" y2="21.7"/>
          </svg>
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 lg:p-16 w-full">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <Logo variant="white" showTagline size="lg" />
          </motion.div>

          <div className="max-w-lg mx-auto w-full">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 text-white/80 text-xs font-medium mb-8">
                <Sparkles className="h-3.5 w-3.5" />
                Trusted by 500+ dental practices across India
              </div>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.4 }}
              className="text-4xl lg:text-5xl font-bold text-white leading-tight"
            >
              Transform your dental<br />
              <span className="text-primary">practice management</span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.5 }}
              className="mt-4 text-lg text-white/60 max-w-md"
            >
              Streamline operations, enhance patient care, and drive growth with India's most advanced dental practice platform.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.6 }}
              className="mt-10 grid grid-cols-3 gap-6"
            >
              {[
                { label: "Practices", value: "500+" },
                { label: "Patients", value: "50K+" },
                { label: "Cities", value: "100+" },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                  <p className="text-xs text-white/50 mt-1">{stat.label}</p>
                </div>
              ))}
            </motion.div>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="text-sm text-white/30 text-center"
          >
            &copy; 2026 NuShine Dental. All rights reserved.
          </motion.p>
        </div>
      </motion.div>

      <div className="flex w-full items-center justify-center lg:w-[45%] bg-gradient-to-br from-slate-50 via-white to-teal-50/30 p-6 sm:p-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="w-full max-w-sm"
        >
          <div className="mb-10 flex lg:hidden justify-center">
            <Logo />
          </div>

          <div className="rounded-2xl border border-white/40 bg-white/70 backdrop-blur-xl p-8 shadow-xl shadow-teal-500/5">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="mb-8 text-center lg:text-left"
          >
            <h1 className="text-2xl font-bold text-gray-900">Welcome to NuShine Dental</h1>
            <p className="mt-1.5 text-sm text-gray-500">Sign in to manage your dental practice</p>
          </motion.div>

          <motion.form
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="Enter your email" value={email}
                onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button type="button" className="text-xs text-primary hover:text-primary-hover transition-colors font-medium">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} placeholder="Enter your password"
                  value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.p initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-danger-soft px-4 py-2.5 text-sm text-danger border border-danger/10">
                {error}
              </motion.p>
            )}

            <Button type="submit" disabled={loading} className="w-full h-11 text-base">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Signing in...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <LogIn className="h-4 w-4" /> Sign in
                </span>
              )}
            </Button>
          </motion.form>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
