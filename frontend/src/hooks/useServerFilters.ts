import { useState, useCallback, useMemo, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { useDebounce } from "./useDebounce"

export interface FilterChip {
  key: string
  label: string
  value: string
}

interface UseServerFiltersOptions {
  defaultSort?: string
  defaultSortDir?: "asc" | "desc"
}

export function useServerFilters(opts?: UseServerFiltersOptions) {
  const defaultSort = opts?.defaultSort ?? ""
  const defaultSortDir = opts?.defaultSortDir ?? "asc"

  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFiltersState] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    searchParams.forEach((v, k) => { if (v) initial[k] = v })
    return initial
  })

  const [searchInput, setSearchInput] = useState(filters.search || "")
  const debouncedSearch = useDebounce(searchInput, 300)

  useEffect(() => {
    if (debouncedSearch) {
      setFiltersState((prev) => ({ ...prev, search: debouncedSearch }))
    } else {
      setFiltersState((prev) => {
        const next = { ...prev }
        delete next.search
        return next
      })
    }
  }, [debouncedSearch])

  useEffect(() => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(k, v)
    }
    setSearchParams(params, { replace: true })
  }, [filters, setSearchParams])

  const [page, setPageRaw] = useState(() => {
    const p = searchParams.get("page")
    return p ? Math.max(1, parseInt(p, 10)) : 1
  })

  const setPage = useCallback((p: number) => {
    setPageRaw(Math.max(1, p))
  }, [])

  useEffect(() => {
    setPage(1)
  }, [JSON.stringify(filters)])

  const [sortField, setSortField] = useState(defaultSort)
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir)

  const toggleSort = useCallback((field: string) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"))
        return field
      }
      setSortDir("asc")
      return field
    })
  }, [])

  const setFilter = useCallback((key: string, value: string) => {
    if (key === "search") {
      setSearchInput(value)
    }
    setFiltersState((prev) => {
      if (value) return { ...prev, [key]: value }
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const resetFilters = useCallback(() => {
    setFiltersState({})
    setSearchInput("")
    setPage(1)
    setSearchParams({}, { replace: true })
  }, [setSearchParams, setPage])

  const activeFilters = useMemo(() => {
    return Object.values(filters).filter((v) => v !== "" && v !== undefined).length
  }, [filters])

  const hasActiveFilters = activeFilters > 0

  const queryParams = useMemo(() => {
    const params: Record<string, string | number> = {}
    for (const [k, v] of Object.entries(filters)) {
      if (v) params[k] = v
    }
    return params
  }, [filters])

  const queryKey = useMemo(() => JSON.stringify(keySort(filters)), [filters])

  const activeChips = useMemo(() => {
    const LABELS: Record<string, string> = {
      search: "Search", status: "Status", gender: "Gender",
      doctor_id: "Doctor", date_from: "From", date_to: "To",
      patient_source: "Source",
      case_status: "Case", treatment_status: "Treatment", billing_status: "Billing",
      created_at_from: "Reg From", created_at_to: "Reg To",
      age_from: "Min Age", age_to: "Max Age",
    }
    const chips: FilterChip[] = []
    for (const [k, v] of Object.entries(filters)) {
      if (v) chips.push({ key: k, label: LABELS[k] || k, value: v })
    }
    return chips
  }, [filters])

  return {
    filters, setFilter, resetFilters, queryParams, queryKey, activeChips,
    activeFilters, hasActiveFilters,
    page, setPage, sortField, sortDir, toggleSort,
  }
}

function keySort(obj: Record<string, string>) {
  const sorted: Record<string, string> = {}
  for (const k of Object.keys(obj).sort()) sorted[k] = obj[k]
  return JSON.stringify(sorted)
}
