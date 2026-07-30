import React, { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings2,
  Users,
  Stethoscope,
  ClipboardList,
  HeartPulse,
  Eye,
  Info,
  CheckCircle2,
  Clock,
  Calendar,
  Zap,
  Shield,
  Bell,
  AlertTriangle,
  Check,
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
  { key: "general", label: "General", icon: Zap, color: "from-blue-600 to-indigo-600", desc: "Global CRM automation behavior and business hours" },
  { key: "lead", label: "Lead", icon: Users, color: "from-emerald-500 to-teal-600", desc: "New lead follow-up automation" },
  { key: "opd", label: "OPD", icon: Stethoscope, color: "from-violet-500 to-purple-600", desc: "Post-consultation follow-up" },
  { key: "treatment", label: "Treatment", icon: ClipboardList, color: "from-amber-500 to-orange-600", desc: "Treatment completion wellness checks" },
  { key: "case", label: "Case", icon: HeartPulse, color: "from-rose-500 to-pink-600", desc: "Case recovery and periodic recall" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const WEEKEND_OPTIONS = [
  { value: "SKIP", label: "Skip (skip non-working days)" },
  { value: "INCLUDE", label: "Include (treat all days equally)" },
];

const DAY_LABELS: Record<string, string> = {
  MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun",
};

export default function CrmSettingsPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [showPreview, setShowPreview] = useState(false);

  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ["crmSettings"],
    queryFn: async () => {
      const [general, lead, opd, treatment, caseSettings] = await Promise.all([
        crmSettingsApi.crmConfig.getGeneral(),
        crmSettingsApi.crmConfig.getLead(),
        crmSettingsApi.crmConfig.getOpd(),
        crmSettingsApi.crmConfig.getTreatment(),
        crmSettingsApi.crmConfig.getCase(),
      ]);
      const generalConfig = general?.config ?? general?.data ?? general;
      const leadConfig = lead?.config ?? lead;
      const opdConfig = opd?.config ?? opd;
      const treatmentItems = Array.isArray(treatment?.items) ? treatment.items : [];
      const caseData = caseSettings?.data ?? caseSettings;
      return { general: generalConfig, lead: leadConfig, opd: opdConfig, treatment: treatmentItems, case: caseData };
    },
    staleTime: 30000,
  });

  const data = settingsData;

  const form = useForm<SettingsFormType>({
    resolver: zodResolver(SettingsSchema),
    defaultValues: getDefaults(data as Record<string, unknown>),
    mode: "onChange",
  });

  const {
    handleSubmit,
    reset,
    formState: { isDirty, errors },
    watch,
    getValues,
  } = form;

  useEffect(() => {
    if (data) {
      reset(getDefaults(data as Record<string, unknown>));
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
      const api = crmSettingsApi.crmConfig;
      switch (activeTab) {
        case "general": {
          const g = values.general;
          return api.updateGeneral({
            crm_enabled: String(g.enabled),
            crm_working_days: g.working_days,
            crm_reminder_time: g.reminder_time,
            crm_business_start: g.business_start,
            crm_business_end: g.business_end,
            crm_timezone: g.timezone,
            crm_reminder_offset: String(g.reminder_offset_days),
            crm_weekend_policy: g.weekend_policy,
          });
        }
        case "lead":
          return api.updateLead({
            enabled: values.lead.enabled,
            start_delay_days: values.lead.start_delay_days,
            auto_close_on_completion: values.lead.auto_close_on_completion,
            skip_wellness_if_appointment: values.lead.skip_wellness_if_appointment,
            max_attempts: values.lead.max_attempts,
            days_between_attempts: values.lead.days_between_attempts,
            auto_close_after_final: values.lead.auto_close_after_final,
            auto_close_action: values.lead.auto_close_action,
            stop_automation_on: values.lead.stop_automation_on,
          });
        case "opd":
          return api.updateOpd({
            enabled: values.opd.enabled,
            start_delay_days: values.opd.start_delay_days,
            auto_close_on_completion: values.opd.auto_close_on_completion,
            skip_wellness_if_appointment: values.opd.skip_wellness_if_appointment,
            max_attempts: values.opd.max_attempts,
            days_between_attempts: values.opd.days_between_attempts,
            auto_close_after_final: values.opd.auto_close_after_final,
            auto_close_action: values.opd.auto_close_action,
            stop_automation_on: values.opd.stop_automation_on,
          });
        case "treatment": {
          const t = values.treatment;
          return api.updateTreatmentDefaults({
            enabled: t.enabled,
            start_delay_days: t.start_delay_days,
            auto_close_on_completion: t.auto_close_on_completion,
            skip_wellness_if_appointment: t.skip_wellness_if_appointment,
          });
        }
        case "case": {
          const c = values.case;
          await api.updateCase("recovery", {
            enabled: c.recovery.enabled,
            start_delay_days: c.recovery.start_delay_days,
            auto_close_on_completion: c.recovery.auto_close_on_completion,
            skip_wellness_if_appointment: c.recovery.skip_wellness_if_appointment,
          });
          return api.updateCase("recall", {
            enabled: c.recall.enabled,
            start_delay_days: c.recall.start_delay_days,
            auto_close_on_completion: c.recall.auto_close_on_completion,
            skip_wellness_if_appointment: c.recall.skip_wellness_if_appointment,
          });
        }
        default:
          throw new Error(`Unknown tab: ${activeTab}`);
      }
    },
    onSuccess: () => {
      addToast({ variant: "success", title: "Settings saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["crmSettings"] });
      reset(getValues());
    },
    onError: (err: Error) => {
      addToast({ variant: "destructive", title: err?.message || "Failed to save settings" });
    },
  });

  const handleSave = useCallback(async () => {
    await saveMutation.mutateAsync(getValues());
  }, [saveMutation, getValues]);

  const handleReset = useCallback(() => {
    if (data) {
      reset(getDefaults(data as Record<string, unknown>));
      addToast({ variant: "success", title: "Changes discarded" });
    }
  }, [reset, data, addToast]);

  const hasErrors = Object.keys(errors).length > 0;

  if (settingsLoading) {
    return (
      <SettingsPage
        title="CRM Settings"
        description="Configure automation rules for the Dental ERP lifecycle"
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
        description="Configure automation rules for the Dental ERP lifecycle"
        icon={<Settings2 className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <div className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium",
              isDirty ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
            )}>
              <div className={cn("w-1.5 h-1.5 rounded-full", isDirty ? "bg-amber-500 animate-pulse" : "bg-emerald-500")} />
              {isDirty ? "Unsaved changes" : "All saved"}
            </div>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={cn(
                "h-8 px-3 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5",
                "border border-[var(--ds-border)] bg-[var(--ds-surface)]",
                showPreview
                  ? "text-[var(--ds-primary)] border-[var(--ds-primary)]/30 bg-[var(--ds-primary-subtle)]"
                  : "text-[var(--ds-text-secondary)] hover:text-[var(--ds-text)] hover:bg-[var(--ds-surface-hover)]"
              )}
            >
              <Eye className="w-3.5 h-3.5" />
              Preview
            </button>
          </div>
        }
      >
        <div className="mb-6">
          <div className="flex gap-1 p-1 bg-[var(--ds-surface)] rounded-[var(--ds-radius-xl)] border border-[var(--ds-border)] shadow-sm overflow-x-auto">
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
                      : "text-[var(--ds-text-secondary)] hover:text-[var(--ds-text)] hover:bg-[var(--ds-surface-hover)]"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className={cn("grid gap-6", showPreview ? "lg:grid-cols-[1fr,380px]" : "")}>
          <form onSubmit={handleSubmit(handleSave)} className="space-y-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {activeTab === "general" && <GeneralTab form={form} />}
                {activeTab === "lead" && <LeadTab form={form} />}
                {activeTab === "opd" && <OpdTab form={form} />}
                {activeTab === "treatment" && <TreatmentTab form={form} />}
                {activeTab === "case" && <CaseTab form={form} />}
              </motion.div>
            </AnimatePresence>

            {hasErrors && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Please fix form errors before saving</span>
              </motion.div>
            )}
          </form>

          {showPreview && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="hidden lg:block"
            >
              <div className="sticky top-6 space-y-4">
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

type TabProps = { form: UseFormReturn<SettingsFormType> };

function GeneralTab({ form }: TabProps) {
  const workingDays = form.watch("general.working_days") || "";
  const selectedDays = workingDays.split(",").map((d) => d.trim()).filter(Boolean);
  const enabled = form.watch("general.enabled");

  const toggleDay = (day: string) => {
    const current = form.getValues("general.working_days") || "";
    const days = current.split(",").map((d) => d.trim()).filter(Boolean);
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => {
      const order = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
      return order.indexOf(a) - order.indexOf(b);
    });
    form.setValue("general.working_days", next.join(","), { shouldDirty: true });
  };

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Global Behavior"
        description="Control the overall CRM automation system for your hospital"
        icon={<Zap className="w-4 h-4" />}
      >
        <SettingsField
          label="Enable CRM Automation"
          description="Master switch for all automated follow-ups, reminders, and enquiries. When disabled, no CRM automation runs."
          layout="horizontal"
        >
          <SettingsSwitch
            checked={enabled}
            onCheckedChange={(val) => form.setValue("general.enabled", val, { shouldDirty: true })}
          />
        </SettingsField>

        {!enabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700 mt-3"
          >
            <Shield className="w-4 h-4 shrink-0" />
            <span>CRM automation is disabled. No follow-ups or reminders will be generated.</span>
          </motion.div>
        )}

        <div className={cn("transition-all", enabled ? "opacity-100" : "opacity-50 pointer-events-none")}>
          <SettingsGrid columns={2} className="mt-4">
            <SettingsField label="Reminder Time" description="Time of day for sending follow-up reminders">
              <SettingsTextInput
                value={form.watch("general.reminder_time")}
                onChange={(val) => form.setValue("general.reminder_time", val, { shouldDirty: true })}
                placeholder="09:00"
              />
            </SettingsField>
            <SettingsField
              label="Reminder Offset"
              description="Days before an appointment to send a reminder notification"
              error={form.formState.errors.general?.reminder_offset_days?.message}
            >
              <SettingsNumberInput
                value={form.watch("general.reminder_offset_days")}
                onChange={(val) => form.setValue("general.reminder_offset_days", val === "" ? 0 : val, { shouldDirty: true })}
                suffix="days"
                min={0}
                max={30}
              />
            </SettingsField>
          </SettingsGrid>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Working Hours"
        description="Business hours used for scheduling and follow-up due date calculations"
        icon={<Clock className="w-4 h-4" />}
      >
        <SettingsGrid columns={2}>
          <SettingsField label="Business Start" description="Start of the hospital's working day">
            <SettingsTextInput
              value={form.watch("general.business_start")}
              onChange={(val) => form.setValue("general.business_start", val, { shouldDirty: true })}
              placeholder="09:00"
            />
          </SettingsField>
          <SettingsField label="Business End" description="End of the hospital's working day">
            <SettingsTextInput
              value={form.watch("general.business_end")}
              onChange={(val) => form.setValue("general.business_end", val, { shouldDirty: true })}
              placeholder="18:00"
            />
          </SettingsField>
        </SettingsGrid>
      </SettingsSection>

      <SettingsSection
        title="Working Days"
        description="Select which days of the week the hospital is open for business"
        icon={<Calendar className="w-4 h-4" />}
      >
        <div className="flex gap-2 flex-wrap">
          {Object.entries(DAY_LABELS).map(([key, label]) => {
            const isSelected = selectedDays.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleDay(key)}
                className={cn(
                  "relative px-4 py-2.5 rounded-lg text-sm font-medium transition-all border",
                  isSelected
                    ? "bg-[var(--ds-primary)] text-white border-[var(--ds-primary)] shadow-sm"
                    : "bg-[var(--ds-surface)] text-[var(--ds-text-secondary)] border-[var(--ds-border)] hover:border-[var(--ds-primary)] hover:text-[var(--ds-primary)]"
                )}
              >
                {label}
                {isSelected && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-[var(--ds-surface)] rounded-full border-2 border-[var(--ds-primary)] flex items-center justify-center">
                    <Check className="w-2 h-2 text-[var(--ds-primary)]" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <SettingsGrid columns={2} className="mt-4">
          <SettingsField label="Timezone" description="Hospital timezone for all scheduling">
            <SettingsTextInput
              value={form.watch("general.timezone")}
              onChange={(val) => form.setValue("general.timezone", val, { shouldDirty: true })}
              placeholder="Asia/Kolkata"
            />
          </SettingsField>
          <SettingsField label="Weekend Policy" description="How to handle follow-ups due on non-working days">
            <SettingsDropdown
              value={form.watch("general.weekend_policy")}
              onValueChange={(val) => form.setValue("general.weekend_policy", val as "SKIP" | "INCLUDE", { shouldDirty: true })}
              options={WEEKEND_OPTIONS}
            />
          </SettingsField>
        </SettingsGrid>
      </SettingsSection>
    </div>
  );
}

function LeadTab({ form }: TabProps) {
  const enabled = form.watch("lead.enabled");
  return (
    <div className="space-y-5">
      <SettingsSection
        title="Lead Follow-Up"
        description="Automate follow-up for new leads — patients who have enquired but not yet visited"
        icon={<Users className="w-4 h-4" />}
      >
        <SettingsField
          label="Enable Lead Follow-Up"
          description="Generate follow-up enquiries automatically when a new lead is created with status NEW"
          layout="horizontal"
        >
          <SettingsSwitch
            checked={enabled}
            onCheckedChange={(val) => form.setValue("lead.enabled", val, { shouldDirty: true })}
          />
        </SettingsField>

        {enabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-4 space-y-4"
          >
            <SettingsGrid columns={2}>
              <SettingsField
                label="Follow-Up Delay"
                description="Days to wait after lead creation before generating the first follow-up"
                error={form.formState.errors.lead?.start_delay_days?.message}
              >
                <SettingsNumberInput
                  value={form.watch("lead.start_delay_days")}
                  onChange={(val) => form.setValue("lead.start_delay_days", val === "" ? 0 : val, { shouldDirty: true })}
                  suffix="days"
                  min={0}
                  max={30}
                />
              </SettingsField>
              <SettingsField
                label="Max Attempts"
                description="Total number of follow-up attempts before automation stops"
                error={form.formState.errors.lead?.max_attempts?.message}
              >
                <SettingsNumberInput
                  value={form.watch("lead.max_attempts")}
                  onChange={(val) => form.setValue("lead.max_attempts", val === "" ? 3 : val, { shouldDirty: true })}
                  suffix="attempts"
                  min={1}
                  max={20}
                />
              </SettingsField>
            </SettingsGrid>
            <SettingsGrid columns={2}>
              <SettingsField
                label="Days Between Attempts"
                description="Days to wait between each follow-up attempt"
                error={form.formState.errors.lead?.days_between_attempts?.message}
              >
                <SettingsNumberInput
                  value={form.watch("lead.days_between_attempts")}
                  onChange={(val) => form.setValue("lead.days_between_attempts", val === "" ? 3 : val, { shouldDirty: true })}
                  suffix="days"
                  min={1}
                  max={90}
                />
              </SettingsField>
              <SettingsField
                label="Auto-Close on Conversion"
                description="Automatically cancel pending follow-ups when the lead converts to a patient"
                layout="horizontal"
              >
                <SettingsSwitch
                  checked={form.watch("lead.auto_close_on_completion")}
                  onCheckedChange={(val) => form.setValue("lead.auto_close_on_completion", val, { shouldDirty: true })}
                />
              </SettingsField>
            </SettingsGrid>
            <SettingsGrid columns={2}>
              <SettingsField
                label="Skip Wellness if Appointment"
                description="Skip wellness follow-up if the lead has a scheduled appointment"
                layout="horizontal"
              >
                <SettingsSwitch
                  checked={form.watch("lead.skip_wellness_if_appointment")}
                  onCheckedChange={(val) => form.setValue("lead.skip_wellness_if_appointment", val, { shouldDirty: true })}
                />
              </SettingsField>
              <SettingsField
                label="Auto-Close After Final"
                description="Close lead automation automatically after the last attempt is completed"
                layout="horizontal"
              >
                <SettingsSwitch
                  checked={form.watch("lead.auto_close_after_final")}
                  onCheckedChange={(val) => form.setValue("lead.auto_close_after_final", val, { shouldDirty: true })}
                />
              </SettingsField>
            </SettingsGrid>
            <SettingsGrid columns={2}>
              <SettingsField
                label="Stop Automation On"
                description="Comma-separated lead statuses that stop automation immediately"
              >
                <SettingsTextInput
                  value={form.watch("lead.stop_automation_on")}
                  onChange={(val) => form.setValue("lead.stop_automation_on", val, { shouldDirty: true })}
                  placeholder="CONVERTED,NOT_INTERESTED,LOST"
                />
              </SettingsField>
              <SettingsField
                label="Auto-Close Action"
                description="Action to take when auto-closing after final attempt"
              >
                <SettingsDropdown
                  value={form.watch("lead.auto_close_action")}
                  onValueChange={(val) => form.setValue("lead.auto_close_action", val, { shouldDirty: true })}
                  options={[
                    { value: "KEEP_OPEN", label: "Keep Open" },
                    { value: "CLOSE", label: "Close Lead" },
                    { value: "MARK_LOST", label: "Mark as Lost" },
                  ]}
                />
              </SettingsField>
            </SettingsGrid>
          </motion.div>
        )}

        {!enabled && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600 mt-3">
            <Info className="w-4 h-4 shrink-0" />
            <span>Lead follow-up automation is disabled. No enquiries will be generated for new leads.</span>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}

function OpdTab({ form }: TabProps) {
  const enabled = form.watch("opd.enabled");
  return (
    <div className="space-y-5">
      <SettingsSection
        title="OPD Follow-Up"
        description="Contact patients after their OPD consultation to ask if they wish to proceed with treatment"
        icon={<Stethoscope className="w-4 h-4" />}
      >
        <SettingsField
          label="Enable OPD Follow-Up"
          description="Generate a follow-up enquiry when an OPD consultation is completed and no treatment has started"
          layout="horizontal"
        >
          <SettingsSwitch
            checked={enabled}
            onCheckedChange={(val) => form.setValue("opd.enabled", val, { shouldDirty: true })}
          />
        </SettingsField>

        {enabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-4 space-y-4"
          >
            <SettingsGrid columns={2}>
              <SettingsField
                label="Follow-Up Delay"
                description="Days to wait after consultation before generating the follow-up enquiry"
                error={form.formState.errors.opd?.start_delay_days?.message}
              >
                <SettingsNumberInput
                  value={form.watch("opd.start_delay_days")}
                  onChange={(val) => form.setValue("opd.start_delay_days", val === "" ? 0 : val, { shouldDirty: true })}
                  suffix="days"
                  min={0}
                  max={30}
                />
              </SettingsField>
              <SettingsField
                label="Auto-Close"
                description="Automatically close OPD follow-up when the patient starts treatment"
                layout="horizontal"
              >
                <SettingsSwitch
                  checked={form.watch("opd.auto_close_on_completion")}
                  onCheckedChange={(val) => form.setValue("opd.auto_close_on_completion", val, { shouldDirty: true })}
                />
              </SettingsField>
            </SettingsGrid>
            <SettingsGrid columns={2}>
              <SettingsField
                label="Max Attempts"
                description="Total number of follow-up attempts"
                error={form.formState.errors.opd?.max_attempts?.message}
              >
                <SettingsNumberInput
                  value={form.watch("opd.max_attempts")}
                  onChange={(val) => form.setValue("opd.max_attempts", val === "" ? 3 : val, { shouldDirty: true })}
                  suffix="attempts"
                  min={1}
                  max={20}
                />
              </SettingsField>
              <SettingsField
                label="Days Between Attempts"
                description="Days to wait between subsequent follow-ups"
                error={form.formState.errors.opd?.days_between_attempts?.message}
              >
                <SettingsNumberInput
                  value={form.watch("opd.days_between_attempts")}
                  onChange={(val) => form.setValue("opd.days_between_attempts", val === "" ? 3 : val, { shouldDirty: true })}
                  suffix="days"
                  min={1}
                  max={90}
                />
              </SettingsField>
            </SettingsGrid>
            <SettingsGrid columns={2}>
              <SettingsField
                label="Skip Wellness if Appointment"
                description="Skip follow-up if the patient already has a scheduled appointment"
                layout="horizontal"
              >
                <SettingsSwitch
                  checked={form.watch("opd.skip_wellness_if_appointment")}
                  onCheckedChange={(val) => form.setValue("opd.skip_wellness_if_appointment", val, { shouldDirty: true })}
                />
              </SettingsField>
              <SettingsField
                label="Auto-Close After Final"
                description="Close automation after the last attempt"
                layout="horizontal"
              >
                <SettingsSwitch
                  checked={form.watch("opd.auto_close_after_final")}
                  onCheckedChange={(val) => form.setValue("opd.auto_close_after_final", val, { shouldDirty: true })}
                />
              </SettingsField>
            </SettingsGrid>
            <SettingsGrid columns={2}>
              <SettingsField
                label="Auto-Close Action"
                description="Action to take when auto-closing"
              >
                <SettingsDropdown
                  value={form.watch("opd.auto_close_action")}
                  onValueChange={(val) => form.setValue("opd.auto_close_action", val, { shouldDirty: true })}
                  options={[
                    { value: "KEEP_OPEN", label: "Keep Open" },
                    { value: "CLOSE", label: "Close" },
                  ]}
                />
              </SettingsField>
              <SettingsField
                label="Stop Automation On"
                description="Comma-separated statuses that stop automation"
              >
                <SettingsTextInput
                  value={form.watch("opd.stop_automation_on")}
                  onChange={(val) => form.setValue("opd.stop_automation_on", val, { shouldDirty: true })}
                  placeholder="CONVERTED,NOT_INTERESTED,LOST"
                />
              </SettingsField>
            </SettingsGrid>
          </motion.div>
        )}

        {!enabled && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600 mt-3">
            <Info className="w-4 h-4 shrink-0" />
            <span>OPD follow-up is disabled. No enquiries will be generated after consultations.</span>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}

function TreatmentTab({ form }: TabProps) {
  const enabled = form.watch("treatment.enabled");
  return (
    <div className="space-y-5">
      <SettingsSection
        title="Treatment Wellness"
        description="Follow-up after treatment completion to check on patient recovery. Skipped automatically if the patient has a future appointment."
        icon={<ClipboardList className="w-4 h-4" />}
      >
        <SettingsField
          label="Enable Treatment Wellness"
          description="Generate a wellness follow-up enquiry when a treatment plan is marked completed"
          layout="horizontal"
        >
          <SettingsSwitch
            checked={enabled}
            onCheckedChange={(val) => form.setValue("treatment.enabled", val, { shouldDirty: true })}
          />
        </SettingsField>

        {enabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-4 space-y-4"
          >
            <SettingsGrid columns={2}>
              <SettingsField
                label="Wellness Delay"
                description="Days to wait after treatment completion before generating the wellness enquiry"
                error={form.formState.errors.treatment?.start_delay_days?.message}
              >
                <SettingsNumberInput
                  value={form.watch("treatment.start_delay_days")}
                  onChange={(val) => form.setValue("treatment.start_delay_days", val === "" ? 0 : val, { shouldDirty: true })}
                  suffix="days"
                  min={0}
                  max={30}
                />
              </SettingsField>
              <SettingsField
                label="Skip if Future Appointment"
                description="Don't create wellness enquiry if the patient has an upcoming scheduled appointment"
                layout="horizontal"
              >
                <SettingsSwitch
                  checked={form.watch("treatment.skip_wellness_if_appointment")}
                  onCheckedChange={(val) => form.setValue("treatment.skip_wellness_if_appointment", val, { shouldDirty: true })}
                />
              </SettingsField>
            </SettingsGrid>
            <SettingsGrid columns={2}>
              <SettingsField
                label="Auto-Close on Completion"
                description="Automatically close wellness enquiry when treatment is fully completed"
                layout="horizontal"
              >
                <SettingsSwitch
                  checked={form.watch("treatment.auto_close_on_completion")}
                  onCheckedChange={(val) => form.setValue("treatment.auto_close_on_completion", val, { shouldDirty: true })}
                />
              </SettingsField>
            </SettingsGrid>
          </motion.div>
        )}

        {!enabled && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600 mt-3">
            <Info className="w-4 h-4 shrink-0" />
            <span>Treatment wellness is disabled. No enquiries will be generated after treatment completion.</span>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}

function CaseTab({ form }: TabProps) {
  const recoveryEnabled = form.watch("case.recovery.enabled");
  const recallEnabled = form.watch("case.recall.enabled");
  return (
    <div className="space-y-5">
      <SettingsSection
        title="Recovery Wellness"
        description="Follow-up after a complete dental case is finished to check on patient recovery"
        icon={<HeartPulse className="w-4 h-4" />}
      >
        <SettingsField
          label="Enable Recovery Wellness"
          description="Generate a wellness enquiry when a dental case is marked completed"
          layout="horizontal"
        >
          <SettingsSwitch
            checked={recoveryEnabled}
            onCheckedChange={(val) => form.setValue("case.recovery.enabled", val, { shouldDirty: true })}
          />
        </SettingsField>

        {recoveryEnabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-4 space-y-4"
          >
            <SettingsGrid columns={2}>
              <SettingsField
                label="Recovery Delay"
                description="Days to wait after case completion before generating the wellness enquiry"
                error={form.formState.errors.case?.recovery?.start_delay_days?.message}
              >
                <SettingsNumberInput
                  value={form.watch("case.recovery.start_delay_days")}
                  onChange={(val) => form.setValue("case.recovery.start_delay_days", val === "" ? 0 : val, { shouldDirty: true })}
                  suffix="days"
                  min={0}
                  max={30}
                />
              </SettingsField>
              <SettingsField
                label="Auto-Close on Completion"
                description="Automatically close recovery enquiry when case is fully resolved"
                layout="horizontal"
              >
                <SettingsSwitch
                  checked={form.watch("case.recovery.auto_close_on_completion")}
                  onCheckedChange={(val) => form.setValue("case.recovery.auto_close_on_completion", val, { shouldDirty: true })}
                />
              </SettingsField>
            </SettingsGrid>
            <SettingsGrid columns={2}>
              <SettingsField
                label="Skip if Appointment"
                description="Skip recovery wellness if patient has an upcoming appointment"
                layout="horizontal"
              >
                <SettingsSwitch
                  checked={form.watch("case.recovery.skip_wellness_if_appointment")}
                  onCheckedChange={(val) => form.setValue("case.recovery.skip_wellness_if_appointment", val, { shouldDirty: true })}
                />
              </SettingsField>
            </SettingsGrid>
          </motion.div>
        )}

        {!recoveryEnabled && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600 mt-3">
            <Info className="w-4 h-4 shrink-0" />
            <span>Recovery wellness is disabled. No enquiries will be generated after case completion.</span>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Periodic Recall"
        description="Schedule periodic dental check-up reminders after case completion"
        icon={<Bell className="w-4 h-4" />}
      >
        <SettingsField
          label="Enable Recall"
          description="Generate recurring recall enquiries at scheduled intervals after case completion"
          layout="horizontal"
        >
          <SettingsSwitch
            checked={recallEnabled}
            onCheckedChange={(val) => form.setValue("case.recall.enabled", val, { shouldDirty: true })}
          />
        </SettingsField>

        {recallEnabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-4 space-y-4"
          >
            <SettingsGrid columns={2}>
              <SettingsField
                label="Recall Interval"
                description="Days after case completion to schedule the first recall"
                error={form.formState.errors.case?.recall?.start_delay_days?.message}
              >
                <SettingsNumberInput
                  value={form.watch("case.recall.start_delay_days")}
                  onChange={(val) => form.setValue("case.recall.start_delay_days", val === "" ? 0 : val, { shouldDirty: true })}
                  suffix="days"
                  min={0}
                  max={730}
                />
              </SettingsField>
              <SettingsField
                label="Auto-Close on Completion"
                description="Automatically close recall when patient completes their visit"
                layout="horizontal"
              >
                <SettingsSwitch
                  checked={form.watch("case.recall.auto_close_on_completion")}
                  onCheckedChange={(val) => form.setValue("case.recall.auto_close_on_completion", val, { shouldDirty: true })}
                />
              </SettingsField>
            </SettingsGrid>
            <SettingsGrid columns={2}>
              <SettingsField
                label="Skip if Appointment"
                description="Skip recall if patient already has an upcoming appointment"
                layout="horizontal"
              >
                <SettingsSwitch
                  checked={form.watch("case.recall.skip_wellness_if_appointment")}
                  onCheckedChange={(val) => form.setValue("case.recall.skip_wellness_if_appointment", val, { shouldDirty: true })}
                />
              </SettingsField>
            </SettingsGrid>
          </motion.div>
        )}

        {!recallEnabled && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600 mt-3">
            <Info className="w-4 h-4 shrink-0" />
            <span>Periodic recall is disabled. No recall enquiries will be generated.</span>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}

function PreviewPanel({ values, activeTab }: { values: SettingsFormType; activeTab: TabKey }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Eye className="w-4 h-4 text-[var(--ds-primary)]" />
        <h3 className="font-[var(--ds-text-h3)] text-[var(--ds-text)]">Live Preview</h3>
      </div>

      <PreviewCard
        title={`${TABS.find((t) => t.key === activeTab)?.label} Settings`}
        description="How your settings affect runtime behaviour"
        icon={<Info className="w-4 h-4" />}
      >
        {activeTab === "general" && (
          <>
            <PreviewRow label="CRM" value={values.general.enabled ? "Enabled" : "Disabled"} highlight />
            <PreviewRow label="Working Days" value={values.general.working_days || "None"} />
            <PreviewRow label="Hours" value={`${values.general.business_start} - ${values.general.business_end}`} />
            <PreviewRow label="Reminder Time" value={values.general.reminder_time} />
            <PreviewRow label="Reminder Offset" value={`${values.general.reminder_offset_days} days before`} />
            <PreviewRow label="Weekend Policy" value={values.general.weekend_policy} />
          </>
        )}
        {activeTab === "lead" && (
          <>
            <PreviewRow label="Status" value={values.lead.enabled ? "Enabled" : "Disabled"} highlight />
            <PreviewRow label="Follow-up Delay" value={`${values.lead.start_delay_days} days after lead created`} />
            <PreviewRow label="Attempts" value={`${values.lead.max_attempts} attempts, ${values.lead.days_between_attempts}d apart`} />
            <PreviewRow label="Auto-Close" value={values.lead.auto_close_on_completion ? "On conversion" : "Manual"} />
            <PreviewRow label="Runtime" value={`Lead Created -> Wait -> ${values.lead.max_attempts} Follow-ups`} />
          </>
        )}
        {activeTab === "opd" && (
          <>
            <PreviewRow label="Status" value={values.opd.enabled ? "Enabled" : "Disabled"} highlight />
            <PreviewRow label="Follow-up Delay" value={`${values.opd.start_delay_days} days after consultation`} />
            <PreviewRow label="Auto-Close" value={values.opd.auto_close_on_completion ? "On treatment start" : "Manual"} />
            <PreviewRow label="Runtime" value="Consultation -> Wait -> ONE Follow-up" />
          </>
        )}
        {activeTab === "treatment" && (
          <>
            <PreviewRow label="Status" value={values.treatment.enabled ? "Enabled" : "Disabled"} highlight />
            <PreviewRow label="Wellness Delay" value={`${values.treatment.start_delay_days} days after treatment`} />
            <PreviewRow label="Skip if Appt" value={values.treatment.skip_wellness_if_appointment ? "Yes" : "No"} />
            <PreviewRow label="Runtime" value="Treatment Done -> Appt? -> Wellness" />
          </>
        )}
        {activeTab === "case" && (
          <>
            <PreviewRow label="Recovery" value={values.case.recovery.enabled ? "Enabled" : "Disabled"} highlight />
            <PreviewRow label="Recovery Delay" value={`${values.case.recovery.start_delay_days} days`} />
            <PreviewRow label="Recall" value={values.case.recall.enabled ? "Enabled" : "Disabled"} highlight />
            <PreviewRow label="Recall Interval" value={`${values.case.recall.start_delay_days} days`} />
            <PreviewRow label="Runtime" value="Case Done -> Wellness + Recall" />
          </>
        )}
      </PreviewCard>

      <PreviewCard
        title="Enquiry Summary"
        description="Enquiries generated by these settings"
        icon={<CheckCircle2 className="w-4 h-4" />}
      >
        <div className="space-y-1.5">
          {activeTab === "general" && (
            <PreviewRow label="CRM Status" value={values.general.enabled ? "Active" : "Inactive"} />
          )}
          {activeTab === "lead" && values.lead.enabled && (
            <PreviewRow label="Lead Follow-up" value={`${values.lead.start_delay_days}d delay, ${values.lead.max_attempts}x`} />
          )}
          {activeTab === "opd" && values.opd.enabled && (
            <PreviewRow label="OPD Follow-up" value={`${values.opd.start_delay_days}d delay`} />
          )}
          {activeTab === "treatment" && values.treatment.enabled && (
            <PreviewRow label="Treatment Wellness" value={`${values.treatment.start_delay_days}d delay`} />
          )}
          {activeTab === "case" && (
            <>
              {values.case.recovery.enabled && <PreviewRow label="Case Wellness" value={`${values.case.recovery.start_delay_days}d delay`} />}
              {values.case.recall.enabled && <PreviewRow label="Recall" value={`${values.case.recall.start_delay_days}d delay`} />}
            </>
          )}
        </div>
      </PreviewCard>
    </div>
  );
}
