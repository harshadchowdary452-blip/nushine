export default function ProductMockup() {
  return (
    <div className="relative w-full max-w-5xl mx-auto">
      <div className="absolute -inset-4 bg-gradient-to-b from-[#1E3A5F]/10 to-transparent rounded-3xl blur-2xl dark:from-[#1E3A5F]/5" />
      <div className="relative bg-white dark:bg-[#111827] rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl shadow-[#1E3A5F]/10 overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-[#1F2937] border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <div className="w-3 h-3 rounded-full bg-emerald-400" />
          </div>
          <div className="flex-1 mx-4">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md px-4 py-1 text-[11px] text-gray-500 dark:text-gray-400 max-w-xs mx-auto text-center truncate">
              app.appointin.com/hospital-admin
            </div>
          </div>
        </div>

        <div className="flex min-h-[420px] sm:min-h-[500px]">
          {/* Sidebar */}
          <div className="hidden sm:flex flex-col w-52 bg-[#1F2937] p-4 gap-1 shrink-0">
            <div className="flex items-center gap-2.5 px-2 py-2 mb-4">
              <div className="w-6 h-6 rounded bg-[#1E3A5F] flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 56 56" fill="none"><path d="M28 14c-4.5 0-7.8 2.6-9 6.8-1 3.4-1.5 7.6-1.5 11.2s.5 7 1.4 8.8c.7 1.4 1.8 2.4 3.2 2.9 1.1.4 2.1 1 2.8 1.7l.7.8c.6.7 1.7.7 2.3 0l.7-.8c.7-.7 1.7-1.3 2.8-1.7 1.4-.5 2.5-1.5 3.2-2.9.9-1.8 1.4-5.2 1.4-8.8s-.5-7.8-1.5-11.2C35.8 16.6 32.5 14 28 14z" fill="white" opacity="0.96" /></svg>
              </div>
              <span className="text-[11px] font-bold text-white tracking-wide">APPOINTIN</span>
            </div>
            {["Dashboard", "Patients", "Appointments", "Cases", "Treatments", "Billing", "CRM", "Laboratory", "Inventory", "Reports"].map((item, i) => (
              <div key={item} className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[11px] ${i === 0 ? "bg-blue-600 text-white font-medium" : "text-gray-400 hover:bg-white/5"}`}>
                <div className={`w-3.5 h-3.5 rounded ${i === 0 ? "bg-blue-400" : "bg-gray-600"}`} />
                {item}
              </div>
            ))}
          </div>

          {/* Main content */}
          <div className="flex-1 bg-[#F8FAFC] dark:bg-[#0F172A] p-4 sm:p-5 space-y-4">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-bold text-[#0F172A] dark:text-white">Hospital Dashboard</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">Wednesday, August 17, 2026</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="px-3 py-1.5 bg-[#1E3A5F] text-white text-[10px] sm:text-[11px] font-medium rounded-md">+ New Patient</div>
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#1E3A5F] to-[#4F46E5]" />
              </div>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { label: "Today's OPDs", value: "24", color: "#1E3A5F" },
                { label: "Appointments", value: "18", color: "#2563EB" },
                { label: "Revenue", value: "₹2.4L", color: "#059669" },
                { label: "Pending", value: "7", color: "#D97706" },
              ].map((s) => (
                <div key={s.label} className="bg-white dark:bg-[#1E293B] rounded-lg border border-gray-100 dark:border-gray-700 p-3">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">{s.label}</p>
                  <p className="text-base sm:text-lg font-bold mt-0.5" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Content grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Upcoming appointments */}
              <div className="sm:col-span-2 bg-white dark:bg-[#1E293B] rounded-lg border border-gray-100 dark:border-gray-700 p-3">
                <p className="text-[11px] font-bold text-[#0F172A] dark:text-white mb-2.5">Upcoming Appointments</p>
                <div className="space-y-2">
                  {[
                    { time: "10:00", name: "Priya Sharma", type: "Follow-up", status: "Confirmed" },
                    { time: "10:30", name: "Raj Patel", type: "RCT - Tooth 36", status: "Scheduled" },
                    { time: "11:00", name: "Anita Desai", type: "Crown Fitting", status: "Confirmed" },
                    { time: "11:30", name: "Vikram Singh", type: "Consultation", status: "Pending" },
                  ].map((a, i) => (
                    <div key={i} className="flex items-center gap-2.5 py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
                      <div className="text-[10px] sm:text-[11px] font-bold text-[#1E3A5F] dark:text-[#5B8DBF] w-9">{a.time}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-[#0F172A] dark:text-white truncate">{a.name}</p>
                        <p className="text-[9px] text-gray-400 dark:text-gray-500 truncate">{a.type}</p>
                      </div>
                      <div className={`text-[8px] sm:text-[9px] font-medium px-2 py-0.5 rounded-full ${a.status === "Confirmed" ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" : a.status === "Pending" ? "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" : "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"}`}>
                        {a.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent activity */}
              <div className="bg-white dark:bg-[#1E293B] rounded-lg border border-gray-100 dark:border-gray-700 p-3">
                <p className="text-[11px] font-bold text-[#0F172A] dark:text-white mb-2.5">Recent Activity</p>
                <div className="space-y-2.5">
                  {[
                    { text: "New patient registered", time: "2m ago", dot: "bg-blue-500" },
                    { text: "Billing #1247 paid", time: "15m ago", dot: "bg-emerald-500" },
                    { text: "Case report uploaded", time: "1h ago", dot: "bg-purple-500" },
                    { text: "Lab result received", time: "2h ago", dot: "bg-amber-500" },
                    { text: "Appointment confirmed", time: "3h ago", dot: "bg-gray-400" },
                  ].map((a, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className={`w-2 h-2 rounded-full mt-1 ${a.dot} shrink-0`} />
                      <div>
                        <p className="text-[10px] text-[#0F172A] dark:text-gray-200 leading-tight">{a.text}</p>
                        <p className="text-[9px] text-gray-400 dark:text-gray-500">{a.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
