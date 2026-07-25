import React, { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings2,
  Users,
  Stethoscope,
  ClipboardList,
  HeartPulse,
  Bell,
  Calendar,
  Clock,
  UserCheck,
  Zap,
  Eye,
  Info,
  CheckCircle2,
} from "lucide-react";
import {
  SettingsPage,
  SettingsSection,
  SettingsGrid,
  SettingsField,
  SettingsNumberInput,
  SettingsTextInput,
  SettingsDropdown,
  SettingsSwitch,
  SettingsSaveBar,
  SettingsSkeleton,
  PreviewCard,
  PreviewRow,
} from "@/components/settings";
import { SettingsSchema, type SettingsFormType, getDefaults } from "@/components/settings/schemas";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { crmSettingsApi } from "@/services/endpoints";

const TABS = [
  { key: "general", label: "General", icon: Settings2, color: "from-blue-500 to-indigo-600" },
  { key: "lead", label: "Lead", icon: Users, color: "from-emerald-500 to-teal-600" },
  { key: "opd", label: "OPD", icon: Stethoscope, color: "from-violet-500 to-purple-600" },
  { key: "treatment", label: "Treatment", icon: ClipboardList, color: "from-amber-500 to-orange-600" },
  { key: "case", label: "Case", icon: HeartPulse, color: "from-rose-500 to-pink-600" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const TAB_TO_API_SECTION: Record<TabKey, string> = {
  general: "general",
  lead: "lead",
  opd: "opd",
  treatment: "treatment",
  case: "case_follow_up",
};

const TAB_TO_FORM_KEY: Record<TabKey, keyof SettingsFormType> = {
  general: "general",
  lead: "lead",
  opd: "opd",
  treatment: "treatment",
  case: "case_follow_up",
};

const ASSIGN_OPTIONS = [
  { value: "", label: "Auto-assign (Round Robin)" },
  { value: "admin", label: "Admin" },
  { value: "reception", label: "Reception" },
  { value: "doctor", label: "Doctor" },
  { value: "manager", label: "Manager" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export default function CrmSettingsPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [showPreview, setShowPreview] = useState(false);

  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ["crmSettings"],
    queryFn: () => crmSettingsApi.crmConfig.getGeneral().then((r: any) => r),
  });

  const data = settingsData?.data ?? settingsData;

  const form = useForm<SettingsFormType>({
    resolver: zodResolver(SettingsSchema),
    defaultValues: getDefaults(data),
    mode: "onChange",
  });

  const {
    handleSubmit,
    reset,
    formState: { isDirty },
    watch,
    getValues,
  } = form;

  useEffect(() => {
    if (data) {
      reset(getDefaults(data));
    }
  }, [data, reset]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const saveMutation = useMutation({
    mutationFn: async (values: SettingsFormType) => {
      const section = TAB_TO_API_SECTION[activeTab];
      const payload = values[TAB_TO_FORM_KEY[activeTab]];
      const api = crmSettingsApi.crmConfig;
      switch (section) {
        case "general": return api.updateGeneral(payload as any);
        case "lead": return api.updateLead(payload as any);
        case "opd": return api.updateOpd(payload as any);
        case "treatment": return api.updateTreatment("", payload as any);
        case "case_follow_up": return api.updateCase("follow_up", payload as any);
        default: throw new Error(`Unknown section: ${section}`);
      }
    },
    onSuccess: () => {
      addToast({ variant: "success", title: "Settings saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["crmSettings"] });
      reset(getValues());
    },
    onError: (error: any) => {
      addToast({ variant: "destructive", title: error?.message || "Failed to save settings" });
    },
  });

  const handleSave = useCallback(async () => {
    await saveMutation.mutateAsync(getValues());
  }, [saveMutation, getValues]);

  const handleReset = useCallback(() => {
    reset(getDefaults(data));
  }, [reset, data]);

  if (settingsLoading) {
    return (
      <SettingsPage
        title="CRM Settings"
        description="Configure your CRM follow-up and notification settings"
        icon={<Settings2 className="w-5 h-5" />}
      >
        <SettingsSkeleton />
      </SettingsPage>
    );
  }

  const previewValues = watch();

  return (
    <>
      <SettingsPage
        title="CRM Settings"
        description="Configure your CRM follow-up and notification settings"
        icon={<Settings2 className="w-5 h-5" />}
        actions={
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={cn(
              "h-8 px-3 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5",
              "border border-[var(--color-border)] bg-white",
              showPreview
                ? "text-[var(--color-primary)] border-[var(--color-primary)]/30 bg-[var(--color-primary-light)]"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg)]"
            )}
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
          </button>
        }
      >
        {/* Tab Navigation */}
        <div className="mb-6">
          <div className="flex gap-1 p-1 bg-white rounded-xl border border-[var(--color-border)] shadow-[var(--shadow-card)] overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                    isActive
                      ? "bg-gradient-to-r text-white shadow-sm " + tab.color
                      : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg)]"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content + Preview */}
        <div className={cn("grid gap-6", showPreview ? "lg:grid-cols-[1fr,380px]" : "")}>
          <form onSubmit={handleSubmit(handleSave)}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === "general" && <GeneralTab form={form} />}
                {activeTab === "lead" && <LeadTab form={form} />}
                {activeTab === "opd" && <OpdTab form={form} />}
                {activeTab === "treatment" && <TreatmentTab form={form} />}
                {activeTab === "case" && <CaseTab form={form} />}
              </motion.div>
            </AnimatePresence>
          </form>

          {showPreview && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="hidden lg:block"
            >
              <div className="sticky top-6">
                <PreviewPanel values={previewValues} activeTab={activeTab} />
              </div>
            </motion.div>
          )}
        </div>
      </SettingsPage>

      <SettingsSaveBar
        visible={isDirty}
        isSaving={saveMutation.isPending}
        hasChanges={isDirty}
        onSave={handleSave}
        onReset={handleReset}
      />
    </>
  );
}

// ─── General Tab ─────────────────────────────────────────────────────────────
function GeneralTab({ form }: { form: any }) {
  return (
    <div className="space-y-5">
      <SettingsSection title="Welcome & Notifications" description="Configure your welcome message and notification preferences" icon={<Bell className="w-4 h-4" />}>
        <SettingsField label="Welcome Message" description="Displayed to patients after their first interaction" error={form.formState.errors.general?.welcome_message?.message}>
          <SettingsTextInput
            value={form.watch("general.welcome_message")}
            onChange={(val) => form.setValue("general.welcome_message", val, { shouldDirty: true })}
            placeholder="Enter welcome message..."
            multiline
          />
        </SettingsField>
        <SettingsGrid columns={2} className="mt-4">
          <SettingsField label="Default Priority" description="Priority for new leads">
            <SettingsDropdown
              value={form.watch("general.default_priority")}
              onValueChange={(val) => form.setValue("general.default_priority", val as any, { shouldDirty: true })}
              options={PRIORITY_OPTIONS}
            />
          </SettingsField>
          <SettingsField label="Reminder Time" description="Time for daily reminders">
            <SettingsTextInput
              value={form.watch("general.reminder_time")}
              onChange={(val) => form.setValue("general.reminder_time", val, { shouldDirty: true })}
              placeholder="10:00"
            />
          </SettingsField>
        </SettingsGrid>
      </SettingsSection>

      <SettingsSection title="Follow-Up Intervals" description="Default intervals for follow-up scheduling" icon={<Clock className="w-4 h-4" />}>
        <SettingsGrid columns={3}>
          <SettingsField label="Follow-Up Reminder" description="Days" error={form.formState.errors.general?.reminder_days?.message}>
            <SettingsNumberInput value={form.watch("general.reminder_days")} onChange={(val) => form.setValue("general.reminder_days", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="Recall Interval" description="Days between recalls">
            <SettingsNumberInput value={form.watch("general.recall_interval_days")} onChange={(val) => form.setValue("general.recall_interval_days", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={365} />
          </SettingsField>
          <SettingsField label="Wellness Interval" description="Days between wellness checks">
            <SettingsNumberInput value={form.watch("general.wellness_interval_days")} onChange={(val) => form.setValue("general.wellness_interval_days", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={365} />
          </SettingsField>
        </SettingsGrid>
      </SettingsSection>

      <SettingsSection title="OPD Settings" description="Outpatient department configuration" icon={<Stethoscope className="w-4 h-4" />}>
        <SettingsField label="Slot Duration" description="Default appointment slot duration">
          <SettingsNumberInput value={form.watch("general.opd_slot_duration")} onChange={(val) => form.setValue("general.opd_slot_duration", val === "" ? 30 : val, { shouldDirty: true })} suffix="min" min={5} max={120} className="max-w-[180px]" />
        </SettingsField>
      </SettingsSection>

      <SettingsSection title="Automation" description="Enable or disable automatic CRM actions" icon={<Zap className="w-4 h-4" />}>
        <div className="space-y-4">
          <SettingsField label="Enable Notifications" description="Send push notifications for follow-up reminders" layout="horizontal">
            <SettingsSwitch checked={form.watch("general.notification_enabled")} onCheckedChange={(val) => form.setValue("general.notification_enabled", val, { shouldDirty: true })} />
          </SettingsField>
          <SettingsField label="Auto-Assign" description="Automatically assign leads to team members" layout="horizontal">
            <SettingsSwitch checked={form.watch("general.auto_assign_enabled")} onCheckedChange={(val) => form.setValue("general.auto_assign_enabled", val, { shouldDirty: true })} />
          </SettingsField>
        </div>
      </SettingsSection>
    </div>
  );
}

// ─── Lead Tab ────────────────────────────────────────────────────────────────
function LeadTab({ form }: { form: any }) {
  return (
    <div className="space-y-5">
      <SettingsSection title="Follow-Up Delays" description="Configure automatic follow-up timing for leads at each stage" icon={<Calendar className="w-4 h-4" />}>
        <SettingsGrid columns={3}>
          <SettingsField label="First Follow-Up" error={form.formState.errors.lead?.lead_first_follow_up?.message}>
            <SettingsNumberInput value={form.watch("lead.lead_first_follow_up")} onChange={(val) => form.setValue("lead.lead_first_follow_up", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="Second Follow-Up" error={form.formState.errors.lead?.lead_second_follow_up?.message}>
            <SettingsNumberInput value={form.watch("lead.lead_second_follow_up")} onChange={(val) => form.setValue("lead.lead_second_follow_up", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="First Call" error={form.formState.errors.lead?.lead_first_call?.message}>
            <SettingsNumberInput value={form.watch("lead.lead_first_call")} onChange={(val) => form.setValue("lead.lead_first_call", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="Second Call">
            <SettingsNumberInput value={form.watch("lead.lead_second_call")} onChange={(val) => form.setValue("lead.lead_second_call", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="Missed Call">
            <SettingsNumberInput value={form.watch("lead.lead_missed_call")} onChange={(val) => form.setValue("lead.lead_missed_call", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="OPD Conversion">
            <SettingsNumberInput value={form.watch("lead.lead_opd_conversion")} onChange={(val) => form.setValue("lead.lead_opd_conversion", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="No Response">
            <SettingsNumberInput value={form.watch("lead.lead_no_response")} onChange={(val) => form.setValue("lead.lead_no_response", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="Converted">
            <SettingsNumberInput value={form.watch("lead.lead_converted")} onChange={(val) => form.setValue("lead.lead_converted", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="Lost">
            <SettingsNumberInput value={form.watch("lead.lead_lost")} onChange={(val) => form.setValue("lead.lead_lost", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
        </SettingsGrid>
      </SettingsSection>

      <SettingsSection title="Assignment" description="Control how leads are assigned to team members" icon={<UserCheck className="w-4 h-4" />}>
        <SettingsField label="Default Assignee" description="Who receives new leads by default">
          <SettingsDropdown
            value={form.watch("lead.assign_to") || ""}
            onValueChange={(val) => form.setValue("lead.assign_to", val || null, { shouldDirty: true })}
            options={ASSIGN_OPTIONS}
            placeholder="Auto-assign (Round Robin)"
          />
        </SettingsField>
      </SettingsSection>
    </div>
  );
}

// ─── OPD Tab ─────────────────────────────────────────────────────────────────
function OpdTab({ form }: { form: any }) {
  return (
    <div className="space-y-5">
      <SettingsSection title="OPD Follow-Up Delays" description="Configure automatic follow-up timing for OPD visits" icon={<Stethoscope className="w-4 h-4" />}>
        <SettingsGrid columns={2}>
          <SettingsField label="Visit Completed" description="Days after a completed visit to trigger follow-up">
            <SettingsNumberInput value={form.watch("opd.opd_visit_completed")} onChange={(val) => form.setValue("opd.opd_visit_completed", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="No Show" description="Days after a missed appointment">
            <SettingsNumberInput value={form.watch("opd.opd_no_show")} onChange={(val) => form.setValue("opd.opd_no_show", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="Converted" description="Days after OPD-to-treatment conversion">
            <SettingsNumberInput value={form.watch("opd.opd_converted")} onChange={(val) => form.setValue("opd.opd_converted", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="No Response" description="Days before escalating no-response cases">
            <SettingsNumberInput value={form.watch("opd.opd_no_response")} onChange={(val) => form.setValue("opd.opd_no_response", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
        </SettingsGrid>
      </SettingsSection>

      <SettingsSection title="Assignment" description="Default assignee for OPD follow-ups" icon={<UserCheck className="w-4 h-4" />}>
        <SettingsField label="Default Assignee">
          <SettingsDropdown
            value={form.watch("opd.assign_to") || ""}
            onValueChange={(val) => form.setValue("opd.assign_to", val || null, { shouldDirty: true })}
            options={ASSIGN_OPTIONS}
            placeholder="Auto-assign (Round Robin)"
          />
        </SettingsField>
      </SettingsSection>
    </div>
  );
}

// ─── Treatment Tab ───────────────────────────────────────────────────────────
function TreatmentTab({ form }: { form: any }) {
  return (
    <div className="space-y-5">
      <SettingsSection title="Treatment Follow-Up Delays" description="Configure automatic follow-up timing for treatment stages" icon={<ClipboardList className="w-4 h-4" />}>
        <SettingsGrid columns={3}>
          <SettingsField label="Treatment Completed" description="After final treatment completion">
            <SettingsNumberInput value={form.watch("treatment.treatment_completed")} onChange={(val) => form.setValue("treatment.treatment_completed", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="Visit Completed" description="After each treatment visit">
            <SettingsNumberInput value={form.watch("treatment.treatment_visit_completed")} onChange={(val) => form.setValue("treatment.treatment_visit_completed", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="No Show" description="After a missed treatment visit">
            <SettingsNumberInput value={form.watch("treatment.treatment_no_show")} onChange={(val) => form.setValue("treatment.treatment_no_show", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="Converted">
            <SettingsNumberInput value={form.watch("treatment.treatment_converted")} onChange={(val) => form.setValue("treatment.treatment_converted", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="No Response">
            <SettingsNumberInput value={form.watch("treatment.treatment_no_response")} onChange={(val) => form.setValue("treatment.treatment_no_response", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
        </SettingsGrid>
      </SettingsSection>

      <SettingsSection title="Wellness Behavior" description="Control wellness follow-up behavior for treatments" icon={<HeartPulse className="w-4 h-4" />}>
        <SettingsField label="Skip Wellness if Appointment Scheduled" description="Don't create wellness enquiry if patient has an upcoming appointment" layout="horizontal">
          <SettingsSwitch checked={form.watch("treatment.skip_wellness_if_appointment")} onCheckedChange={(val) => form.setValue("treatment.skip_wellness_if_appointment", val, { shouldDirty: true })} />
        </SettingsField>
      </SettingsSection>

      <SettingsSection title="Assignment" description="Default assignee for treatment follow-ups" icon={<UserCheck className="w-4 h-4" />}>
        <SettingsField label="Default Assignee">
          <SettingsDropdown
            value={form.watch("treatment.assign_to") || ""}
            onValueChange={(val) => form.setValue("treatment.assign_to", val || null, { shouldDirty: true })}
            options={ASSIGN_OPTIONS}
            placeholder="Auto-assign (Round Robin)"
          />
        </SettingsField>
      </SettingsSection>
    </div>
  );
}

// ─── Case Tab ────────────────────────────────────────────────────────────────
function CaseTab({ form }: { form: any }) {
  return (
    <div className="space-y-5">
      <SettingsSection title="Case Follow-Up Delays" description="Configure automatic follow-up timing for dental cases" icon={<HeartPulse className="w-4 h-4" />}>
        <SettingsGrid columns={3}>
          <SettingsField label="Case Follow-Up" description="General case follow-up interval">
            <SettingsNumberInput value={form.watch("case_follow_up.case_follow_up")} onChange={(val) => form.setValue("case_follow_up.case_follow_up", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="Case Completed" description="After case is marked complete">
            <SettingsNumberInput value={form.watch("case_follow_up.case_completed")} onChange={(val) => form.setValue("case_follow_up.case_completed", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="Case Created" description="After a new case is created">
            <SettingsNumberInput value={form.watch("case_follow_up.case_created")} onChange={(val) => form.setValue("case_follow_up.case_created", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="Case Approved" description="After case is approved by admin">
            <SettingsNumberInput value={form.watch("case_follow_up.case_approved")} onChange={(val) => form.setValue("case_follow_up.case_approved", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="No Show">
            <SettingsNumberInput value={form.watch("case_follow_up.case_no_show")} onChange={(val) => form.setValue("case_follow_up.case_no_show", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
          <SettingsField label="No Response">
            <SettingsNumberInput value={form.watch("case_follow_up.case_no_response")} onChange={(val) => form.setValue("case_follow_up.case_no_response", val === "" ? 0 : val, { shouldDirty: true })} suffix="days" min={0} max={30} />
          </SettingsField>
        </SettingsGrid>
      </SettingsSection>

      <SettingsSection title="Assignment" description="Default assignee for case follow-ups" icon={<UserCheck className="w-4 h-4" />}>
        <SettingsField label="Default Assignee">
          <SettingsDropdown
            value={form.watch("case_follow_up.assign_to") || ""}
            onValueChange={(val) => form.setValue("case_follow_up.assign_to", val || null, { shouldDirty: true })}
            options={ASSIGN_OPTIONS}
            placeholder="Auto-assign (Round Robin)"
          />
        </SettingsField>
      </SettingsSection>
    </div>
  );
}

// ─── Preview Panel ───────────────────────────────────────────────────────────
function PreviewPanel({ values, activeTab }: { values: SettingsFormType; activeTab: TabKey }) {
  const formKey = TAB_TO_FORM_KEY[activeTab];
  const sectionData = values[formKey] as any;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Eye className="w-4 h-4 text-[var(--color-primary)]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Live Preview</h3>
      </div>

      <PreviewCard title={`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Settings`} description="Current configuration" icon={<Info className="w-4 h-4" />}>
        {activeTab === "general" && (
          <>
            <PreviewRow label="Welcome Message" value={values.general.welcome_message.slice(0, 40) + "..."} />
            <PreviewRow label="Priority" value={values.general.default_priority} highlight />
            <PreviewRow label="Slot Duration" value={`${values.general.opd_slot_duration} min`} />
            <PreviewRow label="Recall Interval" value={`${values.general.recall_interval_days} days`} />
            <PreviewRow label="Wellness Interval" value={`${values.general.wellness_interval_days} days`} />
            <PreviewRow label="Notifications" value={values.general.notification_enabled ? "Enabled" : "Disabled"} />
          </>
        )}
        {activeTab === "lead" && (
          <>
            <PreviewRow label="1st Follow-Up" value={`${values.lead.lead_first_follow_up} days`} highlight />
            <PreviewRow label="2nd Follow-Up" value={`${values.lead.lead_second_follow_up} days`} />
            <PreviewRow label="1st Call" value={`${values.lead.lead_first_call} days`} />
            <PreviewRow label="Missed Call" value={`${values.lead.lead_missed_call} days`} />
            <PreviewRow label="Assignee" value={values.lead.assign_to || "Auto-assign"} />
          </>
        )}
        {activeTab === "opd" && (
          <>
            <PreviewRow label="Visit Completed" value={`${values.opd.opd_visit_completed} days`} highlight />
            <PreviewRow label="No Show" value={`${values.opd.opd_no_show} days`} />
            <PreviewRow label="Converted" value={`${values.opd.opd_converted} days`} />
            <PreviewRow label="Assignee" value={values.opd.assign_to || "Auto-assign"} />
          </>
        )}
        {activeTab === "treatment" && (
          <>
            <PreviewRow label="Completed" value={`${values.treatment.treatment_completed} days`} highlight />
            <PreviewRow label="Visit" value={`${values.treatment.treatment_visit_completed} days`} />
            <PreviewRow label="Skip Wellness" value={values.treatment.skip_wellness_if_appointment ? "Yes" : "No"} />
            <PreviewRow label="Assignee" value={values.treatment.assign_to || "Auto-assign"} />
          </>
        )}
        {activeTab === "case" && (
          <>
            <PreviewRow label="Follow-Up" value={`${values.case_follow_up.case_follow_up} days`} highlight />
            <PreviewRow label="Completed" value={`${values.case_follow_up.case_completed} days`} />
            <PreviewRow label="Created" value={`${values.case_follow_up.case_created} days`} />
            <PreviewRow label="Assignee" value={values.case_follow_up.assign_to || "Auto-assign"} />
          </>
        )}
      </PreviewCard>

      <PreviewCard title="Quick Summary" description="Follow-up schedule overview" icon={<CheckCircle2 className="w-4 h-4" />}>
        <div className="space-y-1.5">
          {Object.entries(sectionData || {}).map(([key, val]) => {
            if (key === "assign_to" || typeof val !== "number") return null;
            if (val === 0) return null;
            return (
              <PreviewRow
                key={key}
                label={key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                value={`${val} days`}
              />
            );
          })}
        </div>
      </PreviewCard>
    </div>
  );
}
