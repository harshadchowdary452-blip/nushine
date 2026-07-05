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
  Decayed: '#8B4513',
  Restored: '#C0C0C0',
  Defective: '#DAA520',
  Missing: '#666',
  Erupt: '#90EE90',
  Implant: '#4169E1',
  Impacted: '#FF8C00',
  Bridge: '#9370DB',
  Denture: '#B0C4DE',
}

export const SURFACE_COLORS: Record<string, string> = {
  Decayed: '#5C2E00',
  Restored: '#A0A0A0',
  Defective: '#B8860B',
  Amalgam: '#808080',
  Composite: '#D2B48C',
  Gold: '#DAA520',
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

export const MOCK_FINDINGS: ToothFinding[] = [
  { id: 'm1', toothNumber: 3, condition: 'Decayed', surfaces: ['Occlusal', 'Mesial'], description: 'Caries on occlusal extending to mesial', date: '2026-06-15' },
  { id: 'm2', toothNumber: 8, condition: 'Restored', surfaces: ['Mesial'], material: 'Composite', description: 'Class III composite', date: '2024-03-10' },
  { id: 'm3', toothNumber: 14, condition: 'Missing', date: '2023-11-20', description: 'Extracted due to extensive caries' },
  { id: 'm4', toothNumber: 19, condition: 'Restored', surfaces: ['Occlusal'], material: 'Amalgam', description: 'Large MOD amalgam', date: '2025-01-22' },
  { id: 'm5', toothNumber: 30, condition: 'Decayed', surfaces: ['Occlusal'], description: 'Small occlusal pit caries', date: '2026-07-01' },
  { id: 'm6', toothNumber: 6, condition: 'Impacted', description: 'Impacted canine, high palatal position', date: '2026-02-14' },
  { id: 'm7', toothNumber: 2, condition: 'Bridge', description: 'Bridge abutment #2-#4', date: '2024-09-05' },
  { id: 'm8', toothNumber: 16, condition: 'Implant', material: 'Zirconia', description: 'Single implant crown', date: '2025-06-30' },
  { id: 'm9', toothNumber: 25, condition: 'Defective', surfaces: ['Occlusal'], description: 'Defective amalgam, marginal ditching', date: '2026-04-18' },
  { id: 'm10', toothNumber: 11, condition: 'Erupt', description: 'Partially erupted', date: '2026-05-01' },
  { id: 'm11', toothNumber: 13, condition: 'Restored', surfaces: ['Occlusal', 'Buccal'], material: 'Composite', description: 'Composite buccal pit filling', date: '2025-08-12' },
  { id: 'm12', toothNumber: 31, condition: 'Decayed', surfaces: ['Distal'], description: 'Distal root caries', date: '2026-07-01' },
  { id: 'm13', toothNumber: 4, condition: 'Decayed', surfaces: ['Mesial', 'Distal'], description: 'MOD caries', date: '2026-06-20' },
  { id: 'm14', toothNumber: 1, condition: 'Denture', description: 'Partial denture clasp on #1', date: '2025-12-01' },
  { id: 'm15', toothNumber: 21, condition: 'Decayed', surfaces: ['Buccal'], description: 'Buccal cervical caries', date: '2026-07-02' },
]
