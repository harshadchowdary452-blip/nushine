import { useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"

/**
 * Opens a create dialog when the URL contains `?create=1` (used by header
 * Quick Actions), then strips the param so it doesn't re-trigger on navigation.
 */
export function useCreateParam(openDialog: () => void) {
  const [searchParams, setSearchParams] = useSearchParams()
  const openRef = useRef(openDialog)
  openRef.current = openDialog

  const search = searchParams.get("create")

  useEffect(() => {
    if (search !== "1") return
    openRef.current()
    const next = new URLSearchParams(searchParams)
    next.delete("create")
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])
}
