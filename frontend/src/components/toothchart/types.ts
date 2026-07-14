export type ToothSurface = 'Mesial' | 'Distal' | 'Buccal' | 'Lingual' | 'Occlusal' | 'Incisal' | 'Labial'

export type ToothCondition =
  | 'Decayed'
  | 'Restored'
  | 'Defective'
  | 'Missing'
  | 'Erupt'
  | 'Implant'
  | 'Impacted'
  | 'Bridge'
  | 'Denture'

export type ToothFinding = {
  id: string
  toothNumber: number
  condition: ToothCondition
  surfaces?: ToothSurface[]
  material?: string
  description?: string
  date: string
  originalFindingType?: string
  findingType?: string
  dentitionType?: 'ADULT' | 'CHILD'
}

export type FindingFormData = {
  condition: ToothCondition
  surfaces: ToothSurface[]
  material: string
  description: string
}

export interface ToothChartProps {
  findings: ToothFinding[]
  onFindingsChange: (findings: ToothFinding[]) => void
  patientName?: string
  patientId?: string
  readonly?: boolean
}

export const SURFACE_LABELS: Record<ToothSurface, string> = {
  Mesial: 'M',
  Distal: 'D',
  Buccal: 'B',
  Lingual: 'L',
  Occlusal: 'O',
  Incisal: 'I',
  Labial: 'La',
}

export const CONDITION_LABELS: Record<ToothCondition, string> = {
  Decayed: 'Decayed',
  Restored: 'Restored',
  Defective: 'Defective',
  Missing: 'Missing',
  Erupt: 'Erupt',
  Implant: 'Implant',
  Impacted: 'Impacted',
  Bridge: 'Bridge',
  Denture: 'Denture',
}

export const CONDITION_COLORS: Record<ToothCondition, string> = {
  Decayed: '#1F2937',
  Restored: '#9CA3AF',
  Defective: '#94A3B8',
  Missing: '#D1D5DB',
  Erupt: '#22C55E',
  Implant: '#6B7280',
  Impacted: '#94A3B8',
  Bridge: '#A855F7',
  Denture: '#D1D5DB',
}

export const SURFACE_COLORS: Record<string, string> = {
  Decayed: '#1F2937',
  Restored: '#9CA3AF',
  Defective: '#94A3B8',
  Amalgam: '#808080',
  Composite: '#D2B48C',
  Gold: '#F59E0B',
  Ceramic: '#F5F5DC',
  Zirconia: '#F0F0F0',
  Acrylic: '#E8E0D8',
}

export const MATERIAL_OPTIONS = [
  'Amalgam',
  'Composite',
  'Gold',
  'Ceramic',
  'Zirconia',
  'Acrylic',
  'Metal',
  'Porcelain',
  'Temporary',
]

export const ALL_CONDITIONS: ToothCondition[] = [
  'Decayed',
  'Restored',
  'Defective',
  'Missing',
  'Erupt',
  'Implant',
  'Impacted',
  'Bridge',
  'Denture',
]

export function getConditionForTooth(findings: ToothFinding[], toothNumber: number): ToothCondition | null {
  const tf = findings.find((f) => f.toothNumber === toothNumber && f.condition !== 'Restored')
  return tf?.condition || null
}

export function getSurfacesForTooth(findings: ToothFinding[], toothNumber: number): ToothFinding[] {
  return findings.filter(
    (f) =>
      f.toothNumber === toothNumber &&
      f.surfaces &&
      f.surfaces.length > 0 &&
      ['Decayed', 'Restored', 'Defective'].includes(f.condition)
  )
}

export function getWholeToothCondition(findings: ToothFinding[], toothNumber: number): ToothCondition | null {
  const wholeTooth: ToothCondition[] = ['Missing', 'Implant', 'Impacted', 'Bridge', 'Denture', 'Erupt']
  const found = findings.find((f) => f.toothNumber === toothNumber && wholeTooth.includes(f.condition))
  return found?.condition || null
}

export const TOOTH_NAMES: Record<number, string> = {
  1: 'Upper Right 3rd Molar',
  2: 'Upper Right 2nd Molar',
  3: 'Upper Right 1st Molar',
  4: 'Upper Right 2nd Premolar',
  5: 'Upper Right 1st Premolar',
  6: 'Upper Right Canine',
  7: 'Upper Right Lateral Incisor',
  8: 'Upper Right Central Incisor',
  9: 'Upper Left Central Incisor',
  10: 'Upper Left Lateral Incisor',
  11: 'Upper Left Canine',
  12: 'Upper Left 1st Premolar',
  13: 'Upper Left 2nd Premolar',
  14: 'Upper Left 1st Molar',
  15: 'Upper Left 2nd Molar',
  16: 'Upper Left 3rd Molar',
  17: 'Lower Left 3rd Molar',
  18: 'Lower Left 2nd Molar',
  19: 'Lower Left 1st Molar',
  20: 'Lower Left 2nd Premolar',
  21: 'Lower Left 1st Premolar',
  22: 'Lower Left Canine',
  23: 'Lower Left Lateral Incisor',
  24: 'Lower Left Central Incisor',
  25: 'Lower Right Central Incisor',
  26: 'Lower Right Lateral Incisor',
  27: 'Lower Right Canine',
  28: 'Lower Right 1st Premolar',
  29: 'Lower Right 2nd Premolar',
  30: 'Lower Right 1st Molar',
  31: 'Lower Right 2nd Molar',
  32: 'Lower Right 3rd Molar',
}

export const MOCK_FINDINGS: ToothFinding[] = []

export function getToothType(toothNumber: number): string {
  const map: Record<number, string> = {
    1: 'wisdom', 16: 'wisdom', 17: 'wisdom', 32: 'wisdom',
    2: 'second_molar', 15: 'second_molar', 18: 'second_molar', 31: 'second_molar',
    3: 'first_molar', 14: 'first_molar', 19: 'first_molar', 30: 'first_molar',
    4: 'second_premolar', 13: 'second_premolar', 20: 'second_premolar', 29: 'second_premolar',
    5: 'first_premolar', 12: 'first_premolar', 21: 'first_premolar', 28: 'first_premolar',
    6: 'canine', 11: 'canine', 22: 'canine', 27: 'canine',
    7: 'lateral_incisor', 10: 'lateral_incisor', 23: 'lateral_incisor', 26: 'lateral_incisor',
    8: 'central_incisor', 9: 'central_incisor', 24: 'central_incisor', 25: 'central_incisor',
  }
  return map[toothNumber] || 'central_incisor'
}
