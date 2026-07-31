import { useState, useCallback, useRef, useEffect, memo, useMemo } from "react"
import {
  getToothAnatomy,
  getToothQuadrant,
  getToothSurfaces,
  TOOTH_NAMES,
  ADULT_TEETH,
  CHILD_TEETH,
  getGingivaPath,
  getTonguePath,
  type ArchPosition,
} from "./toothPaths"
import SurfaceOverlay from "./SurfaceOverlay"

// ─── Types (spec-compliant) ───────────────────────────────────────

export type FindingType =
  | "DentalCaries" | "FillingAmalgam" | "FillingComposite"
  | "RootCanalTreated" | "RootCanalRequired"
  | "Crown" | "Bridge" | "Implant"
  | "Calculus" | "Gingivitis" | "Periodontitis"
  | "Mobility" | "Fracture" | "Stains"
  | "Attrition" | "Abrasion" | "Erosion"
  | "MissingTooth" | "Impaction"

export interface Finding {
  id: string
  type: FindingType
  surface?: "Occlusal" | "Mesial" | "Distal" | "Buccal" | "Lingual"
  note?: string
  createdAt: string
  toothNumber: string
}

interface Props {
  findings?: Finding[]
  onFindingsChange?: (patientId: string, findings: Finding[]) => void
  patientId?: string
  readonly?: boolean
  patientAge?: number
  patientName?: string
  doctorName?: string
  visitDate?: string
}

// ─── Mock Data ────────────────────────────────────────────────────

const MOCK_FINDINGS: Finding[] = [
  { id: "m1", type: "DentalCaries", surface: "Occlusal", toothNumber: "16", createdAt: "2026-06-15T10:30:00Z" },
  { id: "m2", type: "DentalCaries", surface: "Distal", toothNumber: "15", createdAt: "2026-06-15T10:30:00Z" },
  { id: "m3", type: "FillingAmalgam", surface: "Occlusal", toothNumber: "26", createdAt: "2026-03-10T09:00:00Z" },
  { id: "m4", type: "RootCanalTreated", toothNumber: "36", createdAt: "2026-01-20T14:00:00Z" },
  { id: "m5", type: "Crown", toothNumber: "36", createdAt: "2026-02-01T11:00:00Z" },
  { id: "m6", type: "MissingTooth", toothNumber: "18", createdAt: "2025-11-05T08:00:00Z" },
  { id: "m7", type: "Calculus", toothNumber: "31", createdAt: "2026-06-15T10:30:00Z" },
  { id: "m8", type: "Calculus", toothNumber: "41", createdAt: "2026-06-15T10:30:00Z" },
  { id: "m9", type: "Mobility", toothNumber: "46", createdAt: "2026-06-15T10:30:00Z" },
  { id: "m10", type: "Fracture", toothNumber: "21", createdAt: "2026-05-01T09:00:00Z" },
  { id: "m11", type: "Gingivitis", toothNumber: "11", createdAt: "2026-06-15T10:30:00Z" },
  { id: "m12", type: "Gingivitis", toothNumber: "21", createdAt: "2026-06-15T10:30:00Z" },
  { id: "m13", type: "Impaction", toothNumber: "28", createdAt: "2026-04-10T13:00:00Z" },
  { id: "m14", type: "Bridge", toothNumber: "45", createdAt: "2026-02-15T10:00:00Z" },
  { id: "m15", type: "Implant", toothNumber: "47", createdAt: "2025-12-01T09:00:00Z" },
]

interface FindingVisual {
  priority: number
  badge: string
  color: string
  fillColor: string
  darkFill: string
  description: string
}

const FINDING_VISUALS: Record<FindingType, FindingVisual> = {
  DentalCaries:     { priority: 6,  badge: "Ca", color: "var(--ds-clinical-caries)",     fillColor: "var(--ds-clinical-caries-fill)",   darkFill: "var(--ds-clinical-caries)", description: "Dental caries / decay" },
  FillingAmalgam:   { priority: 4,  badge: "Am", color: "var(--ds-clinical-amalgam)",     fillColor: "var(--ds-clinical-amalgam-fill)",   darkFill: "var(--ds-clinical-amalgam)", description: "Silver amalgam filling" },
  FillingComposite: { priority: 4,  badge: "Co", color: "var(--ds-clinical-composite)",     fillColor: "var(--ds-clinical-composite-fill)",   darkFill: "var(--ds-clinical-composite-dark)", description: "Tooth-colored composite filling" },
  RootCanalTreated: { priority: 9,  badge: "RC", color: "var(--ds-clinical-rct)",     fillColor: "var(--ds-clinical-rct-fill)",   darkFill: "var(--ds-clinical-rct)", description: "Root canal treatment completed" },
  RootCanalRequired:{ priority: 8,  badge: "RR", color: "var(--ds-clinical-rc-required)",     fillColor: "var(--ds-clinical-rc-required-fill)",   darkFill: "var(--ds-clinical-rc-required)", description: "Root canal treatment required" },
  Crown:            { priority: 8,  badge: "C",  color: "var(--ds-clinical-crown)",     fillColor: "var(--ds-clinical-crown)",   darkFill: "var(--ds-clinical-crown-dark)", description: "Crown (cap)" },
  Bridge:           { priority: 8,  badge: "B",  color: "var(--ds-clinical-bridge)",     fillColor: "var(--ds-clinical-bridge)",   darkFill: "var(--ds-clinical-bridge-dark)", description: "Bridge" },
  Implant:          { priority: 14, badge: "I",  color: "var(--ds-clinical-implant)",     fillColor: "var(--ds-clinical-implant-fill)",   darkFill: "var(--ds-clinical-implant)", description: "Dental implant" },
  Calculus:         { priority: 3,  badge: "Ca", color: "var(--ds-clinical-calculus)",     fillColor: "var(--ds-clinical-calculus-fill)",   darkFill: "var(--ds-clinical-calculus)", description: "Calculus / tartar deposits" },
  Gingivitis:       { priority: 1,  badge: "G",  color: "var(--ds-clinical-gingivitis)",     fillColor: "transparent", darkFill: "var(--ds-clinical-gingivitis)", description: "Gingival inflammation" },
  Periodontitis:    { priority: 2,  badge: "P",  color: "var(--ds-clinical-periodontitis)",     fillColor: "transparent", darkFill: "var(--ds-clinical-periodontitis)", description: "Periodontal disease" },
  Mobility:         { priority: 2,  badge: "M",  color: "var(--ds-clinical-mobility)",     fillColor: "transparent", darkFill: "var(--ds-clinical-mobility)", description: "Tooth mobility" },
  Fracture:         { priority: 10, badge: "F",  color: "var(--ds-clinical-fracture)",     fillColor: "var(--ds-clinical-fracture-fill)",   darkFill: "var(--ds-clinical-fracture)", description: "Tooth fracture / crack" },
  Stains:           { priority: 3,  badge: "St", color: "var(--ds-clinical-stains)",     fillColor: "var(--ds-clinical-caries-fill)",   darkFill: "var(--ds-clinical-stains)", description: "Stains / discoloration" },
  Attrition:        { priority: 3,  badge: "A",  color: "var(--ds-clinical-attrition)",     fillColor: "var(--ds-clinical-attrition)",   darkFill: "var(--ds-clinical-attrition-dark)", description: "Wear from tooth-to-tooth contact" },
  Abrasion:         { priority: 3,  badge: "Ab", color: "var(--ds-clinical-abrasion)",     fillColor: "var(--ds-clinical-abrasion)",   darkFill: "var(--ds-clinical-abrasion-dark)", description: "Wear from external factors" },
  Erosion:          { priority: 3,  badge: "Er", color: "var(--ds-clinical-erosion)",     fillColor: "var(--ds-clinical-erosion)",   darkFill: "var(--ds-clinical-erosion-dark)", description: "Chemical wear / erosion" },
  MissingTooth:     { priority: 15, badge: "M",  color: "var(--ds-clinical-missing)",     fillColor: "var(--ds-clinical-missing)",   darkFill: "var(--ds-clinical-missing)", description: "Missing tooth" },
  Impaction:        { priority: 12, badge: "Im", color: "var(--ds-clinical-impaction)",     fillColor: "var(--ds-clinical-impaction-fill)",   darkFill: "var(--ds-clinical-impaction)", description: "Impacted tooth" },
}

const FINDING_TYPES: FindingType[] = [
  "DentalCaries", "FillingAmalgam", "FillingComposite",
  "RootCanalTreated", "RootCanalRequired",
  "Crown", "Bridge", "Implant",
  "Calculus", "Gingivitis", "Periodontitis",
  "Mobility", "Fracture", "Stains",
  "Attrition", "Abrasion", "Erosion",
  "MissingTooth", "Impaction",
]

// ─── Enamel Gradients ─────────────────────────────────────────────
// Anatomical tooth-shading ramps (enamel / cervical / root / gingiva /
// tongue). Cohesive SVG art used only inside this chart; finding-legend
// and UI colors below are token-driven (--ds-clinical-* / --ds-*).

const ENAMEL_GRADIENT = [
  { offset: "0%",  color: "#FDFCF8" },
  { offset: "15%", color: "#F5F0E8" },
  { offset: "35%", color: "#EDE5D6" },
  { offset: "55%", color: "#E8DECC" },
  { offset: "70%", color: "#E0D5C0" },
  { offset: "85%", color: "#D8CCB4" },
  { offset: "100%",color: "#D0C4A8" },
]

const CERVICAL_GRADIENT = [
  { offset: "0%",  color: "rgba(200,180,150,0)" },
  { offset: "60%", color: "rgba(200,180,150,0)" },
  { offset: "85%", color: "rgba(195,170,135,0.25)" },
  { offset: "100%",color: "rgba(190,160,120,0.35)" },
]

const ROOT_GRADIENT = [
  { offset: "0%",  color: "#E8E0D4" },
  { offset: "40%", color: "#D8D0C4" },
  { offset: "70%", color: "#CDC4B6" },
  { offset: "100%",color: "#C0B8A8" },
]

const CROWN_SHADOW = "rgba(0,0,0,0.06)"
const SELECTION_GLOW = 'var(--ds-primary-500)'

// ─── Helpers ──────────────────────────────────────────────────────

function hasType(findings: Finding[], type: string): boolean {
  return findings.some((f) => f.type === type)
}

function hasBaseType(findings: Finding[], base: string): boolean {
  return findings.some((f) => f.type.startsWith(base))
}

const S = (v: number) => String(v)

// ─── Gradient Defs ─────────────────────────────────────────────────

function GradientDefs() {
  return (
    <defs>
      <linearGradient id="enamel-grad" x1="0%" y1="0%" x2="0%" y2="100%">
        {ENAMEL_GRADIENT.map((s) => <stop key={s.offset} offset={s.offset} stopColor={s.color} />)}
      </linearGradient>
      <linearGradient id="cervical-grad" x1="0%" y1="0%" x2="0%" y2="100%">
        {CERVICAL_GRADIENT.map((s) => <stop key={s.offset} offset={s.offset} stopColor={s.color} />)}
      </linearGradient>
      <linearGradient id="root-grad" x1="0%" y1="0%" x2="0%" y2="100%">
        {ROOT_GRADIENT.map((s) => <stop key={s.offset} offset={s.offset} stopColor={s.color} />)}
      </linearGradient>
      <linearGradient id="gingiva-grad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#E8C8B0" />
        <stop offset="40%" stopColor="#E0C0A8" />
        <stop offset="100%" stopColor="#D4B498" />
      </linearGradient>
      <linearGradient id="gingiva-margin" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#E8B8A0" />
        <stop offset="50%" stopColor="#DDB0A0" />
        <stop offset="100%" stopColor="#D0A898" />
      </linearGradient>

      <filter id="glow">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="shadow">
        <feDropShadow dx={0} dy={2} stdDeviation={3} floodOpacity={0.15} />
      </filter>
    </defs>
  )
}

// ─── Tooth SVG Component ──────────────────────────────────────────

interface ToothSVGProps {
  toothNum: number
  findings: Finding[]
  isPrimary: boolean
  isSelected: boolean
  isHovered: boolean
  position: ArchPosition
  toothWidth: number
  toothHeight: number
  onClick: (num: number) => void
  onHover: (num: number | null) => void
  selectedSurface: string | null
  hoveredSurface: string | null
  onSurfaceClick: (num: number, surface: string) => void
  onSurfaceHover: (surface: string | null) => void
}

const ToothSVG = memo(function ToothSVG({
  toothNum, findings, isPrimary, isSelected, isHovered,
  position, toothWidth, toothHeight, onClick, onHover,
  selectedSurface, hoveredSurface, onSurfaceClick, onSurfaceHover,
}: ToothSVGProps) {
  const { x, y, rotation } = position
  const toothData = getToothAnatomy(toothNum, isPrimary)
  const jawPrefix = Math.floor(toothNum / 10)
  const isUpper = [1, 2, 5, 6].includes(jawPrefix)
  const isMirror = [2, 3, 6, 7].includes(jawPrefix)
  const [animScale, setAnimScale] = useState(1)

  useEffect(() => {
    if (isSelected) { setAnimScale(1.04); setTimeout(() => setAnimScale(1.02), 200) }
    else setAnimScale(1)
  }, [isSelected])

  const toothFindings = findings.filter((f) => f.toothNumber === S(toothNum))

  const isMissing = hasType(toothFindings, "MissingTooth")
  const isImplant = hasType(toothFindings, "Implant")
  const isRCT = hasType(toothFindings, "Root Canal Treated")
  const isFracture = hasType(toothFindings, "Fracture")
  const isCrown = hasBaseType(toothFindings, "Crown")
  const isRootStump = hasType(toothFindings, "Root Stump")
  const isCaries = hasBaseType(toothFindings, "Caries")
  const isCalculus = hasType(toothFindings, "Calculus")
  const isMobility = hasBaseType(toothFindings, "Mobility")
  const isGingivitis = hasType(toothFindings, "Gingivitis")
  const isPeriodontitis = hasType(toothFindings, "Periodontitis")
  const isPeriapical = hasType(toothFindings, "Periapical Lesion")
  const isBridgePontic = hasType(toothFindings, "Bridge Pontic")
  const isBridgeAbut = hasType(toothFindings, "Bridge Abutment")
  const isFilling = hasBaseType(toothFindings, "Filling")
  const isWear = hasType(toothFindings, "Attrition") || hasType(toothFindings, "Abrasion") || hasType(toothFindings, "Erosion")

  let fillColor = "url(#enamel-grad)"
  let strokeColor = "var(--ds-clinical-outline)"
  let strokeW = 1.2
  let opacity = 1

  if (isMissing) { fillColor = "var(--ds-clinical-missing)"; strokeColor = "var(--ds-clinical-inactive)"; strokeW = 1.5; opacity = 0.4 }
  else if (isRootStump) { fillColor = "var(--ds-clinical-root-stump)"; strokeColor = "var(--ds-clinical-root-stump-stroke)" }
  else if (isImplant) { fillColor = "var(--ds-clinical-implant-fill)"; strokeColor = "var(--ds-clinical-implant)" }
  else if (isCaries) {
    const c = toothFindings.find((f) => f.type === "DentalCaries")
    const fv = c ? FINDING_VISUALS[c.type] : null
    if (fv && fv.fillColor !== "transparent") fillColor = fv.fillColor
  }
  else if (isCrown) { strokeColor = "var(--ds-clinical-outline-light)"; strokeW = 1.5 }
  else if (isWear) fillColor = "var(--ds-clinical-attrition)"

  const baseOpacity = opacity
  const scale = animScale * (isHovered ? 1.03 : 1)

  const tx = x + toothWidth / 2
  const ty = y + toothHeight / 2

  return (
    <g
      onClick={(e) => { e.stopPropagation(); onClick(toothNum) }}
      onMouseEnter={() => onHover(toothNum)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: "pointer", opacity: baseOpacity }}
      transform={`translate(${tx},${ty}) rotate(${rotation}) scale(${isUpper ? "1,-1" : "1,1"}) scale(${isMirror ? -1 : 1},1) scale(${scale}) translate(${-50},${-60})`}
    >
      {/* Shadow */}
      <path d={toothData.outline} fill={CROWN_SHADOW} transform="translate(2,3)" />

      {/* Root gradient overlay */}
      <path d={toothData.outline} fill="url(#root-grad)" opacity={0.15} />

      {/* Cervical yellow overlay */}
      <path d={toothData.outline} fill="url(#cervical-grad)" opacity={0.5} />

      {/* Main tooth */}
      <path
        d={toothData.outline}
        fill={fillColor}
        stroke={isSelected ? SELECTION_GLOW : strokeColor}
        strokeWidth={isSelected ? 2.5 : strokeW}
        filter={isSelected ? "url(#glow)" : undefined}
      />

      {/* Enamel highlight streak (vertical center sheen) */}
      {!isMissing && !isRootStump && (
        <ellipse cx={isMirror ? 55 : 45} cy={26} rx={12} ry={18} fill="rgba(255,255,255,0.35)" />
      )}
      {!isMissing && !isRootStump && (
        <ellipse cx={isMirror ? 52 : 48} cy={30} rx={6} ry={12} fill="rgba(255,255,255,0.2)" />
      )}
      {/* Cervical highlight reflection */}
      {!isMissing && !isRootStump && (
        <ellipse cx={isMirror ? 55 : 45} cy={toothData.crownHeight * 100 / 120 * 0.85} rx={toothData.rootWidth * 0.3} ry={3} fill="rgba(255,255,255,0.15)" />
      )}
      {/* Root highlight */}
      {!isMissing && !isRootStump && (
        <line x1={isMirror ? 52 : 48} y1={50} x2={isMirror ? 55 : 45} y2={95} stroke="rgba(255,255,255,0.08)" strokeWidth={2} />
      )}

      {/* Grooves and fissures */}
      {toothData.grooves.map((g, i) => (
        <path key={i} d={g} fill="none" stroke="var(--ds-clinical-outline)" strokeWidth={0.8} opacity={0.5} />
      ))}

      {/* Root lines */}
      {toothData.rootLines?.map((l, i) => (
        <path key={i} d={l} fill="none" stroke="var(--ds-clinical-outline-light)" strokeWidth={0.6} opacity={0.4} />
      ))}

      {/* ── Finding Visuals ── */}

      {/* Missing */}
      {isMissing && (
        <path d={toothData.outline} fill="none" stroke="var(--ds-clinical-toothnum)" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />
      )}

      {/* Implant screw */}
      {isImplant && !isMissing && (
        <>
          {[0.25, 0.35, 0.45].map((p) => (
            <line key={p} x1={42} y1={p * 100} x2={58} y2={p * 100} stroke="var(--ds-clinical-implant)" strokeWidth={2} />
          ))}
          <line x1={50} y1={20} x2={50} y2={50} stroke="var(--ds-clinical-implant)" strokeWidth={2} />
        </>
      )}

      {/* RCT canal lines */}
      {isRCT && !isMissing && (
        <>
          <line x1={44} y1={45} x2={46} y2={95} stroke="var(--ds-clinical-rct)" strokeWidth={1.8} strokeLinecap="round" />
          <line x1={56} y1={45} x2={54} y2={95} stroke="var(--ds-clinical-rct)" strokeWidth={1.8} strokeLinecap="round" />
          <path d="M 44,45 Q 48,52 46,58 Q 50,62 50,58 Q 50,62 54,58 Q 52,52 56,45" fill="none" stroke="var(--ds-clinical-rct)" strokeWidth={1.5} opacity={0.6} />
        </>
      )}

      {/* Fracture crack */}
      {isFracture && (
        <path d={`M ${isMirror ? 55 : 45},22 L ${isMirror ? 52 : 48},75`} fill="none" stroke="var(--ds-clinical-fracture)" strokeWidth={1.2} strokeDasharray="2,1.5" opacity={0.9} />
      )}

      {/* Crown overlay */}
      {isCrown && !isMissing && !isRootStump && (
        <path
          d={`M 25,18 Q 28,8 38,6 L 62,6 Q 72,8 75,18 L 72,48 C 70,52 65,56 62,48 L 58,44 L 42,44 L 38,48 C 35,56 30,52 28,48 Z`}
          fill="rgba(200,190,180,0.2)" stroke="var(--ds-clinical-outline)" strokeWidth={0.8} strokeDasharray="2,1.5"
        />
      )}

      {/* Calculus deposits */}
      {isCalculus && !isMissing && (
        <path d={`M 28,68 Q 50,62 72,68 Q 74,76 68,72 Q 50,78 32,72 Q 26,76 28,68`} fill="var(--ds-clinical-calculus)" opacity={0.6} />
      )}

      {/* Gingivitis line */}
      {isGingivitis && !isMissing && (
        <path d={`M 26,70 Q 50,64 74,70 Q 76,76 68,74 Q 50,78 32,74 Q 24,76 26,70`} fill="var(--ds-clinical-gingivitis)" opacity={0.5} />
      )}

      {/* Periodontitis pockets */}
      {isPeriodontitis && !isMissing && (
        <>
          <path d={`M 28,72 Q 30,80 34,74`} fill="none" stroke="var(--ds-clinical-periodontitis)" strokeWidth={1.2} />
          <path d={`M 72,72 Q 70,80 66,74`} fill="none" stroke="var(--ds-clinical-periodontitis)" strokeWidth={1.2} />
        </>
      )}

      {/* Periapical lesion */}
      {isPeriapical && !isMissing && (
        <circle cx={50} cy={105} r={8} fill="none" stroke="var(--ds-clinical-mobility-pink)" strokeWidth={1.5} opacity={0.7} />
      )}

      {/* Wear facets */}
      {isWear && !isMissing && (
        <ellipse cx={50} cy={14} rx={18} ry={3} fill="var(--ds-clinical-abrasion)" opacity={0.4} />
      )}

      {/* Caries cavity patches - surface-specific */}
      {isCaries && !isMissing && (
        <>
          {toothFindings.filter((f) => f.type === "DentalCaries").map((cf) => {
            const surf = cf.surface
            let cx2 = 50, cy2 = 38
            if (surf === "Occlusal") { cx2 = 50; cy2 = 18 }
            else if (surf === "Mesial") { cx2 = isMirror ? 68 : 32; cy2 = 40 }
            else if (surf === "Distal") { cx2 = isMirror ? 32 : 68; cy2 = 40 }
            else if (surf === "Buccal") { cx2 = 50; cy2 = 48 }
            else if (surf === "Lingual") { cx2 = isMirror ? 55 : 45; cy2 = 30 }
            return <circle key={cf.id || "car"} cx={cx2} cy={cy2} r={3.5} fill="var(--ds-clinical-caries-dark)" opacity={0.8} />
          })}
          {/* Legacy position-based caries */}
          {hasType(toothFindings, "Caries – Enamel") && (
            <circle cx={isMirror ? 55 : 45} cy={36} r={3.5} fill="var(--ds-clinical-caries)" opacity={0.6} />
          )}
          {hasType(toothFindings, "Caries – Dentin") && (
            <circle cx={isMirror ? 52 : 48} cy={44} r={3} fill="var(--ds-clinical-caries-dark)" opacity={0.75} />
          )}
          {hasType(toothFindings, "Caries – Pulp") && (
            <circle cx={50} cy={52} r={2.5} fill="var(--ds-clinical-caries-dark)" opacity={0.9} />
          )}
        </>
      )}

      {/* Restorations - surface-specific */}
      {isFilling && !isMissing && toothFindings.filter((f) => f.type.startsWith("Filling")).map((f) => {
        const fv = FINDING_VISUALS[f.type]
        const isAmalgam = f.type === "FillingAmalgam"
        return (
          <g key={f.id || f.type}>
            <ellipse cx={isMirror ? 56 : 44} cy={42} rx={8} ry={6} fill={fv?.darkFill || "var(--ds-clinical-amalgam-fill)"} opacity={0.5} />
            {isAmalgam && (
              <ellipse cx={isMirror ? 56 : 44} cy={42} rx={6} ry={4.5} fill="var(--ds-clinical-amalgam-mid)" opacity={0.4} />
            )}
          </g>
        )
      })}

      {/* Bridge connectors */}
      {isBridgePontic && (
        <line x1={2} y1={50} x2={98} y2={50} stroke="var(--ds-clinical-bridge-dark)" strokeWidth={2.5} opacity={0.4} />
      )}
      {isBridgeAbut && (
        <line x1={2} y1={50} x2={98} y2={50} stroke="var(--ds-clinical-bridge-dark)" strokeWidth={2} opacity={0.3} />
      )}

      {/* Surface overlay (clickable surfaces) */}
      {!isMissing && !isRootStump && (
        <SurfaceOverlay
          toothNum={toothNum}
          outline={toothData.outline}
          isAnterior={toothNum % 10 <= 3}
          isUpper={isUpper}
          isMirror={isMirror}
          findings={findings}
          selectedSurface={selectedSurface}
          hoveredSurface={hoveredSurface}
          onSurfaceClick={(surface) => onSurfaceClick(toothNum, surface)}
          onSurfaceHover={onSurfaceHover}
        />
      )}

      {/* Tooth number */}
      <text
        x={50} y={isUpper ? 108 : 112}
        textAnchor="middle"
        fill={isMissing ? "var(--ds-clinical-inactive)" : "var(--ds-clinical-toothnum)"}
        fontSize={9}
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight={500}
        transform={isUpper ? "scale(1,-1) translate(0,-220)" : undefined}
        style={{ pointerEvents: "none" }}
      >
        {toothNum}
      </text>

      {/* Mobility badge */}
      {isMobility && (
        <>
          {hasType(toothFindings, "Mobility Grade I") && <text x={14} y={28} fill="var(--ds-clinical-mobility)" fontSize={11} fontWeight={700}>↕</text>}
          {hasType(toothFindings, "Mobility Grade II") && <text x={14} y={28} fill="var(--ds-clinical-mobility-high)" fontSize={11} fontWeight={700}>↕</text>}
          {hasType(toothFindings, "Mobility Grade III") && <text x={14} y={28} fill="var(--ds-clinical-mobility-severe)" fontSize={11} fontWeight={700}>↕</text>}
        </>
      )}

      {/* Selection rect */}
      {isSelected && (
        <rect x={2} y={2} width={96} height={116} rx={10} fill="none" stroke={SELECTION_GLOW} strokeWidth={2.5} opacity={0.6} />
      )}
    </g>
  )
})

// ─── Tooltip ──────────────────────────────────────────────────────

function ToothTooltip({ toothNum, findings, isPrimary: _isPrimary, mouseX, mouseY }: {
  toothNum: number; findings: Finding[]; isPrimary: boolean; mouseX: number; mouseY: number
}) {
  const tf = findings.filter((f) => f.toothNumber === S(toothNum))
  const name = TOOTH_NAMES[toothNum] || "Unknown"
  const quadrant = getToothQuadrant(toothNum)

  return (
    <div
      style={{
        position: "fixed", left: mouseX + 12, top: mouseY - 10, zIndex: 1000,
        background: "var(--ds-tooltip-bg)", color: "var(--ds-tooltip-fg)", borderRadius: 8, padding: "8px 12px",
        fontSize: 11, lineHeight: 1.5, maxWidth: 220,
        boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
        pointerEvents: "none", transition: "opacity 0.15s",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>
        Tooth #{toothNum} — {name}
      </div>
      <div style={{ color: "var(--ds-text-tertiary)", fontSize: 10, marginBottom: tf.length ? 4 : 0 }}>
        {quadrant}
      </div>
      {tf.length === 0 && <div style={{ color: "var(--ds-text-secondary)", fontStyle: "italic" }}>Healthy / No findings</div>}
      {tf.map((f) => {
        const fv = FINDING_VISUALS[f.type]
        return (
          <div key={f.id || f.type} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: fv?.color || "var(--ds-text-tertiary)", flexShrink: 0 }} />
            <span>{f.type}{f.surface ? ` (${f.surface})` : ""}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Legend ────────────────────────────────────────────────────────

function Legend({ findings }: { findings: Finding[] }) {
  const activeTypes = new Set(findings.map((f) => f.type))
  const items = FINDING_TYPES

  return (
    <div style={{ background: "var(--ds-surface)", borderRadius: 10, border: "1px solid var(--ds-border)", padding: "10px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ds-text)", letterSpacing: "0.02em" }}>LEGEND</span>
        <span style={{ fontSize: 10, color: "var(--ds-text-tertiary)" }}>({activeTypes.size} finding types active)</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {items.map((ft) => {
          const v = FINDING_VISUALS[ft]
          const active = activeTypes.has(ft)
          return (
            <div
              key={ft}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: 5,
                background: active ? `color-mix(in srgb, ${v.color} 7%, transparent)` : "var(--ds-background-subtle)",
                border: `1px solid ${active ? v.color : "var(--ds-border)"}`,
                opacity: active ? 1 : 0.4,
                fontSize: 10, fontWeight: 500, color: "var(--ds-text-secondary)",
                transition: "all 0.15s",
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: v.color, border: `1px solid ${v.darkFill}`,
                flexShrink: 0,
              }} />
              <span>{v.badge}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Right Panel ──────────────────────────────────────────────────

function RightPanel({
  toothNum, findings, onFindingsChange, readonly, isPrimary, onClose,
}: {
  toothNum: number; findings: Finding[]; onFindingsChange: (f: Finding[]) => void
  readonly: boolean; isPrimary: boolean; onClose: () => void
}) {
  const tf = findings.filter((f) => f.toothNumber === S(toothNum))
  const surfaces = getToothSurfaces(toothNum)
  const toothName = TOOTH_NAMES[toothNum] || "Unknown"
  const quadrant = getToothQuadrant(toothNum)
  const anatomy = getToothAnatomy(toothNum, isPrimary)

  const [ftype, setFtype] = useState("Caries – Enamel")
  const [surf, setSurf] = useState("")
  const [notes, setNotes] = useState("")

  const addFinding = () => {
    if (readonly) return
    const nf: Finding = {
      id: `local-${Date.now()}`,
      type: ftype as FindingType,
      toothNumber: S(toothNum),
      surface: (surf || undefined) as Finding["surface"],
      note: notes || undefined,
      createdAt: new Date().toISOString(),
    }
    onFindingsChange([...findings, nf])
    setSurf("")
    setNotes("")
  }

  const removeFinding = (f: Finding) => {
    if (readonly) return
    onFindingsChange(findings.filter((x) => x !== f))
  }

  const resetTooth = () => {
    if (readonly) return
    onFindingsChange(findings.filter((x) => x.toothNumber !== S(toothNum)))
  }

  return (
    <div style={{
      width: 320, flexShrink: 0, background: "var(--ds-surface)", borderRadius: 12,
      border: "1px solid var(--ds-border)", boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      display: "flex", flexDirection: "column", overflow: "hidden",
      height: "fit-content", position: "sticky", top: 16,
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px", borderBottom: "1px solid var(--ds-border)",
        background: "linear-gradient(135deg, var(--ds-background-subtle) 0%, var(--ds-surface-secondary) 100%)",
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ds-text)", lineHeight: 1.2 }}>
            #{toothNum}
            <span style={{ fontSize: 12, fontWeight: 400, color: "var(--ds-text-secondary)", marginLeft: 6 }}>{toothName}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--ds-text-secondary)", marginTop: 1 }}>{quadrant}</div>
        </div>
        <button onClick={onClose} style={{
          width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--ds-border)",
          background: "var(--ds-surface)", cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "center", color: "var(--ds-text-secondary)", fontSize: 13, fontWeight: 500,
          transition: "all 0.15s",
        }} title="Close">✕</button>
      </div>

      {/* Tooth Preview */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "16px 0", background: "var(--ds-background-subtle)" }}>
        <svg width={90} height={108} viewBox="0 0 100 120" style={{ display: "block" }}>
          <defs>
            <linearGradient id="pv-enamel" x1="0%" y1="0%" x2="0%" y2="100%">
              {ENAMEL_GRADIENT.map((s) => <stop key={s.offset} offset={s.offset} stopColor={s.color} />)}
            </linearGradient>
            <linearGradient id="pv-cervical" x1="0%" y1="0%" x2="0%" y2="100%">
              {CERVICAL_GRADIENT.map((s) => <stop key={s.offset} offset={s.offset} stopColor={s.color} />)}
            </linearGradient>
          </defs>
          <path d={anatomy.outline} fill="url(#pv-enamel)" stroke="var(--ds-clinical-outline)" strokeWidth={1} />
          <path d={anatomy.outline} fill="url(#pv-cervical)" opacity={0.4} />
          <ellipse cx={50} cy={26} rx={14} ry={16} fill="rgba(255,255,255,0.3)" />
          <ellipse cx={50} cy={30} rx={6} ry={10} fill="rgba(255,255,255,0.18)" />
          {anatomy.grooves.map((g, i) => (
            <path key={i} d={g} fill="none" stroke="var(--ds-clinical-outline)" strokeWidth={0.6} opacity={0.4} />
          ))}
        </svg>
      </div>

      {/* Current Findings */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--ds-border)" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ds-text)", marginBottom: 6, letterSpacing: "0.02em" }}>
          CURRENT FINDINGS ({tf.length})
        </div>
        {tf.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--ds-text-tertiary)", fontStyle: "italic" }}>No findings recorded for this tooth</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 140, overflowY: "auto" }}>
            {tf.map((f) => {
              const fv = FINDING_VISUALS[f.type]
              return (
                <div key={f.id || f.type} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "3px 8px", borderRadius: 5, background: `color-mix(in srgb, ${fv?.color} 6%, transparent)` || "var(--ds-background-subtle)",
                  borderLeft: `3px solid ${fv?.color || "var(--ds-clinical-inactive)"}`,
                }}>
                  <div style={{ fontSize: 11, color: "var(--ds-text)" }}>
                    <span style={{ fontWeight: 600 }}>{f.type}</span>
                    {f.surface && <span style={{ color: "var(--ds-text-secondary)" }}> ({f.surface})</span>}
                    {f.note && <span style={{ color: "var(--ds-text-tertiary)" }}> — {f.note}</span>}
                  </div>
                  {!readonly && (
                    <button onClick={() => removeFinding(f)} style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--ds-danger)", fontSize: 12, padding: "0 4px", lineHeight: 1,
                    }} title="Remove">✕</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Finding Form */}
      {!readonly && (
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ds-text)", letterSpacing: "0.02em" }}>ADD FINDING</div>

          <select value={ftype} onChange={(e) => setFtype(e.target.value)} style={inputStyle}>
            {FINDING_TYPES.map((ft) => <option key={ft} value={ft}>{ft}</option>)}
          </select>

          <div style={{ display: "flex", gap: 6 }}>
            <select value={surf} onChange={(e) => setSurf(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
              <option value="">Surface</option>
              {surfaces.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <input type="text" placeholder="Clinical notes..." value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} />

          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={addFinding} style={{
              flex: 1, padding: "7px", borderRadius: 6, border: "none",
              background: "var(--ds-primary)", color: "var(--ds-surface)", fontSize: 12, fontWeight: 600,
              cursor: "pointer", transition: "background 0.15s",
            }}>+ Add Finding</button>
            <button onClick={resetTooth} style={{
              padding: "7px 10px", borderRadius: 6, border: "1px solid var(--ds-border)",
              background: "var(--ds-surface)", color: "var(--ds-danger)", fontSize: 11, cursor: "pointer",
            }} title="Reset tooth">Reset</button>
          </div>
        </div>
      )}

      {/* Quick Summary */}
      {tf.length > 0 && (
        <div style={{ padding: "8px 16px 12px", borderTop: "1px solid var(--ds-border)", background: "var(--ds-background-subtle)" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--ds-text-secondary)", letterSpacing: "0.02em", marginBottom: 4 }}>
            TREATMENT NEEDED
          </div>
          <div style={{ fontSize: 11, color: "var(--ds-text)" }}>
            {tf.some((f) => f.type.startsWith("Caries")) && "Restoration required. "}
            {hasType(tf, "Root Canal Treated") && "Endodontically treated. "}
            {hasType(tf, "Fracture") && "Evaluate for crown/cusp protection. "}
            {hasBaseType(tf, "Mobility") && "Periodontal evaluation needed. "}
            {hasType(tf, "Calculus") && "Scaling required. "}
            {!tf.some((f) => f.type.startsWith("Caries") || f.type === "Fracture" || hasBaseType(tf, "Mobility") || hasType(tf, "Calculus")) && "Routine monitoring."}
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--ds-border-hover)",
  fontSize: 12, color: "var(--ds-text)", background: "var(--ds-surface)", outline: "none",
}

// ─── Clinical Summary ─────────────────────────────────────────────

function ClinicalSummary({ findings, isPrimary: _isPrimary }: { findings: Finding[]; isPrimary: boolean }) {
  const grouped = useMemo(() => {
    const map = new Map<string, Finding[]>()
    for (const f of findings) {
      const k = f.toothNumber || "0"
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(f)
    }
    return map
  }, [findings])

  const sorted = [...grouped.entries()].sort(([a], [b]) => Number(a) - Number(b))

  return (
    <div style={{ background: "var(--ds-surface)", borderRadius: 10, border: "1px solid var(--ds-border)", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--ds-border)", background: "var(--ds-background-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ds-text)" }}>
          Clinical Findings Summary
        </span>
        <span style={{ fontSize: 10, color: "var(--ds-text-tertiary)" }}>
          {findings.length} finding{findings.length !== 1 ? "s" : ""} · {sorted.length} tooth{ sorted.length !== 1 ? "ren" : ""}
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ background: "var(--ds-background-subtle)", color: "var(--ds-text)" }}>
              <th style={thStyle}>Tooth</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Finding</th>
              <th style={thStyle}>Surface</th>
              <th style={thStyle}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: 20, color: "var(--ds-text-tertiary)", fontStyle: "italic" }}>No clinical findings recorded</td></tr>
            )}
            {sorted.map(([toothNum, tfs]) => (
              tfs.map((f, idx) => (
                <tr key={`${toothNum}-${idx}`} style={{ borderBottom: "1px solid var(--ds-border-light)" }}>
                  {idx === 0 && <td rowSpan={tfs.length} style={{ ...tdStyle, fontWeight: 600, color: "var(--ds-text)", verticalAlign: "top" }}>#{toothNum}</td>}
                  {idx === 0 && <td rowSpan={tfs.length} style={{ ...tdStyle, color: "var(--ds-text-secondary)", verticalAlign: "top" }}>{TOOTH_NAMES[Number(toothNum)] || "—"}</td>}
                  <td style={tdStyle}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: FINDING_VISUALS[f.type]?.color || "var(--ds-clinical-inactive)", flexShrink: 0 }} />
                      {f.type}
                    </span>
                  </td>
                  <td style={tdStyle}>{f.surface || "—"}</td>
                  <td style={{ ...tdStyle, color: "var(--ds-text-tertiary)" }}>{f.note || "—"}</td>
                </tr>
              ))
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "6px 10px", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "2px solid var(--ds-border)" }
const tdStyle: React.CSSProperties = { padding: "5px 10px", fontSize: 11 }

// ─── Occlusal View ────────────────────────────────────────────────

function OcclusalView({ findings, isPrimary }: { findings: Finding[]; isPrimary: boolean }) {
  const teeth = isPrimary ? CHILD_TEETH.upper : ADULT_TEETH.upper
  return (
    <div style={{ background: "var(--ds-surface)", borderRadius: 10, border: "1px solid var(--ds-border)", padding: "12px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ds-text)", marginBottom: 8, letterSpacing: "0.02em" }}>
        Occlusal Views
      </div>
      <div style={{ display: "flex", gap: 20, justifyContent: "center" }}>
        {/* Upper occlusal */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "var(--ds-text-secondary)", marginBottom: 4 }}>Upper (Maxillary)</div>
          <svg width={280} height={80} viewBox="-160 -10 320 80">
            <ellipse cx={0} cy={30} rx={140} ry={30} fill="var(--ds-clinical-tooth)" stroke="var(--ds-border-light)" strokeWidth={1} />
            {teeth.map((t) => {
              const tf = findings.filter((f) => f.toothNumber === S(t.num))
              const hasCaries = tf.some((f) => f.type.startsWith("Caries"))
              const hasFilling = tf.some((f) => f.type.startsWith("Filling"))
              const hasFracture = tf.some((f) => f.type === "Fracture")
              const isMissing = tf.some((f) => f.type === "MissingTooth")
              const ax = t.pos.x * 0.65
              const ay = t.pos.y * 0.25 + 30
              const ang = t.pos.rotation * 0.5

              if (isMissing) return null
              return (
                <g key={t.num} transform={`translate(${ax},${ay}) rotate(${ang})`}>
                  {/* Occlusal outline (oval) */}
                  <ellipse cx={0} cy={0} rx={12} ry={8} fill={hasCaries ? "var(--ds-clinical-caries-fill)" : hasFilling ? "var(--ds-clinical-amalgam-fill)" : "var(--ds-clinical-tooth)"} stroke="var(--ds-clinical-outline)" strokeWidth={0.8} />
                  {hasFilling && <ellipse cx={0} cy={0} rx={6} ry={4} fill="var(--ds-clinical-amalgam-fill)" opacity={0.6} />}
                  {hasFracture && <line x1={-6} y1={0} x2={6} y2={0} stroke="var(--ds-clinical-fracture)" strokeWidth={0.8} />}
                  {hasCaries && <circle cx={3} cy={-2} r={2.5} fill="var(--ds-clinical-caries)" opacity={0.7} />}
                  <text x={0} y={2.5} textAnchor="middle" fill="var(--ds-clinical-toothnum)" fontSize={6} style={{ pointerEvents: "none" }}>{t.num}</text>
                </g>
              )
            })}
          </svg>
        </div>
        {/* Lower occlusal */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "var(--ds-text-secondary)", marginBottom: 4 }}>Lower (Mandibular)</div>
          <svg width={280} height={80} viewBox="-160 -10 320 80">
            <ellipse cx={0} cy={30} rx={130} ry={28} fill="var(--ds-clinical-tooth-mid)" stroke="var(--ds-border-light)" strokeWidth={1} />
            {(isPrimary ? CHILD_TEETH.lower : ADULT_TEETH.lower).map((t) => {
              const tf = findings.filter((f) => f.toothNumber === S(t.num))
              const hasCaries = tf.some((f) => f.type.startsWith("Caries"))
              const hasFilling = tf.some((f) => f.type.startsWith("Filling"))
              const isMissing = tf.some((f) => f.type === "MissingTooth")
              const ax = t.pos.x * 0.65
              const ay = t.pos.y * 0.25 + 30
              const ang = t.pos.rotation * 0.5

              if (isMissing) return null
              return (
                <g key={t.num} transform={`translate(${ax},${ay}) rotate(${ang})`}>
                  <ellipse cx={0} cy={0} rx={11} ry={7} fill={hasCaries ? "var(--ds-clinical-caries-fill)" : hasFilling ? "var(--ds-clinical-amalgam-fill)" : "var(--ds-clinical-tooth-mid)"} stroke="var(--ds-clinical-outline)" strokeWidth={0.8} />
                  {hasFilling && <ellipse cx={0} cy={0} rx={5} ry={3.5} fill="var(--ds-clinical-amalgam-fill)" opacity={0.6} />}
                  {hasCaries && <circle cx={-2} cy={1} r={2} fill="var(--ds-clinical-caries)" opacity={0.7} />}
                  <text x={0} y={2.5} textAnchor="middle" fill="var(--ds-clinical-toothnum)" fontSize={6} style={{ pointerEvents: "none" }}>{t.num}</text>
                </g>
              )
            })}
          </svg>
        </div>
      </div>
    </div>
  )
}

// ─── Main Odontogram Component ────────────────────────────────────

export default function Odontogram({
  findings: findingsProp, onFindingsChange, readonly, patientAge,
  patientName, doctorName, visitDate, patientId,
}: Props) {
  const findings = findingsProp ?? MOCK_FINDINGS
  const isPrimary = patientAge !== undefined && patientAge < 12
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null)
  const [selectedSurface, setSelectedSurface] = useState<string | null>(null)
  const [hoveredTooth, setHoveredTooth] = useState<number | null>(null)
  const [hoveredSurface, setHoveredSurface] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [showSummary, setShowSummary] = useState(false)
  const [showOcclusal, setShowOcclusal] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)

  const upperTeeth = isPrimary ? CHILD_TEETH.upper : ADULT_TEETH.upper
  const lowerTeeth = isPrimary ? CHILD_TEETH.lower : ADULT_TEETH.lower
  const dentitionLabel = isPrimary ? "Primary" : "Permanent"

  // Keyboard: Escape closes panel
  useEffect(() => {
    const hk = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedTooth(null) }
    window.addEventListener("keydown", hk)
    return () => window.removeEventListener("keydown", hk)
  }, [])

  const handleToothClick = useCallback((num: number) => {
    setSelectedTooth((prev) => (prev === num ? null : num))
    setSelectedSurface(null)
  }, [])

  const handleSurfaceClick = useCallback((num: number, surface: string) => {
    setSelectedTooth(num)
    setSelectedSurface((prev) => (prev === surface ? null : surface))
  }, [])

  const handleSurfaceHover = useCallback((surface: string | null) => {
    setHoveredSurface(surface)
  }, [])

  const handleHover = useCallback((num: number | null) => {
    setHoveredTooth(num)
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (hoveredTooth !== null) {
      setTooltipPos({ x: e.clientX, y: e.clientY })
    }
  }, [hoveredTooth])

  const handleFindingsChange = useCallback((updated: Finding[]) => {
    onFindingsChange?.(patientId || "local", updated)
  }, [onFindingsChange, patientId])

  // Generate summary text
  const summaryText = useMemo(() => {
    if (findings.length === 0) return `No clinical findings recorded (${dentitionLabel} dentition).`
    const groups = new Map<string, string[]>()
    for (const f of findings) {
      const key = `#${f.toothNumber}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(f.type + (f.note ? ` (${f.note})` : ""))
    }
    const lines = [`Clinical Findings Summary (${dentitionLabel} Dentition):`, ""]
    for (const [tooth, types] of groups) {
      lines.push(`${tooth}: ${types.join(", ")}`)
    }
    return lines.join("\n")
  }, [findings, dentitionLabel])

  const [, setSummaryEdit] = useState("")

  useEffect(() => {
    setSummaryEdit(summaryText)
  }, [summaryText])

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div ref={containerRef} style={{ fontFamily: "Inter, system-ui, -apple-system, sans-serif" }}>
      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", background: "var(--ds-surface)", borderRadius: 12,
        border: "1px solid var(--ds-border)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        marginBottom: 12, flexWrap: "wrap", gap: 8,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ds-text)", letterSpacing: "-0.01em" }}>
            Clinical Findings — Interactive Odontogram
          </div>
          <div style={{ fontSize: 11, color: "var(--ds-text-secondary)", marginTop: 1 }}>
            {patientName && `Patient: ${patientName}`}{patientName && doctorName && " · "}
            {doctorName && `Doctor: ${doctorName}`}{visitDate && ` · Visit: ${visitDate}`}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {/* Dentition badge */}
          <span style={{
            padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
            background: isPrimary ? "var(--ds-warning-subtle)" : "var(--ds-info-100)",
            color: isPrimary ? "var(--ds-warning)" : "var(--ds-info-800)",
            border: `1px solid ${isPrimary ? "var(--ds-warning-200)" : "var(--ds-info-300)"}`,
          }}>
            {dentitionLabel} Dentition
          </span>
          {/* View toggle */}
          <button onClick={() => setShowSummary(!showSummary)} style={btnStyle(showSummary)}>
            {showSummary ? "Chart" : "Summary"}
          </button>
          {/* Occlusal toggle */}
          <button onClick={() => setShowOcclusal(!showOcclusal)} style={btnStyle(showOcclusal)}>
            {showOcclusal ? "Hide Occlusal" : "Occlusal"}
          </button>
        </div>
      </div>

      {/* ── Main Body ── */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        {/* Left: Chart */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Chart area */}
          <div
            ref={chartRef}
            onMouseMove={handleMouseMove}
            style={{
              background: "var(--ds-surface)", borderRadius: 12, border: "1px solid var(--ds-border)",
              padding: "12px 8px 8px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              position: "relative", overflow: "hidden",
            }}
          >
            {/* Gingiva background */}
            <svg width="100%" height={400} viewBox="-280 -60 560 480" style={{ display: "block" }}>
              <GradientDefs />

              {/* Gingiva - Attached gingiva (base layer) */}
              <path d={getGingivaPath(true)} fill="url(#gingiva-grad)" opacity={0.5} />
              <path d={getGingivaPath(false)} fill="url(#gingiva-grad)" opacity={0.45} />

              {/* Gingiva - Marginal gingiva (darker, near tooth emergence) */}
              <path d={getGingivaPath(true)} fill="url(#gingiva-margin)" opacity={0.3} transform="translate(0, 4)" />
              <path d={getGingivaPath(false)} fill="url(#gingiva-margin)" opacity={0.25} transform="translate(0, -4)" />

              {/* Tongue */}
              <path d={getTonguePath()} fill="var(--ds-clinical-tongue)" opacity={0.25} />

              {/* Upper teeth */}
              {upperTeeth.map((t) => (
                <ToothSVG
                  key={t.num}
                  toothNum={t.num}
                  findings={findings}
                  isPrimary={isPrimary}
                  isSelected={selectedTooth === t.num}
                  isHovered={hoveredTooth === t.num}
                  position={t.pos}
                  toothWidth={48}
                  toothHeight={60}
                  onClick={handleToothClick}
                  onHover={handleHover}
                  selectedSurface={selectedTooth === t.num ? selectedSurface : null}
                  hoveredSurface={hoveredTooth === t.num ? hoveredSurface : null}
                  onSurfaceClick={handleSurfaceClick}
                  onSurfaceHover={handleSurfaceHover}
                />
              ))}

              {/* Lower teeth */}
              {lowerTeeth.map((t) => (
                <ToothSVG
                  key={t.num}
                  toothNum={t.num}
                  findings={findings}
                  isPrimary={isPrimary}
                  isSelected={selectedTooth === t.num}
                  isHovered={hoveredTooth === t.num}
                  position={t.pos}
                  toothWidth={48}
                  toothHeight={60}
                  onClick={handleToothClick}
                  onHover={handleHover}
                  selectedSurface={selectedTooth === t.num ? selectedSurface : null}
                  hoveredSurface={hoveredTooth === t.num ? hoveredSurface : null}
                  onSurfaceClick={handleSurfaceClick}
                  onSurfaceHover={handleSurfaceHover}
                />
              ))}

              {/* Arch labels */}
              <text x={0} y={-48} textAnchor="middle" fill="var(--ds-clinical-outline)" fontSize={9} fontWeight={500} letterSpacing="0.06em">MAXILLARY</text>
              <text x={0} y={210} textAnchor="middle" fill="var(--ds-clinical-outline)" fontSize={9} fontWeight={500} letterSpacing="0.06em">MANDIBULAR</text>
            </svg>
          </div>

          {/* Tooth count */}
          <div style={{ textAlign: "center", fontSize: 10, color: "var(--ds-text-tertiary)", marginTop: 6, marginBottom: 12 }}>
            {findings.length} finding{findings.length !== 1 ? "s" : ""} across {new Set(findings.map((f) => f.toothNumber)).size} teeth
          </div>

          {/* Legend */}
          <div style={{ marginBottom: 12 }}>
            <Legend findings={findings} />
          </div>

          {/* Summary */}
          {showSummary && (
            <div style={{ marginBottom: 12 }}>
              <ClinicalSummary findings={findings} isPrimary={isPrimary} />
            </div>
          )}

          {/* Occlusal Views */}
          {showOcclusal && (
            <div style={{ marginBottom: 12 }}>
              <OcclusalView findings={findings} isPrimary={isPrimary} />
            </div>
          )}
        </div>

        {/* Right: Selected Tooth Panel */}
        {selectedTooth !== null && (
          <RightPanel
            toothNum={selectedTooth}
            findings={findings}
            onFindingsChange={handleFindingsChange}
            readonly={!!readonly}
            isPrimary={isPrimary}
            onClose={() => setSelectedTooth(null)}
          />
        )}
      </div>

      {/* Tooltip */}
      {hoveredTooth !== null && (
        <ToothTooltip
          toothNum={hoveredTooth}
          findings={findings}
          isPrimary={isPrimary}
          mouseX={tooltipPos.x}
          mouseY={tooltipPos.y}
        />
      )}

      {/* Edit fit for screen */}
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  )
}

function btnStyle(active: boolean): React.CSSProperties {
  return {
    padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500,
    border: `1px solid ${active ? "var(--ds-primary-400)" : "var(--ds-border)"}`,
    background: active ? "var(--ds-primary-50)" : "var(--ds-surface)",
    color: active ? "var(--ds-primary-600)" : "var(--ds-text)",
    cursor: "pointer", transition: "all 0.15s",
    whiteSpace: "nowrap",
  }
}
