import React, { memo } from 'react'
import { getSurfaceClips } from './toothPaths'
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

function surfaceFindingColor(findings: Finding[], surface: string, toothNum: number): string | null {
  const findingTypesCarries: FindingType[] = ['DentalCaries']
  const findingTypesFilling: FindingType[] = ['FillingAmalgam', 'FillingComposite']
  const findingTypesRCT: FindingType[] = ['RootCanalTreated']
  const f = findings.find(
    (f) => f.toothNumber === String(toothNum) && f.surface?.toLowerCase() === surface.toLowerCase()
  )
  if (!f) return null
  if (findingTypesCarries.includes(f.type)) return 'var(--ds-clinical-caries)'
  if (findingTypesFilling.includes(f.type)) return 'var(--ds-clinical-amalgam-fill)'
  if (findingTypesRCT.includes(f.type)) return 'var(--ds-clinical-rct)'
  return null
}

const SurfacePath = memo(function SurfacePath({
  surfaceKey: _surfaceKey,
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
    ? 'var(--ds-primary-200)'
    : isHovered
    ? 'var(--ds-primary-100)'
    : 'transparent'

  const stroke = isSelected ? 'var(--ds-primary-500)' : isHovered ? 'var(--ds-primary-400)' : 'transparent'
  const strokeW = isSelected ? 2 : isHovered ? 1.5 : 0

  return (
    <path
      d={outline}
      fill={fill}
      style={{ stroke, strokeWidth: strokeW, cursor: 'pointer', transition: 'fill 0.15s, stroke 0.15s' }}
      clipPath={`url(#${clipPathId})`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  )
})

export default memo(function SurfaceOverlay({
  toothNum,
  outline,
  isAnterior,
  isUpper: _isUpper,
  isMirror: _isMirror,
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
