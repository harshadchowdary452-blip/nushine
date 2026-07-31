import * as React from "react"

/**
 * SSR-safe media-query hook. Returns false on first render when there is no
 * window (tests, static render) and corrects on mount.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState<boolean>(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches
  )

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const media = window.matchMedia(query)
    const onChange = () => setMatches(media.matches)
    media.addEventListener("change", onChange)
    setMatches(media.matches)
    return () => media.removeEventListener("change", onChange)
  }, [query])

  return matches
}
