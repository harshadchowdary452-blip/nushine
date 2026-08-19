import { useState, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { format } from "date-fns"
import {
  Search, CreditCard, Clock, AlertTriangle, XCircle, Gift,
  RefreshCw, IndianRupee, Users, Building2,
  Play, Calendar, History, Pencil, Ban, ChevronRight,
} from "lucide-react"
import { subscriptionsApi } from "@/services/endpoints"
import { PageHeader } from "@/design-system"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { showErrorToast } from "@/utils/showErrorToast"
import type {
  Subscription, SubscriptionPlan, SubscriptionDashboardStats,
  SubscriptionPayment, SubscriptionEvent,
  SubscriptionStatus, PaymentMethod, SubscriberType,
} from "@/types"

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

const STATUS_CONFIG: Record<string, { label: string; variant: "success" | "warning" | "danger" | "info" | "secondary" }> = {
  ACTIVE: { label: "Active", variant: "success" },
  TRIAL: { label: "Trial", variant: "info" },
  PAST_DUE: { label: "Past Due", variant: "warning" },
  EXPIRED: { label: "Expired", variant: "danger" },
  CANCELLED: { label: "Cancelled", variant: "secondary" },
  NO_SUBSCRIPTION: { label: "No Subscription", variant: "secondary" },
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OTHER", label: "Other" },
]

function fmtDate(d: string | null) {
  if (!d) return "—"
  try { return format(new Date(d), "dd MMM yyyy") } catch { return d }
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n)
}

function subKey(s: Subscription) {
  return `${s.subscriber_type}__${s.subscriber_id}`
}

const GROUP_BASE_PRICE = 5999
const SINGLE_HOSPITAL_PRICE = 2999
const ADDITIONAL_HOSPITAL_PRICE = 2999

function expectedMonthlyAmount(sub: Subscription) {
  const hospitals = sub.hospital_count ?? (sub.subscriber_type === "ADMIN_GROUP" ? 0 : 1)
  if (sub.subscriber_type === "ADMIN_GROUP") {
    if (hospitals === 0) return GROUP_BASE_PRICE
    return GROUP_BASE_PRICE + (hospitals - 1) * ADDITIONAL_HOSPITAL_PRICE
  }
  if (sub.plan) return sub.plan.price
  return SINGLE_HOSPITAL_PRICE
}

function pricingBreakdown(sub: Subscription) {
  const hospitals = sub.hospital_count ?? (sub.subscriber_type === "ADMIN_GROUP" ? 0 : 1)
  if (sub.subscriber_type !== "ADMIN_GROUP" || hospitals === 0) return null
  return {
    base: GROUP_BASE_PRICE,
    additional: Math.max(0, hospitals - 1),
    perAdditional: ADDITIONAL_HOSPITAL_PRICE,
    total: GROUP_BASE_PRICE + Math.max(0, hospitals - 1) * ADDITIONAL_HOSPITAL_PRICE,
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   STAT CARDS
   ═══════════════════════════════════════════════════════════════════════════ */

function StatCard({ title, value, icon: Icon, tone, loading }: {
  title: string; value: number | string; icon: React.ElementType; tone: string; loading?: boolean
}) {
  if (loading) return <Skeleton className="h-24 rounded-xl" />
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-medium text-[var(--ds-text-secondary)] uppercase tracking-wider">{title}</p>
            <p className="mt-1.5 text-xl font-bold text-[var(--ds-text)]">{value}</p>
          </div>
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>
            <Icon className="h-4 w-4 text-white" strokeWidth={1.5} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function AdminSubscriptions() {
  const { addToast } = useToast()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | "">("")
  const [typeFilter, setTypeFilter] = useState<SubscriberType | "">("")
  const [page, setPage] = useState(0)
  const pageSize = 50

  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null)
  const [detailTab, setDetailTab] = useState<"overview" | "payments" | "history">("overview")

  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false)
  const [grantFreeOpen, setGrantFreeOpen] = useState(false)
  const [extendOpen, setExtendOpen] = useState(false)
  const [changePlanOpen, setChangePlanOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reactivateOpen, setReactivateOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const [paymentForm, setPaymentForm] = useState({ amount: "", payment_method: "CASH" as PaymentMethod, reference_number: "", notes: "", payment_date: "" })
  const [grantFreeForm, setGrantFreeForm] = useState({ plan_id: "", free_forever: false, reason: "", notes: "" })
  const [extendForm, setExtendForm] = useState({ months: "1" })
  const [changePlanForm, setChangePlanForm] = useState({ plan_id: "", effective: "immediate" })
  const [cancelForm, setCancelForm] = useState({ reason: "" })
  const [createForm, setCreateForm] = useState({ plan_id: "", subscription_type: "PAID" as "PAID" | "TRIAL" | "FREE", trial_days: "30", notes: "" })
  const [createTarget, setCreateTarget] = useState<Subscription | null>(null)

  const hasSubId = !!selectedSub?.id

  const { data: stats, isLoading: statsLoading } = useQuery<SubscriptionDashboardStats>({
    queryKey: ["subscriptions", "dashboard"],
    queryFn: subscriptionsApi.dashboardStats,
  })

  const { data: plans = [] } = useQuery<SubscriptionPlan[]>({
    queryKey: ["subscription-plans"],
    queryFn: () => subscriptionsApi.plans(true),
  })

  const queryParams: Record<string, unknown> = { skip: page * pageSize, limit: pageSize }
  if (statusFilter) queryParams.status = statusFilter
  if (typeFilter) queryParams.subscriber_type = typeFilter
  if (search) queryParams.search = search

  const { data: subData, isLoading: subsLoading } = useQuery<{ total: number; items: Subscription[] }>({
    queryKey: ["subscriptions", queryParams],
    queryFn: () => subscriptionsApi.list(queryParams),
  })

  const { data: detailPayments = [] } = useQuery<SubscriptionPayment[]>({
    queryKey: ["subscription-payments", selectedSub?.id],
    queryFn: () => subscriptionsApi.payments(selectedSub!.id!),
    enabled: hasSubId && detailTab === "payments",
  })

  const { data: detailHistory = [] } = useQuery<SubscriptionEvent[]>({
    queryKey: ["subscription-history", selectedSub?.id],
    queryFn: () => subscriptionsApi.history(selectedSub!.id!),
    enabled: hasSubId && detailTab === "history",
  })

  const subs = subData?.items ?? []
  const total = subData?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["subscriptions"] })
    queryClient.invalidateQueries({ queryKey: ["subscription-plans"] })
  }, [queryClient])

  const recordPaymentMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => subscriptionsApi.recordPayment(selectedSub!.id!, data),
    onSuccess: () => { addToast({ title: "Payment recorded", variant: "success" }); setRecordPaymentOpen(false); setSelectedSub(null); invalidateAll() },
    onError: (e) => showErrorToast(e, addToast),
  })

  const extendMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => subscriptionsApi.extend(selectedSub!.id!, data),
    onSuccess: () => { addToast({ title: "Subscription extended", variant: "success" }); setExtendOpen(false); setSelectedSub(null); invalidateAll() },
    onError: (e) => showErrorToast(e, addToast),
  })

  const grantFreeMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => subscriptionsApi.grantFree(selectedSub!.id!, data),
    onSuccess: () => { addToast({ title: "Free access granted", variant: "success" }); setGrantFreeOpen(false); setSelectedSub(null); invalidateAll() },
    onError: (e) => showErrorToast(e, addToast),
  })

  const changePlanMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => subscriptionsApi.changePlan(selectedSub!.id!, data),
    onSuccess: () => { addToast({ title: "Plan changed", variant: "success" }); setChangePlanOpen(false); setSelectedSub(null); invalidateAll() },
    onError: (e) => showErrorToast(e, addToast),
  })

  const cancelMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => subscriptionsApi.cancel(selectedSub!.id!, data),
    onSuccess: () => { addToast({ title: "Subscription cancelled", variant: "success" }); setCancelOpen(false); setSelectedSub(null); invalidateAll() },
    onError: (e) => showErrorToast(e, addToast),
  })

  const reactivateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => subscriptionsApi.reactivate(selectedSub!.id!, data),
    onSuccess: () => { addToast({ title: "Subscription reactivated", variant: "success" }); setReactivateOpen(false); setSelectedSub(null); invalidateAll() },
    onError: (e) => showErrorToast(e, addToast),
  })

  const renewMutation = useMutation({
    mutationFn: () => subscriptionsApi.renew(selectedSub!.id!, {}),
    onSuccess: () => { addToast({ title: "Subscription renewed", variant: "success" }); setSelectedSub(null); invalidateAll() },
    onError: (e) => showErrorToast(e, addToast),
  })

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => subscriptionsApi.create(data),
    onSuccess: () => {
      addToast({ title: "Subscription created", variant: "success" })
      setCreateOpen(false)
      setCreateTarget(null)
      invalidateAll()
    },
    onError: (e) => showErrorToast(e, addToast),
  })

  function openCreateDialog(sub: Subscription) {
    setCreateTarget(sub)
    const isGroup = sub.subscriber_type === "ADMIN_GROUP"
    const correctPlan = plans.find(p => isGroup ? p.price === GROUP_BASE_PRICE && p.name.includes("Group") : p.price === SINGLE_HOSPITAL_PRICE && p.name.includes("Single"))
    setCreateForm({ plan_id: correctPlan?.id ?? plans[0]?.id ?? "", subscription_type: "PAID", trial_days: "30", notes: "" })
    setCreateOpen(true)
  }

  function handleCreate() {
    if (!createTarget) return
    createMutation.mutate({
      subscriber_type: createTarget.subscriber_type,
      subscriber_id: createTarget.subscriber_id,
      plan_id: createForm.plan_id,
      subscription_type: createForm.subscription_type,
      status: createForm.subscription_type === "TRIAL" ? "TRIAL" : "ACTIVE",
      trial_days: createForm.subscription_type === "TRIAL" ? Number(createForm.trial_days) : undefined,
      notes: createForm.notes || undefined,
    })
  }

  function openDetailDrawer(sub: Subscription) {
    if (!sub.id) return
    setSelectedSub(sub)
    setDetailTab("overview")
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscriptions"
        description="Manage tenant subscriptions and billing"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard title="Active" value={stats?.total_active ?? 0} icon={Play} tone="bg-emerald-500" loading={statsLoading} />
        <StatCard title="Trial" value={stats?.total_trial ?? 0} icon={Clock} tone="bg-blue-500" loading={statsLoading} />
        <StatCard title="Past Due" value={stats?.total_past_due ?? 0} icon={AlertTriangle} tone="bg-amber-500" loading={statsLoading} />
        <StatCard title="Expired" value={stats?.total_expired ?? 0} icon={XCircle} tone="bg-red-500" loading={statsLoading} />
        <StatCard title="Free" value={stats?.total_free ?? 0} icon={Gift} tone="bg-purple-500" loading={statsLoading} />
        <StatCard title="Revenue (Mo)" value={fmtCurrency(stats?.revenue_this_month ?? 0)} icon={IndianRupee} tone="bg-[var(--ds-primary)]" loading={statsLoading} />
      </div>

      {/* Filters + Table */}
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-[var(--ds-border-light)] px-5 py-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ds-text-secondary)]" />
              <Input
                placeholder="Search tenant..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0) }}
                className="pl-9 h-9"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as SubscriptionStatus | ""); setPage(0) }}
              className="h-9 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-background)] px-3 text-sm text-[var(--ds-text)]"
            >
              <option value="">All Statuses</option>
              <option value="NO_SUBSCRIPTION">No Subscription</option>
              {Object.entries(STATUS_CONFIG).filter(([k]) => k !== "NO_SUBSCRIPTION").map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value as SubscriberType | ""); setPage(0) }}
              className="h-9 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-background)] px-3 text-sm text-[var(--ds-text)]"
            >
              <option value="">All Tenants</option>
              <option value="ADMIN_GROUP">Groups</option>
              <option value="HOSPITAL">Hospitals</option>
            </select>
          </div>

          {subsLoading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : subs.length === 0 ? (
            <div className="p-12 text-center text-[var(--ds-text-secondary)]">
              <Users className="mx-auto h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">No tenants found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm mobile-card-view">
                  <thead>
                    <tr className="border-b border-[var(--ds-border-light)] text-left text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-secondary)]">
                      <th className="px-5 py-3">Tenant</th>
                      <th className="px-5 py-3">Hospitals</th>
                      <th className="px-5 py-3">Plan</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Period End</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subs.map((sub, idx) => {
                      const eff = sub.effective_status
                      const sc = STATUS_CONFIG[eff] ?? STATUS_CONFIG.ACTIVE
                      const hasSub = !!sub.id
                      const isGroup = sub.subscriber_type === "ADMIN_GROUP"
                      const hospitalCount = sub.hospital_count ?? (isGroup ? 0 : 1)

                      return (
                        <motion.tr
                          key={subKey(sub)}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.02 }}
                          className={`border-b border-[var(--ds-border-light)] last:border-0 ${
                            hasSub ? "hover:bg-[var(--ds-background-subtle)]/50 cursor-pointer" : ""
                          }`}
                          onClick={() => hasSub && openDetailDrawer(sub)}
                        >
                          <td className="px-5 py-3" data-label="Tenant">
                            <div className="flex items-center gap-2">
                              {isGroup
                                ? <Users className="h-4 w-4 text-[var(--ds-text-secondary)]" />
                                : <Building2 className="h-4 w-4 text-[var(--ds-text-secondary)]" />}
                              <div className="min-w-0">
                                <p className="font-medium text-[var(--ds-text)] text-xs truncate max-w-[200px]">
                                  {sub.subscriber_name || sub.subscriber_id.slice(0, 8) + "..."}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3" data-label="Hospitals">
                            <span className="text-xs text-[var(--ds-text-secondary)]">
                              {isGroup ? `${hospitalCount} hospitals` : "Single"}
                            </span>
                          </td>
                          <td className="px-5 py-3" data-label="Plan">
                            {isGroup ? (
                              <div>
                                <span className="text-xs font-medium text-[var(--ds-text)]">{fmtCurrency(expectedMonthlyAmount(sub))}/mo</span>
                                {pricingBreakdown(sub) && pricingBreakdown(sub)!.additional > 0 && (
                                  <p className="text-[10px] text-[var(--ds-text-secondary)]">
                                    {fmtCurrency(GROUP_BASE_PRICE)} base + {pricingBreakdown(sub)!.additional} × {fmtCurrency(ADDITIONAL_HOSPITAL_PRICE)}
                                  </p>
                                )}
                                {pricingBreakdown(sub) && pricingBreakdown(sub)!.additional === 0 && (
                                  <p className="text-[10px] text-[var(--ds-text-secondary)]">Group base</p>
                                )}
                              </div>
                            ) : sub.plan ? (
                              <div>
                                <span className="text-xs text-[var(--ds-text)]">{sub.plan.name}</span>
                                <p className="text-[10px] text-[var(--ds-text-secondary)]">{fmtCurrency(expectedMonthlyAmount(sub))}/mo</p>
                              </div>
                            ) : (
                              <span className="text-[var(--ds-text-secondary)] text-xs">{fmtCurrency(SINGLE_HOSPITAL_PRICE)}/mo</span>
                            )}
                          </td>
                          <td className="px-5 py-3" data-label="Status">
                            <Badge variant={sc.variant}>{sc.label}</Badge>
                          </td>
                          <td className="px-5 py-3" data-label="Period End">
                            <span className="text-[var(--ds-text-secondary)] text-xs">{fmtDate(sub.current_period_end)}</span>
                          </td>
                          <td className="px-5 py-3 text-right" data-label="Actions">
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              {eff === "NO_SUBSCRIPTION" ? (
                                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openCreateDialog(sub)}>
                                  <Play className="h-3 w-3 mr-1" />
                                  Create
                                </Button>
                              ) : (
                                <>
                                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => { setSelectedSub(sub); setPaymentForm(f => ({ ...f, amount: expectedMonthlyAmount(sub).toString(), payment_date: new Date().toISOString().slice(0, 10) })); setRecordPaymentOpen(true) }}>
                                    <CreditCard className="h-3 w-3 mr-1" />
                                    Pay
                                  </Button>
                                  <div className="relative group">
                                    <button className="p-1.5 rounded-md hover:bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]">
                                      <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                                    </button>
                                    <div className="hidden group-hover:block absolute right-0 top-full mt-1 z-20 w-48 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-background)] shadow-lg py-1">
                                      {eff === "ACTIVE" || eff === "TRIAL" || eff === "PAST_DUE" ? (
                                        <>
                                          <MenuBtn icon={CreditCard} label="Record Payment" onClick={() => { setSelectedSub(sub); setPaymentForm(f => ({ ...f, amount: expectedMonthlyAmount(sub).toString(), payment_date: new Date().toISOString().slice(0, 10) })); setRecordPaymentOpen(true) }} />
                                          <MenuBtn icon={Calendar} label="Extend" onClick={() => { setSelectedSub(sub); setExtendOpen(true) }} />
                                          <MenuBtn icon={Pencil} label="Change Plan" onClick={() => { setSelectedSub(sub); setChangePlanOpen(true) }} />
                                          <MenuBtn icon={Gift} label="Grant Free" onClick={() => { setSelectedSub(sub); setGrantFreeForm(f => ({ ...f, plan_id: sub.plan_id })); setGrantFreeOpen(true) }} />
                                          <MenuBtn icon={Ban} label="Cancel" onClick={() => { setSelectedSub(sub); setCancelOpen(true) }} />
                                        </>
                                      ) : (
                                        <>
                                          <MenuBtn icon={RefreshCw} label="Renew" onClick={() => { setSelectedSub(sub); renewMutation.mutate() }} />
                                          <MenuBtn icon={Play} label="Reactivate" onClick={() => { setSelectedSub(sub); setReactivateOpen(true) }} />
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-[var(--ds-border-light)] px-5 py-3">
                  <p className="text-xs text-[var(--ds-text-secondary)]">
                    Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
                  </p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ═════════════════════════════════════════════════════════════════════
         DETAIL DRAWER (only for tenants WITH a subscription)
         ═════════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!selectedSub && hasSubId} onOpenChange={(open) => { if (!open) setSelectedSub(null) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedSub && hasSubId && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge variant={STATUS_CONFIG[selectedSub.effective_status]?.variant ?? "secondary"}>
                    {STATUS_CONFIG[selectedSub.effective_status]?.label ?? selectedSub.effective_status}
                  </Badge>
                  {selectedSub.subscriber_name || selectedSub.subscriber_id.slice(0, 8)}
                </DialogTitle>
                <DialogDescription>
                  {selectedSub.subscriber_type === "ADMIN_GROUP" ? "Group" : "Hospital"}
                  {selectedSub.hospital_count ? ` · ${selectedSub.hospital_count} hospital(s)` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="flex gap-1 border-b border-[var(--ds-border-light)]">
                {(["overview", "payments", "history"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setDetailTab(tab)}
                    className={`px-4 py-2 text-xs font-medium capitalize border-b-2 transition-colors ${
                      detailTab === tab
                        ? "border-[var(--ds-primary)] text-[var(--ds-primary)]"
                        : "border-transparent text-[var(--ds-text-secondary)] hover:text-[var(--ds-text)]"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="py-4 space-y-4">
                {detailTab === "overview" && (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <Info label="Plan" value={selectedSub.plan?.name ?? "—"} />
                    <Info label="Type" value={selectedSub.subscription_type ?? "—"} />
                    <Info label="Period Start" value={fmtDate(selectedSub.current_period_start)} />
                    <Info label="Period End" value={fmtDate(selectedSub.current_period_end)} />
                    {selectedSub.trial_ends_at && <Info label="Trial Ends" value={fmtDate(selectedSub.trial_ends_at)} />}
                    <Info label="Grace Period" value={`${selectedSub.grace_period_days} days`} />
                    {selectedSub.free_forever && <Info label="Free Forever" value="Yes" />}
                    {selectedSub.free_until && <Info label="Free Until" value={fmtDate(selectedSub.free_until)} />}
                    {selectedSub.free_reason && <Info label="Reason" value={selectedSub.free_reason} />}
                    {selectedSub.cancelled_at && <Info label="Cancelled At" value={fmtDate(selectedSub.cancelled_at)} />}
                    <Info label="Created" value={fmtDate(selectedSub.created_at)} />
                    {selectedSub.notes && <div className="col-span-2"><Info label="Notes" value={selectedSub.notes} /></div>}
                  </div>
                )}

                {detailTab === "payments" && (
                  <div>
                    {detailPayments.length === 0 ? (
                      <p className="text-sm text-[var(--ds-text-secondary)] text-center py-6">No payments recorded</p>
                    ) : (
                      <div className="space-y-2">
                        {detailPayments.map((p) => (
                          <div key={p.id} className="flex items-center justify-between rounded-lg border border-[var(--ds-border-light)] px-4 py-3">
                            <div>
                              <p className="text-sm font-medium text-[var(--ds-text)]">{fmtCurrency(p.amount)}</p>
                              <p className="text-xs text-[var(--ds-text-secondary)]">{p.payment_method} · {fmtDate(p.payment_date)}</p>
                            </div>
                            {p.reference_number && <span className="text-xs text-[var(--ds-text-secondary)]">{p.reference_number}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {detailTab === "history" && (
                  <div>
                    {detailHistory.length === 0 ? (
                      <p className="text-sm text-[var(--ds-text-secondary)] text-center py-6">No history events</p>
                    ) : (
                      <div className="space-y-2">
                        {detailHistory.map((e) => (
                          <div key={e.id} className="flex items-start gap-3 rounded-lg border border-[var(--ds-border-light)] px-4 py-3">
                            <History className="h-4 w-4 mt-0.5 text-[var(--ds-text-secondary)] shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[var(--ds-text)]">{e.event_type.replace(/_/g, " ")}</p>
                              {e.reason && <p className="text-xs text-[var(--ds-text-secondary)] mt-0.5">{e.reason}</p>}
                              {e.previous_status && e.new_status && (
                                <p className="text-xs text-[var(--ds-text-secondary)] mt-0.5">
                                  {e.previous_status} → {e.new_status}
                                </p>
                              )}
                            </div>
                            <span className="text-xs text-[var(--ds-text-secondary)] shrink-0">{fmtDate(e.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ═════════════════════════════════════════════════════════════════════
         ACTION DIALOGS
         ═════════════════════════════════════════════════════════════════════ */}

      {/* Record Payment */}
      <Dialog open={recordPaymentOpen} onOpenChange={setRecordPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a payment for {selectedSub?.subscriber_name || "this tenant"}.
              {selectedSub && pricingBreakdown(selectedSub) && pricingBreakdown(selectedSub)!.additional > 0 && (
                <span className="block mt-1 text-[var(--ds-text-secondary)]">
                  {fmtCurrency(GROUP_BASE_PRICE)} base + {pricingBreakdown(selectedSub)!.additional} hospitals × {fmtCurrency(ADDITIONAL_HOSPITAL_PRICE)} = {fmtCurrency(expectedMonthlyAmount(selectedSub))}/mo
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Amount (INR)</Label>
              <Input type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <Label>Payment Method</Label>
              <select value={paymentForm.payment_method} onChange={(e) => setPaymentForm(f => ({ ...f, payment_method: e.target.value as PaymentMethod }))} className="w-full h-9 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-background)] px-3 text-sm">
                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <Label>Payment Date</Label>
              <Input type="date" value={paymentForm.payment_date} onChange={(e) => setPaymentForm(f => ({ ...f, payment_date: e.target.value }))} />
            </div>
            <div>
              <Label>Reference Number</Label>
              <Input value={paymentForm.reference_number} onChange={(e) => setPaymentForm(f => ({ ...f, reference_number: e.target.value }))} placeholder="Optional" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={paymentForm.notes} onChange={(e) => setPaymentForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordPaymentOpen(false)}>Cancel</Button>
            <Button onClick={() => recordPaymentMutation.mutate({ amount: Number(paymentForm.amount), payment_method: paymentForm.payment_method, payment_date: paymentForm.payment_date || new Date().toISOString(), reference_number: paymentForm.reference_number || undefined, notes: paymentForm.notes || undefined })} disabled={!paymentForm.amount || recordPaymentMutation.isPending}>
              {recordPaymentMutation.isPending ? "Saving..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend */}
      <Dialog open={extendOpen} onOpenChange={setExtendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend Subscription</DialogTitle>
            <DialogDescription>Add months to the current subscription period.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Months to Add</Label>
              <Input type="number" min={1} value={extendForm.months} onChange={(e) => setExtendForm({ months: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendOpen(false)}>Cancel</Button>
            <Button onClick={() => extendMutation.mutate({ months: Number(extendForm.months) })} disabled={extendMutation.isPending}>
              {extendMutation.isPending ? "Extending..." : "Extend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grant Free */}
      <Dialog open={grantFreeOpen} onOpenChange={setGrantFreeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant Free Access</DialogTitle>
            <DialogDescription>Switch this subscription to free access.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Plan</Label>
              <select value={grantFreeForm.plan_id} onChange={(e) => setGrantFreeForm(f => ({ ...f, plan_id: e.target.value }))} className="w-full h-9 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-background)] px-3 text-sm">
                {plans.map(p => <option key={p.id} value={p.id}>{p.name} — {fmtCurrency(p.price)}/mo</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="free-forever" checked={grantFreeForm.free_forever} onChange={(e) => setGrantFreeForm(f => ({ ...f, free_forever: e.target.checked }))} className="rounded" />
              <Label htmlFor="free-forever">Free forever</Label>
            </div>
            <div>
              <Label>Reason *</Label>
              <Input value={grantFreeForm.reason} onChange={(e) => setGrantFreeForm(f => ({ ...f, reason: e.target.value }))} placeholder="Why is this free?" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={grantFreeForm.notes} onChange={(e) => setGrantFreeForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantFreeOpen(false)}>Cancel</Button>
            <Button onClick={() => grantFreeMutation.mutate({ plan_id: grantFreeForm.plan_id, free_forever: grantFreeForm.free_forever, reason: grantFreeForm.reason, notes: grantFreeForm.notes || undefined })} disabled={!grantFreeForm.reason || grantFreeMutation.isPending}>
              {grantFreeMutation.isPending ? "Saving..." : "Grant Free"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Plan */}
      <Dialog open={changePlanOpen} onOpenChange={setChangePlanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Plan</DialogTitle>
            <DialogDescription>Switch to a different subscription plan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>New Plan</Label>
              <select value={changePlanForm.plan_id} onChange={(e) => setChangePlanForm(f => ({ ...f, plan_id: e.target.value }))} className="w-full h-9 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-background)] px-3 text-sm">
                {plans.map(p => <option key={p.id} value={p.id}>{p.name} — {fmtCurrency(p.price)}/mo</option>)}
              </select>
            </div>
            <div>
              <Label>Effective</Label>
              <select value={changePlanForm.effective} onChange={(e) => setChangePlanForm(f => ({ ...f, effective: e.target.value }))} className="w-full h-9 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-background)] px-3 text-sm">
                <option value="immediate">Immediate</option>
                <option value="next_renewal">Next Renewal</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePlanOpen(false)}>Cancel</Button>
            <Button onClick={() => changePlanMutation.mutate({ plan_id: changePlanForm.plan_id, effective: changePlanForm.effective })} disabled={!changePlanForm.plan_id || changePlanMutation.isPending}>
              {changePlanMutation.isPending ? "Saving..." : "Change Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Subscription</DialogTitle>
            <DialogDescription>This will cancel the subscription. The tenant will lose access at the end of the current period.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Reason (optional)</Label>
              <Input value={cancelForm.reason} onChange={(e) => setCancelForm({ reason: e.target.value })} placeholder="Why is this being cancelled?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep Active</Button>
            <Button variant="destructive" onClick={() => cancelMutation.mutate({ reason: cancelForm.reason || undefined })} disabled={cancelMutation.isPending}>
              {cancelMutation.isPending ? "Cancelling..." : "Cancel Subscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reactivate */}
      <Dialog open={reactivateOpen} onOpenChange={setReactivateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reactivate Subscription</DialogTitle>
            <DialogDescription>Reactivate this subscription with the same plan.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReactivateOpen(false)}>Cancel</Button>
            <Button onClick={() => reactivateMutation.mutate({})} disabled={reactivateMutation.isPending}>
              {reactivateMutation.isPending ? "Reactivating..." : "Reactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Subscription */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) { setCreateOpen(false); setCreateTarget(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Subscription</DialogTitle>
            <DialogDescription>
              Assign a subscription to {createTarget?.subscriber_name || "this tenant"}.
              {createTarget?.subscriber_type === "ADMIN_GROUP" ? (
                <span className="block mt-1 text-[var(--ds-primary)]">
                  {fmtCurrency(GROUP_BASE_PRICE)}/mo base + {(createTarget.hospital_count ?? 1) - 1 > 0
                    ? `${(createTarget.hospital_count ?? 1) - 1} additional × ${fmtCurrency(ADDITIONAL_HOSPITAL_PRICE)}`
                    : "first hospital included"} = {fmtCurrency(expectedMonthlyAmount(createTarget))}/mo total
                </span>
              ) : (
                <span className="block mt-1 text-[var(--ds-primary)]">{fmtCurrency(SINGLE_HOSPITAL_PRICE)}/mo</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Plan</Label>
              <select value={createForm.plan_id} onChange={(e) => setCreateForm(f => ({ ...f, plan_id: e.target.value }))} className="w-full h-9 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-background)] px-3 text-sm">
                {plans.map(p => <option key={p.id} value={p.id}>{p.name} — {fmtCurrency(p.price)}/mo</option>)}
              </select>
            </div>
            <div>
              <Label>Type</Label>
              <select value={createForm.subscription_type} onChange={(e) => setCreateForm(f => ({ ...f, subscription_type: e.target.value as "PAID" | "TRIAL" | "FREE" }))} className="w-full h-9 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-background)] px-3 text-sm">
                <option value="PAID">Paid</option>
                <option value="TRIAL">Trial</option>
                <option value="FREE">Free</option>
              </select>
            </div>
            {createForm.subscription_type === "TRIAL" && (
              <div>
                <Label>Trial Days</Label>
                <Input type="number" min={1} value={createForm.trial_days} onChange={(e) => setCreateForm(f => ({ ...f, trial_days: e.target.value }))} />
              </div>
            )}
            <div>
              <Label>Notes</Label>
              <Input value={createForm.notes} onChange={(e) => setCreateForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setCreateTarget(null) }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!createForm.plan_id || createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Subscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUB COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-[var(--ds-text-secondary)]">{label}</p>
      <p className="text-sm text-[var(--ds-text)] mt-0.5">{value}</p>
    </div>
  )
}

function MenuBtn({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-[var(--ds-text)] hover:bg-[var(--ds-background-subtle)]"
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
      {label}
    </button>
  )
}
