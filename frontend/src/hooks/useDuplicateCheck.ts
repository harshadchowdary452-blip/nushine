import { useCallback, useEffect, useRef, useState } from "react"
import { patientsApi } from "@/services/endpoints"

export interface DuplicateCandidate {
  id: string
  full_name: string
  gender?: string | null
  phone?: string | null
  email?: string | null
  date_of_birth?: string | null
  age?: number | null
  patient_source?: string | null
  status?: string
  matched_on: string[]
  confidence: "high" | "medium"
}

interface DuplicateCheckOptions {
  debounceMs?: number
  hospitalId?: string
  /** Minimum full-name length before a name check fires. */
  minNameLength?: number
}

const MATCH_LABELS: Record<string, string> = {
  phone: "same phone",
  email: "same email",
  full_name: "same name",
  name: "similar name",
}

export function matchedOnLabel(field: string): string {
  return MATCH_LABELS[field] ?? field
}

/**
 * Smart duplicate detection for registration forms. Debounces calls to
 * GET /patients/duplicates and only fires once the entered identity
 * (name / phone / email) is meaningful enough to compare.
 */
export function useDuplicateCheck({ debounceMs = 600, hospitalId, minNameLength = 3 }: DuplicateCheckOptions = {}) {
  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([])
  const [checking, setChecking] = useState(false)
  const [checked, setChecked] = useState(false)
  const timerRef = useRef<number | null>(null)
  const inFlightRef = useRef<number>(0)

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    inFlightRef.current += 1
    setCandidates([])
    setChecked(false)
    setChecking(false)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      inFlightRef.current += 1
    }
  }, [])

  const check = useCallback(
    ({ full_name, phone, email }: { full_name?: string; phone?: string; email?: string }) => {
      const name = full_name?.trim() ?? ""
      const digits = (phone ?? "").replace(/\D/g, "")
      const mail = email?.trim() ?? ""
      const hasName = name.length >= minNameLength
      const hasPhone = digits.length >= 8
      const hasEmail = mail.includes("@") && mail.length >= 5
      const query: { full_name?: string; phone?: string; email?: string; hospital_id?: string; limit?: number } = {}
      if (hasName) query.full_name = name
      if (hasPhone) query.phone = phone
      if (hasEmail) query.email = mail
      if (hospitalId) query.hospital_id = hospitalId
      if (!Object.keys(query).length) {
        clear()
        return
      }
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      setChecking(true)
      const run = () => {
        if (!Object.keys(query).length) return
        const seq = ++inFlightRef.current
        patientsApi
          .checkDuplicates({ ...query, limit: 5 })
          .then((res: { candidates?: DuplicateCandidate[]; total?: number; checked?: boolean }) => {
            if (seq !== inFlightRef.current) return
            setCandidates(res?.candidates ?? [])
            setChecked(Boolean(res?.checked))
          })
          .catch(() => {
            if (seq !== inFlightRef.current) return
            setCandidates([])
            setChecked(false)
          })
          .finally(() => {
            if (seq === inFlightRef.current) setChecking(false)
          })
      }
      timerRef.current = window.setTimeout(run, debounceMs)
    },
    [debounceMs, hospitalId, minNameLength, clear],
  )

  return { candidates, total: candidates.length, checking, checked, check, clear }
}
