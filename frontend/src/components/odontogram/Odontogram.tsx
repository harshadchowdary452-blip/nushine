import { useState, useCallback, useMemo } from "react"
import { X, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ClinicalFinding } from "@/types"

// ─── Types ───────────────────────────────────────────────────────
export interface OdontogramProps {
  findings: ClinicalFinding[]
  readonly?: boolean
  onFindingsChange?: (findings: ClinicalFinding[]) => void
}

interface ToothDef {
  num: number
  label: string
  region: "upper" | "lower"
}

// ─── Finding Visual Config ───────────────────────────────────────
export interface FindingVisual {
  fill: string
  stroke: string
  textColor: string
  icon?: "crown" | "implant" | "rct" | "missing" | "mobility" | "fracture" | "bridge" | "root_stump"
  priority: number
  label: string
}

export const FINDING_VISUALS: Record<string, FindingVisual> = {
  Caries: { fill: "#c0392b", stroke: "#922b21", textColor: "#fff", priority: 60, label: "Caries" },
  Decay: { fill: "#c0392b", stroke: "#922b21", textColor: "#fff", priority: 60, label: "Decay" },
  Missing: { fill: "#555", stroke: "#333", textColor: "#fff", icon: "missing", priority: 100, label: "Missing" },
  "Root Stump": { fill: "#8B4513", stroke: "#5D2E0C", textColor: "#fff", icon: "root_stump", priority: 90, label: "Root Stump" },
  Filled: { fill: "#2980b9", stroke: "#1a5276", textColor: "#fff", priority: 30, label: "Filling" },
  Crown: { fill: "#d4a017", stroke: "#b8860b", textColor: "#000", icon: "crown", priority: 70, label: "Crown" },
  Bridge: { fill: "#8e44ad", stroke: "#6c3483", textColor: "#fff", icon: "bridge", priority: 75, label: "Bridge" },
  Implant: { fill: "#7f8c8d", stroke: "#5d6d7e", textColor: "#fff", icon: "implant", priority: 95, label: "Implant" },
  Mobility: { fill: "#e67e22", stroke: "#ca6f1e", textColor: "#fff", icon: "mobility", priority: 40, label: "Mobility" },
  Calculus: { fill: "#f39c12", stroke: "#d68910", textColor: "#000", priority: 20, label: "Calculus" },
  Stains: { fill: "#a0522d", stroke: "#8B4513", textColor: "#fff", priority: 10, label: "Stains" },
  Fracture: { fill: "#e74c3c", stroke: "#c0392b", textColor: "#fff", icon: "fracture", priority: 80, label: "Fracture" },
  Attrition: { fill: "#bdc3c7", stroke: "#95a5a6", textColor: "#000", priority: 15, label: "Attrition" },
  Abrasion: { fill: "#d5dbdb", stroke: "#aeb6bf", textColor: "#000", priority: 15, label: "Abrasion" },
  Erosion: { fill: "#f2d7d5", stroke: "#e6b0aa", textColor: "#000", priority: 15, label: "Erosion" },
  Impaction: { fill: "#6c3483", stroke: "#4a235a", textColor: "#fff", priority: 85, label: "Impaction" },
  "RCT Done": { fill: "#27ae60", stroke: "#1e8449", textColor: "#fff", icon: "rct", priority: 65, label: "RCT Done" },
  "RCT Required": { fill: "#1abc9c", stroke: "#148f77", textColor: "#fff", priority: 55, label: "RCT Required" },
  Pocket: { fill: "#ff5733", stroke: "#c70039", textColor: "#fff", priority: 45, label: "Pocket" },
  Tenderness: { fill: "#ff1493", stroke: "#c0392b", textColor: "#fff", priority: 35, label: "Tenderness" },
  "Periapical Lesion": { fill: "#800000", stroke: "#4a0000", textColor: "#fff", priority: 50, label: "Periapical Lesion" },
  Healthy: { fill: "#27ae60", stroke: "#1e8449", textColor: "#fff", priority: 0, label: "Healthy" },
  Other: { fill: "#95a5a6", stroke: "#7f8c8d", textColor: "#fff", priority: 5, label: "Other" },
}

export const FINDING_TYPES = Object.keys(FINDING_VISUALS)

// ─── Dentition Data ──────────────────────────────────────────────
const ADULT_UPPER: ToothDef[] = [
  { num: 18, label: "18", region: "upper" }, { num: 17, label: "17", region: "upper" },
  { num: 16, label: "16", region: "upper" }, { num: 15, label: "15", region: "upper" },
  { num: 14, label: "14", region: "upper" }, { num: 13, label: "13", region: "upper" },
  { num: 12, label: "12", region: "upper" }, { num: 11, label: "11", region: "upper" },
  { num: 21, label: "21", region: "upper" }, { num: 22, label: "22", region: "upper" },
  { num: 23, label: "23", region: "upper" }, { num: 24, label: "24", region: "upper" },
  { num: 25, label: "25", region: "upper" }, { num: 26, label: "26", region: "upper" },
  { num: 27, label: "27", region: "upper" }, { num: 28, label: "28", region: "upper" },
]

const ADULT_LOWER: ToothDef[] = [
  { num: 48, label: "48", region: "lower" }, { num: 47, label: "47", region: "lower" },
  { num: 46, label: "46", region: "lower" }, { num: 45, label: "45", region: "lower" },
  { num: 44, label: "44", region: "lower" }, { num: 43, label: "43", region: "lower" },
  { num: 42, label: "42", region: "lower" }, { num: 41, label: "41", region: "lower" },
  { num: 31, label: "31", region: "lower" }, { num: 32, label: "32", region: "lower" },
  { num: 33, label: "33", region: "lower" }, { num: 34, label: "34", region: "lower" },
  { num: 35, label: "35", region: "lower" }, { num: 36, label: "36", region: "lower" },
  { num: 37, label: "37", region: "lower" }, { num: 38, label: "38", region: "lower" },
]

const PRIMARY_UPPER: ToothDef[] = [
  { num: 55, label: "55", region: "upper" }, { num: 54, label: "54", region: "upper" },
  { num: 53, label: "53", region: "upper" }, { num: 52, label: "52", region: "upper" },
  { num: 51, label: "51", region: "upper" },
  { num: 61, label: "61", region: "upper" }, { num: 62, label: "62", region: "upper" },
  { num: 63, label: "63", region: "upper" }, { num: 64, label: "64", region: "upper" },
  { num: 65, label: "65", region: "upper" },
]

const PRIMARY_LOWER: ToothDef[] = [
  { num: 85, label: "85", region: "lower" }, { num: 84, label: "84", region: "lower" },
  { num: 83, label: "83", region: "lower" }, { num: 82, label: "82", region: "lower" },
  { num: 81, label: "81", region: "lower" },
  { num: 71, label: "71", region: "lower" }, { num: 72, label: "72", region: "lower" },
  { num: 73, label: "73", region: "lower" }, { num: 74, label: "74", region: "lower" },
  { num: 75, label: "75", region: "lower" },
]

// ─── Tooth Name Map ──────────────────────────────────────────────
const TOOTH_NAMES: Record<number, string> = {
  11: "Central Incisor", 12: "Lateral Incisor", 13: "Canine",
  14: "First Premolar", 15: "Second Premolar", 16: "First Molar", 17: "Second Molar", 18: "Third Molar",
  21: "Central Incisor", 22: "Lateral Incisor", 23: "Canine",
  24: "First Premolar", 25: "Second Premolar", 26: "First Molar", 27: "Second Molar", 28: "Third Molar",
  31: "Central Incisor", 32: "Lateral Incisor", 33: "Canine",
  34: "First Premolar", 35: "Second Premolar", 36: "First Molar", 37: "Second Molar", 38: "Third Molar",
  41: "Central Incisor", 42: "Lateral Incisor", 43: "Canine",
  44: "First Premolar", 45: "Second Premolar", 46: "First Molar", 47: "Second Molar", 48: "Third Molar",
  51: "Central Incisor", 52: "Lateral Incisor", 53: "Canine",
  54: "First Molar", 55: "Second Molar",
  61: "Central Incisor", 62: "Lateral Incisor", 63: "Canine",
  64: "First Molar", 65: "Second Molar",
  71: "Central Incisor", 72: "Lateral Incisor", 73: "Canine",
  74: "First Molar", 75: "Second Molar",
  81: "Central Incisor", 82: "Lateral Incisor", 83: "Canine",
  84: "First Molar", 85: "Second Molar",
}

// ─── Tooth SVG Paths ─────────────────────────────────────────────
function getToothPath(isMolar: boolean, isUpper: boolean): string {
  const dir = isUpper ? 1 : -1
  const rootDir = dir * 1
  if (isMolar) {
    return `
      M 6,4
      Q 6,0 12,0
      L 32,0
      Q 38,0 38,4
      L 36,28
      Q 36,32 32,32
      L 28,32
      L 28,${44 * rootDir < 0 ? 40 : 44}
      Q 28,${44 * rootDir < 0 ? 44 : 48} 24,${44 * rootDir < 0 ? 44 : 48}
      Q 20,${44 * rootDir < 0 ? 44 : 48} 20,${44 * rootDir < 0 ? 40 : 44}
      L 20,${36 * rootDir < 0 ? 34 : 36}
      L 18,${36 * rootDir < 0 ? 34 : 36}
      L 18,${44 * rootDir < 0 ? 40 : 44}
      Q 18,${44 * rootDir < 0 ? 44 : 48} 14,${44 * rootDir < 0 ? 44 : 48}
      Q 10,${44 * rootDir < 0 ? 44 : 48} 10,${44 * rootDir < 0 ? 40 : 44}
      L 10,32
      L 8,32
      Q 4,32 4,28
      Z
    `
  }
  return `
    M 6,4
    Q 6,0 12,0
    L 32,0
    Q 38,0 38,4
    L 36,28
    Q 36,32 32,32
    L 28,32
    L 28,${44 * rootDir < 0 ? 40 : 44}
    Q 28,${44 * rootDir < 0 ? 44 : 48} 22,${44 * rootDir < 0 ? 44 : 48}
    Q 16,${44 * rootDir < 0 ? 44 : 48} 16,${44 * rootDir < 0 ? 40 : 44}
    L 16,32
    L 12,32
    Q 8,32 8,28
    Z
  `
}

function isMolarTooth(num: number): boolean {
  const n = num % 10
  return n === 6 || n === 7 || n === 8 || n === 5
}

function getSurfaces(num: number): string[] {
  return ["Mesial", "Distal", "Occlusal/Incisal", "Buccal", "Lingual"]
}

// ─── ToothSVG (memoized) ─────────────────────────────────────────
interface ToothSVGProps {
  tooth: ToothDef
  findings: ClinicalFinding[]
  isSelected: boolean
  isChild: boolean
  onClick: () => void
}

const ToothSVG = ({ tooth, findings, isSelected, isChild, onClick }: ToothSVGProps) => {
  const isUpper = tooth.region === "upper"
  const isMolar = isMolarTooth(tooth.num)
  const path = getToothPath(isMolar, isUpper)
  const toothKey = String(tooth.num)

  const toothFindings = useMemo(
    () => findings.filter((f) => f.tooth_number === toothKey),
    [findings, toothKey]
  )

  const hasFindings = toothFindings.length > 0
  const isMissing = toothFindings.some((f) => f.finding_type === "Missing")

  const primaryFinding = useMemo(() => {
    if (toothFindings.length === 0) return null
    const sorted = [...toothFindings].sort((a, b) => {
      const va = FINDING_VISUALS[a.finding_type]
      const vb = FINDING_VISUALS[b.finding_type]
      return (vb?.priority || 0) - (va?.priority || 0)
    })
    return sorted[0]
  }, [toothFindings])

  const visual = primaryFinding ? FINDING_VISUALS[primaryFinding.finding_type] : null
  const fillColor = isMissing ? "#555" : visual?.fill || "#f8f8f8"
  const strokeColor = isSelected ? "#2563eb" : isMissing ? "#333" : visual?.stroke || "#ddd"
  const strokeWidth = isSelected ? 3 : isMissing ? 2 : 1.5

  const extraFindings = toothFindings.filter((f) => f !== primaryFinding)

  return (
    <g
      onClick={onClick}
      style={{ cursor: "pointer" }}
      className="tooth-svg-group"
    >
      {/* Tooth shadow */}
      <path
        d={path}
        fill="rgba(0,0,0,0.06)"
        transform="translate(1,1)"
      />
      {/* Tooth body */}
      <path
        d={path}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* Tooth number label */}
      <text
        x={22}
        y={isUpper ? 16 : 42}
        textAnchor="middle"
        fill={visual?.textColor || "#333"}
        fontSize={isChild ? 7 : 8}
        fontWeight="bold"
        fontFamily="Arial, sans-serif"
      >
        {tooth.label}
      </text>

      {/* Missing tooth cross */}
      {isMissing && (
        <g>
          <line x1="10" y1="10" x2="34" y2="38" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
          <line x1="34" y1="10" x2="10" y2="38" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
        </g>
      )}

      {/* RCT indicator */}
      {hasFindings && toothFindings.some((f) => f.finding_type === "RCT Done") && (
        <circle cx={22} cy={isUpper ? 26 : 24} r={4} fill="#fff" opacity={0.9} />
      )}

      {/* Crown indicator */}
      {hasFindings && toothFindings.some((f) => f.finding_type === "Crown") && (
        <path
          d="M 8,6 L 12,2 L 16,6 L 20,2 L 24,6 L 28,2 L 32,6 L 36,2"
          fill="none"
          stroke="#d4a017"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      )}

      {/* Mobility arrow */}
      {hasFindings && toothFindings.some((f) => f.finding_type === "Mobility") && (
        <g transform={isUpper ? "translate(8,2)" : "translate(8,42)"}>
          <polygon points="0,2 7,8 14,2" fill="#e67e22" opacity={0.8} />
        </g>
      )}

      {/* Fracture warning */}
      {hasFindings && toothFindings.some((f) => f.finding_type === "Fracture") && (
        <g transform="translate(30, 2)">
          <polygon points="6,0 12,10 0,10" fill="#e74c3c" />
          <text x={6} y={8} textAnchor="middle" fill="#fff" fontSize={6} fontWeight="bold">!</text>
        </g>
      )}

      {/* Pocket indicator */}
      {hasFindings && toothFindings.some((f) => f.finding_type === "Pocket") && (
        <line
          x1={isUpper ? 2 : 2}
          y1={isUpper ? 12 : 36}
          x2={isUpper ? 2 : 2}
          y2={isUpper ? 28 : 20}
          stroke="#ff5733"
          strokeWidth={3}
          strokeLinecap="round"
        />
      )}

      {/* Periapical Lesion indicator */}
      {hasFindings && toothFindings.some((f) => f.finding_type === "Periapical Lesion") && (
        <circle
          cx={22}
          cy={isUpper ? 44 : 10}
          r={5}
          fill="none"
          stroke="#800000"
          strokeWidth={2}
          strokeDasharray="3,2"
        />
      )}

      {/* Badge for secondary findings */}
      {extraFindings.length > 0 && !isMissing && (
        <>
          {extraFindings.slice(0, 3).map((f, i) => {
            const positions = [
              { x: 36, y: 12 },
              { x: 36, y: 22 },
              { x: 36, y: 32 },
            ]
            const pos = positions[i] || positions[2]
            const fv = FINDING_VISUALS[f.finding_type]
            return (
              <g key={`${f.finding_type}-${i}`}>
                <circle cx={pos.x} cy={pos.y} r={3.5} fill={fv?.fill || "#999"} stroke="#fff" strokeWidth={1} />
                <text
                  x={pos.x}
                  y={pos.y + 1.2}
                  textAnchor="middle"
                  fill="#fff"
                  fontSize={5}
                  fontWeight="bold"
                >
                  {f.finding_type === "Calculus" ? "C" :
                   f.finding_type === "Mobility" ? "M" :
                   f.finding_type === "Tenderness" ? "T" :
                   f.finding_type === "Pocket" ? "P" :
                   f.finding_type === "Fracture" ? "F" :
                   f.finding_type === "Attrition" ? "A" :
                   f.finding_type === "Abrasion" ? "AB" :
                   f.finding_type === "Erosion" ? "E" :
                   f.finding_type === "Stains" ? "S" :
                   f.finding_type === "Impaction" ? "I" :
                   f.finding_type[0]}
                </text>
              </g>
            )
          })}
          {extraFindings.length > 3 && (
            <text x={36} y={42} fill="#666" fontSize={5} fontWeight="bold">+{extraFindings.length - 3}</text>
          )}
        </>
      )}

      {/* Healthy checkmark */}
      {hasFindings && toothFindings.some((f) => f.finding_type === "Healthy") && !isMissing && toothFindings.filter((f) => f.finding_type !== "Healthy").length === 0 && (
        <g transform="translate(30, 38)">
          <circle cx={5} cy={5} r={5} fill="#27ae60" />
          <polyline points="2,5 4,7 8,3" fill="none" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" />
        </g>
      )}
    </g>
  )
}

// ─── Tooth Details Panel ─────────────────────────────────────────
interface ToothDetailsPanelProps {
  tooth: ToothDef | null
  findings: ClinicalFinding[]
  isChild: boolean
  onAddFinding: (findingType: string) => void
  onRemoveFinding: (findingType: string) => void
  onClose: () => void
}

function ToothDetailsPanel({ tooth, findings, isChild, onAddFinding, onRemoveFinding, onClose }: ToothDetailsPanelProps) {
  if (!tooth) return null

  const toothKey = String(tooth.num)
  const toothFindings = findings.filter((f) => f.tooth_number === toothKey)
  const toothName = TOOTH_NAMES[tooth.num] || `Tooth ${tooth.label}`
  const surfaces = getSurfaces(tooth.num)
  const selectedTypes = toothFindings.map((f) => f.finding_type)
  const availableTypes = FINDING_TYPES.filter((t) => t !== "Healthy")

  return (
    <Card className="border-2 border-blue-200">
      <CardHeader className="py-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">
          Tooth {tooth.label} — {toothName}
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-xs text-muted-foreground">Surfaces</Label>
          <div className="flex flex-wrap gap-1 mt-1">
            {surfaces.map((s) => (
              <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Current Findings</Label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {toothFindings.length === 0 && (
              <span className="text-xs text-muted-foreground italic">No findings for this tooth</span>
            )}
            {toothFindings.map((f) => {
              const fv = FINDING_VISUALS[f.finding_type]
              return (
                <Badge
                  key={f.finding_type + (f.notes || "")}
                  className="text-[10px] cursor-pointer hover:opacity-80 gap-1"
                  style={{ backgroundColor: fv?.fill || "#999", color: fv?.textColor || "#fff" }}
                  onClick={() => onRemoveFinding(f.finding_type)}
                >
                  {f.finding_type}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              )
            })}
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Add Finding</Label>
          <div className="grid grid-cols-3 gap-1 mt-1 max-h-[200px] overflow-y-auto">
            {availableTypes.map((ft) => {
              const active = selectedTypes.includes(ft)
              const fv = FINDING_VISUALS[ft]
              return (
                <Button
                  key={ft}
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className={`text-[10px] h-7 justify-start ${active ? "ring-2 ring-blue-400" : ""}`}
                  style={active ? { backgroundColor: fv?.fill || "#999" } : undefined}
                  onClick={() => {
                    if (active) onRemoveFinding(ft)
                    else onAddFinding(ft)
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full mr-1 flex-shrink-0"
                    style={{ backgroundColor: fv?.fill || "#999" }}
                  />
                  {ft}
                </Button>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Legend ───────────────────────────────────────────────────────
function OdontogramLegend() {
  const legendItems = [
    { color: "#c0392b", label: "Caries / Decay" },
    { color: "#555", label: "Missing" },
    { color: "#8B4513", label: "Root Stump" },
    { color: "#2980b9", label: "Filling" },
    { color: "#d4a017", label: "Crown" },
    { color: "#8e44ad", label: "Bridge" },
    { color: "#7f8c8d", label: "Implant" },
    { color: "#e67e22", label: "Mobility" },
    { color: "#f39c12", label: "Calculus" },
    { color: "#e74c3c", label: "Fracture" },
    { color: "#27ae60", label: "RCT Done" },
    { color: "#1abc9c", label: "RCT Required" },
    { color: "#ff5733", label: "Pocket" },
    { color: "#ff1493", label: "Tenderness" },
    { color: "#800000", label: "Periapical Lesion" },
    { color: "#27ae60", label: "Healthy" },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1">
      {legendItems.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-xs">
          <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
          <span className="text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main Odontogram ─────────────────────────────────────────────
export default function Odontogram({ findings, readonly, onFindingsChange }: OdontogramProps) {
  const [dentition, setDentition] = useState<"adult" | "child">("adult")
  const [selectedTooth, setSelectedTooth] = useState<ToothDef | null>(null)

  const upperTeeth = dentition === "adult" ? ADULT_UPPER : PRIMARY_UPPER
  const lowerTeeth = dentition === "adult" ? ADULT_LOWER : PRIMARY_LOWER

  const handleToothClick = useCallback((tooth: ToothDef) => {
    if (readonly) return
    setSelectedTooth((prev) => (prev?.num === tooth.num ? null : tooth))
  }, [readonly])

  const handleAddFinding = useCallback((findingType: string) => {
    if (!selectedTooth || !onFindingsChange) return
    const toothKey = String(selectedTooth.num)
    const exists = findings.some((f) => f.tooth_number === toothKey && f.finding_type === findingType)
    if (exists) return
    const newFinding: ClinicalFinding = {
      id: "",
      case_id: "",
      tooth_number: toothKey,
      finding_type: findingType,
      severity: null,
      notes: null,
      created_at: new Date().toISOString(),
    }
    onFindingsChange([...findings, newFinding])
  }, [selectedTooth, findings, onFindingsChange])

  const handleRemoveFinding = useCallback((findingType: string) => {
    if (!selectedTooth || !onFindingsChange) return
    const toothKey = String(selectedTooth.num)
    onFindingsChange(findings.filter((f) => !(f.tooth_number === toothKey && f.finding_type === findingType)))
  }, [selectedTooth, findings, onFindingsChange])

  // Generate clinical findings summary
  const findingsSummary = useMemo(() => {
    const grouped: Record<string, string[]> = {}
    for (const f of findings) {
      if (f.finding_type === "Healthy") continue
      const key = `Tooth ${f.tooth_number}`
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(f.finding_type + (f.notes ? ` (${f.notes})` : ""))
    }
    return Object.entries(grouped)
      .map(([tooth, types]) => `${tooth}\n  ${types.join("\n  ")}`)
      .join("\n\n")
  }, [findings])

  const svgWidth = dentition === "adult" ? 42 * 16 + 20 : 42 * 10 + 20
  const midX = svgWidth / 2
  const toothW = 42

  function renderArch(teeth: ToothDef[], y: number, label: string) {
    const mid = teeth.length / 2
    return (
      <g>
        {teeth.map((t, i) => {
          const x = i < mid
            ? 2 + i * toothW
            : 2 + (i + 1) * toothW + 6
          return (
            <g key={t.num} transform={`translate(${x}, ${y})`}>
              <ToothSVG
                tooth={t}
                findings={findings}
                isSelected={selectedTooth?.num === t.num}
                isChild={dentition === "child"}
                onClick={() => handleToothClick(t)}
              />
            </g>
          )
        })}
      </g>
    )
  }

  return (
    <div className="space-y-4">
      {/* Dentition Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Dentition:</span>
          <div className="flex bg-muted rounded-lg p-0.5">
            <button
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                dentition === "adult" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground"
              }`}
              onClick={() => { setDentition("adult"); setSelectedTooth(null) }}
            >
              Adult (32)
            </button>
            <button
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                dentition === "child" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground"
              }`}
              onClick={() => { setDentition("child"); setSelectedTooth(null) }}
            >
              Child (20)
            </button>
          </div>
        </div>
        {findings.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {findings.filter((f) => f.tooth_number).length} findings on {new Set(findings.filter((f) => f.tooth_number).map((f) => f.tooth_number)).size} teeth
          </span>
        )}
      </div>

      {/* Odontogram SVG */}
      <div className="overflow-x-auto py-2">
        <svg
          viewBox={`0 0 ${svgWidth + 10} 130`}
          className="w-full max-w-[750px] mx-auto"
          style={{ minHeight: 140 }}
        >
          {/* Upper arch */}
          {renderArch(upperTeeth, 10, "Upper")}

          {/* Midline separator */}
          <line
            x1={midX - 2}
            y1={5}
            x2={midX - 2}
            y2={115}
            stroke="#ddd"
            strokeWidth={1}
            strokeDasharray="4,3"
          />
          <line
            x1={midX + 2}
            y1={74}
            x2={midX + 2}
            y2={120}
            stroke="#ddd"
            strokeWidth={1}
            strokeDasharray="4,3"
          />

          {/* Arch labels */}
          <text x={midX} y={8} textAnchor="middle" fill="#888" fontSize={8} fontFamily="Arial, sans-serif">
            Upper Arch
          </text>
          <text x={midX} y={120} textAnchor="middle" fill="#888" fontSize={8} fontFamily="Arial, sans-serif">
            Lower Arch
          </text>

          {/* Lower arch */}
          {renderArch(lowerTeeth, 75, "Lower")}
        </svg>
      </div>

      {/* Tooth Details Panel */}
      {selectedTooth && !readonly && (
        <ToothDetailsPanel
          tooth={selectedTooth}
          findings={findings}
          isChild={dentition === "child"}
          onAddFinding={handleAddFinding}
          onRemoveFinding={handleRemoveFinding}
          onClose={() => setSelectedTooth(null)}
        />
      )}

      {/* Legend */}
      <Card>
        <CardHeader className="py-2">
          <CardTitle className="text-xs font-medium">Legend</CardTitle>
        </CardHeader>
        <CardContent className="py-2">
          <OdontogramLegend />
        </CardContent>
      </Card>

      {/* Clinical Findings Summary */}
      <Card>
        <CardHeader className="py-2">
          <CardTitle className="text-xs font-medium">Clinical Findings Summary</CardTitle>
        </CardHeader>
        <CardContent className="py-2">
          {findingsSummary ? (
            <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
              {findingsSummary}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground italic">No clinical findings recorded.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Export helper for external use ─────────────────────────────
export { TOOTH_NAMES, getSurfaces, FINDING_TYPES as ODONTOGRAM_FINDING_TYPES }
