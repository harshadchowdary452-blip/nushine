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

// ═══════════════════════════════════════════════════════════════════════════════
// Tabs — 5 pages aligned with Dental ERP lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

const TABS = [
  { key: "general", label: "General", icon: Settings2, color: "from-blue-500 to-indigo-600" },
  { key: "lead", label: "Lead", icon: Users, color: "from-emerald-500 to-teal-600" },
  { key: "opd", label: "OPD", icon: Stethoscope, color: "from-violet-500 to-purple-600" },
  { key: "treatment", label: "Treatment", icon: ClipboardList, color: "from-amber-500 to-orange-600" },
  { key: "case", label: "Case", icon: HeartPulse, color: "from-rose-500 to-pink-600" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const WEEKEND_OPTIONS = [
  { value: "SKIP", label: "Skip (skip non-working days)" },
  { value: "INCLUDE", label: "Include" },
];

const DAY_LABELS: Record<string, string> = {
  MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun",
};

// ═══════════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════════

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
      return { general: general?.data ?? general, lead: lead?.config ?? lead, opd: opd?.config ?? opd, treatment: treatment?.items ?? treatment, case: caseSettings };
    },
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
    formState: { isDirty },
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

  // ─── Save Logic ──────────────────────────────────────────────────────────

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
          return api.updateLead({ ...values.lead, skip_wellness_if_appointment: false });
        case "opd":
          return api.updateOpd({ ...values.opd, skip_wellness_if_appointment: false });
        case "treatment": {
          // Save global treatment defaults
          const t = values.treatment;
          return api.updateTreatment("", {
            enabled: t.enabled,
            start_delay_days: t.start_delay_days,
            skip_wellness_if_appointment: t.skip_wellness_if_appointment,
            auto_close_on_completion: t.auto_close_on_completion,
          });
        }
        case "case": {
          const c = values.case;
          await api.updateCase("recovery", {
            enabled: c.recovery.enabled,
            start_delay_days: c.recovery.start_delay_days,
            auto_close_on_completion: false,
            skip_wellness_if_appointment: false,
          });
          return api.updateCase("recall", {
            enabled: c.recall.enabled,
            start_delay_days: c.recall.start_delay_days,
            auto_close_on_completion: false,
            skip_wellness_if_appointment: false,
          });
        }
        default:
          throw new Error(`Unknown tab: ${activeTab}`);
      }
    },
    onSuccess: () => {
      addToast({ variant: "success", title: "Settings saved" });
      queryClient.invalidateQueries({ queryKey: ["crmSettings"] });
      reset(getValues());
    },
    onError: (err: Error) => {
      addToast({ variant: "destructive", title: err?.message || "Save failed" });
    },
  });

  const handleSave = useCallback(async () => {
    await saveMutation.mutateAsync(getValues());
  }, [saveMutation, getValues]);

  const handleReset = useCallback(() => {
    reset(getDefaults(data));
  }, [reset, data]);

  // ─── Loading ─────────────────────────────────────────────────────────────

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

type TabProps = { form: UseFormReturn<SettingsFormType> };

// ═══════════════════════════════════════════════════════════════════════════════
// General Tab — Global CRM behaviour
// ═══════════════════════════════════════════════════════════════════════════════

function GeneralTab({ form }: TabProps) {
  const workingDays = form.watch("general.working_days") || "";
  const selectedDays = workingDays.split(",").map((d: string) => d.trim()).filter(Boolean);

  const toggleDay = (day: string) => {
    const current = form.getValues("general.working_days") || "";
    const days = current.split(",").map((d: string) => d.trim()).filter(Boolean);
    const next = days.includes(day) ? days.filter((d: string) => d !== day) : [...days, day].sort((a, b) => {
      const order = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
      return order.indexOf(a) - order.indexOf(b);
    });
    form.setValue("general.working_days", next.join(","), { shouldDirty: true });
  };

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Global Behaviour"
        description="Control the overall CRM system for your hospital"
        icon={<Zap className="w-4 h-4" />}
      >
        <SettingsField
          label="Enable CRM Automation"
          description="Master switch for all automated follow-ups and reminders"
          layout="horizontal"
        >
          <SettingsSwitch
            checked={form.watch("general.enabled")}
            onCheckedChange={(val) => form.setValue("general.enabled", val, { shouldDirty: true })}
          />
        </SettingsField>

        <SettingsGrid columns={2} className="mt-4">
          <SettingsField label="Reminder Time" description="Time for daily follow-up reminders">
            <SettingsTextInput
              value={form.watch("general.reminder_time")}
              onChange={(val) => form.setValue("general.reminder_time", val, { shouldDirty: true })}
              placeholder="09:00"
            />
          </SettingsField>
          <SettingsField
            label="Reminder Offset"
            description="Days before appointment to send reminder"
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
      </SettingsSection>

      <SettingsSection
        title="Working Hours"
        description="Business hours for scheduling and follow-up calculations"
        icon={<Clock className="w-4 h-4" />}
      >
        <SettingsGrid columns={2}>
          <SettingsField label="Business Start" description="Start of working hours">
            <SettingsTextInput
              value={form.watch("general.business_start")}
              onChange={(val) => form.setValue("general.business_start", val, { shouldDirty: true })}
              placeholder="09:00"
            />
          </SettingsField>
          <SettingsField label="Business End" description="End of working hours">
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
        description="Select which days the hospital is open"
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
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all border",
                  isSelected
                    ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                    : "bg-white text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-primary)]"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <SettingsGrid columns={2} className="mt-4">
          <SettingsField label="Timezone" description="Hospital timezone for scheduling">
            <SettingsTextInput
              value={form.watch("general.timezone")}
              onChange={(val) => form.setValue("general.timezone", val, { shouldDirty: true })}
              placeholder="Asia/Kolkata"
            />
          </SettingsField>
          <SettingsField label="Weekend Policy" description="How to handle non-working days">
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

// ═══════════════════════════════════════════════════════════════════════════════
// Lead Tab — Patients who have not yet visited
// ═══════════════════════════════════════════════════════════════════════════════

function LeadTab({ form }: TabProps) {
  return (
    <div className="space-y-5">
      <SettingsSection
        title="Lead Follow-Up"
        description="Configure automatic follow-up for new leads (patients who have not yet visited)"
        icon={<Users className="w-4 h-4" />}
      >
        <SettingsField
          label="Enable Lead Follow-Up"
          description="Generate a follow-up enquiry when a new lead is created"
          layout="horizontal"
        >
          <SettingsSwitch
            checked={form.watch("lead.enabled")}
            onCheckedChange={(val) => form.setValue("lead.enabled", val, { shouldDirty: true })}
          />
        </SettingsField>

        <div className="mt-4">
          <SettingsGrid columns={2}>
            <SettingsField
              label="Follow-Up Delay"
              description="Days to wait before generating the follow-up enquiry"
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
              label="Auto-Close on Conversion"
              description="Automatically close the follow-up when lead becomes a patient"
              layout="horizontal"
            >
              <SettingsSwitch
                checked={form.watch("lead.auto_close_on_completion")}
                onCheckedChange={(val) => form.setValue("lead.auto_close_on_completion", val, { shouldDirty: true })}
              />
            </SettingsField>
          </SettingsGrid>
        </div>
      </SettingsSection>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPD Tab — Patient visited, consultation completed, treatment not started
// ═══════════════════════════════════════════════════════════════════════════════

function OpdTab({ form }: TabProps) {
  return (
    <div className="space-y-5">
      <SettingsSection
        title="OPD Follow-Up"
        description="Contact patients after consultation to ask if they wish to proceed with treatment"
        icon={<Stethoscope className="w-4 h-4" />}
      >
        <SettingsField
          label="Enable OPD Follow-Up"
          description="Generate a follow-up enquiry when OPD consultation is completed"
          layout="horizontal"
        >
          <SettingsSwitch
            checked={form.watch("opd.enabled")}
            onCheckedChange={(val) => form.setValue("opd.enabled", val, { shouldDirty: true })}
          />
        </SettingsField>

        <div className="mt-4">
          <SettingsGrid columns={2}>
            <SettingsField
              label="Follow-Up Delay"
              description="Days to wait after consultation before generating enquiry"
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
              description="Automatically close when patient starts treatment"
              layout="horizontal"
            >
              <SettingsSwitch
                checked={form.watch("opd.auto_close_on_completion")}
                onCheckedChange={(val) => form.setValue("opd.auto_close_on_completion", val, { shouldDirty: true })}
              />
            </SettingsField>
          </SettingsGrid>
        </div>
      </SettingsSection>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Treatment Tab — Follow-up AFTER treatment completion
// ═══════════════════════════════════════════════════════════════════════════════

function TreatmentTab({ form }: TabProps) {
  return (
    <div className="space-y-5">
      <SettingsSection
        title="Treatment Wellness"
        description="Follow-up after treatment completion. Skipped if patient has a future appointment."
        icon={<ClipboardList className="w-4 h-4" />}
      >
        <SettingsField
          label="Enable Treatment Wellness"
          description="Generate a wellness follow-up when treatment is completed"
          layout="horizontal"
        >
          <SettingsSwitch
            checked={form.watch("treatment.enabled")}
            onCheckedChange={(val) => form.setValue("treatment.enabled", val, { shouldDirty: true })}
          />
        </SettingsField>

        <div className="mt-4">
          <SettingsGrid columns={2}>
            <SettingsField
              label="Wellness Delay"
              description="Days to wait after treatment completion before generating enquiry"
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
              description="Don't create wellness if patient has an upcoming appointment"
              layout="horizontal"
            >
              <SettingsSwitch
                checked={form.watch("treatment.skip_wellness_if_appointment")}
                onCheckedChange={(val) => form.setValue("treatment.skip_wellness_if_appointment", val, { shouldDirty: true })}
              />
            </SettingsField>
          </SettingsGrid>
        </div>
      </SettingsSection>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Case Tab — Recovery + Recall after complete case
// ═══════════════════════════════════════════════════════════════════════════════

function CaseTab({ form }: TabProps) {
  return (
    <div className="space-y-5">
      <SettingsSection
        title="Recovery Wellness"
        description="Follow-up after a complete dental case is finished"
        icon={<HeartPulse className="w-4 h-4" />}
      >
        <SettingsField
          label="Enable Recovery Wellness"
          description="Generate a wellness enquiry when a case is completed"
          layout="horizontal"
        >
          <SettingsSwitch
            checked={form.watch("case.recovery.enabled")}
            onCheckedChange={(val) => form.setValue("case.recovery.enabled", val, { shouldDirty: true })}
          />
        </SettingsField>

        <div className="mt-4">
          <SettingsGrid columns={1}>
            <SettingsField
              label="Recovery Delay"
              description="Days to wait after case completion before generating enquiry"
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
          </SettingsGrid>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Recall"
        description="Periodic dental check-up reminder after case completion"
        icon={<Clock className="w-4 h-4" />}
      >
        <SettingsField
          label="Enable Recall"
          description="Generate a recall enquiry when a case is completed"
          layout="horizontal"
        >
          <SettingsSwitch
            checked={form.watch("case.recall.enabled")}
            onCheckedChange={(val) => form.setValue("case.recall.enabled", val, { shouldDirty: true })}
          />
        </SettingsField>

        <div className="mt-4">
          <SettingsGrid columns={1}>
            <SettingsField
              label="Recall Delay"
              description="Days after case completion to schedule the recall"
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
          </SettingsGrid>
        </div>
      </SettingsSection>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Preview Panel — Shows how settings affect runtime behaviour
// ═══════════════════════════════════════════════════════════════════════════════

function PreviewPanel({ values, activeTab }: { values: SettingsFormType; activeTab: TabKey }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Eye className="w-4 h-4 text-[var(--color-primary)]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Live Preview</h3>
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
            <PreviewRow label="Auto-Close" value={values.lead.auto_close_on_completion ? "On conversion" : "Manual"} />
            <PreviewRow label="Runtime" value="Lead Created -> Wait -> ONE Follow-up" />
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
            <PreviewRow label="Recall Delay" value={`${values.case.recall.start_delay_days} days`} />
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
            <PreviewRow label="Lead Follow-up" value={`${values.lead.start_delay_days}d delay`} />
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
