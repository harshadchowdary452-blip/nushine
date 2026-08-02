export function entityPath(entityType?: string | null, entityId?: string | null): string | null {
  if (!entityType || !entityId) return null
  const t = entityType.toLowerCase()
  switch (t) {
    case "patient":
      return `/patients/${entityId}`
    case "appointment":
      return `/appointments/${entityId}`
    case "case":
      return `/cases/${entityId}`
    case "treatment":
    case "treatment_plan":
      return `/treatments/${entityId}`
    case "billing":
    case "invoice":
      return `/billing/${entityId}`
    case "lead":
      return `/leads/${entityId}`
    default:
      return null
  }
}

export function entityLabel(entityType?: string | null): string {
  if (!entityType) return ""
  return entityType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}
