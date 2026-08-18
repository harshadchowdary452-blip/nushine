import { useState } from "react"
import { motion } from "framer-motion"
import { Send, CheckCircle2, ArrowRight } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import api from "@/services/api"
import { getApiErrorMessage } from "@/lib/api-errors"

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
    mode: "onBlur",
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
    } catch (err: unknown) {
      setSubmitError(getApiErrorMessage(err))
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

  const inputClass = "w-full px-3 py-2.5 bg-gray-50 border rounded-xl text-sm text-[#0F172A] placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-all"
  const labelClass = "block text-xs font-semibold text-gray-600 mb-1"
  const errorClass = "text-[10px] text-red-500 mt-0.5"

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8 max-w-2xl mx-auto">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="demo-full_name" className={labelClass}>Full Name *</label>
          <input
            id="demo-full_name"
            {...register("full_name")}
            autoComplete="name"
            aria-invalid={!!errors.full_name}
            aria-describedby={errors.full_name ? "demo-full_name-error" : undefined}
            className={`${inputClass} ${errors.full_name ? "border-red-300 focus:ring-red-200 focus:border-red-400" : "border-gray-200 focus:border-[#1E3A5F]"}`}
            placeholder="Dr. John Smith"
          />
          {errors.full_name && <p id="demo-full_name-error" className={errorClass} role="alert">{errors.full_name.message}</p>}
        </div>
        <div>
          <label htmlFor="demo-organization" className={labelClass}>Organization / Hospital *</label>
          <input
            id="demo-organization"
            {...register("organization")}
            autoComplete="organization"
            aria-invalid={!!errors.organization}
            aria-describedby={errors.organization ? "demo-organization-error" : undefined}
            className={`${inputClass} ${errors.organization ? "border-red-300 focus:ring-red-200 focus:border-red-400" : "border-gray-200 focus:border-[#1E3A5F]"}`}
            placeholder="SmileCare Dental"
          />
          {errors.organization && <p id="demo-organization-error" className={errorClass} role="alert">{errors.organization.message}</p>}
        </div>
        <div>
          <label htmlFor="demo-email" className={labelClass}>Work Email *</label>
          <input
            id="demo-email"
            {...register("email")}
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "demo-email-error" : undefined}
            className={`${inputClass} ${errors.email ? "border-red-300 focus:ring-red-200 focus:border-red-400" : "border-gray-200 focus:border-[#1E3A5F]"}`}
            placeholder="john@smilecare.com"
          />
          {errors.email && <p id="demo-email-error" className={errorClass} role="alert">{errors.email.message}</p>}
        </div>
        <div>
          <label htmlFor="demo-phone" className={labelClass}>Phone</label>
          <input
            id="demo-phone"
            {...register("phone")}
            type="tel"
            autoComplete="tel"
            className={`${inputClass} border-gray-200 focus:border-[#1E3A5F]`}
            placeholder="+91 98765 43210"
          />
        </div>
        <div>
          <label htmlFor="demo-role" className={labelClass}>Your Role</label>
          <select
            id="demo-role"
            {...register("role")}
            className={`${inputClass} border-gray-200 focus:border-[#1E3A5F]`}
          >
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
          <label htmlFor="demo-num_hospitals" className={labelClass}>Number of Hospitals</label>
          <select
            id="demo-num_hospitals"
            {...register("num_hospitals")}
            className={`${inputClass} border-gray-200 focus:border-[#1E3A5F]`}
          >
            <option value="">Select</option>
            <option>1 (Single Clinic)</option>
            <option>2-5</option>
            <option>6-10</option>
            <option>10+</option>
          </select>
        </div>
        <div>
          <label htmlFor="demo-num_doctors" className={labelClass}>Number of Doctors</label>
          <select
            id="demo-num_doctors"
            {...register("num_doctors")}
            className={`${inputClass} border-gray-200 focus:border-[#1E3A5F]`}
          >
            <option value="">Select</option>
            <option>1-5</option>
            <option>6-15</option>
            <option>16-30</option>
            <option>30+</option>
          </select>
        </div>
        <div>
          <label htmlFor="demo-preferred_date" className={labelClass}>Preferred Demo Date</label>
          <input
            id="demo-preferred_date"
            {...register("preferred_date")}
            type="date"
            className={`${inputClass} border-gray-200 focus:border-[#1E3A5F]`}
          />
        </div>
        <div>
          <label htmlFor="demo-preferred_time" className={labelClass}>Preferred Demo Time</label>
          <select
            id="demo-preferred_time"
            {...register("preferred_time")}
            className={`${inputClass} border-gray-200 focus:border-[#1E3A5F]`}
          >
            <option value="">Select time</option>
            <option>Morning (9 AM - 12 PM)</option>
            <option>Afternoon (12 PM - 3 PM)</option>
            <option>Evening (3 PM - 6 PM)</option>
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="demo-message" className={labelClass}>Requirements / Message</label>
        <textarea
          id="demo-message"
          {...register("message")}
          rows={3}
          className={`${inputClass} resize-none border-gray-200 focus:border-[#1E3A5F]`}
          placeholder="Tell us about your clinic or hospital and what you're looking for..."
        />
      </div>

      {submitError && (
        <div className="mt-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3" role="alert">
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
