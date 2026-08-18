export type HelpRole = "GROUP_ADMIN" | "HOSPITAL_ADMIN" | "DOCTOR"

export interface FaqItem {
  id: string
  question: string
  answer: string
  steps?: string[]
  keywords: string[]
  relatedIds?: string[]
  linkTo?: string
  linkLabel?: string
}

export interface WorkflowGuide {
  id: string
  title: string
  description: string
  steps: string[]
  keywords: string[]
  linkTo?: string
  linkLabel?: string
}

export interface HelpCategory {
  id: string
  label: string
  faqs: FaqItem[]
  workflows: WorkflowGuide[]
}

export interface RoleHelpData {
  role: HelpRole
  categories: HelpCategory[]
}

// ─── GROUP ADMIN ─────────────────────────────────────────────────────────────

export const groupAdminHelp: RoleHelpData = {
  role: "GROUP_ADMIN",
  categories: [
    {
      id: "ga-dashboard",
      label: "Dashboard",
      faqs: [
        {
          id: "ga-dash-1",
          question: "What does the Group Dashboard show?",
          answer:
            "The Group Dashboard gives you a bird's-eye view of all hospitals under your group. You can see total patients, appointments, revenue, and pending tasks across every hospital at a glance. Use the date range picker to filter the numbers for any period.",
          steps: [
            "Navigate to Dashboard from the left sidebar.",
            "Use the date range picker at the top to select a period.",
            "Review the summary cards for patients, appointments, and revenue.",
            "Scroll down to see hospital-wise breakdowns.",
          ],
          keywords: ["dashboard", "overview", "summary", "metrics", "KPIs"],
        },
        {
          id: "ga-dash-2",
          question: "How do I filter dashboard data by hospital or date range?",
          answer:
            "Use the filter bar at the top of the Dashboard. Select one or more hospitals from the hospital dropdown, then pick a start and end date. The charts and summary cards update automatically to reflect your selection.",
          steps: [
            "Open the Dashboard.",
            "Click the hospital dropdown and select the hospitals you want to view.",
            "Choose a start date and end date from the date pickers.",
            "Wait for the dashboard to refresh with the filtered data.",
          ],
          keywords: ["filter", "hospital", "date range", "date picker"],
          relatedIds: ["ga-dash-1"],
        },
        {
          id: "ga-dash-3",
          question: "Can I see revenue breakdown by hospital?",
          answer:
            "Yes. The Dashboard includes a revenue chart that breaks down earnings by hospital. You can switch between daily, weekly, and monthly views using the toggle buttons above the chart. Hover over any bar or point to see exact figures.",
          steps: [
            "Go to the Dashboard.",
            "Scroll to the revenue section.",
            "Click Daily, Weekly, or Monthly to change the view.",
            "Hover over chart elements to see exact revenue numbers.",
          ],
          keywords: ["revenue", "chart", "earnings", "hospital breakdown"],
        },
        {
          id: "ga-dash-4",
          question: "How do I add a hospital to my group?",
          answer:
            "Go to Manage Hospitals from the sidebar and click Add Hospital. Fill in the hospital name, address, contact details, and assign an administrator. The hospital will appear on your Dashboard once saved.",
          steps: [
            "Click Manage Hospitals in the left sidebar.",
            "Click the Add Hospital button.",
            "Fill in the hospital name, address, phone, and email.",
            "Assign a Hospital Admin from the dropdown.",
            "Click Save to create the hospital.",
          ],
          keywords: ["add hospital", "new hospital", "create hospital"],
        },
      ],
      workflows: [
        {
          id: "ga-dash-wf-1",
          title: "Reviewing Daily Group Performance",
          description:
            "A quick daily routine to stay on top of your group's performance across all hospitals.",
          steps: [
            "Open the Dashboard each morning.",
            "Check the appointment count and patient arrivals for the previous day.",
            "Review revenue figures and compare with the previous week.",
            "Scan pending tasks and overdue items.",
            "Navigate to Doctor Performance if any numbers look unusual.",
          ],
          keywords: ["daily", "routine", "performance", "morning check"],
          linkTo: "/performance",
          linkLabel: "Viewing Doctor Performance",
        },
        {
          id: "ga-dash-wf-2",
          title: "Generating a Monthly Group Report",
          description:
            "Export a monthly summary of key metrics across all hospitals for reporting or review.",
          steps: [
            "Open the Dashboard and set the date range to the first and last day of the month.",
            "Review the summary cards for total patients, appointments, and revenue.",
            "Check hospital-wise breakdowns in the charts.",
            "Use the Export Center to download a detailed report if needed.",
          ],
          keywords: ["monthly", "report", "export", "summary"],
          linkTo: "/exports",
          linkLabel: "Using the Export Center",
        },
      ],
    },
    {
      id: "ga-hospitals",
      label: "Manage Hospitals",
      faqs: [
        {
          id: "ga-hospitals-1",
          question: "How do I view all hospitals in my group?",
          answer:
            "Click Manage Hospitals in the left sidebar. You will see a list of every hospital with its name, address, admin, and status. Use the search bar at the top to find a specific hospital quickly.",
          steps: [
            "Click Manage Hospitals in the sidebar.",
            "Browse the list of hospitals displayed.",
            "Use the search bar to find a hospital by name.",
            "Click any hospital row to view or edit its details.",
          ],
          keywords: ["hospitals", "list", "view hospitals", "all hospitals"],
        },
        {
          id: "ga-hospitals-2",
          question: "How do I add a new hospital?",
          answer:
            "Click the Add Hospital button on the Manage Hospitals page. Fill in the required fields such as name, address, phone number, and email. You can also assign a Hospital Admin during creation or later from the settings.",
          steps: [
            "Go to Manage Hospitals.",
            "Click Add Hospital.",
            "Enter the hospital name, address, phone, and email.",
            "Optionally assign a Hospital Admin from the dropdown.",
            "Click Save to create the hospital.",
          ],
          keywords: ["add hospital", "create hospital", "new hospital"],
        },
        {
          id: "ga-hospitals-3",
          question: "How do I edit hospital details?",
          answer:
            "Click on any hospital row in the Manage Hospitals list to open its detail page. Click the Edit button to update fields like name, address, contact info, or assigned admin. Save your changes when done.",
          steps: [
            "Go to Manage Hospitals.",
            "Click the hospital you want to edit.",
            "Click the Edit button.",
            "Update the necessary fields.",
            "Click Save to apply changes.",
          ],
          keywords: ["edit hospital", "update hospital", "hospital details"],
          relatedIds: ["ga-hospitals-1"],
        },
        {
          id: "ga-hospitals-4",
          question: "Can I view a hospital's staff from here?",
          answer:
            "Yes. Open any hospital from the Manage Hospitals list, then switch to the Doctors tab. This shows all doctors assigned to that hospital along with their specialisation and status.",
          steps: [
            "Go to Manage Hospitals.",
            "Click on the hospital name.",
            "Click the Doctors tab.",
            "View the list of doctors with their details.",
          ],
          keywords: ["staff", "doctors", "hospital staff", "view doctors"],
        },
      ],
      workflows: [
        {
          id: "ga-hosp-wf-1",
          title: "Setting Up a New Hospital",
          description:
            "Step-by-step guide to add a new hospital to your group and get it ready for daily operations.",
          steps: [
            "Go to Manage Hospitals and click Add Hospital.",
            "Enter the hospital name, full address, phone number, and email.",
            "Assign a Hospital Admin who will manage day-to-day operations.",
            "Save the hospital.",
            "Ask the Hospital Admin to set up Clinical Settings and add doctors.",
          ],
          keywords: ["setup", "new hospital", "onboarding", "configuration"],
          linkTo: "/admin/hospitals",
          linkLabel: "Adding a hospital",
        },
      ],
    },
    {
      id: "ga-doctors",
      label: "Manage Doctors",
      faqs: [
        {
          id: "ga-doctors-1",
          question: "How do I view all doctors across my group?",
          answer:
            "Click Manage Doctors in the left sidebar. This shows every doctor across all your hospitals. You can filter by hospital using the dropdown at the top. Each row shows the doctor's name, specialisation, hospital, and status.",
          steps: [
            "Click Manage Doctors in the sidebar.",
            "Use the hospital filter dropdown to narrow results.",
            "Browse the list of doctors.",
            "Click a doctor's name to view their profile.",
          ],
          keywords: ["doctors", "view doctors", "all doctors", "doctor list"],
        },
        {
          id: "ga-doctors-2",
          question: "How do I see which hospital a doctor belongs to?",
          answer:
            "Each doctor row in the Manage Doctors list includes a hospital column. You can also open the doctor's profile to see all the hospitals they are associated with, along with their schedule and performance data.",
          steps: [
            "Go to Manage Doctors.",
            "Look at the Hospital column in the list.",
            "Click a doctor's name to open their full profile.",
            "Review the hospital association in the profile header.",
          ],
          keywords: ["hospital", "doctor hospital", "doctor profile"],
          relatedIds: ["ga-doctors-1"],
        },
        {
          id: "ga-doctors-3",
          question: "How do I check a doctor's performance?",
          answer:
            "Go to Doctor Performance from the sidebar. Select a doctor and a date range to see their total OPDs, treatments completed, cases handled, and revenue generated. You can compare doctors side by side using the comparison view.",
          steps: [
            "Click Doctor Performance in the sidebar.",
            "Select one or more doctors from the dropdown.",
            "Set a date range for the analysis.",
            "Review the metrics displayed: OPDs, treatments, cases, revenue.",
          ],
          keywords: ["performance", "doctor performance", "metrics", "OPD", "revenue"],
        },
        {
          id: "ga-doctors-4",
          question: "Can I filter doctors by specialisation?",
          answer:
            "Yes. On the Manage Doctors page, use the Specialisation filter dropdown to show only doctors with a specific specialisation such as Orthodontics, Endodontics, or Prosthodontics. You can combine this with the hospital filter.",
          steps: [
            "Go to Manage Doctors.",
            "Click the Specialisation filter dropdown.",
            "Select the specialisation you want to filter by.",
            "Optionally also filter by hospital.",
            "The list updates to show matching doctors.",
          ],
          keywords: ["specialisation", "filter", "orthodontics", "endodontics"],
          relatedIds: ["ga-doctors-1"],
        },
      ],
      workflows: [
        {
          id: "ga-doc-wf-1",
          title: "Comparing Doctor Performance Across Hospitals",
          description:
            "Use Doctor Performance to identify top performers and doctors who may need support.",
          steps: [
            "Navigate to Doctor Performance.",
            "Select two or more doctors from the dropdown.",
            "Set the same date range for a fair comparison.",
            "Compare OPDs, treatments, cases, and revenue side by side.",
            "Follow up with doctors who need coaching or resources.",
          ],
          keywords: ["compare", "performance", "top performer", "coaching"],
          linkTo: "/performance",
          linkLabel: "Doctor Performance",
        },
      ],
    },
    {
      id: "ga-perf",
      label: "Doctor Performance",
      faqs: [
        {
          id: "ga-perf-1",
          question: "What metrics are shown in Doctor Performance?",
          answer:
            "Doctor Performance shows total OPDs (outpatient visits), treatments completed, cases handled, and revenue generated per doctor. You can view these for any date range and filter by hospital to focus on specific locations.",
          steps: [
            "Open Doctor Performance from the sidebar.",
            "Select a date range using the date pickers.",
            "Optionally filter by hospital.",
            "Review the metrics table for each doctor.",
          ],
          keywords: ["OPD", "treatments", "cases", "revenue", "metrics"],
        },
        {
          id: "ga-perf-2",
          question: "How do I view performance for a specific doctor?",
          answer:
            "On the Doctor Performance page, use the doctor dropdown to select a single doctor. The page will display their individual metrics. You can also click on a doctor's row to open a detailed breakdown.",
          steps: [
            "Go to Doctor Performance.",
            "Select a specific doctor from the dropdown.",
            "Review their individual metrics.",
            "Click the doctor's name for a detailed breakdown.",
          ],
          keywords: ["specific doctor", "individual", "single doctor"],
          relatedIds: ["ga-perf-1"],
        },
        {
          id: "ga-perf-3",
          question: "Can I export performance data?",
          answer:
            "Yes. Use the Export button at the top right of the Doctor Performance page to download the data as a spreadsheet. The export includes all doctors and metrics currently displayed based on your filters.",
          steps: [
            "Set your filters (hospital, doctor, date range) on Doctor Performance.",
            "Click the Export button.",
            "Choose the file format if prompted.",
            "The file downloads to your computer.",
          ],
          keywords: ["export", "download", "spreadsheet", "report"],
        },
        {
          id: "ga-perf-4",
          question: "How often is performance data updated?",
          answer:
            "Performance data updates in real time as doctors complete treatments and close cases in the system. If a number seems off, check that all treatments have been marked as completed in the Treatments section.",
          steps: [
            "Performance data updates automatically.",
            "If numbers seem low, check Treatments for pending items.",
            "Ensure all cases have been closed properly.",
            "Contact support if data still looks incorrect.",
          ],
          keywords: ["update", "real time", "sync", "data freshness"],
        },
      ],
      workflows: [
        {
          id: "ga-perf-wf-1",
          title: "Weekly Performance Review",
          description:
            "A weekly check-in routine to track doctor performance trends and address any issues early.",
          steps: [
            "Open Doctor Performance every Monday.",
            "Set the date range to the previous week.",
            "Compare this week's numbers with the week before.",
            "Identify any doctors with declining metrics.",
            "Reach out to those doctors to discuss support needs.",
          ],
          keywords: ["weekly", "review", "trend", "monitoring"],
        },
        {
          id: "ga-perf-wf-2",
          title: "Monthly Revenue Analysis by Doctor",
          description:
            "Analyse revenue contribution by each doctor to understand profitability and plan resource allocation.",
          steps: [
            "Go to Doctor Performance.",
            "Set the date range to the current month.",
            "Sort the table by the Revenue column.",
            "Review the top and bottom contributors.",
            "Use these insights for staffing and scheduling decisions.",
          ],
          keywords: ["revenue", "monthly", "analysis", "profitability"],
        },
      ],
    },
    {
      id: "ga-inventory",
      label: "Inventory",
      faqs: [
        {
          id: "ga-inv-1",
          question: "What does the Group Inventory page show?",
          answer:
            "The Group Inventory page shows consolidated inventory data across all your hospitals. You can view total requirements, hospital-wise stock levels, and monthly indent history in one place. This helps you spot shortages and plan purchases.",
          steps: [
            "Click Inventory in the sidebar.",
            "Review the consolidated requirements at the top.",
            "Scroll down for hospital-wise stock breakdown.",
            "Use the monthly view to check indent history.",
          ],
          keywords: ["inventory", "stock", "requirements", "consolidated"],
        },
        {
          id: "ga-inv-2",
          question: "How do I see stock levels for a specific hospital?",
          answer:
            "On the Inventory page, use the hospital filter dropdown to select a specific hospital. The view will update to show only that hospital's stock data, including current quantities and reorder levels.",
          steps: [
            "Go to Inventory.",
            "Click the hospital filter dropdown.",
            "Select the hospital you want to check.",
            "Review the stock levels displayed for that hospital.",
          ],
          keywords: ["hospital stock", "stock level", "specific hospital"],
          relatedIds: ["ga-inv-1"],
        },
        {
          id: "ga-inv-3",
          question: "How do I view monthly indent data?",
          answer:
            "Scroll to the Monthly Indents section on the Inventory page. You can select a month from the dropdown to see all indent requests made by each hospital during that period, including quantities and status.",
          steps: [
            "Open the Inventory page.",
            "Scroll down to the Monthly Indents section.",
            "Select a month from the dropdown.",
            "Review the indent list showing hospital, items, quantities, and status.",
          ],
          keywords: ["monthly indent", "indent", "request", "procurement"],
        },
        {
          id: "ga-inv-4",
          question: "Can I compare inventory across hospitals?",
          answer:
            "Yes. The Inventory page includes a comparison view that lets you see stock levels for the same items across different hospitals side by side. This is useful for identifying imbalances and planning transfers.",
          steps: [
            "Go to Inventory.",
            "Switch to the Comparison view if available.",
            "Select the items or categories you want to compare.",
            "Review the side-by-side hospital stock data.",
          ],
          keywords: ["compare", "comparison", "transfer", "balance"],
          relatedIds: ["ga-inv-1"],
        },
      ],
      workflows: [
        {
          id: "ga-inv-wf-1",
          title: "Reviewing and Approving Indent Requests",
          description:
            "A workflow to review pending indent requests from hospitals and approve or modify them.",
          steps: [
            "Open Inventory and scroll to Monthly Indents.",
            "Filter by status to see Pending requests.",
            "Review each indent for quantity and item appropriateness.",
            "Approve, reject, or modify quantities as needed.",
            "Communicate with the hospital admin if adjustments are needed.",
          ],
          keywords: ["indent", "approve", "pending", "procurement"],
        },
      ],
    },
    {
      id: "ga-settings",
      label: "Settings & Communication",
      faqs: [
        {
          id: "ga-set-1",
          question: "How do I access group settings?",
          answer:
            "Click Settings in the left sidebar to open the Group Settings page. Here you can manage group-level preferences such as the group name, default timezone, notification preferences, and user roles.",
          steps: [
            "Click Settings in the sidebar.",
            "Review the available setting sections.",
            "Make your changes in the relevant section.",
            "Click Save to apply.",
          ],
          keywords: ["settings", "group settings", "preferences", "configuration"],
        },
        {
          id: "ga-set-2",
          question: "How do I use the Communication Center?",
          answer:
            "The Communication Center lets you send messages and announcements across your group. You can message all hospitals, specific hospitals, or individual users. Go to Communication Center from the sidebar to get started.",
          steps: [
            "Click Communication Center in the sidebar.",
            "Choose your audience: all hospitals, specific hospital, or individual.",
            "Compose your message or announcement.",
            "Click Send to deliver.",
          ],
          keywords: ["communication", "messaging", "announcements", "broadcast"],
        },
        {
          id: "ga-set-3",
          question: "Can I manage user roles from the group level?",
          answer:
            "Yes. Group Admins can assign or change roles for users across their hospitals. Go to Settings and then User Management to see all users and their current roles. Click on a user to update their role.",
          steps: [
            "Go to Settings.",
            "Navigate to User Management.",
            "Find the user you want to update.",
            "Click on the user and change their role.",
            "Save the changes.",
          ],
          keywords: ["roles", "user management", "permissions", "access"],
        },
        {
          id: "ga-set-4",
          question: "How do I manage expenses at the group level?",
          answer:
            "Go to Expenses from the sidebar to see a consolidated view of expenses across all hospitals. You can filter by hospital, category, and date range. The page also shows charts for expense trends over time.",
          steps: [
            "Click Expenses in the sidebar.",
            "Use the hospital filter to narrow the view.",
            "Select a date range for the analysis.",
            "Review the expense chart and detailed table.",
          ],
          keywords: ["expenses", "costs", "spending", "financial"],
        },
      ],
      workflows: [
        {
          id: "ga-set-wf-1",
          title: "Sending a Group-Wide Announcement",
          description:
            "Use the Communication Center to broadcast an important message to all hospitals.",
          steps: [
            "Open Communication Center.",
            "Select All Hospitals as the audience.",
            "Type your announcement with a clear subject.",
            "Preview the message.",
            "Click Send to deliver to all hospitals.",
          ],
          keywords: ["announcement", "broadcast", "communication"],
          linkTo: "/communications",
          linkLabel: "Communication Center",
        },
      ],
    },
  ],
}

// ─── HOSPITAL ADMIN ──────────────────────────────────────────────────────────

export const hospitalAdminHelp: RoleHelpData = {
  role: "HOSPITAL_ADMIN",
  categories: [
    {
      id: "ha-dashboard",
      label: "Dashboard & Tasks",
      faqs: [
        {
          id: "ha-dash-1",
          question: "What does the Hospital Dashboard show?",
          answer:
            "The Hospital Dashboard gives you a summary of your hospital's daily and overall performance. You can see today's appointments, patient arrivals, revenue, pending tasks, and a quick overview of doctor availability.",
          steps: [
            "Navigate to Dashboard from the left sidebar.",
            "Review the summary cards for today's appointments and patients.",
            "Check the revenue card for earnings.",
            "Scroll down to see doctor-wise and treatment-wise breakdowns.",
          ],
          keywords: ["dashboard", "overview", "summary", "daily"],
        },
        {
          id: "ha-dash-2",
          question: "How do I manage tasks?",
          answer:
            "Click Tasks in the sidebar to see all your pending and completed tasks. Tasks are created automatically when actions are needed, such as approving a treatment plan or following up on a lead. Click a task to open the relevant item.",
          steps: [
            "Click Tasks in the sidebar.",
            "Review the Pending tasks list.",
            "Click a task to open the related patient, treatment, or lead.",
            "Complete the action required.",
            "The task moves to Completed automatically.",
          ],
          keywords: ["tasks", "pending", "to-do", "action items"],
        },
        {
          id: "ha-dash-3",
          question: "Can I see which doctors are available today?",
          answer:
            "Yes. The Dashboard includes a doctor availability section that shows which doctors are on duty today and their current patient load. You can also check individual schedules from the Doctors section.",
          steps: [
            "Open the Dashboard.",
            "Look at the Doctor Availability section.",
            "See which doctors are marked as available today.",
            "Click a doctor's name to see their detailed schedule.",
          ],
          keywords: ["availability", "doctors", "schedule", "on duty"],
        },
        {
          id: "ha-dash-4",
          question: "How do I view today's appointments?",
          answer:
            "The Dashboard shows today's appointments in a dedicated card. For a full list, go to Appointments in the sidebar. You can see appointment time, patient name, doctor, and status at a glance.",
          steps: [
            "Open the Dashboard to see the appointments summary card.",
            "For the full list, click Appointments in the sidebar.",
            "Review each appointment with time, patient, and doctor.",
            "Click any appointment to view or edit details.",
          ],
          keywords: ["appointments", "today", "schedule", "booking"],
        },
        {
          id: "ha-dash-5",
          question: "What is the CRM Dashboard?",
          answer:
            "The CRM Dashboard shows your lead pipeline, conversion rates, and enquiry trends. It helps you track how many leads came in, how many converted to patients, and where your marketing efforts are performing well.",
          steps: [
            "Click CRM Dashboard in the sidebar.",
            "Review the lead pipeline chart.",
            "Check conversion rates and enquiry trends.",
            "Click on specific stages to drill into the data.",
          ],
          keywords: ["CRM", "leads", "pipeline", "conversion", "enquiry"],
        },
      ],
      workflows: [
        {
          id: "ha-dash-wf-1",
          title: "Morning Hospital Check-In",
          description:
            "A daily routine to start your day by reviewing appointments, tasks, and doctor availability.",
          steps: [
            "Open the Dashboard each morning.",
            "Check today's appointment count and patient list.",
            "Review pending tasks and prioritise urgent ones.",
            "Verify doctor availability and flag any gaps.",
            "Address any missing tasks before the first patient arrives.",
          ],
          keywords: ["morning", "routine", "daily", "check-in"],
        },
        {
          id: "ha-dash-wf-2",
          title: "End-of-Day Review",
          description:
            "Wrap up the day by reviewing completed work, pending items, and preparing for tomorrow.",
          steps: [
            "Open the Dashboard and review today's completed appointments.",
            "Check revenue earned for the day.",
            "Review any remaining tasks and decide which to handle now.",
            "Look at tomorrow's appointment schedule to prepare.",
            "Send any necessary messages through the Communication Center.",
          ],
          keywords: ["end of day", "wrap up", "review", "closing"],
          linkTo: "/communications",
          linkLabel: "Communication Center",
        },
      ],
    },
    {
      id: "ha-patients",
      label: "Patients & Appointments",
      faqs: [
        {
          id: "ha-pat-1",
          question: "How do I add a new patient?",
          answer:
            "Go to Patients and click Add Patient. Enter the patient's name, phone number, email, date of birth, and any other required details. You can also add notes about their dental history or specific needs.",
          steps: [
            "Click Patients in the sidebar.",
            "Click the Add Patient button.",
            "Fill in name, phone, email, and date of birth.",
            "Add any notes or medical history if available.",
            "Click Save to create the patient record.",
          ],
          keywords: ["add patient", "new patient", "create patient", "register"],
        },
        {
          id: "ha-pat-2",
          question: "How do I view a patient's full history?",
          answer:
            "Click on any patient's name in the Patients list to open their detail page. From there, you can see their complete history including past appointments, treatments, cases, billing records, and consent forms.",
          steps: [
            "Go to Patients.",
            "Search for the patient by name or phone.",
            "Click the patient's name to open their profile.",
            "Browse the tabs: Appointments, Treatments, Cases, Billing.",
          ],
          keywords: ["patient history", "medical history", "treatment history", "records"],
          relatedIds: ["ha-pat-1"],
        },
        {
          id: "ha-pat-3",
          question: "How do I create an appointment for a patient?",
          answer:
            "Go to Appointments and click New Appointment. Select the patient, doctor, date, and time slot. You can also add a reason for the visit. The appointment will appear on the doctor's schedule and the patient's record.",
          steps: [
            "Click Appointments in the sidebar.",
            "Click New Appointment.",
            "Select the patient from the dropdown or search.",
            "Choose the doctor and available time slot.",
            "Add a reason for the visit.",
            "Click Save to confirm the appointment.",
          ],
          keywords: ["appointment", "book", "schedule", "new appointment"],
        },
        {
          id: "ha-pat-4",
          question: "How do I edit or cancel an appointment?",
          answer:
            "Go to Appointments and click on the appointment you want to change. You can reschedule by selecting a new date and time, or cancel it entirely. Cancelled appointments are moved to the Cancelled tab for your records.",
          steps: [
            "Go to Appointments.",
            "Click on the appointment to open it.",
            "Click Edit to change date or time.",
            "Or click Cancel to cancel the appointment.",
            "Confirm the cancellation if prompted.",
          ],
          keywords: ["edit appointment", "cancel appointment", "reschedule"],
          relatedIds: ["ha-pat-3"],
        },
        {
          id: "ha-pat-5",
          question: "Can I search for a patient by phone number?",
          answer:
            "Yes. Use the search bar at the top of the Patients page. You can search by patient name, phone number, or email. The results update as you type.",
          steps: [
            "Go to Patients.",
            "Click the search bar.",
            "Type the patient's phone number or name.",
            "Click on the matching result to open the patient profile.",
          ],
          keywords: ["search", "phone number", "find patient", "lookup"],
        },
        {
          id: "ha-pat-6",
          question: "How do I view a patient's billing history?",
          answer:
            "Open the patient's profile and click the Billing tab. This shows all invoices, payments, and outstanding balances for that patient. You can also generate new invoices from this page.",
          steps: [
            "Go to Patients and open the patient's profile.",
            "Click the Billing tab.",
            "Review the list of invoices and payments.",
            "Click Generate Invoice to create a new one if needed.",
          ],
          keywords: ["billing", "invoice", "payment", "balance"],
        },
      ],
      workflows: [
        {
          id: "ha-pat-wf-1",
          title: "Registering a New Patient and Booking Their First Appointment",
          description:
            "Complete workflow from creating a patient record to booking their first visit.",
          steps: [
            "Go to Patients and click Add Patient.",
            "Fill in all required patient details and save.",
            "Click Appointments in the sidebar.",
            "Click New Appointment and select the newly created patient.",
            "Choose the doctor, date, and time slot.",
            "Save the appointment.",
          ],
          keywords: ["new patient", "booking", "first appointment", "registration"],
        },
        {
          id: "ha-pat-wf-2",
          title: "Handling a Walk-In Patient",
          description:
            "Quick workflow to register and schedule a walk-in patient who arrives without an appointment.",
          steps: [
            "Open Patients and search to confirm the patient is not already in the system.",
            "If new, click Add Patient and fill in their details quickly.",
            "Go to Appointments and click New Appointment.",
            "Select the patient and the next available doctor.",
            "Assign the nearest available time slot.",
            "Save the appointment.",
          ],
          keywords: ["walk-in", "emergency", "quick registration"],
        },
        {
          id: "ha-pat-wf-3",
          title: "Converting a Lead to a Patient",
          description:
            "When a lead is ready, convert them into a patient record and schedule their first appointment.",
          steps: [
            "Go to Leads and open the lead you want to convert.",
            "Click Convert to Patient.",
            "Review and complete any missing patient information.",
            "Save to create the patient record.",
            "Book an appointment for the new patient.",
          ],
          keywords: ["convert lead", "lead to patient", "conversion"],
          linkTo: "/leads",
          linkLabel: "Managing Leads",
        },
      ],
    },
    {
      id: "ha-treatments",
      label: "Treatments & Cases",
      faqs: [
        {
          id: "ha-treat-1",
          question: "How do I view all treatments?",
          answer:
            "Click Treatments in the sidebar to see a list of all treatments across your hospital. Each row shows the patient name, treatment type, doctor, status, and dates. Use filters to narrow by status, doctor, or date range.",
          steps: [
            "Click Treatments in the sidebar.",
            "Review the list of treatments.",
            "Use the status filter to see Pending, In Progress, or Completed treatments.",
            "Click any treatment to see full details.",
          ],
          keywords: ["treatments", "list", "status", "view treatments"],
        },
        {
          id: "ha-treat-2",
          question: "How do I approve a treatment plan?",
          answer:
            "When a doctor submits a treatment plan, you will see a task in your Tasks list. Open the treatment from Tasks, review the proposed plan and cost estimate, then click Approve to proceed or Reject with comments if changes are needed.",
          steps: [
            "Open Tasks and find the treatment plan approval task.",
            "Click to open the treatment details.",
            "Review the proposed procedures and cost estimate.",
            "Click Approve to proceed or Reject to send back with comments.",
          ],
          keywords: ["approve", "treatment plan", "plan approval", "review"],
        },
        {
          id: "ha-treat-3",
          question: "What is the Treatment Workflow Board?",
          answer:
            "The Workflow Board is a visual Kanban-style board that shows treatments in different stages such as Planned, In Progress, Completed, and Billed. Drag and drop treatments between columns to update their status as work progresses.",
          steps: [
            "Click Treatments and then switch to the Workflow Board view.",
            "See treatments arranged in columns by status.",
            "Drag a treatment card to the next column as work progresses.",
            "Click a card to see full treatment details.",
          ],
          keywords: ["workflow board", "kanban", "drag and drop", "stages"],
        },
        {
          id: "ha-treat-4",
          question: "How do I view treatment details and history?",
          answer:
            "Click on any treatment in the list or on the Workflow Board to open its detail page. You can see the treatment plan, procedures included, doctor assigned, status history, cost breakdown, and linked case if any.",
          steps: [
            "Open the Treatments list or Workflow Board.",
            "Click the treatment you want to view.",
            "Review the plan details, procedures, and cost.",
            "Check the status history timeline.",
            "View the linked case if one exists.",
          ],
          keywords: ["treatment details", "history", "procedures", "cost breakdown"],
        },
        {
          id: "ha-treat-5",
          question: "How do I create a case for a patient?",
          answer:
            "Go to Cases and click New Case. Select the patient, assign a doctor, and describe the dental issue. You can attach photos or X-rays. The case links to the patient record and can be used to plan treatments.",
          steps: [
            "Click Cases in the sidebar.",
            "Click New Case.",
            "Select the patient and assign a doctor.",
            "Enter a description of the dental issue.",
            "Attach any photos or X-rays.",
            "Click Save to create the case.",
          ],
          keywords: ["create case", "new case", "dental case", "patient case"],
        },
        {
          id: "ha-treat-6",
          question: "Can I print a treatment summary?",
          answer:
            "Yes. Open any treatment and click the Print button to generate a print-friendly summary. This includes the treatment plan, procedures, cost, and status. You can also print from the Cases section for case summaries.",
          steps: [
            "Open the treatment or case you want to print.",
            "Click the Print button.",
            "Review the print preview.",
            "Send to your printer or save as PDF.",
          ],
          keywords: ["print", "summary", "print preview", "PDF"],
        },
      ],
      workflows: [
        {
          id: "ha-treat-wf-1",
          title: "End-to-End Treatment Workflow",
          description:
            "Follow a treatment from initial case creation through planning, approval, execution, and billing.",
          steps: [
            "Create a Case for the patient with their dental issue.",
            "Plan the treatment within the case.",
            "Submit the treatment plan for approval.",
            "Approve the plan (or send back for revision).",
            "Move the treatment through the Workflow Board as work progresses.",
            "Mark the treatment as Completed when done.",
            "Generate an invoice from the Billing section.",
          ],
          keywords: ["treatment workflow", "end to end", "case to billing"],
          linkTo: "/treatments/workflow",
          linkLabel: "Workflow Board",
        },
        {
          id: "ha-treat-wf-2",
          title: "Using the Workflow Board to Track Treatments",
          description:
            "Learn how to use the Kanban-style board to manage treatment progress visually.",
          steps: [
            "Go to Treatments and click the Workflow Board tab.",
            "Identify which column each treatment belongs in.",
            "Drag treatments to the next column as they progress.",
            "Click any card for full details.",
            "Use filters to focus on a specific doctor or status.",
          ],
          keywords: ["workflow board", "kanban", "visual tracking"],
        },
      ],
    },
    {
      id: "ha-billing",
      label: "Billing & Invoices",
      faqs: [
        {
          id: "ha-bill-1",
          question: "How do I view all billing records?",
          answer:
            "Click Billing in the sidebar to see all invoices and payments for your hospital. Each row shows the invoice number, patient name, amount, status (Paid, Pending, Partial), and date. Use filters to narrow by status or date.",
          steps: [
            "Click Billing in the sidebar.",
            "Review the list of invoices and payments.",
            "Use the status filter to see Paid, Pending, or Partial invoices.",
            "Click any invoice to see full details.",
          ],
          keywords: ["billing", "invoices", "payments", "list"],
        },
        {
          id: "ha-bill-2",
          question: "How do I generate an invoice?",
          answer:
            "Open a completed treatment or case and click Generate Invoice. The system pre-fills the patient details and treatment costs. Review the items, adjust if needed, and save to create the invoice.",
          steps: [
            "Open the completed treatment or case.",
            "Click Generate Invoice.",
            "Review the pre-filled patient and treatment details.",
            "Adjust line items or amounts if necessary.",
            "Save to generate the invoice.",
          ],
          keywords: ["generate invoice", "create invoice", "billing"],
        },
        {
          id: "ha-bill-3",
          question: "How do I record a payment?",
          answer:
            "Open an invoice and click Record Payment. Enter the amount paid, payment method (cash, card, UPI, etc.), and any reference number. The invoice status updates automatically to reflect the payment.",
          steps: [
            "Go to Billing and open the invoice.",
            "Click Record Payment.",
            "Enter the amount paid.",
            "Select the payment method.",
            "Add a reference number if applicable.",
            "Click Save to record the payment.",
          ],
          keywords: ["record payment", "payment", "cash", "UPI", "card"],
          relatedIds: ["ha-bill-1"],
        },
        {
          id: "ha-bill-4",
          question: "Can I send an invoice to a patient via WhatsApp?",
          answer:
            "Yes. Open the invoice and click the WhatsApp icon to send it directly to the patient's registered phone number. The invoice is shared as a formatted message with key details and a downloadable PDF link.",
          steps: [
            "Open the invoice in Billing.",
            "Click the WhatsApp send icon.",
            "Confirm the patient's phone number.",
            "The invoice is sent via WhatsApp.",
          ],
          keywords: ["WhatsApp", "send invoice", "share invoice"],
        },
        {
          id: "ha-bill-5",
          question: "How do I view outstanding payments?",
          answer:
            "On the Billing page, filter by Pending or Partial status to see all unpaid or partially paid invoices. The total outstanding amount is displayed at the top of the list. You can also check individual patient balances from their profile.",
          steps: [
            "Go to Billing.",
            "Click the status filter and select Pending or Partial.",
            "Review the filtered list of outstanding invoices.",
            "Check the total outstanding amount displayed.",
          ],
          keywords: ["outstanding", "pending", "unpaid", "balance"],
        },
      ],
      workflows: [
        {
          id: "ha-bill-wf-1",
          title: "Billing a Completed Treatment",
          description:
            "From treatment completion to invoice generation and payment collection.",
          steps: [
            "Ensure the treatment is marked as Completed.",
            "Open the treatment and click Generate Invoice.",
            "Review the pre-filled invoice details.",
            "Save the invoice.",
            "Collect payment and click Record Payment.",
            "Send the invoice to the patient via WhatsApp if requested.",
          ],
          keywords: ["billing workflow", "complete treatment", "invoice", "payment"],
        },
      ],
    },
    {
      id: "ha-crm",
      label: "CRM & Leads",
      faqs: [
        {
          id: "ha-crm-1",
          question: "What is the CRM Dashboard?",
          answer:
            "The CRM Dashboard shows your lead pipeline, conversion rates, and enquiry trends. It helps you track how many leads came in, how many converted to patients, and where your marketing efforts are performing well.",
          steps: [
            "Click CRM Dashboard in the sidebar.",
            "Review the lead pipeline chart.",
            "Check conversion rates and enquiry trends.",
            "Click on specific stages to drill into the data.",
          ],
          keywords: ["CRM", "dashboard", "pipeline", "conversion"],
        },
        {
          id: "ha-crm-2",
          question: "How do I add a new lead?",
          answer:
            "Go to Leads and click Add Lead. Enter the person's name, phone number, source (walk-in, referral, online), and any notes. You can also set a follow-up date and assign it to a team member.",
          steps: [
            "Click Leads in the sidebar.",
            "Click Add Lead.",
            "Enter the lead's name, phone, and source.",
            "Add notes and set a follow-up date.",
            "Save the lead.",
          ],
          keywords: ["add lead", "new lead", "create lead", "enquiry"],
        },
        {
          id: "ha-crm-3",
          question: "How do I manage and follow up on leads?",
          answer:
            "Go to Leads to see all your leads in a list. Each lead shows name, source, status, and next follow-up date. Click a lead to see full details, update its status, add notes, or schedule a follow-up reminder.",
          steps: [
            "Click Leads in the sidebar.",
            "Review the list of leads with their statuses.",
            "Click a lead to open its details.",
            "Update the status, add notes, or schedule a follow-up.",
            "Mark as Converted when the lead becomes a patient.",
          ],
          keywords: ["leads", "follow up", "manage leads", "status"],
        },
        {
          id: "ha-crm-4",
          question: "How do I convert a lead to a patient?",
          answer:
            "Open the lead and click Convert to Patient. The system creates a new patient record with the lead's information. You can then book an appointment for the new patient right away.",
          steps: [
            "Open the lead from the Leads list.",
            "Click Convert to Patient.",
            "Review and complete any missing patient details.",
            "Save the new patient record.",
            "Book an appointment for the patient.",
          ],
          keywords: ["convert", "lead to patient", "conversion"],
          relatedIds: ["ha-crm-2"],
        },
        {
          id: "ha-crm-5",
          question: "What is the Enquiry Calendar?",
          answer:
            "The Enquiry Calendar shows all leads and follow-ups on a calendar view. You can see which leads are due for follow-up on any given day. Click a date to see all scheduled activities and update them.",
          steps: [
            "Click Enquiry Calendar in the sidebar.",
            "Browse the calendar for scheduled follow-ups.",
            "Click a date to see all leads with follow-ups on that day.",
            "Click a lead to open its details and update.",
          ],
          keywords: ["enquiry calendar", "calendar", "follow-up", "schedule"],
        },
      ],
      workflows: [
        {
          id: "ha-crm-wf-1",
          title: "Lead to Patient Conversion",
          description:
            "Complete workflow from receiving a new enquiry to converting it into a patient appointment.",
          steps: [
            "Add the new lead from Leads or the Enquiry Calendar.",
            "Log the enquiry details and source.",
            "Set a follow-up date.",
            "Contact the lead and update notes.",
            "When ready, click Convert to Patient.",
            "Book the first appointment.",
          ],
          keywords: ["lead conversion", "enquiry", "patient booking"],
        },
        {
          id: "ha-crm-wf-2",
          title: "Managing Daily Follow-Ups",
          description:
            "Use the Enquiry Calendar to stay on top of lead follow-ups every day.",
          steps: [
            "Open the Enquiry Calendar each morning.",
            "See which leads have follow-ups due today.",
            "Contact each lead and update their status.",
            "Reschedule follow-ups if the lead is not ready.",
            "Mark converted leads as Converted.",
          ],
          keywords: ["daily follow-up", "enquiry calendar", "lead management"],
          linkTo: "/crm/enquiry-calendar",
          linkLabel: "Enquiry Calendar",
        },
      ],
    },
    {
      id: "ha-whatsapp",
      label: "WhatsApp & Communication",
      faqs: [
        {
          id: "ha-whatsapp-1",
          question: "How do I send a WhatsApp message to a patient?",
          answer:
            "Open any patient record and click the WhatsApp icon to send a message. You can send appointment reminders, treatment summaries, invoices, or consent forms directly through WhatsApp.",
          steps: [
            "Open the patient's profile.",
            "Click the WhatsApp icon.",
            "Select the message type or type a custom message.",
            "Click Send.",
          ],
          keywords: ["WhatsApp", "message patient", "send message"],
        },
        {
          id: "ha-whatsapp-2",
          question: "Can I send appointment reminders via WhatsApp?",
          answer:
            "Yes. When creating or viewing an appointment, click the Send Reminder button to send a WhatsApp reminder to the patient. The message includes the appointment date, time, and doctor name.",
          steps: [
            "Open the appointment from the Appointments list.",
            "Click Send Reminder.",
            "Confirm the patient's phone number.",
            "The reminder is sent via WhatsApp.",
          ],
          keywords: ["reminder", "appointment reminder", "WhatsApp reminder"],
        },
        {
          id: "ha-whatsapp-3",
          question: "How do I configure WhatsApp for my hospital?",
          answer:
            "Go to WhatsApp Config in Settings. Enter your WhatsApp Business API credentials and phone number. Once connected, you can send and receive messages from within Appointin.",
          steps: [
            "Go to Settings and click WhatsApp Config.",
            "Enter your WhatsApp Business API key.",
            "Enter the registered phone number.",
            "Click Save to connect.",
            "Test by sending a message to a patient.",
          ],
          keywords: ["WhatsApp config", "setup WhatsApp", "WhatsApp API", "configuration"],
        },
        {
          id: "ha-whatsapp-4",
          question: "Can I view WhatsApp conversation history with a patient?",
          answer:
            "Yes. Open the patient's profile and click the WhatsApp tab to see the complete message history. This helps you track all communications in one place.",
          steps: [
            "Open the patient's profile.",
            "Click the WhatsApp tab.",
            "Scroll through the message history.",
            "Send a new message from this view if needed.",
          ],
          keywords: ["WhatsApp history", "conversation", "message history"],
        },
      ],
      workflows: [
        {
          id: "ha-whatsapp-wf-1",
          title: "Sending Treatment Summary via WhatsApp",
          description:
            "Share a completed treatment summary with the patient through WhatsApp for their records.",
          steps: [
            "Open the completed treatment.",
            "Click the Print/Share button.",
            "Select WhatsApp as the sharing method.",
            "Confirm the patient's phone number.",
            "The treatment summary is sent as a formatted message.",
          ],
          keywords: ["treatment summary", "share", "WhatsApp"],
        },
      ],
    },
    {
      id: "ha-lab-inv",
      label: "Laboratory & Inventory",
      faqs: [
        {
          id: "ha-lab-1",
          question: "How do I register a laboratory?",
          answer:
            "Go to Laboratory and click Add Lab. Enter the lab name, contact details, and the services they offer. Once registered, you can assign lab work to them from patient cases.",
          steps: [
            "Click Laboratory in the sidebar.",
            "Click Add Lab.",
            "Enter the lab name, phone, and email.",
            "Select the services the lab provides.",
            "Click Save to register the lab.",
          ],
          keywords: ["register lab", "add lab", "laboratory", "lab setup"],
        },
        {
          id: "ha-lab-2",
          question: "How do I assign lab work to a patient?",
          answer:
            "Open a patient case or treatment and click Assign Lab Work. Select the lab, the test or service required, and any special instructions. The lab is notified and the status is tracked in the case.",
          steps: [
            "Open the patient's case or treatment.",
            "Click Assign Lab Work.",
            "Select the registered lab from the dropdown.",
            "Choose the test or service required.",
            "Add any special instructions.",
            "Click Save to assign.",
          ],
          keywords: ["assign lab", "lab work", "lab test", "dental lab"],
          relatedIds: ["ha-lab-1"],
        },
        {
          id: "ha-lab-3",
          question: "How do I manage lab items and inventory?",
          answer:
            "Go to Laboratory and switch to the Lab Items tab. Here you can see all items used in lab work, their quantities, and reorder levels. Add new items, update stock, or set reorder alerts.",
          steps: [
            "Go to Laboratory and click the Lab Items tab.",
            "Review the list of lab items.",
            "Click Add Item to add a new lab item.",
            "Update quantities and reorder levels.",
            "Save changes.",
          ],
          keywords: ["lab items", "lab inventory", "lab stock", "reorder"],
        },
        {
          id: "ha-lab-4",
          question: "How do I add a stock indent?",
          answer:
            "Go to Inventory and click Add Indent. Select the items you need, enter quantities, and submit. The indent is visible to the Group Admin for approval and tracking.",
          steps: [
            "Click Inventory in the sidebar.",
            "Click Add Indent.",
            "Select the items and enter quantities.",
            "Add any notes for the approver.",
            "Click Submit to create the indent.",
          ],
          keywords: ["indent", "stock indent", "reorder", "procurement"],
        },
        {
          id: "ha-inv-1",
          question: "How do I track inventory stock levels?",
          answer:
            "Go to Inventory to see current stock levels for all items. Each item shows current quantity, reorder level, and last updated date. Items below their reorder level are highlighted to alert you.",
          steps: [
            "Click Inventory in the sidebar.",
            "Review the stock levels for each item.",
            "Check highlighted items that are below reorder level.",
            "Click an item to see its usage history.",
          ],
          keywords: ["stock level", "inventory", "reorder level", "stock tracking"],
        },
        {
          id: "ha-inv-2",
          question: "Can I add custom inventory items?",
          answer:
            "Yes. In the Inventory section, click Add Item to create a new item. Enter the item name, category, unit of measure, and reorder level. Custom items appear alongside standard inventory items.",
          steps: [
            "Go to Inventory.",
            "Click Add Item.",
            "Enter the item name and category.",
            "Set the unit of measure and reorder level.",
            "Click Save to add the item.",
          ],
          keywords: ["custom item", "add item", "new inventory item"],
        },
      ],
      workflows: [
        {
          id: "ha-lab-wf-1",
          title: "Sending a Case to the Lab",
          description:
            "From case creation to lab assignment and tracking the result.",
          steps: [
            "Open the patient case.",
            "Click Assign Lab Work.",
            "Select the lab and the required test or prosthesis.",
            "Add clinical notes and attach images.",
            "Save the assignment.",
            "Track the lab status from the case detail page.",
          ],
          keywords: ["lab workflow", "send to lab", "lab assignment"],
        },
        {
          id: "ha-lab-wf-2",
          title: "Monthly Inventory Check and Indent",
          description:
            "Routine for checking stock levels and raising indents for the group admin.",
          steps: [
            "Go to Inventory at the start of each month.",
            "Review current stock levels for all items.",
            "Identify items below reorder level.",
            "Click Add Indent and select the needed items.",
            "Submit the indent for Group Admin approval.",
          ],
          keywords: ["monthly check", "indent", "stock check", "inventory routine"],
        },
      ],
    },
    {
      id: "ha-settings",
      label: "Settings & Exports",
      faqs: [
        {
          id: "ha-set-1",
          question: "How do I access hospital settings?",
          answer:
            "Click Settings in the sidebar to open your hospital's settings page. From here you can manage hospital details, clinical settings, CRM settings, and WhatsApp configuration.",
          steps: [
            "Click Settings in the sidebar.",
            "Choose the section you want to configure.",
            "Make your changes.",
            "Click Save to apply.",
          ],
          keywords: ["settings", "hospital settings", "configuration"],
        },
        {
          id: "ha-set-2",
          question: "What are Clinical Settings?",
          answer:
            "Clinical Settings let you configure treatment categories, procedure lists, and default treatment workflows used in your hospital. This ensures consistency when doctors plan treatments.",
          steps: [
            "Go to Settings and click Clinical Settings.",
            "Review the default treatment categories.",
            "Add or modify procedures as needed.",
            "Set default workflows for common treatments.",
            "Save your changes.",
          ],
          keywords: ["clinical settings", "treatment categories", "procedures"],
        },
        {
          id: "ha-set-3",
          question: "How do I use the Export Center?",
          answer:
            "Go to Export Center to download reports for patients, treatments, billing, and other data. Select the report type, set your filters (date range, status), and click Export. The file downloads to your computer.",
          steps: [
            "Click Export Center in the sidebar.",
            "Choose the report type: Patients, Treatments, Billing, etc.",
            "Set your filters like date range or status.",
            "Click Export to download the file.",
          ],
          keywords: ["export", "download", "report", "data export"],
        },
        {
          id: "ha-set-4",
          question: "How do I configure CRM Settings?",
          answer:
            "CRM Settings let you customise lead sources, follow-up reminders, and lead statuses. Go to Settings and click CRM Settings to configure these options for your hospital.",
          steps: [
            "Go to Settings and click CRM Settings.",
            "Add or edit lead sources (e.g., walk-in, referral, social media).",
            "Customise lead statuses and pipelines.",
            "Set default follow-up reminder intervals.",
            "Save your changes.",
          ],
          keywords: ["CRM settings", "lead sources", "follow-up", "pipeline"],
        },
        {
          id: "ha-set-5",
          question: "Can I manage expenses for my hospital?",
          answer:
            "Yes. Go to Expenses in the sidebar to view and manage all hospital expenses. You can add new expenses, categorise them, and view expense trends over time using the built-in charts.",
          steps: [
            "Click Expenses in the sidebar.",
            "Review the expense list and charts.",
            "Click Add Expense to record a new expense.",
            "Enter the amount, category, and date.",
            "Save the expense entry.",
          ],
          keywords: ["expenses", "spending", "cost management", "financials"],
        },
      ],
      workflows: [
        {
          id: "ha-set-wf-1",
          title: "Configuring Hospital Settings for First-Time Setup",
          description:
            "Essential settings to configure when your hospital first starts using Appointin.",
          steps: [
            "Go to Settings and update hospital details (name, address, phone).",
            "Open Clinical Settings and set up treatment categories and procedures.",
            "Configure CRM Settings with your lead sources and statuses.",
            "Set up WhatsApp Config if messaging is needed.",
            "Test by creating a sample patient and booking an appointment.",
          ],
          keywords: ["setup", "first time", "configuration", "onboarding"],
        },
        {
          id: "ha-set-wf-2",
          title: "Exporting Monthly Reports",
          description:
            "Download monthly reports for patients, treatments, and billing for accounting or review.",
          steps: [
            "Go to Export Center.",
            "Select the report type.",
            "Set the date range to the current month.",
            "Click Export and download the file.",
            "Share with your accounts team if needed.",
          ],
          keywords: ["monthly report", "export", "accounting", "download"],
        },
      ],
    },
  ],
}

// ─── DOCTOR ──────────────────────────────────────────────────────────────────

export const doctorHelp: RoleHelpData = {
  role: "DOCTOR",
  categories: [
    {
      id: "doc-dashboard",
      label: "Dashboard & Tasks",
      faqs: [
        {
          id: "doc-dash-1",
          question: "What does the Doctor Dashboard show?",
          answer:
            "Your Dashboard shows today's appointments, pending tasks, and a quick summary of your recent activity. You can see how many patients are scheduled, which cases need attention, and your upcoming schedule.",
          steps: [
            "Navigate to Dashboard from the left sidebar.",
            "Review today's appointment count and patient names.",
            "Check the tasks section for pending items.",
            "Scroll down for a summary of recent treatments and cases.",
          ],
          keywords: ["dashboard", "overview", "today", "appointments"],
        },
        {
          id: "doc-dash-2",
          question: "How do I view and manage my tasks?",
          answer:
            "Click Tasks in the sidebar to see all your pending and completed tasks. Tasks include items like reviewing a treatment plan, following up on a case, or updating a patient record. Click any task to open the relevant item.",
          steps: [
            "Click Tasks in the sidebar.",
            "Review the Pending tasks list.",
            "Click a task to open the related item.",
            "Complete the action required.",
            "The task moves to Completed automatically.",
          ],
          keywords: ["tasks", "pending", "to-do", "action items"],
        },
        {
          id: "doc-dash-3",
          question: "How do I set my availability schedule?",
          answer:
            "Go to Availability in the sidebar to set your weekly schedule. Select the days you are available, set your start and end times, and save. The system uses this to book appointments for you during available hours.",
          steps: [
            "Click Availability in the sidebar.",
            "Select each day you are available.",
            "Set your start time and end time for each day.",
            "Add breaks if needed.",
            "Click Save to update your schedule.",
          ],
          keywords: ["availability", "schedule", "working hours", "set schedule"],
        },
        {
          id: "doc-dash-4",
          question: "How do I view my performance metrics?",
          answer:
            "Go to My Performance in the sidebar. This shows your personal metrics including total OPDs, treatments completed, cases handled, and revenue generated. You can filter by date range to track your progress over time.",
          steps: [
            "Click My Performance in the sidebar.",
            "Set a date range to view metrics for that period.",
            "Review your OPDs, treatments, cases, and revenue.",
            "Compare with previous periods using the date picker.",
          ],
          keywords: ["performance", "metrics", "OPD", "revenue", "my performance"],
        },
      ],
      workflows: [
        {
          id: "doc-dash-wf-1",
          title: "Starting Your Day",
          description:
            "A quick morning routine to prepare for the day's patients and tasks.",
          steps: [
            "Open the Dashboard each morning.",
            "Review today's appointment list and patient details.",
            "Check pending tasks and prioritise urgent ones.",
            "Verify your availability schedule is correct.",
            "Open My Queue to see patients waiting to see you.",
          ],
          keywords: ["morning routine", "start day", "daily preparation"],
          linkTo: "/treatments/queue",
          linkLabel: "My Queue",
        },
      ],
    },
    {
      id: "doc-patients",
      label: "Patients & Appointments",
      faqs: [
        {
          id: "doc-pat-1",
          question: "How do I view my patients?",
          answer:
            "Click Patients in the sidebar to see patients assigned to you or who have visited you. Each row shows the patient name, last visit date, and any active cases. Click a patient to open their full profile.",
          steps: [
            "Click Patients in the sidebar.",
            "Browse the list of your patients.",
            "Use the search bar to find a specific patient.",
            "Click a patient's name to view their profile.",
          ],
          keywords: ["patients", "view patients", "patient list"],
        },
        {
          id: "doc-pat-2",
          question: "How do I view a patient's dental history?",
          answer:
            "Open the patient's profile and review the tabs. The History tab shows all past appointments, treatments, and cases. You can see what procedures were done, when, and the outcomes.",
          steps: [
            "Open the Patients list and click on a patient.",
            "Click the History tab in the patient profile.",
            "Review past appointments, treatments, and cases.",
            "Click any entry for full details.",
          ],
          keywords: ["dental history", "patient history", "past treatments"],
          relatedIds: ["doc-pat-1"],
        },
        {
          id: "doc-pat-3",
          question: "How do I view today's appointments?",
          answer:
            "Your Dashboard shows today's appointments. For the full list, go to Appointments in the sidebar. You can see appointment time, patient name, reason for visit, and status.",
          steps: [
            "Check the Dashboard for today's appointment summary.",
            "Click Appointments for the full list.",
            "Review each appointment with time and patient details.",
            "Click an appointment to see the reason and any notes.",
          ],
          keywords: ["appointments", "today", "schedule", "view appointments"],
        },
        {
          id: "doc-pat-4",
          question: "What is My Queue?",
          answer:
            "My Queue shows patients who are currently waiting to see you. It updates in real time as patients check in. You can see how long each patient has been waiting and call them in from the queue.",
          steps: [
            "Click My Queue in the sidebar.",
            "See the list of patients waiting.",
            "Review how long each patient has been waiting.",
            "Click Call Next to bring in the next patient.",
          ],
          keywords: ["queue", "waiting", "patient queue", "call next"],
        },
      ],
      workflows: [
        {
          id: "doc-pat-wf-1",
          title: "Seeing a Patient from Queue",
          description:
            "Workflow for calling a patient from the queue, reviewing their history, and starting the consultation.",
          steps: [
            "Open My Queue and see who is waiting.",
            "Click Call Next to bring in the next patient.",
            "Review the patient's dental history in their profile.",
            "Begin the consultation and update the case or treatment.",
            "Mark the appointment as Completed when done.",
          ],
          keywords: ["see patient", "consultation", "queue workflow"],
        },
      ],
    },
    {
      id: "doc-treatments",
      label: "Treatments & Cases",
      faqs: [
        {
          id: "doc-treat-1",
          question: "How do I view my treatments?",
          answer:
            "Click Treatments in the sidebar to see all treatments assigned to you. Each row shows the patient name, treatment type, status, and dates. Use the status filter to focus on pending or in-progress treatments.",
          steps: [
            "Click Treatments in the sidebar.",
            "Review the list of treatments assigned to you.",
            "Use the status filter to narrow by Pending, In Progress, or Completed.",
            "Click any treatment to see full details.",
          ],
          keywords: ["treatments", "my treatments", "treatment list"],
        },
        {
          id: "doc-treat-2",
          question: "How do I update a treatment's status?",
          answer:
            "Open the treatment and update its status from the detail page. You can move it through stages like Planned, In Progress, and Completed. Adding notes at each stage helps track progress.",
          steps: [
            "Open the treatment from the Treatments list.",
            "Click the status dropdown.",
            "Select the new status (e.g., In Progress, Completed).",
            "Add any notes about the work done.",
            "Save the changes.",
          ],
          keywords: ["update status", "treatment status", "progress"],
          relatedIds: ["doc-treat-1"],
        },
        {
          id: "doc-treat-3",
          question: "How do I plan a treatment for a patient?",
          answer:
            "Open the patient's case and click Plan Treatment. Select the procedures needed, estimate the cost, and add clinical notes. Submit the plan for admin approval before starting work.",
          steps: [
            "Open the patient's case from Cases.",
            "Click Plan Treatment.",
            "Select the procedures from the list.",
            "Enter estimated cost and clinical notes.",
            "Click Submit for Approval.",
          ],
          keywords: ["plan treatment", "treatment plan", "procedures"],
        },
        {
          id: "doc-treat-4",
          question: "Can I view the Treatment Workflow Board?",
          answer:
            "Yes. Go to Treatments and switch to the Workflow Board view. This Kanban-style board shows your treatments across different stages. Drag and drop cards to update treatment status visually.",
          steps: [
            "Go to Treatments and click the Workflow Board tab.",
            "See treatments in columns by status.",
            "Drag a treatment card to the next column to update status.",
            "Click any card for full treatment details.",
          ],
          keywords: ["workflow board", "kanban", "visual", "drag and drop"],
        },
        {
          id: "doc-treat-5",
          question: "How do I view a patient's case details?",
          answer:
            "Click Cases in the sidebar and select the case you want to review. The detail page shows the patient information, dental issue description, attached images or X-rays, and any linked treatments.",
          steps: [
            "Click Cases in the sidebar.",
            "Browse or search for the case.",
            "Click on the case to open it.",
            "Review the description, images, and linked treatments.",
          ],
          keywords: ["case details", "dental case", "case review"],
        },
        {
          id: "doc-treat-6",
          question: "How do I view billing for my patients?",
          answer:
            "Click Billing in the sidebar to see invoices for patients you have treated. Each row shows the invoice number, patient name, amount, and payment status. You can view but not edit billing details.",
          steps: [
            "Click Billing in the sidebar.",
            "Review the list of invoices.",
            "Click an invoice to see the details.",
            "Check the payment status.",
          ],
          keywords: ["billing", "invoices", "view billing", "payment status"],
        },
      ],
      workflows: [
        {
          id: "doc-treat-wf-1",
          title: "Planning and Executing a Treatment",
          description:
            "From reviewing a case to planning a treatment, getting approval, and completing the work.",
          steps: [
            "Open the patient's case and review the dental issue.",
            "Click Plan Treatment and select the procedures.",
            "Add clinical notes and estimated cost.",
            "Submit the plan for admin approval.",
            "Once approved, update status to In Progress.",
            "Complete the treatment and mark as Completed.",
          ],
          keywords: ["treatment workflow", "plan", "execute", "complete"],
        },
        {
          id: "doc-treat-wf-2",
          title: "Using the Workflow Board",
          description:
            "Track your treatments visually using the Kanban-style Workflow Board.",
          steps: [
            "Go to Treatments and click Workflow Board.",
            "See all your treatments organised by status.",
            "Drag treatments to the next column as they progress.",
            "Click any card for full details.",
            "Use filters to focus on specific patients or statuses.",
          ],
          keywords: ["workflow board", "visual tracking", "kanban"],
        },
      ],
    },
    {
      id: "doc-queue",
      label: "My Queue",
      faqs: [
        {
          id: "doc-queue-1",
          question: "What is My Queue and how does it work?",
          answer:
            "My Queue shows patients who are currently checked in and waiting to see you. It updates in real time as the front desk checks patients in. You can see how long each patient has been waiting and call them in when ready.",
          steps: [
            "Click My Queue in the sidebar.",
            "See the list of waiting patients with wait times.",
            "Click Call Next to bring in the next patient.",
            "The patient is removed from the queue when you start seeing them.",
          ],
          keywords: ["queue", "waiting", "call next", "patient queue"],
        },
        {
          id: "doc-queue-2",
          question: "Can I see which patients are waiting for specific treatments?",
          answer:
            "The queue shows each patient's appointment reason and any treatment notes. This helps you prepare before calling them in. You can also check the patient's profile for more context.",
          steps: [
            "Open My Queue.",
            "Look at the Reason column for each patient.",
            "Click a patient's name to see their full profile.",
            "Review their treatment history before calling them in.",
          ],
          keywords: ["waiting", "treatment reason", "prepare", "patient info"],
          relatedIds: ["doc-queue-1"],
        },
        {
          id: "doc-queue-3",
          question: "How do I skip a patient in the queue?",
          answer:
            "Click the Skip button next to a patient to move them to the end of the queue. This is useful if a patient needs more time or if you need to see an urgent case first.",
          steps: [
            "Open My Queue.",
            "Find the patient you want to skip.",
            "Click the Skip button next to their name.",
            "The patient moves to the end of the queue.",
          ],
          keywords: ["skip", "reorder", "queue management", "urgent"],
        },
      ],
      workflows: [
        {
          id: "doc-queue-wf-1",
          title: "Managing Your Patient Queue",
          description:
            "How to efficiently work through your queue while handling urgent cases.",
          steps: [
            "Open My Queue at the start of your session.",
            "Check for any urgent cases flagged at the top.",
            "Call Next for the next regular patient.",
            "Skip patients if you need to handle an emergency.",
            "Review the queue periodically to manage wait times.",
          ],
          keywords: ["queue management", "efficiency", "urgent cases"],
        },
      ],
    },
    {
      id: "doc-lab-inv",
      label: "Laboratory & Inventory",
      faqs: [
        {
          id: "doc-lab-1",
          question: "How do I view lab work for my patients?",
          answer:
            "Open any patient case and scroll to the Lab Work section. This shows all lab assignments, their status (Pending, In Progress, Completed), and any results uploaded by the lab.",
          steps: [
            "Open the patient's case.",
            "Scroll to the Lab Work section.",
            "Review the list of lab assignments and their statuses.",
            "Click any assignment for more details.",
          ],
          keywords: ["lab work", "laboratory", "lab status", "lab results"],
        },
        {
          id: "doc-lab-2",
          question: "Can I assign lab work from a case?",
          answer:
            "Yes. Open the case and click Assign Lab Work. Select the lab, the test or prosthesis needed, and add any clinical instructions. The assignment is tracked within the case.",
          steps: [
            "Open the patient's case.",
            "Click Assign Lab Work.",
            "Select the lab from the dropdown.",
            "Choose the test or service required.",
            "Add clinical notes and instructions.",
            "Save the assignment.",
          ],
          keywords: ["assign lab", "lab assignment", "lab work"],
          relatedIds: ["doc-lab-1"],
        },
        {
          id: "doc-inv-1",
          question: "How do I view inventory items?",
          answer:
            "Click Inventory in the sidebar to see the current stock of items used in your practice. This is a view-only page for doctors. If you need to request items, raise an indent through your Hospital Admin.",
          steps: [
            "Click Inventory in the sidebar.",
            "Browse the list of items and their stock levels.",
            "Use the search bar to find a specific item.",
            "Contact your Hospital Admin to request items.",
          ],
          keywords: ["inventory", "stock", "items", "view inventory"],
        },
      ],
      workflows: [
        {
          id: "doc-lab-wf-1",
          title: "Requesting Lab Work for a Treatment",
          description:
            "Assign lab work as part of a treatment plan and track it to completion.",
          steps: [
            "Open the patient's treatment or case.",
            "Click Assign Lab Work.",
            "Select the lab and the required service.",
            "Add detailed clinical instructions.",
            "Save the assignment.",
            "Check back periodically for status updates.",
          ],
          keywords: ["lab workflow", "request lab", "lab assignment"],
        },
      ],
    },
    {
      id: "doc-consent",
      label: "Consent Forms & Settings",
      faqs: [
        {
          id: "doc-consent-1",
          question: "How do I view consent forms?",
          answer:
            "Open a patient's profile and click the Consent Forms tab. This shows all consent forms signed by the patient for various treatments. You can view the details but cannot edit signed forms.",
          steps: [
            "Open the patient's profile.",
            "Click the Consent Forms tab.",
            "Browse the list of consent forms.",
            "Click any form to view its details.",
          ],
          keywords: ["consent forms", "patient consent", "legal", "signatures"],
        },
        {
          id: "doc-set-1",
          question: "How do I update my profile settings?",
          answer:
            "Click Settings in the sidebar to open your profile settings. You can update your name, contact information, specialisation, and profile photo. Changes are saved when you click Update.",
          steps: [
            "Click Settings in the sidebar.",
            "Update your profile information.",
            "Change your profile photo if needed.",
            "Click Update to save changes.",
          ],
          keywords: ["settings", "profile", "update profile", "personal info"],
        },
        {
          id: "doc-set-2",
          question: "Can I change my password?",
          answer:
            "Yes. Go to Settings and click Change Password. Enter your current password and the new password twice to confirm. Click Update to save the new password.",
          steps: [
            "Go to Settings.",
            "Click Change Password.",
            "Enter your current password.",
            "Enter the new password and confirm it.",
            "Click Update to save.",
          ],
          keywords: ["password", "change password", "security", "account"],
        },
        {
          id: "doc-set-3",
          question: "How do I manage my notification preferences?",
          answer:
            "Go to Settings and look for Notification Preferences. You can choose which notifications you receive, such as new appointment alerts, task assignments, and patient messages.",
          steps: [
            "Go to Settings.",
            "Find the Notification Preferences section.",
            "Toggle notifications on or off for each type.",
            "Save your preferences.",
          ],
          keywords: ["notifications", "preferences", "alerts", "settings"],
        },
      ],
      workflows: [
        {
          id: "doc-set-wf-1",
          title: "Setting Up Your Profile and Availability",
          description:
            "Initial setup steps when you first log in as a doctor.",
          steps: [
            "Go to Settings and update your profile information.",
            "Upload a professional profile photo.",
            "Go to Availability and set your weekly schedule.",
            "Set your notification preferences.",
            "Verify everything is correct by checking your Dashboard.",
          ],
          keywords: ["setup", "profile", "availability", "initial setup"],
        },
      ],
    },
  ],
}

// ─── COMBINED EXPORT ─────────────────────────────────────────────────────────

export const helpByRole: Record<HelpRole, RoleHelpData> = {
  GROUP_ADMIN: groupAdminHelp,
  HOSPITAL_ADMIN: hospitalAdminHelp,
  DOCTOR: doctorHelp,
}

// ─── SEARCH HELPER ───────────────────────────────────────────────────────────

export function searchHelp(
  data: RoleHelpData,
  query: string,
): { faqs: FaqItem[]; workflows: WorkflowGuide[] } {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1)

  if (terms.length === 0) {
    return { faqs: [], workflows: [] }
  }

  function matchesText(text: string): boolean {
    const lower = text.toLowerCase()
    return terms.every((term) => lower.includes(term))
  }

  const matchedFaqs: FaqItem[] = []
  const matchedWorkflows: WorkflowGuide[] = []

  for (const category of data.categories) {
    for (const faq of category.faqs) {
      const searchable = [faq.question, faq.answer, ...faq.keywords].join(" ")
      if (matchesText(searchable)) {
        matchedFaqs.push(faq)
      }
    }

    for (const workflow of category.workflows) {
      const searchable = [
        workflow.title,
        workflow.description,
        ...workflow.keywords,
      ].join(" ")
      if (matchesText(searchable)) {
        matchedWorkflows.push(workflow)
      }
    }
  }

  return { faqs: matchedFaqs, workflows: matchedWorkflows }
}
