import { useEffect, useRef } from "react"
import { useRecentItemsStore, type RecentItem } from "@/store/recentItemsStore"

const PATH_BY_KIND: Record<string, (id: string) => string> = {
  patient: (id) => `/patients/${id}`,
  appointment: (id) => `/appointments/${id}`,
  case: (id) => `/cases/${id}`,
  treatment: (id) => `/treatments/${id}`,
  billing: (id) => `/billing/${id}`,
  lead: (id) => `/leads/${id}`,
}

/**
 * Records a "recently opened" entry once per detail record id. The record is
 * read through a ref so the effect fires exactly when the loaded record id
 * changes — never on unrelated re-renders.
 */
export function useTrackRecent<T>(
  kind: string,
  recordId: string | null | undefined,
  record?: T | null,
  toTitle?: (r: T) => string,
  toSubtitle?: (r: T) => string | undefined
) {
  const track = useRecentItemsStore((s) => s.track)
  const id = recordId ?? null
  const prevId = useRef<string | null>(null)
  const recordRef = useRef(record)
  const titleRef = useRef(toTitle)
  const subtitleRef = useRef(toSubtitle)
  recordRef.current = record
  titleRef.current = toTitle
  subtitleRef.current = toSubtitle

  useEffect(() => {
    if (!id || prevId.current === id) return
    prevId.current = id
    const r = recordRef.current
    if (!r) return
    const makePath = PATH_BY_KIND[kind]
    const entry: Omit<RecentItem, "ts"> = {
      kind,
      id,
      title: titleRef.current ? titleRef.current(r) : String(id),
      subtitle: subtitleRef.current ? subtitleRef.current(r) : undefined,
      path: makePath ? makePath(id) : `/${kind}s/${id}`,
    }
    track(entry)
  }, [id, kind, track])
}
