export interface FindingTypeConfig {
  name: string
  label: string
  color: string
  order: number
  isQuick: boolean
}

export const FINDING_TYPES: FindingTypeConfig[] = [
  { name: 'Decay',         label: 'Decay',         color: '#1F2937',  order: 1,  isQuick: true },
  { name: 'Gross Decay',   label: 'Gross Decay',   color: '#DC2626',  order: 2,  isQuick: true },
  { name: 'Root Stumps',   label: 'Root Stumps',   color: '#EAB308',  order: 3,  isQuick: true },
  { name: 'Missing Tooth', label: 'Missing Tooth', color: '#D1D5DB',  order: 4,  isQuick: true },
  { name: 'Mobility',      label: 'Mobility',      color: '#22C55E',  order: 5,  isQuick: true },
  { name: 'Fracture',      label: 'Fracture',      color: '#EC4899',  order: 6,  isQuick: true },
  { name: 'Crown',         label: 'Crown',         color: '#3B82F6',  order: 7,  isQuick: true },
  { name: 'Bridge',        label: 'Bridge',        color: '#A855F7',  order: 8,  isQuick: true },
  { name: 'RCT',           label: 'RCT',            color: '#F59E0B',  order: 9,  isQuick: true },
  { name: 'Restoration',   label: 'Restoration',   color: '#9CA3AF',  order: 10, isQuick: true },
  { name: 'Implant',       label: 'Implant',       color: '#6B7280',  order: 11, isQuick: true },
  { name: 'Veneers',       label: 'Veneers',       color: '#FCD34D',  order: 12, isQuick: true },
  { name: 'Impaction',     label: 'Impaction',     color: '#8B5CF6',  order: 14, isQuick: true },
  { name: 'Others',        label: 'Others',        color: '#94A3B8',  order: 15, isQuick: false },
]

export const FINDING_COLORS_MAP: Record<string, string> = {}
export const FINDING_LABELS_MAP: Record<string, string> = {}
export const QUICK_FINDINGS: FindingTypeConfig[] = []
export const ALL_FINDING_NAMES: string[] = []

for (const ft of FINDING_TYPES) {
  FINDING_COLORS_MAP[ft.name] = ft.color
  FINDING_LABELS_MAP[ft.name] = ft.label
  ALL_FINDING_NAMES.push(ft.name)
  if (ft.isQuick) QUICK_FINDINGS.push(ft)
}

export function getFindingColor(name: string): string {
  return FINDING_COLORS_MAP[name] || '#9CA3AF'
}

export function getFindingLabel(name: string): string {
  return FINDING_LABELS_MAP[name] || name
}

export const SEVERITY_OPTIONS = ['Mild', 'Moderate', 'Severe']
