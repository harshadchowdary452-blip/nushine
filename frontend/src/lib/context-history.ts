export interface ContextEntry {
  id: string
  name: string
  groupName?: string
}

const RECENTS_KEY = "nushine-context-recents"
const FAVORITES_KEY = "nushine-context-favorites"
const MAX_RECENTS = 5

function read(key: string): ContextEntry[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.id === "string") : []
  } catch {
    return []
  }
}

function write(key: string, entries: ContextEntry[]) {
  localStorage.setItem(key, JSON.stringify(entries.slice(0, 12)))
}

export function getRecentContexts(): ContextEntry[] {
  return read(RECENTS_KEY)
}

export function addRecentContext(entry: ContextEntry) {
  const entries = read(RECENTS_KEY).filter((e) => e.id !== entry.id)
  entries.unshift(entry)
  write(RECENTS_KEY, entries.slice(0, MAX_RECENTS))
}

export function getFavoriteContexts(): ContextEntry[] {
  return read(FAVORITES_KEY)
}

export function isFavoriteContext(id: string): boolean {
  return read(FAVORITES_KEY).some((e) => e.id === id)
}

export function toggleFavoriteContext(entry: ContextEntry): boolean {
  const entries = read(FAVORITES_KEY)
  const exists = entries.some((e) => e.id === entry.id)
  if (exists) {
    write(
      FAVORITES_KEY,
      entries.filter((e) => e.id !== entry.id),
    )
    return false
  }
  entries.unshift(entry)
  write(FAVORITES_KEY, entries)
  return true
}
