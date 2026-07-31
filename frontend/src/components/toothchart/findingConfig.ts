export interface FindingTypeConfig {
  name: string
  label: string
  color: string
  order: number
  isQuick: boolean
}

export const FINDING_TYPES: FindingTypeConfig[] = [
  { name: 'Decay',         label: 'Decay',         color: 'var(--ds-toothchart-decay)',        order: 1,  isQuick: true },
  { name: 'Gross Decay',   label: 'Gross Decay',   color: 'var(--ds-toothchart-gross-decay)',  order: 2,  isQuick: true },
  { name: 'Root Stumps',   label: 'Root Stumps',   color: 'var(--ds-toothchart-root-stumps)',  order: 3,  isQuick: true },
  { name: 'Missing Tooth', label: 'Missing Tooth', color: 'var(--ds-toothchart-missing)',      order: 4,  isQuick: true },
  { name: 'Mobility',      label: 'Mobility',      color: 'var(--ds-toothchart-mobility)',     order: 5,  isQuick: true },
  { name: 'Fracture',      label: 'Fracture',      color: 'var(--ds-toothchart-fracture)',     order: 6,  isQuick: true },
  { name: 'Crown',         label: 'Crown',         color: 'var(--ds-toothchart-crown)',        order: 7,  isQuick: true },
  { name: 'Bridge',        label: 'Bridge',        color: 'var(--ds-toothchart-bridge)',       order: 8,  isQuick: true },
  { name: 'RCT',           label: 'RCT',           color: 'var(--ds-toothchart-rct)',          order: 9,  isQuick: true },
  { name: 'Restoration',   label: 'Restoration',   color: 'var(--ds-toothchart-restoration)',  order: 10, isQuick: true },
  { name: 'Implant',       label: 'Implant',       color: 'var(--ds-toothchart-implant)',      order: 11, isQuick: true },
  { name: 'Veneers',       label: 'Veneers',       color: 'var(--ds-toothchart-veneers)',      order: 12, isQuick: true },
  { name: 'Impaction',     label: 'Impaction',     color: 'var(--ds-toothchart-impaction)',    order: 14, isQuick: true },
  { name: 'Others',        label: 'Others',        color: 'var(--ds-toothchart-others)',       order: 15, isQuick: false },
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
  return FINDING_COLORS_MAP[name] || 'var(--ds-toothchart-restoration)'
}

export function getFindingLabel(name: string): string {
  return FINDING_LABELS_MAP[name] || name
}

export const SEVERITY_OPTIONS = ['Mild', 'Moderate', 'Severe']
