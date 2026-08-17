export default function ProductMockup() {
  return (
    <div className="relative w-full max-w-5xl mx-auto">
      <div className="absolute -inset-4 bg-gradient-to-b from-[#1E3A5F]/10 to-transparent rounded-3xl blur-2xl" />
      <div className="relative bg-white rounded-2xl border border-gray-200 shadow-2xl shadow-[#1E3A5F]/10 overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          </div>
          <div className="flex-1 mx-4">
            <div className="bg-white border border-gray-200 rounded-md px-3 py-0.5 text-[10px] text-gray-400 max-w-xs mx-auto text-center truncate">
              app.appointin.com/hospital-admin
            </div>
          </div>
        </div>

        <div className="flex min-h-[340px] sm:min-h-[420px]">
          {/* Sidebar */}
          <div className="hidden sm:flex flex-col w-44 bg-[#1F2937] p-3 gap-0.5 shrink-0">
            <div className="flex items-center gap-2 px-2 py-1.5 mb-3">
              <div className="w-5 h-5 rounded bg-[#1E3A5F] flex items-center justify-center">
                <svg width="10" height="10" viewBox="0 0 56 56" fill="none"><path d="M28 14c-4.5 0-7.8 2.6-9 6.8-1 3.4-1.5 7.6-1.5 11.2s.5 7 1.4 8.8c.7 1.4 1.8 2.4 3.2 2.9 1.1.4 2.1 1 2.8 1.7l.7.8c.6.7 1.7.7 2.3 0l.7-.8c.7-.7 1.7-1.3 2.8-1.7 1.4-.5 2.5-1.5 3.2-2.9.9-1.8 1.4-5.2 1.4-8.8s-.5-7.8-1.5-11.2C35.8 16.6 32.5 14 28 14z" fill="white" opacity="0.96" /></svg>
              </div>
              <span className="text-[10px] font-bold text-white tracking-wide">APPOINTIN</span>
            </div>
            {["Dashboard", "Patients", "Appointments", "Cases", "Treatments", "Billing", "CRM", "Laboratory", "Inventory", "Reports"].map((item, i) => (
              <div key={item} className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[10px] ${i === 0 ? "bg-blue-600 text-white font-medium" : "text-gray-400 hover:bg-white/5"}`}>
                <div className={`w-3 h-3 rounded ${i === 0 ? "bg-blue-400" : "bg-gray-600"}`} />
                {item}
              </div>
            ))}
          </div>

          {/* Main content */}
          <div className="flex-1 bg-[#F8FAFC] p-3 sm:p-4 space-y-3">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-[#0F172A] sm:text-xs">Hospital Dashboard</p>
                <p className="text-[9px] text-gray-400">Wednesday, August 17, 2026</p>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="px-2 py-1 bg-[#1E3A5F] text-white text-[8px] sm:text-[9px] font-medium rounded-md">+ New Patient</div>
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#1E3A5F] to-[#4F46E5]" />
              </div>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Today's OPDs", value: "24", color: "#1E3A5F" },
                { label: "Appointments", value: "18", color: "#2563EB" },
                { label: "Revenue", value: "₹2.4L", color: "#059669" },
                { label: "Pending", value: "7", color: "#D97706" },
              ].map((s) => (
                <div key={s.label} className="bg-white rounded-lg border border-gray-100 p-2 sm:p-2.5">
                  <p className="text-[8px] sm:text-[9px] text-gray-400">{s.label}</p>
                  <p className="text-sm sm:text-base font-bold" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Content grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Upcoming appointments */}
              <div className="sm:col-span-2 bg-white rounded-lg border border-gray-100 p-2.5">
                <p className="text-[9px] font-bold text-[#0F172A] mb-2">Upcoming Appointments</p>
                <div className="space-y-1.5">
                  {[
                    { time: "10:00", name: "Priya Sharma", type: "Follow-up", status: "Confirmed" },
                    { time: "10:30", name: "Raj Patel", type: "RCT - Tooth 36", status: "Scheduled" },
                    { time: "11:00", name: "Anita Desai", type: "Crown Fitting", status: "Confirmed" },
                    { time: "11:30", name: "Vikram Singh", type: "Consultation", status: "Pending" },
                  ].map((a, i) => (
                    <div key={i} className="flex items-center gap-2 py-1 border-b border-gray-50 last:border-0">
                      <div className="text-[8px] sm:text-[9px] font-bold text-[#1E3A5F] w-8">{a.time}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-medium text-[#0F172A] truncate">{a.name}</p>
                        <p className="text-[8px] text-gray-400 truncate">{a.type}</p>
                      </div>
                      <div className={`text-[7px] sm:text-[8px] font-medium px-1.5 py-0.5 rounded-full ${a.status === "Confirmed" ? "bg-emerald-50 text-emerald-600" : a.status === "Pending" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}>
                        {a.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent activity */}
              <div className="bg-white rounded-lg border border-gray-100 p-2.5">
                <p className="text-[9px] font-bold text-[#0F172A] mb-2">Recent Activity</p>
                <div className="space-y-2">
                  {[
                    { text: "New patient registered", time: "2m ago", dot: "bg-blue-500" },
                    { text: "Billing #1247 paid", time: "15m ago", dot: "bg-emerald-500" },
                    { text: "Case report uploaded", time: "1h ago", dot: "bg-purple-500" },
                    { text: "Lab result received", time: "2h ago", dot: "bg-amber-500" },
                    { text: "Appointment confirmed", time: "3h ago", dot: "bg-gray-400" },
                  ].map((a, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1 ${a.dot} shrink-0`} />
                      <div>
                        <p className="text-[9px] text-[#0F172A] leading-tight">{a.text}</p>
                        <p className="text-[8px] text-gray-300">{a.time}</p>
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
