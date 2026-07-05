import React, { memo } from 'react'
import { getSurfaceClips, type SurfaceClips, SURFACE_LABELS } from './toothPaths'
import type { Finding, FindingType } from './Odontogram'

interface SurfaceOverlayProps {
  toothNum: number
  outline: string
  isAnterior: boolean
  isUpper: boolean
  isMirror: boolean
  findings: Finding[]
  selectedSurface: string | null
  hoveredSurface: string | null
  onSurfaceClick: (surface: string) => void
  onSurfaceHover: (surface: string | null) => void
}

const SURFACE_COLORS: Record<string, { active: string; hover: string; finding: string }> = {
  mesial:   { active: '#3B82F6', hover: 'rgba(59,130,246,0.25)', finding: '#8B4513' },
  distal:   { active: '#3B82F6', hover: 'rgba(59,130,246,0.25)', finding: '#8B4513' },
  labial:   { active: '#3B82F6', hover: 'rgba(59,130,246,0.25)', finding: '#8B4513' },
  buccal:   { active: '#3B82F6', hover: 'rgba(59,130,246,0.25)', finding: '#8B4513' },
  incisal:  { active: '#3B82F6', hover: 'rgba(59,130,246,0.25)', finding: '#8B4513' },
  occlusal: { active: '#3B82F6', hover: 'rgba(59,130,246,0.25)', finding: '#8B4513' },
  root:     { active: '#3B82F6', hover: 'rgba(59,130,246,0.25)', finding: '#8B4513' },
}

function surfaceHasFinding(findings: Finding[], surface: string, toothNum: number): boolean {
  return findings.some(
    (f) => f.toothNumber === String(toothNum) && f.surface?.toLowerCase() === surface.toLowerCase()
  )
}

function surfaceFindingColor(findings: Finding[], surface: string, toothNum: number): string | null {
  const findingTypesCarries: FindingType[] = ['DentalCaries']
  const findingTypesFilling: FindingType[] = ['FillingAmalgam', 'FillingComposite']
  const findingTypesRCT: FindingType[] = ['RootCanalTreated']
  const f = findings.find(
    (f) => f.toothNumber === String(toothNum) && f.surface?.toLowerCase() === surface.toLowerCase()
  )
  if (!f) return null
  if (findingTypesCarries.includes(f.type)) return '#8B4513'
  if (findingTypesFilling.includes(f.type)) return '#a0a0a0'
  if (findingTypesRCT.includes(f.type)) return '#7B2D8E'
  return null
}

const SurfacePath = memo(function SurfacePath({
  surfaceKey,
  outline,
  clipPathId,
  isSelected,
  isHovered,
  findingColor,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  surfaceKey: string
  outline: string
  clipPathId: string
  isSelected: boolean
  isHovered: boolean
  findingColor: string | null
  onClick: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const fill = findingColor
    ? findingColor
    : isSelected
    ? 'rgba(59,130,246,0.12)'
    : isHovered
    ? 'rgba(59,130,246,0.08)'
    : 'transparent'

  const stroke = isSelected ? '#2563EB' : isHovered ? '#3B82F6' : 'transparent'
  const strokeW = isSelected ? 2 : isHovered ? 1.5 : 0

  return (
    <path
      d={outline}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeW}
      clipPath={`url(#${clipPathId})`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: 'pointer', transition: 'fill 0.15s, stroke 0.15s' }}
    />
  )
})

export default memo(function SurfaceOverlay({
  toothNum,
  outline,
  isAnterior,
  isUpper,
  isMirror,
  findings,
  selectedSurface,
  hoveredSurface,
  onSurfaceClick,
  onSurfaceHover,
}: SurfaceOverlayProps) {
  const clips = getSurfaceClips(isAnterior)

  const surfaceKeys = isAnterior
    ? ['mesial', 'distal', 'labial', 'incisal', 'root'] as const
    : ['mesial', 'distal', 'buccal', 'occlusal', 'root'] as const

  return (
    <g>
      <defs>
        {surfaceKeys.map((sk) => (
          <clipPath key={sk} id={`clip-${toothNum}-${sk}`}>
            <path d={clips[sk] || clips.mesial} />
          </clipPath>
        ))}
      </defs>
      {surfaceKeys.map((sk) => (
        <SurfacePath
          key={sk}
          surfaceKey={sk}
          outline={outline}
          clipPathId={`clip-${toothNum}-${sk}`}
          isSelected={selectedSurface === sk}
          isHovered={hoveredSurface === sk}
          findingColor={surfaceFindingColor(findings, sk, toothNum)}
          onClick={() => onSurfaceClick(sk)}
          onMouseEnter={() => onSurfaceHover(sk)}
          onMouseLeave={() => onSurfaceHover(null)}
        />
      ))}
    </g>
  )
})
