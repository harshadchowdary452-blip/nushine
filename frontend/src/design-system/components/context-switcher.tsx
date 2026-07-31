"use client"

import { useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Building2, Check, ChevronsUpDown, Globe2, Layers, Search, Star } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useFixedPosition, useOverlayDismiss, resolveOverlayLayer } from "@/lib/overlay"
import { useAuthStore } from "@/store/authStore"
import { authApi, hospitalsApi, groupsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import type { AdminGroup, Hospital } from "@/types"
import { getHospitalOverride, setHospitalOverride } from "@/lib/hospital-override"
import {
  addRecentContext,
  getFavoriteContexts,
  getRecentContexts,
  isFavoriteContext,
  toggleFavoriteContext,
  type ContextEntry,
} from "@/lib/context-history"
import { queryClient } from "@/lib/queryClient"

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  GROUP_ADMIN: "Group Admin",
  HOSPITAL_ADMIN: "Hospital Admin",
  DOCTOR: "Doctor",
}

interface HospitalRef {
  id: string
  name: string
  groupId?: string
  groupName?: string
}

interface Section {
  key: string
  groupName: string
  hospitals: HospitalRef[]
}

export default function ContextSwitcher() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const { addToast } = useToast()
  const role = user?.role

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [switching, setSwitching] = useState(false)
  const [resolved, setResolved] = useState<ContextEntry | null>(null)
  const [favorites, setFavorites] = useState<ContextEntry[]>(() => getFavoriteContexts())
  const [recents, setRecents] = useState<ContextEntry[]>(() => getRecentContexts())
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const { position } = useFixedPosition(open, triggerRef)
  useOverlayDismiss(open, () => setOpen(false), triggerRef, popupRef)
  const layer = resolveOverlayLayer(triggerRef.current)

  const isSuper = role === "SUPER_ADMIN"
  const isGroupAdmin = role === "GROUP_ADMIN"
  const isReadOnly = role === "HOSPITAL_ADMIN" || role === "DOCTOR"

  const { data: ctx } = useQuery({
    queryKey: ["context", "current"],
    queryFn: () => authApi.switchContext({}),
    enabled: !!user,
    staleTime: 120_000,
  })

  const { data: groupsData } = useQuery<AdminGroup[]>({
    queryKey: ["admin-groups", "context"],
    queryFn: () => groupsApi.list({ page_size: 200 }),
    enabled: isSuper,
    staleTime: 120_000,
  })

  const { data: hospitalsData } = useQuery<{ items: Hospital[] } | Hospital[]>({
    queryKey: ["hospitals", "context"],
    queryFn: () => hospitalsApi.list({ page_size: 200 }),
    enabled: isSuper || isGroupAdmin,
    staleTime: 60_000,
  })

  const hospitals: HospitalRef[] = useMemo(() => {
    const raw = hospitalsData
    const items = Array.isArray(raw) ? raw : (raw?.items ?? [])
    const refs: HospitalRef[] = items.map((h) => ({
      id: h.id,
      name: h.name,
      groupId: h.admin_group_id,
    }))
    return refs
  }, [hospitalsData])

  const sections: Section[] = useMemo(() => {
    if (isGroupAdmin) {
      const groupName = ctx?.admin_group_name ?? "All Hospitals in Group"
      return [{ key: groupName, groupName, hospitals }]
    }
    if (!isSuper) return []
    const groups = groupsData ?? []
    const byGroup = new Map<string, HospitalRef[]>()
    const ungrouped: HospitalRef[] = []
    for (const h of hospitals) {
      if (h.groupId && groups.some((g) => g.id === h.groupId)) {
        if (!byGroup.has(h.groupId)) byGroup.set(h.groupId, [])
        byGroup.get(h.groupId)!.push(h)
      } else {
        ungrouped.push(h)
      }
    }
    const result: Section[] = groups.map((g) => ({
      key: g.id,
      groupName: g.name,
      hospitals: (byGroup.get(g.id) ?? []).map((h) => ({ ...h, groupName: g.name })),
    }))
    if (ungrouped.length) {
      result.push({ key: "ungrouped", groupName: "Ungrouped", hospitals: ungrouped })
    }
    return result
  }, [isSuper, isGroupAdmin, groupsData, hospitals, ctx])

  const override = getHospitalOverride()
  const activeId = override ?? resolved?.id ?? ctx?.hospital_id ?? null

  const allHospitals = useMemo(() => hospitals.flatMap((h) => [h]), [hospitals])
  const activeHospital = allHospitals.find((h) => h.id === activeId)
  const activeName =
    activeHospital?.name ??
    (activeId === resolved?.id ? resolved?.name : null) ??
    (activeId === ctx?.hospital_id ? ctx?.hospital_name : null)

  if (isReadOnly) {
    return (
      <div
        className="flex items-center gap-2 rounded-[var(--ds-radius-lg)] px-2.5 py-1.5"
        title={`${activeName || ctx?.hospital_name || user?.hospital_name || "No hospital"} · ${roleLabels[role]}`}
      >
        <Building2 className="h-3.5 w-3.5 text-[var(--ds-primary)]" strokeWidth={1.5} />
        <div className="min-w-0 text-left leading-tight">
          <p className="max-w-[150px] truncate text-xs font-medium text-[var(--ds-text)]">
            {activeName ?? ctx?.hospital_name ?? user?.hospital_name ?? "No hospital"}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ds-text-tertiary)]">
            {roleLabels[role]}
          </p>
        </div>
      </div>
    )
  }

  const applyContext = async (hospitalId: string | null) => {
    if (switching) return
    setSwitching(true)
    try {
      const next = await authApi.switchContext({ hospital_id: hospitalId })
      const entry: ContextEntry | null =
        hospitalId && next.hospital_name
          ? {
              id: hospitalId,
              name: next.hospital_name,
              groupName: next.admin_group_name ?? undefined,
            }
          : null
      if (entry) {
        addRecentContext(entry)
        setRecents(getRecentContexts())
        setResolved(entry)
      } else {
        setResolved(null)
      }
      setHospitalOverride(hospitalId)
      setOpen(false)
      setQuery("")
      queryClient.clear()
      addToast({
        title: hospitalId ? "Hospital switched" : "Context updated",
        description: hospitalId
          ? "Showing data for the selected hospital."
          : "Showing data across all hospitals.",
        variant: "success",
      })
      navigate("/")
    } catch {
      addToast({
        title: "Context change denied",
        description: "You do not have access to that context.",
        variant: "destructive",
      })
    } finally {
      setSwitching(false)
    }
  }

  const toggleStar = (entry: ContextEntry) => {
    toggleFavoriteContext(entry)
    setFavorites(getFavoriteContexts())
  }

  const globalActive = !activeId

  const triggerLabel =
    activeName ?? (isSuper ? "All Hospitals" : (ctx?.admin_group_name ?? "All Hospitals in Group"))

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Current context: ${triggerLabel}`}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-[var(--ds-radius-lg)] px-2 text-xs font-medium transition-colors",
          "text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]",
        )}
      >
        <Building2 className="h-3.5 w-3.5 text-[var(--ds-primary)]" strokeWidth={1.5} />
        <span className="hidden max-w-[130px] truncate lg:inline">{triggerLabel}</span>
        <ChevronsUpDown
          className="hidden h-3 w-3 text-[var(--ds-text-tertiary)] lg:inline"
          strokeWidth={1.5}
        />
      </button>

      {open &&
        createPortal(
          <motion.div
            ref={popupRef}
            role="menu"
            aria-label="Switch context"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.12 }}
            style={position ? { top: position.top, left: position.left } : undefined}
            className={cn(
              "fixed flex max-h-[70vh] flex-col rounded-[var(--ds-radius-xl)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-1.5 shadow-[var(--ds-shadow-dropdown)]",
              isSuper ? "w-80" : "w-64",
              layer,
            )}
          >
            {isSuper && (
              <div className="relative mb-1 px-1">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ds-text-tertiary)]"
                  strokeWidth={1.5}
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search groups & hospitals…"
                  aria-label="Search groups and hospitals"
                  className="h-8 w-full rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] pl-8 pr-2 text-xs text-[var(--ds-text)] placeholder:text-[var(--ds-text-tertiary)] outline-none transition-colors focus:border-[var(--ds-input-border-focus)]"
                />
              </div>
            )}

            <div className="overflow-y-auto">
              {isSuper && (
                <>
                  {!query && favorites.length > 0 && (
                    <>
                      <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-tertiary)]">
                        Pinned
                      </p>
                      {favorites.map((f) => (
                        <Row
                          key={`fav-${f.id}`}
                          hospital={{ id: f.id, name: f.name, groupName: f.groupName }}
                          active={activeId === f.id}
                          onSelect={() => applyContext(f.id)}
                          onToggleStar={() => toggleStar(f)}
                          starred
                        />
                      ))}
                    </>
                  )}

                  {!query && recents.length > 0 && (
                    <>
                      <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-tertiary)]">
                        Recent
                      </p>
                      {recents.map((r) => (
                        <Row
                          key={`rec-${r.id}`}
                          hospital={{ id: r.id, name: r.name, groupName: r.groupName }}
                          active={activeId === r.id}
                          onSelect={() => applyContext(r.id)}
                          onToggleStar={() => toggleStar(r)}
                          starred={isFavoriteContext(r.id)}
                        />
                      ))}
                    </>
                  )}

                  <button
                    role="menuitem"
                    onClick={() => applyContext(null)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-[var(--ds-radius-lg)] px-3 py-2 text-left text-sm transition-colors",
                      globalActive
                        ? "bg-[var(--ds-primary-subtle)] font-medium text-[var(--ds-primary)]"
                        : "text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]",
                    )}
                  >
                    <Globe2 className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                    <span className="min-w-0 flex-1 truncate">All Groups & Hospitals</span>
                    {globalActive && <Check className="h-4 w-4 shrink-0" strokeWidth={1.5} />}
                  </button>
                </>
              )}

              {isGroupAdmin && (
                <button
                  role="menuitem"
                  onClick={() => applyContext(null)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-[var(--ds-radius-lg)] px-3 py-2 text-left text-sm transition-colors",
                    globalActive
                      ? "bg-[var(--ds-primary-subtle)] font-medium text-[var(--ds-primary)]"
                      : "text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]",
                  )}
                >
                  <Layers className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  <span className="min-w-0 flex-1 truncate">
                    {ctx?.admin_group_name
                      ? `All · ${ctx.admin_group_name}`
                      : "All Hospitals in Group"}
                  </span>
                  {globalActive && <Check className="h-4 w-4 shrink-0" strokeWidth={1.5} />}
                </button>
              )}

              <div
                className={cn(
                  "my-1 h-px bg-[var(--ds-border-subtle)]",
                  isSuper && (favorites.length || recents.length) && query && "mt-1.5",
                )}
              />

              {query ? (
                <FilteredList
                  query={query}
                  hospitals={allHospitals}
                  activeId={activeId}
                  onSelect={(id) => applyContext(id)}
                  onToggleStar={toggleStar}
                />
              ) : (
                sections.map((section) => (
                  <div key={section.key}>
                    <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
                      <Layers
                        className="h-3 w-3 shrink-0 text-[var(--ds-text-tertiary)]"
                        strokeWidth={1.5}
                      />
                      <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-tertiary)]">
                        {section.groupName}
                      </span>
                    </div>
                    {section.hospitals.length === 0 ? (
                      <p className="px-3 pb-1 text-xs text-[var(--ds-text-tertiary)]">
                        No hospitals
                      </p>
                    ) : (
                      section.hospitals.map((h) => (
                        <Row
                          key={h.id}
                          hospital={h}
                          active={activeId === h.id}
                          onSelect={() => applyContext(h.id)}
                          onToggleStar={() =>
                            toggleStar({ id: h.id, name: h.name, groupName: h.groupName })
                          }
                          starred={isFavoriteContext(h.id)}
                        />
                      ))
                    )}
                  </div>
                ))
              )}

              {isSuper && allHospitals.length === 0 && (
                <p className="px-3 py-3 text-center text-xs text-[var(--ds-text-tertiary)]">
                  No hospitals yet
                </p>
              )}
            </div>
          </motion.div>,
          document.body,
        )}
    </div>
  )
}

function Row({
  hospital,
  active,
  starred,
  onSelect,
  onToggleStar,
}: {
  hospital: HospitalRef
  active: boolean
  starred: boolean
  onSelect: () => void
  onToggleStar: () => void
}) {
  return (
    <div className="relative">
      <button
        role="menuitem"
        onClick={onSelect}
        disabled={active}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[var(--ds-radius-lg)] px-3 py-2 pr-9 text-left text-sm transition-colors",
          active
            ? "bg-[var(--ds-primary-subtle)] font-medium text-[var(--ds-primary)]"
            : "text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]",
        )}
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--ds-primary-light)]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{hospital.name}</span>
          {hospital.groupName && (
            <span className="block truncate text-[11px] text-[var(--ds-text-tertiary)]">
              {hospital.groupName}
            </span>
          )}
        </span>
        {active && <Check className="h-4 w-4 shrink-0" strokeWidth={1.5} />}
      </button>
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onToggleStar()
        }}
        aria-label={starred ? "Remove from favorites" : "Add to favorites"}
        className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-[var(--ds-radius-sm)] text-[var(--ds-text-tertiary)] transition-colors",
          "hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-warning)]",
        )}
      >
        <Star
          className={cn(
            "h-3.5 w-3.5",
            starred && "fill-[var(--ds-warning)] text-[var(--ds-warning)]",
          )}
          strokeWidth={1.5}
        />
      </button>
    </div>
  )
}

function FilteredList({
  query,
  hospitals,
  activeId,
  onSelect,
  onToggleStar,
}: {
  query: string
  hospitals: HospitalRef[]
  activeId: string | null
  onSelect: (id: string) => void
  onToggleStar: (entry: ContextEntry) => void
}) {
  const q = query.trim().toLowerCase()
  const filtered = hospitals.filter(
    (h) => h.name.toLowerCase().includes(q) || (h.groupName ?? "").toLowerCase().includes(q),
  )
  if (filtered.length === 0) {
    return (
      <p className="px-3 py-3 text-center text-xs text-[var(--ds-text-tertiary)]">
        No matches for “{query}”
      </p>
    )
  }
  return (
    <>
      {filtered.map((h) => (
        <Row
          key={h.id}
          hospital={h}
          active={activeId === h.id}
          onSelect={() => onSelect(h.id)}
          onToggleStar={() => onToggleStar({ id: h.id, name: h.name, groupName: h.groupName })}
          starred={isFavoriteContext(h.id)}
        />
      ))}
    </>
  )
}
