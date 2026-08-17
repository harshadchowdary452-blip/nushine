import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Send, CheckCircle2, ArrowRight } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import api from "@/services/api"

const schema = z.object({
  full_name: z.string().min(1, "Name is required").max(255),
  organization: z.string().min(1, "Organization name is required").max(255),
  email: z.string().email("Please enter a valid email"),
  phone: z.string().max(50).optional().or(z.literal("")),
  role: z.string().max(100).optional().or(z.literal("")),
  num_hospitals: z.string().max(50).optional().or(z.literal("")),
  num_doctors: z.string().max(50).optional().or(z.literal("")),
  message: z.string().optional().or(z.literal("")),
  preferred_date: z.string().optional().or(z.literal("")),
  preferred_time: z.string().optional().or(z.literal("")),
})

type FormData = z.infer<typeof schema>

export default function DemoForm() {
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setSubmitting(true)
    setSubmitError("")
    try {
      await api.post("/public/demo-requests", {
        ...data,
        phone: data.phone || undefined,
        role: data.role || undefined,
        num_hospitals: data.num_hospitals || undefined,
        num_doctors: data.num_doctors || undefined,
        message: data.message || undefined,
        preferred_date: data.preferred_date || undefined,
        preferred_time: data.preferred_time || undefined,
      })
      setSubmitted(true)
    } catch {
      setSubmitError("Something went wrong. Please try again or email us directly.")
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl border border-gray-100 p-10 text-center max-w-lg mx-auto"
      >
        <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 className="h-7 w-7 text-emerald-500" />
        </div>
        <h3 className="text-xl font-bold text-[#0F172A] mb-2">Demo Request Received</h3>
        <p className="text-sm text-gray-500 leading-relaxed">
          Thank you for your interest in Appointin. Our team will reach out to you within 24 hours to schedule your personalized demo.
        </p>
      </motion.div>
    )
  }

  const inputClass = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-[#0F172A] placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F] transition-all"
  const labelClass = "block text-xs font-semibold text-gray-600 mb-1"
  const errorClass = "text-[10px] text-red-500 mt-0.5"

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8 max-w-2xl mx-auto">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Full Name *</label>
          <input {...register("full_name")} className={inputClass} placeholder="Dr. John Smith" />
          {errors.full_name && <p className={errorClass}>{errors.full_name.message}</p>}
        </div>
        <div>
          <label className={labelClass}>Organization / Hospital *</label>
          <input {...register("organization")} className={inputClass} placeholder="SmileCare Dental" />
          {errors.organization && <p className={errorClass}>{errors.organization.message}</p>}
        </div>
        <div>
          <label className={labelClass}>Work Email *</label>
          <input {...register("email")} type="email" className={inputClass} placeholder="john@smilecare.com" />
          {errors.email && <p className={errorClass}>{errors.email.message}</p>}
        </div>
        <div>
          <label className={labelClass}>Phone</label>
          <input {...register("phone")} className={inputClass} placeholder="+91 98765 43210" />
        </div>
        <div>
          <label className={labelClass}>Your Role</label>
          <select {...register("role")} className={inputClass}>
            <option value="">Select role</option>
            <option>Hospital Admin</option>
            <option>Group Admin</option>
            <option>Doctor</option>
            <option>Practice Manager</option>
            <option>IT Administrator</option>
            <option>Other</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Number of Hospitals</label>
          <select {...register("num_hospitals")} className={inputClass}>
            <option value="">Select</option>
            <option>1 (Single Clinic)</option>
            <option>2-5</option>
            <option>6-10</option>
            <option>10+</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Number of Doctors</label>
          <select {...register("num_doctors")} className={inputClass}>
            <option value="">Select</option>
            <option>1-5</option>
            <option>6-15</option>
            <option>16-30</option>
            <option>30+</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Preferred Demo Date</label>
          <input {...register("preferred_date")} type="date" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Preferred Demo Time</label>
          <select {...register("preferred_time")} className={inputClass}>
            <option value="">Select time</option>
            <option>Morning (9 AM - 12 PM)</option>
            <option>Afternoon (12 PM - 3 PM)</option>
            <option>Evening (3 PM - 6 PM)</option>
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label className={labelClass}>Requirements / Message</label>
        <textarea {...register("message")} rows={3} className={inputClass + " resize-none"} placeholder="Tell us about your clinic or hospital and what you're looking for..." />
      </div>

      {submitError && (
        <div className="mt-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <p className="text-xs text-red-600">{submitError}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#1E3A5F] to-[#163050] hover:from-[#163050] hover:to-[#0F172A] text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-[#1E3A5F]/20 disabled:opacity-50 text-sm"
      >
        {submitting ? (
          <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <>
            Book My Demo <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  )
}
