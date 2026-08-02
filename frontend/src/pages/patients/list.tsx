import { useState, useMemo, useCallback, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef, SortingState } from "@tanstack/react-table"
import { Plus, Eye, Trash2, Users, UserPlus, Phone, MessageSquare, User as UserIcon, MapPin, HeartPulse, CalendarPlus, UserRound } from "lucide-react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import SearchableSelect from "@/components/ui/searchable-select"
import { patientsApi, doctorsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import QuickExport from "@/components/ui/quick-export"
import { useServerFilters } from "@/hooks/useServerFilters"
import { useWorkspaceMemory } from "@/hooks/useWorkspaceMemory"
import { useFormState } from "@/hooks/useFormState"
import { useFormDraft, useUnsavedChangesGuard } from "@/hooks/useFormDraft"
import { useDuplicateCheck } from "@/hooks/useDuplicateCheck"
import type { DuplicateCandidate } from "@/hooks/useDuplicateCheck"
import { required, email, phone, max, maxLength } from "@/lib/validation"
import type { FieldRules } from "@/lib/validation"
import PatientFilterBar from "./filter-bar"
import {
  EnterpriseWorkspace, DataTable, DrawerSection,
  EnterpriseFormDialog, EnterpriseWizard, EnterpriseFieldGrid, FormField,
  WorkflowNextActions, DuplicateWarning,
} from "@/design-system"
import type { EnterpriseWizardStep } from "@/design-system"
import type { Patient, PaginatedResponse, User } from "@/types"
import { extractDetail } from "@/types"
import { useAuthStore } from "@/store/authStore"
import { useCreateParam } from "@/lib/use-create-param"

const DATE_PRESET_KEYS = new Set(["date_preset"])

const genderBadgeVariant: Record<string, "default" | "secondary" | "outline" | "destructive" | "success" | "warning"> = {
  MALE: "default", FEMALE: "success", OTHER: "secondary",
}

const SOURCE_OPTIONS = [
  "Walk-In", "Google Search", "Google Maps", "Instagram", "Facebook",
  "WhatsApp", "Website", "Referral - Existing Patient", "Referral - Doctor",
  "Referral - Clinic", "Advertisement", "Banner", "Newspaper", "YouTube",
  "Campaign", "Event", "Lead", "Other",
]

const PATIENT_RULES: FieldRules = {
  full_name: [required("Full name is required"), maxLength(120)],
  email: [email()],
  phone: [phone()],
  patient_source: [required("Please select how the patient heard about us")],
  age: [max(150, "Age must be 150 or under")],
  op_no: [maxLength(40)],
  abha_id: [maxLength(20)],
}

const WIZARD_STEPS: EnterpriseWizardStep[] = [
  { title: "Basic Information", description: "Name, type, contact & source", icon: UserIcon, fields: ["full_name", "email", "phone", "gender", "age", "patient_type", "patient_source"] },
  { title: "Contact & Registration", description: "Address, guardian, OP & ABHA", icon: MapPin, fields: ["address", "op_no", "abha_id"] },
  { title: "Medical Information", description: "History & vitals", icon: HeartPulse, fields: ["medical_history", "height", "weight", "bp", "sugar", "spo2"] },
]

const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
]

const PATIENT_TYPE_OPTIONS = [
  { value: "ADULT", label: "Adult" },
  { value: "CHILD", label: "Child" },
]

const GUARDIAN_RELATIONSHIP_OPTIONS = [
  "Parent", "Father", "Mother", "Grandparent", "Guardian", "Other",
]

type PatientForm = {
  full_name: string; email: string; phone: string; gender: string; age: string;
  patient_type: string; guardian_name: string; guardian_relationship: string; guardian_phone: string;
  patient_source: string; source_campaign_name: string; source_campaign_id: string;
  source_campaign_date: string; address: string; medical_history: string; abha_id: string;
  height: string; weight: string; bp: string; sugar: string; spo2: string; op_no: string;
  emergency_contact: string
}

function getEmptyForm(): PatientForm {
  return {
    full_name: "", email: "", phone: "", gender: "", age: "",
    patient_type: "ADULT", guardian_name: "", guardian_relationship: "", guardian_phone: "",
    patient_source: "", source_campaign_name: "", source_campaign_id: "",
    source_campaign_date: "", address: "", medical_history: "", abha_id: "",
    height: "", weight: "", bp: "", sugar: "", spo2: "", op_no: "",
    emergency_contact: "",
  }
}

function stripEmptyFormFields(data: PatientForm): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value !== "" && value !== undefined) {
      if (key === "height" || key === "weight") cleaned[key] = Number(value)
      else if (key === "patient_type" && data.patient_type === "CHILD") {
        cleaned[key] = "CHILD"
      } else cleaned[key] = value
    }
  }
  return cleaned
}

function StatusBadge({ status }: { status: string }) {
  const cls = `status-badge status-badge-${status?.toLowerCase().replace(/_/g, "_")}`
  return <span className={cls}>{status?.replace(/_/g, " ")}</span>
}

export default function PatientList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const {
    filters, setFilter, resetFilters, queryKey, activeFilters, hasActiveFilters,
    page, setPage, sortField, sortDir, setSort, activeChips,
  } = useServerFilters({ defaultSort: "created_at", defaultSortDir: "desc" })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingPatient, setDeletingPatient] = useState<Patient | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkTargets, setBulkTargets] = useState<Patient[]>([])
  const [completedPatient, setCompletedPatient] = useState<Patient | null>(null)
  const [dupAcknowledged, setDupAcknowledged] = useState(false)

  const {
    values: formValues, setField: setFormField, onBlur: onFormBlur,
    validate: validateForm, validateFields: validateStepFields,
    fieldError, dirty: formDirty, reset: resetFormState,
  } = useFormState<PatientForm>({ initialValues: getEmptyForm(), rules: PATIENT_RULES, validateOn: "blur" })
  const draft = useFormDraft<PatientForm>("patients.create", { version: 1 })
  const { clear: clearUnsavedGuard } = useUnsavedChangesGuard(dialogOpen && formDirty)

  // Autosave the in-progress patient to a draft so nothing is lost on close.
  useEffect(() => {
    if (!dialogOpen || !formDirty) return
    const t = window.setTimeout(() => draft.saveDraft(formValues), 400)
    return () => window.clearTimeout(t)
  }, [dialogOpen, formDirty, formValues, draft])

  function resetForm() {
    resetFormState(getEmptyForm())
    setStep(0)
    setDialogOpen(false)
  }

  function openDialog() {
    resetFormState(draft.readDraft() ?? getEmptyForm())
    setStep(0)
    setDupAcknowledged(false)
    clearDuplicates()
    setDialogOpen(true)
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open) {
      if (formDirty && !window.confirm("Discard unsaved changes and close?")) return
      resetForm()
    } else {
      openDialog()
    }
    setDialogOpen(open)
  }

  const validateStep = useCallback(
    (index: number): boolean => validateStepFields((WIZARD_STEPS[index]?.fields ?? []) as (keyof PatientForm)[]),
    [validateStepFields],
  )

  // Workspace memory: restore the selected record when returning to the list
  const { state: workspace, update: updateWorkspace } = useWorkspaceMemory<{ quickViewId?: string }>(
    "patients.list",
    { quickViewId: undefined },
    { version: 1 }
  )
  const openQuickView = useCallback((patient: Patient | null) => {
    updateWorkspace({ quickViewId: patient?.id })
  }, [updateWorkspace])

  useCreateParam(() => openDialog())

  const currentUser = useAuthStore((s) => s.user)

  const {
    candidates: dupCandidates, total: dupTotal, checked: dupChecked,
    check: checkDuplicates, clear: clearDuplicates,
  } = useDuplicateCheck({ hospitalId: currentUser?.hospital_id ?? undefined })

  // Smart duplicate detection: probe the registry while step 0 is filled in.
  useEffect(() => {
    if (!dialogOpen || dupAcknowledged) return
    checkDuplicates({
      full_name: formValues.full_name,
      phone: formValues.phone,
      email: formValues.email,
    })
  }, [dialogOpen, dupAcknowledged, formValues.full_name, formValues.phone, formValues.email, checkDuplicates])

  const { data, isLoading } = useQuery<PaginatedResponse<Patient>>({
    queryKey: ["patients", "search", queryKey, page],
    queryFn: () => {
      const params: Record<string, string | number> = {
        page, page_size: 10,
        sort_by: sortField, sort_order: sortDir,
      }
      for (const [k, v] of Object.entries(filters)) {
        if (v !== "" && v !== undefined && !DATE_PRESET_KEYS.has(k)) params[k] = v
      }
      return patientsApi.searchAdvanced(params)
    },
    placeholderData: (prev) => prev,
  })

  const { data: doctorsData } = useQuery<PaginatedResponse<User>>({
    queryKey: ["doctors", "filter-dropdown"],
    queryFn: () => doctorsApi.list({ page_size: 200, admin_group_id: currentUser?.admin_group_id || undefined }),
  })

  const doctors: User[] = useMemo(() => {
    if (!doctorsData) return []
    if (Array.isArray(doctorsData)) return doctorsData
    return doctorsData?.items || []
  }, [doctorsData])

  const patients: Patient[] = useMemo(() => {
    if (Array.isArray(data)) return data
    return data?.items || []
  }, [data])

  const quickViewPatient: Patient | null = workspace.quickViewId
    ? patients.find((p) => p.id === workspace.quickViewId) ?? null
    : null

  const totalCount = useMemo(() => {
    if (Array.isArray(data)) return data.length
    return data?.total ?? 0
  }, [data])

  const totalPages = useMemo(() => {
    if (Array.isArray(data)) return 1
    return data?.total_pages || data?.pages || 1
  }, [data])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => patientsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["crm"] })
      addToast({ title: "Success", description: "Patient deleted successfully", variant: "success" })
      setDeleteDialogOpen(false); setDeletingPatient(null)
    },
    onError: (err: unknown) => {
      addToast({ title: "Error", description: extractDetail(err), variant: "destructive" })
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => patientsApi.delete(id))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["crm"] })
      addToast({ title: "Success", description: `${bulkTargets.length} patients deleted successfully`, variant: "success" })
      setBulkDeleteOpen(false); setBulkTargets([])
    },
    onError: (err: unknown) => {
      addToast({ title: "Error", description: extractDetail(err), variant: "destructive" })
    },
  })

  function confirmDelete(patient: Patient) { setDeletingPatient(patient); setDeleteDialogOpen(true) }
  function handleDelete() { if (deletingPatient) deleteMutation.mutate(deletingPatient.id) }
  function handleBulkDelete() {
    if (bulkTargets.length > 0) bulkDeleteMutation.mutate(bulkTargets.map((p) => p.id))
  }

  function applySavedFilters(saved: Record<string, string>) {
    resetFilters()
    for (const [k, v] of Object.entries(saved)) setFilter(k, v)
  }

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => patientsApi.create(data),
    onSuccess: (created: Patient) => {
      queryClient.invalidateQueries({ queryKey: ["patients"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["crm"] })
      addToast({ title: "Success", description: "Patient created successfully", variant: "success" })
      draft.clearDraft()
      clearUnsavedGuard()
      resetForm()
      // Smart workflow completion: offer the related-record shortcuts.
      setCompletedPatient(created)
    },
    onError: (err: unknown) => {
      addToast({ title: "Error", description: extractDetail(err), variant: "destructive" })
    },
  })

  const handleSubmit = () => {
    if (!validateForm()) return
    createMutation.mutate(stripEmptyFormFields(formValues))
  }

  function handleOpenDuplicate(candidate: DuplicateCandidate) {
    clearDuplicates()
    setDupAcknowledged(true)
    resetForm()
    navigate(`/patients/${candidate.id}`)
  }

  const columns = useMemo<ColumnDef<Patient>[]>(
    () => [
      {
        accessorKey: "full_name",
        header: "Name",
        enableSorting: true,
        cell: ({ row }) => <span className="font-medium">{row.getValue("full_name")}</span>,
      },
      {
        accessorKey: "gender",
        header: "Gender",
        enableSorting: false,
        cell: ({ row }) => {
          const gender = row.getValue("gender") as string
          return gender ? <Badge variant={genderBadgeVariant[gender] || "secondary"}>{gender}</Badge> : <span className="text-[var(--ds-text-tertiary)]">—</span>
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => {
          const status = row.getValue("status") as string
          return status ? <StatusBadge status={status} /> : <span className="text-[var(--ds-text-tertiary)]">—</span>
        },
      },
      {
        accessorKey: "age",
        header: "Age",
        enableSorting: false,
        cell: ({ row }) => row.getValue("age") ?? "—",
      },
      {
        accessorKey: "phone",
        header: "Phone",
        enableSorting: false,
        cell: ({ row }) => row.getValue("phone") ?? "—",
      },
      {
        accessorKey: "email",
        header: "Email",
        enableSorting: false,
        cell: ({ row }) => row.getValue("email") ?? "—",
      },
      {
        accessorKey: "created_at",
        header: "Created",
        enableSorting: true,
        cell: ({ row }) => {
          const val = row.getValue("created_at") as string
          return val ? format(new Date(val), "MMM dd, yyyy") : "—"
        },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label={`Quick view ${row.original.full_name}`} onClick={(e) => { e.stopPropagation(); openQuickView(row.original) }}>
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Delete ${row.original.full_name}`} onClick={(e) => { e.stopPropagation(); confirmDelete(row.original) }}>
              <Trash2 className="h-4 w-4 text-[var(--ds-danger)]" />
            </Button>
          </div>
        ),
      },
    ],
    [openQuickView]
  )

  function handleSortingChange(sorting: SortingState) {
    const f = sorting[0]
    setSort(f?.id ?? "", f?.desc ? "desc" : "asc")
  }

  const quickView = quickViewPatient ? {
    open: true,
    onClose: () => openQuickView(null),
    title: quickViewPatient.full_name,
    subtitle: [
      quickViewPatient.op_no && `OP No. ${quickViewPatient.op_no}`,
      quickViewPatient.age && `${quickViewPatient.age} yrs`,
      quickViewPatient.gender,
    ].filter(Boolean).join(" · ") || undefined,
    eyebrow: `ID ${quickViewPatient.id.slice(0, 8)}`,
    statusPill: <StatusBadge status={quickViewPatient.status} />,
    onOpenFull: () => {
      navigate(`/patients/${quickViewPatient.id}`)
      openQuickView(null)
    },
    actions: quickViewPatient.phone ? (
      <>
        <a href={`tel:${quickViewPatient.phone}`} onClick={() => openQuickView(null)}>
          <Button variant="outline" size="sm" aria-label="Call patient">
            <Phone className="h-4 w-4" />
            <span className="hidden sm:inline">Call</span>
          </Button>
        </a>
        <a
          href={`https://wa.me/${quickViewPatient.phone.replace(/[^0-9]/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => openQuickView(null)}
        >
          <Button variant="outline" size="sm" aria-label="WhatsApp patient">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">WhatsApp</span>
          </Button>
        </a>
      </>
    ) : undefined,
    children: (
      <>
        <DrawerSection title="Contact">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--ds-text-secondary)]">Phone</dt>
              <dd className="font-medium">{quickViewPatient.phone || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--ds-text-secondary)]">Email</dt>
              <dd className="font-medium">{quickViewPatient.email || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--ds-text-secondary)]">Address</dt>
              <dd className="font-medium text-right">{quickViewPatient.address || "—"}</dd>
            </div>
          </dl>
        </DrawerSection>
        <DrawerSection title="Registration">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--ds-text-secondary)]">OP No.</dt>
              <dd className="font-medium">{quickViewPatient.op_no || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--ds-text-secondary)]">ABHA ID</dt>
              <dd className="font-medium">{quickViewPatient.abha_id || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--ds-text-secondary)]">Source</dt>
              <dd className="font-medium">{quickViewPatient.patient_source || "—"}</dd>
            </div>
          </dl>
        </DrawerSection>
        <DrawerSection title="Vitals">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { label: "Height", value: quickViewPatient.height ? `${quickViewPatient.height} cm` : "—" },
              { label: "Weight", value: quickViewPatient.weight ? `${quickViewPatient.weight} kg` : "—" },
              { label: "BP", value: quickViewPatient.bp || "—" },
              { label: "Sugar", value: quickViewPatient.sugar || "—" },
              { label: "SpO2", value: quickViewPatient.spo2 ? `${quickViewPatient.spo2}%` : "—" },
            ].map((item) => (
              <div key={item.label} className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-border-light)] p-3">
                <p className="ds-caption text-[var(--ds-text-tertiary)]">{item.label}</p>
                <p className="ds-body-sm mt-0.5 font-medium text-[var(--ds-text)]">{item.value}</p>
              </div>
            ))}
          </div>
        </DrawerSection>
      </>
    ),
  } : undefined

  return (
    <>
      <EnterpriseWorkspace
        title="Patients"
        description="Manage patient records"
        headerActions={
          currentUser?.role !== "DOCTOR" && (
            <Button onClick={openDialog}><Plus className="h-4 w-4" /> Add Patient</Button>
          )
        }
        toolbarActions={<QuickExport module="patients" label="patients" />}
        filters={{
          fields: (
            <PatientFilterBar
              filters={filters} setFilter={setFilter} resetFilters={resetFilters}
              activeCount={activeFilters} doctors={doctors}
            />
          ),
          chips: activeChips,
          activeCount: activeFilters,
          onRemoveChip: (k) => setFilter(k, ""),
          onClearAll: resetFilters,
          savedStorageKey: "patient-list",
          savedCurrent: filters,
          onApplySaved: applySavedFilters,
        }}
        totalCount={totalCount}
        totalLabel="patients"
        quickView={quickView}
      >
        <DataTable
          key={queryKey}
          columns={columns}
          data={patients}
          loading={isLoading}
          pagination
          pageSize={10}
          manualPagination
          pageCount={totalPages}
          onPageChange={(pageIndex) => setPage(pageIndex + 1)}
          manualSorting
          initialSorting={sortField ? [{ id: sortField, desc: sortDir === "desc" }] : []}
          onSortingChange={handleSortingChange}
          enableRowSelection
          getRowId={(row) => row.id}
          bulkActions={(rows) => (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { setBulkTargets(rows); setBulkDeleteOpen(true) }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          emptyIcon={Users}
          emptyTitle={hasActiveFilters ? "No patients match your filters" : "No patients yet"}
          emptyDescription={hasActiveFilters ? "Try adjusting or clearing your filters." : "Begin your patient journey by registering the first patient in your dental practice."}
          emptyAction={
            hasActiveFilters ? (
              <Button variant="outline" onClick={resetFilters}>Clear Filters</Button>
            ) : currentUser?.role !== "DOCTOR" ? (
              <Button onClick={openDialog}><UserPlus className="h-4 w-4" /> Add Patient</Button>
            ) : undefined
          }
          mobileCard={(row) => (
            <div className="flex items-center justify-between gap-3">
              <div className="ds-min-w-0">
                <p className="ds-body font-medium text-[var(--ds-text)]">{row.full_name}</p>
                <p className="ds-caption text-[var(--ds-text-secondary)]">
                  {row.gender ?? "—"} · {row.phone ?? "—"}
                </p>
              </div>
              <StatusBadge status={row.status} />
            </div>
          )}
          onRowClick={(row) => openQuickView(row)}
        />
      </EnterpriseWorkspace>

      {/* Create Dialog — multi-step wizard */}
      <EnterpriseFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        title="Add Patient"
        description="Fill in the details to register a new patient."
        scrollable={false}
      >
        <EnterpriseWizard
          steps={WIZARD_STEPS}
          currentStep={step}
          onStepChange={setStep}
          validateStep={validateStep}
          onSubmit={handleSubmit}
          submitting={createMutation.isPending}
          onCancel={() => handleDialogOpenChange(false)}
        >
          {step === 0 && (
            <div className="space-y-4">
              {dupChecked && dupTotal > 0 && !dupAcknowledged && (
                <DuplicateWarning
                  candidates={dupCandidates}
                  onOpenExisting={handleOpenDuplicate}
                  onContinueAnyway={() => { setDupAcknowledged(true); clearDuplicates() }}
                />
              )}
              <FormField label="Full Name" htmlFor="name" required error={fieldError("full_name")} hint="Patient's legal name as registered.">
                <Input
                  id="name"
                  value={formValues.full_name}
                  onChange={(e) => setFormField("full_name", e.target.value)}
                  onBlur={() => onFormBlur("full_name")}
                  aria-invalid={Boolean(fieldError("full_name"))}
                />
              </FormField>
              <EnterpriseFieldGrid>
                <FormField label="Patient Type" htmlFor="patient_type" hint="Children require guardian details.">
                  <Select value={formValues.patient_type} onValueChange={(v) => setFormField("patient_type", v)}>
                    <SelectTrigger id="patient_type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {PATIENT_TYPE_OPTIONS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Email" htmlFor="email" error={fieldError("email")}>
                  <Input
                    id="email"
                    type="email"
                    value={formValues.email}
                    onChange={(e) => setFormField("email", e.target.value)}
                    onBlur={() => onFormBlur("email")}
                    placeholder="name@clinic.com"
                  />
                </FormField>
              </EnterpriseFieldGrid>
              <EnterpriseFieldGrid>
                <FormField label="Phone" htmlFor="phone" error={fieldError("phone")}>
                  <Input
                    id="phone"
                    value={formValues.phone}
                    onChange={(e) => setFormField("phone", e.target.value)}
                    onBlur={() => onFormBlur("phone")}
                    placeholder="e.g. +91 98765 43210"
                  />
                </FormField>
                <FormField label="Age" htmlFor="age" error={fieldError("age")}>
                  <NumericInput id="age" mode="integer" min={0} max={150} value={formValues.age} onChange={(v) => setFormField("age", v)} />
                </FormField>
              </EnterpriseFieldGrid>
              <EnterpriseFieldGrid>
                <FormField label="Gender" htmlFor="gender">
                  <Select value={formValues.gender} onValueChange={(v) => setFormField("gender", v)}>
                    <SelectTrigger id="gender">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((g) => (
                        <SelectItem key={g.value} value={g.value}>
                          {g.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Emergency Contact" htmlFor="emergency_contact" hint="Parent / next of kin if the patient is a child.">
                  <Input id="emergency_contact" value={formValues.emergency_contact} onChange={(e) => setFormField("emergency_contact", e.target.value)} placeholder="e.g. +91 91234 56780" />
                </FormField>
              </EnterpriseFieldGrid>
              {formValues.patient_type === "CHILD" && (
                <div className="rounded-lg border border-[var(--ds-border-light)] bg-[var(--ds-surface-secondary)] p-3">
                  <p className="ds-form-title mb-3 text-[var(--ds-text)]">Guardian Information</p>
                  <EnterpriseFieldGrid>
                    <FormField label="Guardian Name" htmlFor="guardian_name">
                      <Input id="guardian_name" value={formValues.guardian_name} onChange={(e) => setFormField("guardian_name", e.target.value)} placeholder="Guardian's full name" />
                    </FormField>
                    <FormField label="Relationship" htmlFor="guardian_relationship">
                      <SearchableSelect
                        value={formValues.guardian_relationship}
                        onValueChange={(v) => setFormField("guardian_relationship", v)}
                        options={GUARDIAN_RELATIONSHIP_OPTIONS}
                        placeholder="Select relationship..."
                      />
                    </FormField>
                  </EnterpriseFieldGrid>
                  <FormField label="Guardian Phone" htmlFor="guardian_phone">
                    <Input id="guardian_phone" value={formValues.guardian_phone} onChange={(e) => setFormField("guardian_phone", e.target.value)} placeholder="e.g. +91 98765 43210" />
                  </FormField>
                </div>
              )}
              <FormField label="How Did You Hear About Us?" htmlFor="source" required error={fieldError("patient_source")}>
                <SearchableSelect
                  value={formValues.patient_source}
                  onValueChange={(v) => setFormField("patient_source", v)}
                  options={SOURCE_OPTIONS}
                  placeholder="Search or select source..."
                />
              </FormField>
              {formValues.patient_source === "Campaign" && (
                <div className="grid grid-cols-3 gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <FormField label="Campaign Name" htmlFor="campaign_name">
                    <Input id="campaign_name" className="h-8 text-xs" placeholder="Campaign name"
                      value={formValues.source_campaign_name} onChange={(e) => setFormField("source_campaign_name", e.target.value)} />
                  </FormField>
                  <FormField label="Campaign ID" htmlFor="campaign_id">
                    <Input id="campaign_id" className="h-8 text-xs" placeholder="Campaign ID"
                      value={formValues.source_campaign_id} onChange={(e) => setFormField("source_campaign_id", e.target.value)} />
                  </FormField>
                  <FormField label="Campaign Date" htmlFor="campaign_date">
                    <Input id="campaign_date" type="date" className="h-8 text-xs"
                      value={formValues.source_campaign_date} onChange={(e) => setFormField("source_campaign_date", e.target.value)} />
                  </FormField>
                </div>
              )}
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <FormField label="Address" htmlFor="address">
                <Input id="address" value={formValues.address} onChange={(e) => setFormField("address", e.target.value)} placeholder="Street, city, PIN" />
              </FormField>
              <EnterpriseFieldGrid>
                <FormField label="OP No." htmlFor="op_no" error={fieldError("op_no")}>
                  <Input id="op_no" value={formValues.op_no} onChange={(e) => setFormField("op_no", e.target.value)} placeholder="e.g. OP-2024-001" />
                </FormField>
                <FormField label="ABHA ID" htmlFor="abha_id" error={fieldError("abha_id")} hint="14-digit ABHA number">
                  <Input id="abha_id" value={formValues.abha_id} onChange={(e) => setFormField("abha_id", e.target.value)} placeholder="14-digit ABHA number" maxLength={20} />
                </FormField>
              </EnterpriseFieldGrid>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <FormField label="Medical History" htmlFor="medical_history">
                <Textarea id="medical_history" value={formValues.medical_history} onChange={(e) => setFormField("medical_history", e.target.value)} placeholder="Past medical history, allergies, medications..." />
              </FormField>
              <div>
                <p className="ds-form-title mb-3 text-[var(--ds-text)]">Vitals</p>
                <EnterpriseFieldGrid columns={3}>
                  <FormField label="Height (cm)" htmlFor="height">
                    <NumericInput id="height" mode="decimal" decimalPlaces={1} suffix="cm" value={formValues.height} onChange={(v) => setFormField("height", v)} />
                  </FormField>
                  <FormField label="Weight (kg)" htmlFor="weight">
                    <NumericInput id="weight" mode="decimal" decimalPlaces={1} suffix="kg" value={formValues.weight} onChange={(v) => setFormField("weight", v)} />
                  </FormField>
                  <FormField label="BP" htmlFor="bp">
                    <Input id="bp" placeholder="120/80" value={formValues.bp} onChange={(e) => setFormField("bp", e.target.value)} />
                  </FormField>
                  <FormField label="Sugar" htmlFor="sugar">
                    <Input id="sugar" placeholder="mg/dL" value={formValues.sugar} onChange={(e) => setFormField("sugar", e.target.value)} />
                  </FormField>
                  <FormField label="SpO2 (%)" htmlFor="spo2">
                    <NumericInput id="spo2" mode="decimal" decimalPlaces={1} suffix="%" placeholder="98" value={formValues.spo2} onChange={(v) => setFormField("spo2", v)} />
                  </FormField>
                </EnterpriseFieldGrid>
              </div>
            </div>
          )}
        </EnterpriseWizard>
      </EnterpriseFormDialog>

      {/* Workflow completion — related-record shortcuts after a successful save */}
      <WorkflowNextActions
        open={Boolean(completedPatient)}
        onOpenChange={(open) => { if (!open) setCompletedPatient(null) }}
        title="Patient registered"
        description={`${completedPatient?.full_name ?? "The patient"} is now part of the practice. What's next?`}
        summaryTitle="Registered patient"
        summary={completedPatient ? [
          { label: "Name", value: completedPatient.full_name },
          { label: "Patient type", value: completedPatient.patient_type === "CHILD" ? "Child" : "Adult" },
          { label: "Phone", value: completedPatient.phone || "—" },
          { label: "Status", value: completedPatient.status?.replace(/_/g, " ") ?? "NEW" },
          { label: "OP No.", value: completedPatient.op_no || "—" },
          { label: "Source", value: completedPatient.patient_source || "—" },
        ] : []}
        primaryAction={{
          label: "Schedule Appointment",
          icon: <CalendarPlus className="h-4 w-4" aria-hidden="true" />,
          onClick: () => {
            const id = completedPatient?.id
            setCompletedPatient(null)
            if (id) navigate(`/appointments?patient_id=${id}`)
          },
        }}
        secondaryActions={[
          {
            label: "Open Profile",
            icon: <UserRound className="h-4 w-4" aria-hidden="true" />,
            onClick: () => {
              const id = completedPatient?.id
              setCompletedPatient(null)
              if (id) navigate(`/patients/${id}`)
            },
          },
          {
            label: "Register Another",
            icon: <UserPlus className="h-4 w-4" aria-hidden="true" />,
            onClick: () => {
              setCompletedPatient(null)
              openDialog()
            },
          },
        ]}
      />

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Patient</DialogTitle>
            <DialogDescription>Are you sure you want to delete "{deletingPatient?.full_name}"? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Patients</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {bulkTargets.length} selected patient{bulkTargets.length === 1 ? "" : "s"}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleteMutation.isPending}>
              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
