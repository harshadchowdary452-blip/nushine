import React from 'react'
import { type ToothFinding, type ToothSurface, type ToothCondition, CONDITION_COLORS } from './types'

interface OcclusalRingProps {
  toothNumber: number
  findings: ToothFinding[]
  layer: 0 | 1
  isSelected: boolean
  isHovered: boolean
  activeFilter: ToothCondition | null
  onClick: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

const RING_VIEWBOX = '0 0 40 40'
const CENTER = 20
const OUTER_R = 16
const INNER_R = 9
interface Segment {
  surface: ToothSurface
  startAngle: number
  endAngle: number
}

const SEGMENTS: Segment[] = [
  { surface: 'Mesial', startAngle: -90, endAngle: -18 },
  { surface: 'Buccal', startAngle: -18, endAngle: 54 },
  { surface: 'Distal', startAngle: 54, endAngle: 126 },
  { surface: 'Lingual', startAngle: 126, endAngle: 198 },
  { surface: 'Occlusal', startAngle: 198, endAngle: 270 },
]

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx: number, cy: number, r1: number, r2: number, start: number, end: number): string {
  const s1 = polarToCartesian(cx, cy, r1, start)
  const s2 = polarToCartesian(cx, cy, r2, start)
  const e1 = polarToCartesian(cx, cy, r1, end)
  const e2 = polarToCartesian(cx, cy, r2, end)
  const large = end - start > 180 ? 1 : 0
  return [
    `M ${s2.x},${s2.y}`,
    `L ${s1.x},${s1.y}`,
    `A ${r1},${r1} 0 ${large} 1 ${e1.x},${e1.y}`,
    `L ${e2.x},${e2.y}`,
    `A ${r2},${r2} 0 ${large} 0 ${s2.x},${s2.y}`,
    'Z',
  ].join(' ')
}

function getSegmentFill(
  findings: ToothFinding[],
  surface: ToothSurface,
  layer: 0 | 1,
  defaultColor: string
): string {
  const layerFindings = layer === 0
    ? findings.filter((f) => ['Decayed', 'Restored', 'Defective'].includes(f.condition))
    : findings.filter((f) => f.condition === 'Restored')

  for (const f of layerFindings) {
    if (f.surfaces?.includes(surface)) {
      return CONDITION_COLORS[f.condition] || defaultColor
    }
  }
  return defaultColor
}

export default React.memo(function OcclusalRing({
  toothNumber,
  findings,
  layer,
  isSelected,
  isHovered,
  activeFilter,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: OcclusalRingProps) {
  const isHighlighted = activeFilter ? findings.some((f) => f.condition === activeFilter) : false

  return (
    <svg
      viewBox={RING_VIEWBOX}
      width={40}
      height={40}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: 'pointer' }}
    >
      {SEGMENTS.map((seg) => {
        const fill = getSegmentFill(findings, seg.surface, layer, 'var(--ds-clinical-tooth)')
        return (
          <path
            key={seg.surface}
            d={describeArc(CENTER, CENTER, OUTER_R, INNER_R, seg.startAngle, seg.endAngle)}
            fill={fill}
            strokeWidth={isSelected || isHovered ? 1.2 : 0.6}
            style={{ stroke: isSelected ? 'var(--ds-primary-500)' : isHovered ? 'var(--ds-primary-400)' : 'var(--ds-neutral-400)' }}
          />
        )
      })}
      <circle cx={CENTER} cy={CENTER} r={INNER_R} fill="var(--ds-clinical-tooth-mid)" stroke="var(--ds-clinical-outline-light)" strokeWidth={0.5} />
      <text
        x={CENTER}
        y={CENTER + 1.5}
        textAnchor="middle"
        fontSize={7}
        fill="var(--ds-clinical-toothnum)"
        style={{ userSelect: 'none' }}
      >
        {toothNumber}
      </text>
      {isHighlighted && (
        <circle cx={CENTER} cy={CENTER} r={OUTER_R + 1.5} fill="none" stroke={CONDITION_COLORS[activeFilter!]} strokeWidth={2} opacity={0.6} />
      )}
    </svg>
  )
})
