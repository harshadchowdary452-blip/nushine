// ─── Tooth Anatomy Definitions ───────────────────────────────────
// Each tooth is defined in a normalized viewBox "0 0 100 120" with crown at top.
// Upper teeth are flipped vertically via transform in the chart.

export type ToothShapeType =
  | "central_incisor" | "lateral_incisor" | "canine"
  | "first_premolar" | "second_premolar"
  | "first_molar" | "second_molar" | "wisdom"
  | "primary_incisor" | "primary_canine" | "primary_molar"

export interface ToothAnatomy {
  shape: ToothShapeType
  outline: string         // SVG path for tooth silhouette
  grooves: string[]       // groove/fissure paths (for occlusal detail)
  highlights: string[]    // enamel highlight paths
  rootLines?: string[]    // root contour lines
  occlusalTable?: string  // occlusal surface shape (for molars/premolars)
  crownWidth: number
  crownHeight: number
  rootLength: number
  rootWidth: number
}

// ─── Tooth Paths ─────────────────────────────────────────────────
// All paths in 100x120 viewBox coordinates, crown at top, root at bottom.
// Uses cubic (C) and quadratic (Q) bezier curves for smooth anatomy.

const PATHS: Record<ToothShapeType, ToothAnatomy> = {
  central_incisor: {
    shape: "central_incisor",
    crownWidth: 52,
    crownHeight: 38,
    rootLength: 52,
    rootWidth: 32,
    outline: [
      "M 50,116",           // root apex
      "C 46,116 42,112 40,106",
      "C 38,100 36,88 36,80",
      "C 36,72 30,56 28,44",
      "C 26,34 12,22 14,12",
      "C 16,6 24,2 34,2",
      "C 42,2 48,2 50,2",
      "C 52,2 58,2 66,2",
      "C 76,2 84,6 86,12",
      "C 88,22 74,34 72,44",
      "C 70,56 64,72 64,80",
      "C 64,88 62,100 60,106",
      "C 58,112 54,116 50,116 Z",
    ].join(" "),
    grooves: [],
    highlights: [
      "M 34,38 C 34,28 42,18 50,16 C 58,18 66,28 66,38 C 66,48 58,52 50,52 C 42,52 34,48 34,38 Z",
    ],
    rootLines: [
      "M 42,80 C 42,90 44,100 46,108",
      "M 58,80 C 58,90 56,100 54,108",
    ],
  },

  lateral_incisor: {
    shape: "lateral_incisor",
    crownWidth: 44,
    crownHeight: 36,
    rootLength: 50,
    rootWidth: 28,
    outline: [
      "M 50,114",
      "C 46,114 42,110 40,104",
      "C 38,98 36,86 36,78",
      "C 36,70 32,56 30,46",
      "C 28,38 16,26 18,16",
      "C 20,8 28,4 38,4",
      "C 46,4 52,4 50,4",
      "C 54,4 62,4 72,4",
      "C 82,8 84,16 82,24",
      "C 80,32 68,42 66,50",
      "C 64,60 64,74 64,78",
      "C 64,86 62,98 60,104",
      "C 58,110 54,114 50,114 Z",
    ].join(" "),
    grooves: [],
    highlights: [
      "M 32,36 C 32,28 40,20 50,18 C 60,20 68,28 68,36 C 68,44 60,48 50,48 C 40,48 32,44 32,36 Z",
    ],
    rootLines: [
      "M 44,78 C 44,88 46,98 48,106",
      "M 56,78 C 56,88 54,98 52,106",
    ],
  },

  canine: {
    shape: "canine",
    crownWidth: 44,
    crownHeight: 44,
    rootLength: 58,
    rootWidth: 28,
    outline: [
      "M 50,118",
      "C 46,118 42,114 40,108",
      "C 38,102 36,88 36,80",
      "C 36,72 30,58 28,48",
      "C 26,40 22,28 26,16",
      "C 28,10 36,4 46,2",
      "C 48,1 50,0 50,0",
      "C 50,0 52,1 54,2",
      "C 64,4 72,10 74,16",
      "C 78,28 74,40 72,48",
      "C 70,58 64,72 64,80",
      "C 64,88 62,102 60,108",
      "C 58,114 54,118 50,118 Z",
    ].join(" "),
    grooves: [],
    highlights: [
      "M 36,38 C 36,26 44,16 50,14 C 56,16 64,26 64,38 C 64,48 56,52 50,52 C 44,52 36,48 36,38 Z",
    ],
    rootLines: [
      "M 44,80 C 44,92 46,104 48,112",
      "M 56,80 C 56,92 54,104 52,112",
    ],
  },

  first_premolar: {
    shape: "first_premolar",
    crownWidth: 48,
    crownHeight: 36,
    rootLength: 50,
    rootWidth: 26,
    outline: [
      "M 50,114",
      "C 46,114 42,110 40,104",
      "C 38,98 38,86 38,78",
      "C 38,70 28,56 26,46",
      "C 24,38 18,28 20,18",
      "C 22,10 30,6 38,6",
      "Q 44,6 48,8",
      "Q 52,4 56,4",
      "C 64,4 74,8 78,16",
      "C 80,24 76,36 74,44",
      "C 72,54 62,68 62,78",
      "C 62,86 62,98 60,104",
      "C 58,110 54,114 50,114 Z",
    ].join(" "),
    grooves: [
      "M 32,28 Q 50,36 68,28",
      "M 50,8 Q 50,28 50,40",
    ],
    highlights: [
      "M 34,30 C 34,20 42,14 50,14 C 58,14 66,20 66,30 C 66,38 58,42 50,42 C 42,42 34,38 34,30 Z",
    ],
    occlusalTable: "M 28,22 Q 50,8 72,22 Q 50,36 28,22 Z",
    rootLines: [
      "M 44,78 C 44,88 46,102 48,110",
      "M 56,78 C 56,88 54,102 52,110",
    ],
  },

  second_premolar: {
    shape: "second_premolar",
    crownWidth: 46,
    crownHeight: 34,
    rootLength: 48,
    rootWidth: 28,
    outline: [
      "M 50,112",
      "C 46,112 44,108 42,102",
      "C 40,96 40,84 40,76",
      "C 40,68 30,54 28,44",
      "C 26,36 20,26 22,18",
      "C 24,10 32,6 40,6",
      "Q 46,6 50,8",
      "Q 54,6 60,6",
      "C 68,6 76,10 78,18",
      "C 80,26 74,36 72,44",
      "C 70,54 60,68 60,76",
      "C 60,84 60,96 58,102",
      "C 56,108 54,112 50,112 Z",
    ].join(" "),
    grooves: [
      "M 34,26 Q 50,34 66,26",
    ],
    highlights: [
      "M 36,28 C 36,20 44,14 50,14 C 56,14 64,20 64,28 C 64,36 56,40 50,40 C 44,40 36,36 36,28 Z",
    ],
    occlusalTable: "M 30,20 Q 50,8 70,20 Q 50,32 30,20 Z",
    rootLines: [
      "M 44,76 C 44,86 46,98 48,108",
      "M 56,76 C 56,86 54,98 52,108",
    ],
  },

  first_molar: {
    shape: "first_molar",
    crownWidth: 56,
    crownHeight: 38,
    rootLength: 46,
    rootWidth: 38,
    outline: [
      "M 40,112",           // mesial root apex
      "C 36,112 34,108 34,102",
      "C 34,96 36,84 36,76",
      "C 36,68 28,54 26,44",
      "C 24,36 18,26 20,18",
      "C 22,10 30,6 38,6",
      "Q 44,4 50,4",
      "Q 56,6 62,6",
      "C 70,6 78,10 80,18",
      "C 82,26 76,36 74,44",
      "C 72,54 64,68 64,76",
      "C 64,84 66,96 66,102",
      "C 66,106 64,110 60,112",
      "C 56,110 54,104 54,96",
      "L 54,82",
      "L 46,82",
      "L 46,96",
      "C 46,104 44,110 40,112 Z",
    ].join(" "),
    grooves: [
      "M 28,24 Q 40,16 50,20 Q 60,16 72,24",
      "M 36,28 Q 50,36 64,28",
      "M 50,20 Q 50,30 50,38",
    ],
    highlights: [
      "M 32,28 C 32,18 42,12 50,12 C 58,12 68,18 68,28 C 68,38 58,44 50,44 C 42,44 32,38 32,28 Z",
    ],
    occlusalTable: "M 26,22 Q 50,6 74,22 Q 60,38 50,34 Q 40,38 26,22 Z",
    rootLines: [
      "M 40,76 C 40,88 38,100 38,108",
      "M 60,76 C 60,88 62,100 62,108",
      "M 50,82 L 50,76",
    ],
  },

  second_molar: {
    shape: "second_molar",
    crownWidth: 50,
    crownHeight: 36,
    rootLength: 44,
    rootWidth: 34,
    outline: [
      "M 38,108",
      "C 34,108 32,104 32,98",
      "C 32,92 34,82 34,74",
      "C 34,66 28,54 26,44",
      "C 24,36 20,26 22,18",
      "C 24,10 32,6 40,6",
      "Q 46,4 50,4",
      "Q 54,4 60,6",
      "C 68,6 76,10 78,18",
      "C 80,26 76,36 74,44",
      "C 72,54 66,66 66,74",
      "C 66,82 68,92 68,98",
      "C 68,102 66,106 62,108",
      "C 58,106 56,100 56,92",
      "L 56,80",
      "L 44,80",
      "L 44,92",
      "C 44,100 42,106 38,108 Z",
    ].join(" "),
    grooves: [
      "M 30,22 Q 50,14 70,22",
      "M 34,26 Q 50,34 66,26",
    ],
    highlights: [
      "M 34,26 C 34,18 42,12 50,12 C 58,12 66,18 66,26 C 66,34 58,40 50,40 C 42,40 34,34 34,26 Z",
    ],
    occlusalTable: "M 28,20 Q 50,6 72,20 Q 56,34 50,32 Q 44,34 28,20 Z",
    rootLines: [
      "M 40,74 C 40,84 38,96 38,104",
      "M 60,74 C 60,84 62,96 62,104",
    ],
  },

  wisdom: {
    shape: "wisdom",
    crownWidth: 44,
    crownHeight: 32,
    rootLength: 38,
    rootWidth: 32,
    outline: [
      "M 50,104",
      "C 44,104 40,100 38,94",
      "C 36,88 38,78 38,72",
      "C 38,64 32,52 30,44",
      "C 28,36 24,28 26,20",
      "C 28,14 34,10 40,10",
      "Q 46,8 50,8",
      "Q 54,8 60,10",
      "C 66,10 72,14 74,20",
      "C 76,28 72,36 70,44",
      "C 68,52 62,64 62,72",
      "C 62,78 64,88 62,94",
      "C 60,100 56,104 50,104 Z",
    ].join(" "),
    grooves: [
      "M 34,22 Q 50,16 66,22",
    ],
    highlights: [
      "M 36,24 C 36,18 44,14 50,14 C 56,14 64,18 64,24 C 64,30 56,34 50,34 C 44,34 36,30 36,24 Z",
    ],
    occlusalTable: "M 32,20 Q 50,8 68,20 Q 56,30 50,28 Q 44,30 32,20 Z",
    rootLines: [
      "M 44,72 C 44,82 46,94 48,102",
      "M 56,72 C 56,82 54,94 52,102",
    ],
  },

  primary_incisor: {
    shape: "primary_incisor",
    crownWidth: 38,
    crownHeight: 28,
    rootLength: 34,
    rootWidth: 24,
    outline: [
      "M 50,96",
      "C 46,96 42,92 40,88",
      "C 38,82 38,72 38,66",
      "C 38,58 32,46 30,38",
      "C 28,30 18,22 20,14",
      "C 22,8 28,6 36,6",
      "C 44,6 50,6 50,6",
      "C 50,6 56,6 64,6",
      "C 72,8 78,14 80,22",
      "C 78,30 68,36 66,44",
      "C 64,52 62,66 62,66",
      "C 62,72 62,82 60,88",
      "C 58,92 54,96 50,96 Z",
    ].join(" "),
    grooves: [],
    highlights: [
      "M 34,30 C 34,24 42,18 50,16 C 58,18 66,24 66,30 C 66,38 58,42 50,42 C 42,42 34,38 34,30 Z",
    ],
    rootLines: [
      "M 44,66 C 44,74 46,84 48,92",
      "M 56,66 C 56,74 54,84 52,92",
    ],
  },

  primary_canine: {
    shape: "primary_canine",
    crownWidth: 36,
    crownHeight: 34,
    rootLength: 38,
    rootWidth: 22,
    outline: [
      "M 50,100",
      "C 46,100 42,96 40,90",
      "C 38,84 38,74 38,68",
      "C 38,60 32,48 30,40",
      "C 28,34 24,24 28,16",
      "C 30,10 36,6 44,4",
      "Q 48,2 50,2",
      "Q 52,2 56,4",
      "C 64,6 70,10 72,16",
      "C 76,24 72,34 70,40",
      "C 68,48 62,60 62,68",
      "C 62,74 62,84 60,90",
      "C 58,96 54,100 50,100 Z",
    ].join(" "),
    grooves: [],
    highlights: [
      "M 36,32 C 36,24 44,16 50,14 C 56,16 64,24 64,32 C 64,40 56,44 50,44 C 44,44 36,40 36,32 Z",
    ],
    rootLines: [
      "M 44,68 C 44,78 46,88 48,96",
      "M 56,68 C 56,78 54,88 52,96",
    ],
  },

  primary_molar: {
    shape: "primary_molar",
    crownWidth: 42,
    crownHeight: 30,
    rootLength: 34,
    rootWidth: 34,
    outline: [
      "M 36,100",
      "C 32,100 30,96 30,90",
      "C 30,84 32,74 32,68",
      "C 32,60 26,48 24,40",
      "C 22,34 18,26 20,18",
      "C 22,12 28,8 36,8",
      "Q 42,6 50,6",
      "Q 58,8 64,8",
      "C 72,8 78,12 80,18",
      "C 82,26 78,34 76,40",
      "C 74,48 68,60 68,68",
      "C 68,74 70,84 70,90",
      "C 70,94 68,98 64,100",
      "C 60,98 58,92 58,84",
      "L 58,72",
      "L 42,72",
      "L 42,84",
      "C 42,92 40,98 36,100 Z",
    ].join(" "),
    grooves: [
      "M 28,22 Q 50,14 72,22",
    ],
    highlights: [
      "M 34,24 C 34,18 42,14 50,14 C 58,14 66,18 66,24 C 66,32 58,36 50,36 C 42,36 34,32 34,24 Z",
    ],
    occlusalTable: "M 26,20 Q 50,8 74,20 Q 56,34 50,32 Q 44,34 26,20 Z",
    rootLines: [
      "M 38,68 C 38,78 36,88 36,96",
      "M 62,68 C 62,78 64,88 64,96",
    ],
  },
}

// ─── Get Tooth Anatomy ───────────────────────────────────────────

export function getToothAnatomy(toothNum: number, isPrimary: boolean): ToothAnatomy {
  const digit = toothNum % 10

  if (isPrimary) {
    if (digit <= 2) return PATHS.primary_incisor
    if (digit === 3) return PATHS.primary_canine
    return PATHS.primary_molar
  }

  switch (digit) {
    case 1: return PATHS.central_incisor
    case 2: return PATHS.lateral_incisor
    case 3: return PATHS.canine
    case 4: return PATHS.first_premolar
    case 5: return PATHS.second_premolar
    case 6: return PATHS.first_molar
    case 7: return PATHS.second_molar
    case 8: return PATHS.wisdom
    default: return PATHS.central_incisor
  }
}

// ─── Tooth Names ─────────────────────────────────────────────────

export const TOOTH_NAMES: Record<number, string> = {
  11: "Central Incisor", 12: "Lateral Incisor", 13: "Canine",
  14: "First Premolar", 15: "Second Premolar", 16: "First Molar", 17: "Second Molar", 18: "Third Molar",
  21: "Central Incisor", 22: "Lateral Incisor", 23: "Canine",
  24: "First Premolar", 25: "Second Premolar", 26: "First Molar", 27: "Second Molar", 28: "Third Molar",
  31: "Central Incisor", 32: "Lateral Incisor", 33: "Canine",
  34: "First Premolar", 35: "Second Premolar", 36: "First Molar", 37: "Second Molar", 38: "Third Molar",
  41: "Central Incisor", 42: "Lateral Incisor", 43: "Canine",
  44: "First Premolar", 45: "Second Premolar", 46: "First Molar", 47: "Second Molar", 48: "Third Molar",
  51: "Central Incisor", 52: "Lateral Incisor", 53: "Canine", 54: "First Molar", 55: "Second Molar",
  61: "Central Incisor", 62: "Lateral Incisor", 63: "Canine", 64: "First Molar", 65: "Second Molar",
  71: "Central Incisor", 72: "Lateral Incisor", 73: "Canine", 74: "First Molar", 75: "Second Molar",
  81: "Central Incisor", 82: "Lateral Incisor", 83: "Canine", 84: "First Molar", 85: "Second Molar",
}

export function getToothQuadrant(toothNum: number): string {
  const p = Math.floor(toothNum / 10)
  if (p === 1) return "Upper Right"
  if (p === 2) return "Upper Left"
  if (p === 3) return "Lower Left"
  if (p === 4) return "Lower Right"
  if (p === 5) return "Upper Right (Primary)"
  if (p === 6) return "Upper Left (Primary)"
  if (p === 7) return "Lower Left (Primary)"
  if (p === 8) return "Lower Right (Primary)"
  return ""
}

export function getToothSurfaces(toothNum: number): string[] {
  const digit = toothNum % 10
  if (digit <= 3) return ["Mesial", "Distal", "Incisal", "Labial", "Palatal"]
  return ["Mesial", "Distal", "Occlusal", "Buccal", "Palatal"]
}

// ─── Surface Clip Regions ──────────────────────────────────────────
// Each surface is a clip region within the 100x120 tooth viewBox.
// Crown is at top (y≈2), root at bottom (y≈116).

export const CROWN_TOP = 2
export const CROWN_BOTTOM = 52
export const ROOT_START = 55
export const ROOT_END = 116

export interface SurfaceClips {
  mesial: string
  distal: string
  labial?: string
  buccal?: string
  incisal?: string
  occlusal?: string
  root: string
}

function rectClip(x: number, y: number, w: number, h: number): string {
  return `M ${x},${y} L ${x + w},${y} L ${x + w},${y + h} L ${x},${y + h} Z`
}

export function getSurfaceClips(isAnterior: boolean): SurfaceClips {
  return {
    mesial: rectClip(0, CROWN_TOP, 46, CROWN_BOTTOM - CROWN_TOP),
    distal: rectClip(54, CROWN_TOP, 46, CROWN_BOTTOM - CROWN_TOP),
    labial: isAnterior ? rectClip(20, CROWN_TOP + 12, 60, CROWN_BOTTOM - CROWN_TOP - 14) : undefined,
    buccal: !isAnterior ? rectClip(20, CROWN_TOP + 12, 60, CROWN_BOTTOM - CROWN_TOP - 14) : undefined,
    incisal: isAnterior ? rectClip(0, CROWN_TOP, 100, 16) : undefined,
    occlusal: !isAnterior ? rectClip(0, CROWN_TOP, 100, 16) : undefined,
    root: rectClip(10, ROOT_START, 80, ROOT_END - ROOT_START),
  }
}

export const SURFACE_LABELS: Record<string, string> = {
  mesial: 'Mesial',
  distal: 'Distal',
  labial: 'Labial',
  buccal: 'Buccal',
  incisal: 'Incisal',
  occlusal: 'Occlusal',
  root: 'Root',
  palatal: 'Palatal',
  lingual: 'Lingual',
}

// ─── Arch Position Calculator ────────────────────────────────────

export interface ArchPosition {
  x: number
  y: number
  rotation: number
}

function generateArch(side: "left" | "right", isUpper: boolean, count: number): ArchPosition[] {
  const positions: ArchPosition[] = []
  const sign = side === "left" ? -1 : 1

  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count  // 0..1 from center outward
    const angle = t * Math.PI * 0.42
    const R = isUpper ? 240 : 220
    const flat = isUpper ? 1.0 : 1.0

    const x = sign * R * Math.sin(angle)
    const y = (isUpper ? -1 : 1) * (R * (1 - Math.cos(angle)) * (isUpper ? 0.55 : 0.60))

    const tangent = Math.atan2(
      R * Math.sin(angle) * (isUpper ? 0.55 : 0.60),
      R * Math.cos(angle)
    )
    const rotation = sign * tangent * (180 / Math.PI) * (isUpper ? 1 : 1)

    positions.push({ x, y, rotation })
  }

  if (side === "left") positions.reverse()
  return positions
}

export const ADULT_TEETH = {
  upper: [
    { num: 18, pos: generateArch("left", true, 8)[0] },
    { num: 17, pos: generateArch("left", true, 8)[1] },
    { num: 16, pos: generateArch("left", true, 8)[2] },
    { num: 15, pos: generateArch("left", true, 8)[3] },
    { num: 14, pos: generateArch("left", true, 8)[4] },
    { num: 13, pos: generateArch("left", true, 8)[5] },
    { num: 12, pos: generateArch("left", true, 8)[6] },
    { num: 11, pos: generateArch("left", true, 8)[7] },
    { num: 21, pos: generateArch("right", true, 8)[7] },
    { num: 22, pos: generateArch("right", true, 8)[6] },
    { num: 23, pos: generateArch("right", true, 8)[5] },
    { num: 24, pos: generateArch("right", true, 8)[4] },
    { num: 25, pos: generateArch("right", true, 8)[3] },
    { num: 26, pos: generateArch("right", true, 8)[2] },
    { num: 27, pos: generateArch("right", true, 8)[1] },
    { num: 28, pos: generateArch("right", true, 8)[0] },
  ],
  lower: [
    { num: 48, pos: generateArch("left", false, 8)[0] },
    { num: 47, pos: generateArch("left", false, 8)[1] },
    { num: 46, pos: generateArch("left", false, 8)[2] },
    { num: 45, pos: generateArch("left", false, 8)[3] },
    { num: 44, pos: generateArch("left", false, 8)[4] },
    { num: 43, pos: generateArch("left", false, 8)[5] },
    { num: 42, pos: generateArch("left", false, 8)[6] },
    { num: 41, pos: generateArch("left", false, 8)[7] },
    { num: 31, pos: generateArch("right", false, 8)[7] },
    { num: 32, pos: generateArch("right", false, 8)[6] },
    { num: 33, pos: generateArch("right", false, 8)[5] },
    { num: 34, pos: generateArch("right", false, 8)[4] },
    { num: 35, pos: generateArch("right", false, 8)[3] },
    { num: 36, pos: generateArch("right", false, 8)[2] },
    { num: 37, pos: generateArch("right", false, 8)[1] },
    { num: 38, pos: generateArch("right", false, 8)[0] },
  ],
}

export const CHILD_TEETH = {
  upper: [
    { num: 55, pos: generateArch("left", true, 5)[0] },
    { num: 54, pos: generateArch("left", true, 5)[1] },
    { num: 53, pos: generateArch("left", true, 5)[2] },
    { num: 52, pos: generateArch("left", true, 5)[3] },
    { num: 51, pos: generateArch("left", true, 5)[4] },
    { num: 61, pos: generateArch("right", true, 5)[4] },
    { num: 62, pos: generateArch("right", true, 5)[3] },
    { num: 63, pos: generateArch("right", true, 5)[2] },
    { num: 64, pos: generateArch("right", true, 5)[1] },
    { num: 65, pos: generateArch("right", true, 5)[0] },
  ],
  lower: [
    { num: 85, pos: generateArch("left", false, 5)[0] },
    { num: 84, pos: generateArch("left", false, 5)[1] },
    { num: 83, pos: generateArch("left", false, 5)[2] },
    { num: 82, pos: generateArch("left", false, 5)[3] },
    { num: 81, pos: generateArch("left", false, 5)[4] },
    { num: 71, pos: generateArch("right", false, 5)[4] },
    { num: 72, pos: generateArch("right", false, 5)[3] },
    { num: 73, pos: generateArch("right", false, 5)[2] },
    { num: 74, pos: generateArch("right", false, 5)[1] },
    { num: 75, pos: generateArch("right", false, 5)[0] },
  ],
}

// ─── Gingiva Paths ────────────────────────────────────────────────

function archToothPositions(isUpper: boolean, count: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = []
  for (const side of ['right', 'left'] as const) {
    const sign = side === 'left' ? -1 : 1
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count
      const angle = t * Math.PI * 0.42
      const R = isUpper ? 240 : 220
      const x = sign * R * Math.sin(angle)
      const y = (isUpper ? -1 : 1) * (R * (1 - Math.cos(angle)) * (isUpper ? 0.55 : 0.60))
      positions.push({ x, y })
    }
  }
  return positions
}

export function getGingivaPath(isUpper: boolean): string {
  const toothPositions = archToothPositions(isUpper, 8)
  const marginR = isUpper ? 300 : 280
  const cx = 0
  const baseY = isUpper ? -70 : 180
  const papillaDepth = isUpper ? 12 : -12

  // Sort teeth: right-to-left across arch
  const all = [...toothPositions]
  const sorted = all.filter(p => p.x >= 0).sort((a, b) => b.x - a.x)
    .concat(all.filter(p => p.x < 0).sort((a, b) => a.x - b.x))

  const parts: string[] = []
  const leftX = -280
  const rightX = 280

  // Outer curve
  parts.push(`M ${leftX},${baseY + 30}`)
  parts.push(`C ${leftX},${baseY - 20} ${cx},${baseY - 40} ${rightX},${baseY - 20}`)
  parts.push(`C ${rightX + 20},${baseY - 10} ${rightX + 10},${baseY + 40} ${rightX},${baseY + 40}`)

  // Scalloped inner edge: create papillae between adjacent teeth
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]
    const nextT = sorted[i + 1]
    if (nextT) {
      // Papilla tip at midpoint between teeth
      const mx = (t.x + nextT.x) / 2
      const my = (t.y + nextT.y) / 2 + papillaDepth
      parts.push(`Q ${mx},${my} ${nextT.x},${nextT.y + (isUpper ? 10 : -10)}`)
    } else {
      parts.push(`L ${t.x},${t.y + (isUpper ? 10 : -10)}`)
    }
  }

  // Back to start
  parts.push(`L ${leftX},${baseY + 30}`)
  parts.push('Z')

  return parts.join(' ')
}

export function getTonguePath(): string {
  return [
    "M -80,10",
    "C -60,-15 -30,-20 0,-22",
    "C 30,-20 60,-15 80,10",
    "C 60,25 30,30 0,32",
    "C -30,30 -60,25 -80,10 Z",
  ].join(" ")
}
