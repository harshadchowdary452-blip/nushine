import React from 'react'
import { getToothPathDef } from './toothPaths'
import { type ToothFinding, type ToothCondition, CONDITION_COLORS } from './types'

interface ToothSVGProps {
  toothNumber: number
  findings: ToothFinding[]
  isUpper: boolean
  view: 'crown' | 'root'
  isSelected: boolean
  isHovered: boolean
  activeFilter: ToothCondition | null
  onClick: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

const TOOTH_COLOR = '#F5F0E8'
const TOOTH_SHADE = '#E8DFD0'
const ROOT_COLOR = '#E0D5C0'
const ROOT_SHADE = '#D0C5B0'

function getConditionColor(condition: ToothCondition): string {
  return CONDITION_COLORS[condition]
}

function renderImplant(cx: number, cy: number, width: number, height: number): string {
  const rw = width * 0.25
  const rh = height * 0.35
  return [
    `M ${cx - rw},${cy + height * 0.15}`,
    `L ${cx - rw * 0.7},${cy + height * 0.15}`,
    `L ${cx - rw * 0.3},${cy}`,
    `L ${cx + rw * 0.3},${cy}`,
    `L ${cx + rw * 0.7},${cy + height * 0.15}`,
    `L ${cx + rw},${cy + height * 0.15}`,
    `L ${cx + rw},${cy + rh + height * 0.15}`,
    `L ${cx - rw},${cy + rh + height * 0.15} Z`,
  ].join(' ')
}

function renderDentureBlock(cx: number, cy: number, width: number, height: number): string {
  return `M ${cx - width * 0.35},${cy + height * 0.1} L ${cx + width * 0.35},${cy + height * 0.1} L ${cx + width * 0.4},${cy + height * 0.9} L ${cx - width * 0.4},${cy + height * 0.9} Z`
}

export default React.memo(function ToothSVG({
  toothNumber,
  findings,
  isUpper: _isUpper,
  view,
  isSelected,
  isHovered,
  activeFilter,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: ToothSVGProps) {
  const pathDef = getToothPathDef(toothNumber)
  const wholeCondition = findings.find((f) =>
    ['Missing', 'Implant', 'Impacted', 'Bridge', 'Denture'].includes(f.condition)
  )?.condition
  const eruptFinding = findings.find((f) => f.condition === 'Erupt')
  const isHighlighted = activeFilter ? findings.some((f) => f.condition === activeFilter) : false

  const stroke = wholeCondition === 'Missing' ? '#888'
    : isSelected ? '#2563EB'
    : isHovered ? '#3B82F6'
    : isHighlighted ? getConditionColor(activeFilter!)
    : '#B0A090'

  const strokeWidth = wholeCondition === 'Missing' ? 1.5
    : isSelected || isHovered ? 1.5
    : 0.8

  const opacity = eruptFinding ? 0.6 : 1

  const cx = 24
  const cy = view === 'crown' ? 10 : 8

  const highlightPath = pathDef.crownDetails?.[0] || ''

  return (
    <g
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: 'pointer' }}
    >
      <defs>
        <linearGradient id={`enamel-${toothNumber}-${view}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={view === 'crown' ? TOOTH_SHADE : ROOT_SHADE} />
          <stop offset="30%" stopColor={view === 'crown' ? TOOTH_COLOR : ROOT_COLOR} />
          <stop offset="60%" stopColor={view === 'crown' ? '#FFF8F0' : '#E8DDD0'} />
          <stop offset="100%" stopColor={view === 'crown' ? TOOTH_SHADE : ROOT_SHADE} />
        </linearGradient>
        <filter id={`glow-${toothNumber}-${view}`}>
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {wholeCondition === 'Bridge' && (
        <line
          x1={cx - 20} y1={cy + 30} x2={cx + 20} y2={cy + 30}
          stroke="#9370DB" strokeWidth="4" strokeLinecap="round"
          opacity={0.7}
        />
      )}

      {wholeCondition === 'Missing' ? (
        <path
          d={pathDef.outline}
          fill="none"
          stroke="#888"
          strokeWidth={1.5}
          strokeDasharray="3,2"
          opacity={opacity}
        />
      ) : wholeCondition === 'Implant' ? (
        <>
          <path
            d={renderImplant(cx, cy, 28, 50)}
            fill="#B0A090"
            stroke="#888"
            strokeWidth={0.5}
          />
          {Array.from({ length: 5 }, (_, i) => (
            <line
              key={i}
              x1={cx - 6} y1={cy + 18 + i * 8}
              x2={cx + 6} y2={cy + 16 + i * 8}
              stroke="#666" strokeWidth={0.8}
            />
          ))}
          <rect
            x={cx - 12} y={cy + 44} width={24} height={18} rx={4}
            fill="#F0E8D8" stroke="#B0A090" strokeWidth={0.8}
          />
        </>
      ) : wholeCondition === 'Denture' ? (
        <path
          d={renderDentureBlock(cx, cy, 28, 60)}
          fill="#D0C8C0"
          stroke="#B0A090"
          strokeWidth={0.8}
          opacity={0.8}
        />
      ) : wholeCondition === 'Impacted' ? (
        <g transform={`rotate(${toothNumber % 2 === 0 ? -12 : 12}, ${cx}, ${cy + 36})`}>
          <path
            d={pathDef.outline}
            fill={`url(#enamel-${toothNumber}-${view})`}
            stroke="#FF8C00"
            strokeWidth={1.2}
            opacity={0.85}
          />
        </g>
      ) : (
        <g>
          <path
            d={pathDef.outline}
            fill={`url(#enamel-${toothNumber}-${view})`}
            stroke={stroke}
            strokeWidth={strokeWidth}
            opacity={opacity}
            filter={isSelected || isHovered || isHighlighted ? `url(#glow-${toothNumber}-${view})` : undefined}
          />
          {!eruptFinding && pathDef.rootDetails && (
            <g stroke={ROOT_SHADE} strokeWidth={0.6} fill="none" opacity={0.5}>
              {pathDef.rootDetails.map((d, i) => <path key={`rd-${i}`} d={d} />)}
            </g>
          )}
          {!eruptFinding && highlightPath && (
            <path
              d={highlightPath}
              fill="none"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth={1.5}
            />
          )}
          {eruptFinding && (
            <path
              d={pathDef.outline}
              fill="none"
              stroke="#90EE90"
              strokeWidth={1}
              strokeDasharray="2,2"
              opacity={0.5}
            />
          )}
        </g>
      )}
    </g>
  )
})
