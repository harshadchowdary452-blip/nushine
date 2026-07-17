// Tooth SVG paths for Universal numbering (1-32)
// viewBox: "0 0 48 76" — root apex at y=4, CEJ around y=30, crown base at y=72

export interface ToothPaths {
  outline: string
  rootDetails?: string[]
  crownDetails?: string[]
}

function incisorPath(width: number, rootW: number): ToothPaths {
  const hw = width / 2
  const rw = rootW / 2
  const cx = 24
  return {
    outline: [
      `M ${cx - rw},28`,
      `C ${cx - rw - 2},22 ${cx - rw - 3},14 ${cx - rw - 1},6`,
      `C ${cx - 1},3 ${cx + 1},3 ${cx + rw + 1},6`,
      `C ${cx + rw + 3},14 ${cx + rw + 2},22 ${cx + rw},28`,
      `C ${cx + rw + 3},34 ${cx + rw + 4},42 ${cx + hw + 2},52`,
      `C ${cx + hw + 1},60 ${cx + hw},68 ${cx + hw - 1},72`,
      `C ${cx + hw - 4},75 ${cx - hw + 4},75 ${cx - hw + 1},72`,
      `C ${cx - hw},68 ${cx - hw - 1},60 ${cx - hw - 2},52`,
      `C ${cx - hw - 4},42 ${cx - rw - 3},34 ${cx - rw},28 Z`,
    ].join(' '),
    rootDetails: [
      `M ${cx - 3},28 C ${cx - 3},22 ${cx - 4},14 ${cx - 2},8`,
      `M ${cx + 3},28 C ${cx + 3},22 ${cx + 4},14 ${cx + 2},8`,
    ],
    crownDetails: [
      `M ${cx - hw + 4},52 C ${cx - 4},56 ${cx + 4},56 ${cx + hw - 4},52`,
    ],
  }
}

function caninePath(): ToothPaths {
  return {
    outline: [
      `M 12,28`,
      `C 10,20 10,12 12,5`,
      `C 16,2 20,2 24,2`,
      `C 28,2 32,2 36,5`,
      `C 38,12 38,20 36,28`,
      `C 39,34 40,44 40,54`,
      `C 40,63 37,70 33,74`,
      `C 27,77 21,77 15,74`,
      `C 11,70 8,63 8,54`,
      `C 8,44 9,34 12,28 Z`,
    ].join(' '),
    rootDetails: [
      `M 18,28 C 18,20 19,12 20,6`,
      `M 28,28 C 28,20 27,12 26,6`,
    ],
    crownDetails: [
      `M 10,54 C 16,60 32,60 38,54`,
    ],
  }
}

function premolarPath(width: number): ToothPaths {
  const hw = width / 2
  const cx = 24
  return {
    outline: [
      `M ${cx - 11},28`,
      `C ${cx - 11},20 ${cx - 11},12 ${cx - 9},6`,
      `C ${cx - 5},3 ${cx + 5},3 ${cx + 9},6`,
      `C ${cx + 11},12 ${cx + 11},20 ${cx + 11},28`,
      `C ${cx + 13},34 ${cx + hw + 1},44 ${cx + hw},54`,
      `C ${cx + hw - 1},64 ${cx + hw - 2},72`,
      `M ${cx + hw - 2},72 C ${cx + hw - 4},74 ${cx - hw + 4},74 ${cx - hw + 2},72`,
      `C ${cx - hw - 2},72 ${cx - hw - 1},64 ${cx - hw},54`,
      `C ${cx - hw - 1},44 ${cx - 13},34 ${cx - 11},28 Z`,
    ].join(' '),
    rootDetails: [
      `M ${cx - 4},28 C ${cx - 4},20 ${cx - 4},12 ${cx - 3},7`,
      `M ${cx + 4},28 C ${cx + 4},20 ${cx + 4},12 ${cx + 3},7`,
    ],
    crownDetails: [
      `M ${cx - hw + 2},54 C ${cx - 6},58 ${cx + 6},58 ${cx + hw - 2},54`,
      `M ${cx - 5},62 C ${cx - 2},59 ${cx + 2},59 ${cx + 5},62`,
    ],
  }
}

function molarPath(width: number, roots: number): ToothPaths {
  const hw = width / 2
  const cx = 24
  const paths: string[] = [
    `M ${cx - 11},28`,
    `C ${cx - 12},20 ${cx - 12},12 ${cx - 10},6`,
    `C ${cx - 7},3 ${cx + 7},3 ${cx + 10},6`,
    `C ${cx + 12},12 ${cx + 12},20 ${cx + 11},28`,
    `C ${cx + 14},34 ${cx + hw + 1},44 ${cx + hw},54`,
    `C ${cx + hw},64 ${cx + hw},72`,
  ]
  if (roots >= 2) {
    // Two roots
    paths.push(`C ${cx + hw - 2},74 ${cx + 4},74 ${cx + 3},70 C ${cx + 2},64 ${cx + 2},58 ${cx + 1},52`)
    paths.push(`C ${cx},58 ${cx},64 ${cx - 1},70 C ${cx - 2},74 ${cx - hw + 2},74 ${cx - hw},72`)
  } else {
    paths.push(`C ${cx + hw - 1},74 ${cx - hw + 1},74 ${cx - hw},72`)
  }
  paths.push(`C ${cx - hw},64 ${cx - hw},54`,)
  paths.push(`C ${cx - hw - 1},44 ${cx - 14},34 ${cx - 11},28 Z`)

  return {
    outline: paths.join(' '),
    rootDetails: [
      roots >= 2
        ? `M ${cx - 3},28 C ${cx - 4},20 ${cx - 5},12 ${cx - 4},6`
        : `M ${cx - 3},28 C ${cx - 4},20 ${cx - 3},12 ${cx - 2},6`,
      roots >= 2
        ? `M ${cx + 3},28 C ${cx + 2},22 ${cx + 2},14 ${cx + 2},8`
        : `M ${cx + 3},28 C ${cx + 4},20 ${cx + 3},12 ${cx + 2},6`,
    ],
    crownDetails: [
      `M ${cx - hw + 1},44 C ${cx - 8},48 ${cx - 4},50 ${cx},50`,
      `M ${cx},50 C ${cx + 4},50 ${cx + 8},48 ${cx + hw - 1},44`,
      `M ${cx - 6},58 C ${cx - 3},55 ${cx + 3},55 ${cx + 6},58`,
    ],
  }
}

export const TOOTH_PATH_DEFS: Record<string, ToothPaths> = {
  central_incisor: incisorPath(28, 16),
  lateral_incisor: incisorPath(24, 14),
  canine: caninePath(),
  first_premolar: premolarPath(26),
  second_premolar: premolarPath(24),
  first_molar: molarPath(32, 2),
  second_molar: molarPath(30, 2),
  wisdom: molarPath(26, 1),
}

export function getToothPathDef(toothNumber: number): ToothPaths {
  const types: Record<number, string> = {
    1: 'wisdom', 16: 'wisdom', 17: 'wisdom', 32: 'wisdom',
    2: 'second_molar', 15: 'second_molar', 18: 'second_molar', 31: 'second_molar',
    3: 'first_molar', 14: 'first_molar', 19: 'first_molar', 30: 'first_molar',
    4: 'second_premolar', 13: 'second_premolar', 20: 'second_premolar', 29: 'second_premolar',
    5: 'first_premolar', 12: 'first_premolar', 21: 'first_premolar', 28: 'first_premolar',
    6: 'canine', 11: 'canine', 22: 'canine', 27: 'canine',
    7: 'lateral_incisor', 10: 'lateral_incisor', 23: 'lateral_incisor', 26: 'lateral_incisor',
    8: 'central_incisor', 9: 'central_incisor', 24: 'central_incisor', 25: 'central_incisor',
  }
  return TOOTH_PATH_DEFS[types[toothNumber]] || TOOTH_PATH_DEFS.central_incisor
}
