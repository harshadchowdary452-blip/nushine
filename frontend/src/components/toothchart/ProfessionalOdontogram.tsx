import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import type { ToothCondition, ToothSurface, ToothFinding } from './types'

interface Props {
  findings: ToothFinding[]
  onFindingsChange: (findings: ToothFinding[]) => void
  patientName?: string
  opNumber?: string
  doctorName?: string
  visitDate?: string
  readonly?: boolean
}

// ─── Responsive hook ──────────────────────────────────────────────────

function useResponsiveBoxSize(): number {
  const [size, setSize] = useState(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) return 48
    if (window.matchMedia('(min-width: 768px)').matches) return 42
    return 36
  })
  useEffect(() => {
    const desk = window.matchMedia('(min-width: 1024px)')
    const tab = window.matchMedia('(min-width: 768px)')
    const handler = () => {
      if (desk.matches) setSize(48)
      else if (tab.matches) setSize(42)
      else setSize(36)
    }
    desk.addEventListener('change', handler)
    tab.addEventListener('change', handler)
    return () => { desk.removeEventListener('change', handler); tab.removeEventListener('change', handler) }
  }, [])
  return size
}

// ─── Constants ────────────────────────────────────────────────────────

const FDI_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
const FDI_LOWER = [31, 32, 33, 34, 35, 36, 37, 38, 48, 47, 46, 45, 44, 43, 42, 41]
const FDI_UPPER_C = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65]
const FDI_LOWER_C = [71, 72, 73, 74, 75, 85, 84, 83, 82, 81]

// ─── Finding Display Patterns ────────────────────────────────────────

interface DisplayEntry { label: string; color: string; match: (f: ToothFinding) => boolean }

const FINDING_PATTERNS: DisplayEntry[] = [
  { label: 'Dental Caries',   color: '#DC2626', match: (f) => f.condition === 'Decayed' && (!f.description || /caries|decay/i.test(f.description)) },
  { label: 'Composite Filling', color: '#3B82F6', match: (f) => f.condition === 'Restored' && f.material === 'Composite' },
  { label: 'Amalgam',         color: '#6B7280', match: (f) => f.condition === 'Restored' && f.material === 'Amalgam' },
  { label: 'RCT Completed',   color: '#9333EA', match: (f) => /rct.?completed|root.?canal.?completed|endodontically.?treated/i.test(f.description || '') },
  { label: 'RCT Required',    color: '#B91C1C', match: (f) => /rct.?required|root.?canal.?required/i.test(f.description || '') || (f.condition === 'Decayed' && /rct/i.test(f.description || '')) },
  { label: 'Calculus',        color: '#EAB308', match: (f) => /calculus|tartar|scale/i.test(f.description || '') },
  { label: 'Crown',           color: '#D97706', match: (f) => /crown|capped/i.test(f.description || '') },
  { label: 'Bridge',          color: '#14B8A6', match: (f) => f.condition === 'Bridge' || /bridge/i.test(f.description || '') },
  { label: 'Implant',         color: '#6B7280', match: (f) => f.condition === 'Implant' || /implant/i.test(f.description || '') },
  { label: 'Fracture',        color: '#000000', match: (f) => /fracture|crack|craze.?line/i.test(f.description || '') },
  { label: 'Mobility',        color: '#F97316', match: (f) => /mobility|mobile|loose/i.test(f.description || '') },
  { label: 'Tenderness',      color: '#EC4899', match: (f) => /tender|sensitive|pain.?on.?percussion/i.test(f.description || '') },
  { label: 'Missing Tooth',   color: '#4B5563', match: (f) => f.condition === 'Missing' },
  { label: 'Root Stump',      color: '#92400E', match: (f) => /root.?stump|stump|root.?remnant/i.test(f.description || '') },
  { label: 'Impacted',        color: '#F97316', match: (f) => f.condition === 'Impacted' || /impacted|unerupted|partial.?eruption/i.test(f.description || '') },
  { label: 'Erupting',        color: '#10B981', match: (f) => f.condition === 'Erupt' },
  { label: 'Denture',         color: '#8B5CF6', match: (f) => f.condition === 'Denture' || /denture|partial.?denture/i.test(f.description || '') },
  { label: 'Decayed',         color: '#DC2626', match: (f) => f.condition === 'Decayed' },
  { label: 'Restored',        color: '#3B82F6', match: (f) => f.condition === 'Restored' },
  { label: 'Defective',       color: '#D97706', match: (f) => f.condition === 'Defective' },
]

function getFindingDisplay(f: ToothFinding): { label: string; color: string } {
  for (const p of FINDING_PATTERNS) {
    if (p.match(f)) return { label: p.label, color: p.color }
  }
  return { label: f.condition, color: '#9CA3AF' }
}

const QUICK_FINDINGS = [
  'Dental Caries', 'Composite Filling', 'Amalgam', 'RCT Completed', 'RCT Required',
  'Missing', 'Crown', 'Implant', 'Bridge', 'Fracture', 'Calculus', 'Mobility',
  'Tenderness', 'Root Stump', 'Impaction',
]

const MATERIAL_OPTIONS = ['Composite', 'Amalgam', 'Gold', 'Ceramic', 'Zirconia', 'Acrylic', 'Metal', 'Porcelain']
const SURFACE_LABELS_MAP: Record<string, string> = {
  Mesial: 'M', Distal: 'D', Buccal: 'B', Lingual: 'L', Occlusal: 'O', Incisal: 'I', Labial: 'La',
}
const SURFACE_COLORS_MAP: Record<string, string> = {
  Mesial: '#F59E0B', Distal: '#8B5CF6', Buccal: '#3B82F6',
  Lingual: '#10B981', Occlusal: '#EF4444', Incisal: '#EC4899', Labial: '#6366F1',
}
const ALL_CONDITIONS: ToothCondition[] = ['Decayed', 'Restored', 'Defective', 'Missing', 'Erupt', 'Implant', 'Impacted', 'Bridge', 'Denture']

const QUICK_MAP: Record<string, { condition: ToothCondition; material?: string; description?: string }> = {
  'Dental Caries':     { condition: 'Decayed',  description: 'Dental Caries' },
  'Composite Filling': { condition: 'Restored', material: 'Composite', description: 'Composite Filling' },
  'Amalgam':           { condition: 'Restored', material: 'Amalgam',   description: 'Amalgam' },
  'RCT Completed':     { condition: 'Restored', description: 'RCT Completed' },
  'RCT Required':      { condition: 'Decayed',  description: 'RCT Required' },
  'Missing':           { condition: 'Missing' },
  'Crown':             { condition: 'Restored', description: 'Crown' },
  'Implant':           { condition: 'Implant' },
  'Bridge':            { condition: 'Bridge' },
  'Fracture':          { condition: 'Defective', description: 'Fracture' },
  'Calculus':          { condition: 'Defective', description: 'Calculus' },
  'Mobility':          { condition: 'Defective', description: 'Mobility' },
  'Tenderness':        { condition: 'Decayed',   description: 'Tenderness' },
  'Root Stump':        { condition: 'Defective', description: 'Root Stump' },
  'Impaction':         { condition: 'Impacted',  description: 'Impaction' },
}

const LEGEND_ITEMS = [
  { label: 'Dental Caries', color: '#DC2626' },
  { label: 'Composite Filling', color: '#3B82F6' },
  { label: 'Amalgam', color: '#6B7280' },
  { label: 'RCT Completed', color: '#9333EA' },
  { label: 'RCT Required', color: '#B91C1C' },
  { label: 'Missing Tooth', color: '#4B5563' },
  { label: 'Crown', color: '#D97706' },
  { label: 'Implant', color: '#6B7280' },
  { label: 'Bridge', color: '#14B8A6' },
  { label: 'Fracture', color: '#000000' },
  { label: 'Calculus', color: '#EAB308' },
  { label: 'Mobility', color: '#F97316' },
  { label: 'Tenderness', color: '#EC4899' },
  { label: 'Root Stump', color: '#92400E' },
  { label: 'Impacted', color: '#F97316' },
]

// ─── Helpers ──────────────────────────────────────────────────────────

function getToothName(num: number): string {
  const digit = num % 10
  const quad = Math.floor(num / 10)
  const arch = quad <= 2 ? 'Upper' : 'Lower'
  const side = [1, 4, 5, 8].includes(quad) ? 'Right' : 'Left'
  const names: Record<number, string> = {
    1: 'Central Incisor', 2: 'Lateral Incisor', 3: 'Canine',
    4: 'First Premolar', 5: 'Second Premolar',
    6: 'First Molar', 7: 'Second Molar', 8: 'Third Molar',
  }
  return `${arch} ${side} ${names[digit] || ''}`
}
function getQuadrant(num: number): number { return Math.floor(num / 10) }
function anonId(): string { return `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }

// ─── Tooth Box ────────────────────────────────────────────────────────

function ToothBox({ toothNum, findings, isSelected, boxSize, onClick }: {
  toothNum: number; findings: ToothFinding[]; isSelected: boolean; boxSize: number; onClick: () => void
}) {
  const tf = findings.filter((f) => f.toothNumber === toothNum)
  const displays = tf.map(getFindingDisplay)
  const isMissing = tf.some((f) => f.condition === 'Missing')
  const isImplant = tf.some((f) => f.condition === 'Implant')
  const MAX_DOTS = 4
  const visibleDots = displays.slice(0, MAX_DOTS)
  const overflow = displays.length - MAX_DOTS

  // Box background color based on findings status per spec
  let bg = '#FFFFFF'
  let border = '#E5E7EB'
  if (isSelected) {
    bg = '#EFF6FF'
    border = '#2563EB'
  } else if (isMissing) {
    bg = '#F3F4F6'
    border = '#D1D5DB'
  } else if (isImplant) {
    bg = '#F0F4F8'
    border = '#94A3B8'
  } else if (displays.length > 0) {
    // Tint based on primary finding
    const c = displays[0].color
    bg = c + '0D'
    border = c + '30'
  }

  return (
    <div
      onClick={onClick}
      title={`Tooth ${toothNum} — ${displays.map((d) => d.label).join(', ') || 'Healthy'}`}
      style={{
        width: boxSize, minWidth: boxSize, height: boxSize,
        borderRadius: 8, cursor: 'pointer',
        background: bg, border: `${isSelected ? 2 : 1}px solid ${border}`,
        boxShadow: isSelected ? '0 0 0 2px rgba(37,99,235,0.2)' : '0 1px 2px rgba(0,0,0,0.04)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 1,
        transition: 'all 0.12s',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isSelected && !isMissing) {
          e.currentTarget.style.background = '#F0F5FF'
          e.currentTarget.style.borderColor = '#93C5FD'
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = bg
          e.currentTarget.style.borderColor = border
        }
      }}
    >
      <span style={{
        fontSize: 12, fontWeight: 700, lineHeight: 1.2,
        color: isSelected ? '#2563EB' : isMissing ? '#9CA3AF' : '#374151',
      }}>
        {toothNum}
      </span>
      {displays.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 10 }}>
          {visibleDots.map((d, i) => (
            <span key={i} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: (i === MAX_DOTS - 1 && overflow > 0) ? 'transparent' : d.color,
              border: `1px solid ${d.color}`,
              flexShrink: 0,
            }} />
          ))}
          {overflow > 0 && (
            <span style={{ fontSize: 7, fontWeight: 700, color: '#6B7280', lineHeight: 1 }}>+{overflow}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Legend ────────────────────────────────────────────────────────────

function Legend({ findings }: { findings: ToothFinding[] }) {
  const activeLabels = useMemo(() => new Set(findings.map((f) => getFindingDisplay(f).label)), [findings])
  return (
    <div style={{ background: '#FFF', borderRadius: 8, border: '1px solid #E5E7EB', padding: '8px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#374151', marginBottom: 5, letterSpacing: '0.03em' }}>
        LEGEND
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {LEGEND_ITEMS.map((item) => {
          const active = activeLabels.has(item.label)
          return (
            <div key={item.label} style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 500,
              background: active ? `${item.color}12` : '#F9FAFB',
              border: `1px solid ${active ? item.color : '#E5E7EB'}`,
              color: '#374151', opacity: active ? 1 : 0.4,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
              {item.label}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Clinical Summary ─────────────────────────────────────────────────

const thS: React.CSSProperties = {
  textAlign: 'left', padding: '4px 8px', fontWeight: 600,
  borderBottom: '2px solid #E5E7EB', letterSpacing: '0.03em', whiteSpace: 'nowrap', fontSize: 10,
}
const tdS: React.CSSProperties = { padding: '3px 8px', whiteSpace: 'nowrap', fontSize: 10 }

function ClinicalSummary({ findings }: { findings: ToothFinding[] }) {
  const [search, setSearch] = useState('')
  const [remarksEdit, setRemarksEdit] = useState<Record<string, string>>({})

  const rows = useMemo(() => {
    const q = search.toLowerCase().trim()
    return findings
      .map((f) => ({ finding: f, display: getFindingDisplay(f), key: f.id }))
      .filter((r) => {
        if (!q) return true
        return (
          String(r.finding.toothNumber).includes(q) ||
          r.display.label.toLowerCase().includes(q) ||
          (r.finding.description || '').toLowerCase().includes(q)
        )
      })
      .sort((a, b) => a.finding.toothNumber - b.finding.toothNumber)
  }, [findings, search])

  return (
    <div style={{ background: '#FFF', borderRadius: 8, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
      <div style={{
        padding: '6px 12px', borderBottom: '1px solid #E5E7EB', background: '#F8FAFC',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#374151' }}>
          Clinical Summary ({findings.length} finding{findings.length !== 1 ? 's' : ''})
        </span>
        <input
          type="text" placeholder="Search tooth, finding, remarks..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '2px 8px', borderRadius: 4, border: '1px solid #D1D5DB',
            fontSize: 10, width: 180, outline: 'none', background: '#FFF',
          }}
        />
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 200 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F1F3F6', color: '#374151' }}>
              <th style={thS}>Tooth</th>
              <th style={thS}>Finding</th>
              <th style={thS}>Surface</th>
              <th style={thS}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 14, color: '#9CA3AF', fontStyle: 'italic' }}>
                {search ? 'No matching findings' : 'No findings'}
              </td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.key} style={{ borderBottom: '1px solid #F1F3F6' }}>
                <td style={{ ...tdS, fontWeight: 600 }}>#{r.finding.toothNumber}</td>
                <td style={tdS}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: r.display.color, flexShrink: 0 }} />
                    {r.display.label}
                  </span>
                </td>
                <td style={tdS}>{r.finding.surfaces?.map((s) => SURFACE_LABELS_MAP[s]).join(', ') || '—'}</td>
                <td style={tdS}>
                  <input
                    type="text"
                    value={(remarksEdit[r.key] ?? r.finding.description) || ''}
                    onChange={(e) => setRemarksEdit((p) => ({ ...p, [r.key]: e.target.value }))}
                    placeholder="Add remarks..."
                    style={{
                      border: 'none', background: 'transparent', width: '100%',
                      fontSize: 10, outline: 'none', color: '#6B7280',
                      borderBottom: '1px dotted #E5E7EB',
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Right Panel ──────────────────────────────────────────────────────

function RightPanel({ toothNum, findings, readonly, onAdd, onRemove, onClose }: {
  toothNum: number; findings: ToothFinding[]; readonly: boolean
  onAdd: (condition: ToothCondition, surfaces: ToothSurface[], material: string, description: string) => void
  onRemove: (id: string) => void; onClose: () => void
}) {
  const [surfaces, setSurfaces] = useState<ToothSurface[]>([])
  const [material, setMaterial] = useState('')
  const [description, setDescription] = useState('')
  const [condition, setCondition] = useState<ToothCondition>('Decayed')
  const [treatmentNote, setTreatmentNote] = useState('')
  const [treatmentHistory, setTreatmentHistory] = useState<{ date: string; note: string }[]>([])

  const toggleSurf = (s: ToothSurface) => {
    setSurfaces((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s])
  }

  const isPosterior = toothNum % 10 >= 4
  const allSurfaces: ToothSurface[] = isPosterior
    ? ['Mesial', 'Distal', 'Occlusal', 'Buccal', 'Lingual']
    : ['Mesial', 'Distal', 'Incisal', 'Labial', 'Lingual']

  const toothName = getToothName(toothNum)
  const quad = getQuadrant(toothNum)

  const handleQuickAdd = (label: string) => {
    const m = QUICK_MAP[label]
    if (m) onAdd(m.condition, [], m.material || '', m.description || label)
  }

  const handleAddSurfaceFinding = (c: ToothCondition) => {
    onAdd(c, surfaces, material, description)
    setSurfaces([])
    setMaterial('')
    setDescription('')
  }

  const handleAddWholeFinding = (c: ToothCondition) => {
    onAdd(c, [], '', description)
    setDescription('')
  }

  const handleAddTreatment = () => {
    if (!treatmentNote.trim()) return
    const entry = { date: new Date().toISOString().split('T')[0], note: treatmentNote.trim() }
    setTreatmentHistory((p) => [...p, entry])
    setTreatmentNote('')
  }

  const displays = useMemo(() => findings.map((f) => ({ finding: f, display: getFindingDisplay(f) })), [findings])

  return (
    <div style={{
      width: 260, flexShrink: 0, background: '#FFF', borderLeft: '1px solid #E5E7EB',
      display: 'flex', flexDirection: 'column', overflowY: 'auto', fontSize: 11,
    }}>
      {/* Panel header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #E5E7EB', background: '#F8FAFC' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>#{toothNum}</span>
              <span style={{ fontSize: 10, color: '#6B7280' }}>{toothName}</span>
            </div>
            <div style={{ fontSize: 9, color: '#9CA3AF' }}>Quadrant {quad} · {isPosterior ? 'Posterior' : 'Anterior'}</div>
          </div>
          <button onClick={onClose} style={{
            width: 22, height: 22, borderRadius: '50%', border: '1px solid #E5E7EB',
            background: '#FFF', cursor: 'pointer', fontSize: 11, color: '#6B7280',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>
      </div>

      {/* Current findings */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #E5E7EB' }}>
        <div style={{ fontSize: 9, fontWeight: 600, color: '#374151', marginBottom: 5, letterSpacing: '0.03em' }}>
          FINDINGS ({findings.length})
        </div>
        {findings.length === 0 ? (
          <div style={{ fontSize: 10, color: '#9CA3AF', fontStyle: 'italic' }}>No findings for this tooth</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 130, overflowY: 'auto' }}>
            {displays.map(({ finding, display: d }) => (
              <div key={finding.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '2px 6px', borderRadius: 4, background: `${d.color}10`,
                borderLeft: `2px solid ${d.color}`,
              }}>
                <div style={{ fontSize: 10, lineHeight: 1.3 }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{d.label}</span>
                  {finding.surfaces && finding.surfaces.length > 0 && (
                    <span style={{ color: '#6B7280', fontSize: 9 }}> ({finding.surfaces.map((s) => SURFACE_LABELS_MAP[s]).join(',')})</span>
                  )}
                </div>
                {!readonly && (
                  <button onClick={() => onRemove(finding.id)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444',
                    fontSize: 11, padding: 0, flexShrink: 0, marginLeft: 3,
                  }}>✕</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick finding chips */}
      {!readonly && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: '#374151', marginBottom: 5, letterSpacing: '0.03em' }}>QUICK FINDINGS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {QUICK_FINDINGS.map((label) => {
              const chipColor = FINDING_PATTERNS.find((p) => p.label === label)?.color || '#6B7280'
              return (
                <button key={label} onClick={() => handleQuickAdd(label)} style={{
                  fontSize: 8, fontWeight: 500, padding: '1px 5px', borderRadius: 3,
                  border: `1px solid ${chipColor}40`,
                  background: '#FFF', color: chipColor, cursor: 'pointer',
                  whiteSpace: 'nowrap', lineHeight: '16px',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = chipColor + '15' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#FFF' }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Add finding form */}
      {!readonly && (
        <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4, borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: '#374151', letterSpacing: '0.03em' }}>ADD FINDING</div>

          <div>
            <div style={{ fontSize: 8, color: '#6B7280', marginBottom: 1 }}>Condition</div>
            <select value={condition} onChange={(e) => setCondition(e.target.value as ToothCondition)} style={inpS}>
              {ALL_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 8, color: '#6B7280', marginBottom: 1 }}>Surfaces</div>
            <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {allSurfaces.map((s) => (
                <button key={s} onClick={() => toggleSurf(s)} style={{
                  width: 24, height: 22, fontSize: 8, fontWeight: 600, borderRadius: 3,
                  border: `1px solid ${surfaces.includes(s) ? SURFACE_COLORS_MAP[s] : '#D1D5DB'}`,
                  background: surfaces.includes(s) ? SURFACE_COLORS_MAP[s] : '#FFF',
                  color: surfaces.includes(s) ? '#FFF' : '#6B7280', cursor: 'pointer',
                }}>{SURFACE_LABELS_MAP[s]}</button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 8, color: '#6B7280', marginBottom: 1 }}>Material</div>
            <select value={material} onChange={(e) => setMaterial(e.target.value)} style={inpS}>
              <option value="">None</option>
              {MATERIAL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <input type="text" placeholder="Clinical notes..." value={description}
            onChange={(e) => setDescription(e.target.value)} style={inpS} />

          <div style={{ display: 'flex', gap: 3 }}>
            <button onClick={() => {
              if (['Missing', 'Implant', 'Impacted', 'Bridge', 'Denture'].includes(condition)) {
                handleAddWholeFinding(condition)
              } else if (surfaces.length > 0) {
                handleAddSurfaceFinding(condition)
              } else {
                handleAddWholeFinding(condition)
              }
            }} style={{
              flex: 1, padding: '5px', borderRadius: 4, border: 'none',
              background: '#2563EB', color: '#FFF', fontSize: 9, fontWeight: 600, cursor: 'pointer',
            }}>
              + Add {condition}
            </button>
          </div>
        </div>
      )}

      {/* Treatment History */}
      <div style={{ padding: '8px 12px', flex: 1 }}>
        <div style={{ fontSize: 9, fontWeight: 600, color: '#374151', marginBottom: 5, letterSpacing: '0.03em' }}>
          TREATMENT HISTORY
        </div>
        {treatmentHistory.length === 0 && findings.length === 0 ? (
          <div style={{ fontSize: 10, color: '#9CA3AF', fontStyle: 'italic' }}>No treatment recorded</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 120, overflowY: 'auto', marginBottom: 6 }}>
            {treatmentHistory.map((t, i) => (
              <div key={i} style={{
                fontSize: 9, color: '#374151', padding: '2px 6px',
                background: '#F9FAFB', borderRadius: 3, borderLeft: '2px solid #3B82F6',
              }}>
                <span style={{ color: '#6B7280', fontWeight: 600 }}>{t.date}</span> {t.note}
              </div>
            ))}
            {displays.map(({ finding, display: d }) => (
              <div key={finding.id} style={{
                fontSize: 9, color: '#374151', padding: '2px 6px',
                background: '#F9FAFB', borderRadius: 3, borderLeft: `2px solid ${d.color}`,
              }}>
                <span style={{ color: '#6B7280', fontWeight: 600 }}>{finding.date}</span>{' '}
                {d.label}{finding.description && d.label !== finding.description ? ` — ${finding.description}` : ''}
              </div>
            ))}
          </div>
        )}
        {!readonly && (
          <div style={{ display: 'flex', gap: 3 }}>
            <input type="text" placeholder="Add treatment note..."
              value={treatmentNote}
              onChange={(e) => setTreatmentNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddTreatment() }}
              style={{ flex: 1, padding: '2px 6px', borderRadius: 3, border: '1px solid #D1D5DB', fontSize: 10, outline: 'none' }}
            />
            <button onClick={handleAddTreatment} style={{
              padding: '2px 8px', borderRadius: 3, border: 'none',
              background: '#2563EB', color: '#FFF', fontSize: 9, fontWeight: 600, cursor: 'pointer',
            }}>Add</button>
          </div>
        )}
      </div>
    </div>
  )
}

const inpS: React.CSSProperties = {
  width: '100%', padding: '3px 6px', borderRadius: 4, border: '1px solid #D1D5DB',
  fontSize: 10, color: '#374151', background: '#FFF', outline: 'none',
}

// ─── Mock Data ────────────────────────────────────────────────────────

const MOCK_FINDINGS: ToothFinding[] = [
  { id: 'm1', toothNumber: 16, condition: 'Decayed', surfaces: ['Occlusal'], description: 'Dental Caries', date: '2026-06-15' },
  { id: 'm2', toothNumber: 26, condition: 'Restored', surfaces: ['Mesial'], material: 'Composite', description: 'Composite Filling', date: '2024-03-10' },
  { id: 'm3', toothNumber: 36, condition: 'Missing', date: '2023-11-20' },
  { id: 'm4', toothNumber: 46, condition: 'Restored', surfaces: ['Occlusal'], material: 'Amalgam', description: 'Amalgam', date: '2025-01-22' },
  { id: 'm5', toothNumber: 14, condition: 'Restored', description: 'RCT Completed', date: '2026-07-01' },
  { id: 'm6', toothNumber: 18, condition: 'Decayed', description: 'RCT Required', date: '2026-02-14' },
  { id: 'm7', toothNumber: 13, condition: 'Defective', description: 'Calculus', date: '2026-06-20' },
  { id: 'm8', toothNumber: 37, condition: 'Restored', description: 'Crown', date: '2025-08-12' },
  { id: 'm9', toothNumber: 22, condition: 'Bridge', date: '2024-09-05' },
  { id: 'm10', toothNumber: 45, condition: 'Implant', date: '2025-06-15' },
  { id: 'm11', toothNumber: 11, condition: 'Defective', description: 'Fracture', date: '2026-04-18' },
  { id: 'm12', toothNumber: 31, condition: 'Defective', description: 'Mobility', date: '2026-07-01' },
  { id: 'm13', toothNumber: 17, condition: 'Decayed', description: 'Tenderness', date: '2026-06-28' },
  { id: 'm14', toothNumber: 47, condition: 'Defective', description: 'Root Stump', date: '2025-12-01' },
  { id: 'm15', toothNumber: 24, condition: 'Impacted', description: 'Impaction', date: '2026-06-10' },
]

// ─── Main Component ───────────────────────────────────────────────────

export { FINDING_PATTERNS as FINDING_DISPLAY, LEGEND_ITEMS, ALL_CONDITIONS, getFindingDisplay }

export default function ProfessionalOdontogram(props: Props) {
  // Use a ref to track the latest findings so callbacks never get stale
  const findingsRef = useRef(props.findings)
  findingsRef.current = props.findings

  const [localFindings, setLocalFindings] = useState<ToothFinding[]>(MOCK_FINDINGS)
  const [isChild, setIsChild] = useState(false)
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null)

  const boxSize = useResponsiveBoxSize()
  const readonly = props.readonly ?? false
  const upperTeeth = isChild ? FDI_UPPER_C : FDI_UPPER
  const lowerTeeth = isChild ? FDI_LOWER_C : FDI_LOWER

  // emitChange always reads from the ref so it's stable
  const emitChange = (updated: ToothFinding[]) => {
    if (props.findings === undefined) setLocalFindings(updated)
    props.onFindingsChange(updated)
  }

  // addFinding reads from ref.current for the latest findings
  const addFinding = (
    condition: ToothCondition,
    surfaces: ToothSurface[],
    material: string,
    description: string,
  ) => {
    if (readonly || selectedTooth === null) return
    const current = findingsRef.current
    const nf: ToothFinding = {
      id: anonId(),
      toothNumber: selectedTooth,
      condition,
      surfaces: surfaces.length > 0 ? surfaces : undefined,
      material: material || undefined,
      description: description || undefined,
      date: new Date().toISOString().split('T')[0],
    }
    emitChange([...current, nf])
  }

  const removeFinding = (id: string) => {
    if (readonly) return
    const current = findingsRef.current
    emitChange(current.filter((f) => f.id !== id))
  }

  const findings = props.findings ?? localFindings
  const selectedFindings = findings.filter((f) => f.toothNumber === selectedTooth)

  function renderArch(teeth: number[], label: string, boxSize: number) {
    const mid = teeth.length / 2
    const left = teeth.slice(0, mid)
    const right = teeth.slice(mid)

    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{
          fontSize: 8, color: '#9CA3AF', textAlign: 'center', marginBottom: 5,
          letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600,
        }}>
          {label}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {left.map((n) => (
              <ToothBox key={n} toothNum={n} findings={findings} boxSize={boxSize}
                isSelected={selectedTooth === n}
                onClick={() => setSelectedTooth(n === selectedTooth ? null : n)} />
            ))}
          </div>
          <div style={{
            width: 12, textAlign: 'center', color: '#D1D5DB',
            fontSize: 11, fontWeight: 300, lineHeight: `${boxSize}px`,
          }}>|</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {right.map((n) => (
              <ToothBox key={n} toothNum={n} findings={findings} boxSize={boxSize}
                isSelected={selectedTooth === n}
                onClick={() => setSelectedTooth(n === selectedTooth ? null : n)} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      fontFamily: 'Inter, system-ui, sans-serif',
      display: 'flex', minHeight: 380, borderRadius: 8,
      overflow: 'hidden', border: '1px solid #E5E7EB', background: '#FFF',
    }}>
      {/* Left: Chart Area */}
      <div style={{ flex: 1, minWidth: 0, background: '#F8FAFC', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px', background: '#FFF', borderBottom: '1px solid #E5E7EB', flexWrap: 'wrap', gap: 5,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Clinical Findings</div>
            <div style={{ fontSize: 9, color: '#6B7280', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {props.patientName && <span>Patient: {props.patientName}</span>}
              {props.opNumber && <span>OP: {props.opNumber}</span>}
              {props.doctorName && <span>Dr. {props.doctorName}</span>}
              {props.visitDate && <span>{props.visitDate}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600,
              background: isChild ? '#FEF3C7' : '#DBEAFE', color: isChild ? '#92400E' : '#1E40AF',
            }}>{isChild ? 'Primary' : 'Permanent'}</span>
            <button onClick={() => { setIsChild(!isChild); setSelectedTooth(null) }} style={chipS}>
              {isChild ? 'Adult' : 'Child'}
            </button>
            <button onClick={() => window.print()} style={chipS}>Print</button>
          </div>
        </div>

        {/* Chart */}
        <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
          <div style={{
            background: '#FFF', borderRadius: 8, border: '1px solid #E5E7EB',
            padding: '12px 10px 8px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}>
            {renderArch(upperTeeth, isChild ? 'Upper Arch (Maxillary — Primary)' : 'Upper Arch (Maxillary — Permanent)', boxSize)}
            <div style={{ borderTop: '1px dashed #D1D5DB', margin: '0 20px 6px' }} />
            {renderArch(lowerTeeth, isChild ? 'Lower Arch (Mandibular — Primary)' : 'Lower Arch (Mandibular — Permanent)', boxSize)}
          </div>

          <div style={{ textAlign: 'center', fontSize: 8, color: '#9CA3AF', marginTop: 5, marginBottom: 8 }}>
            {findings.length} finding{findings.length !== 1 ? 's' : ''} · {isChild ? 'Primary' : 'Permanent'} dentition
            {selectedTooth !== null && <> · Selected: #{selectedTooth} — {getToothName(selectedTooth)}</>}
          </div>

          <div style={{ marginBottom: 6 }}>
            <Legend findings={findings} />
          </div>
          <ClinicalSummary findings={findings} />
        </div>
      </div>

      {/* Right Panel */}
      {selectedTooth !== null && (
        <RightPanel
          toothNum={selectedTooth}
          findings={selectedFindings}
          readonly={!!readonly}
          onAdd={addFinding}
          onRemove={removeFinding}
          onClose={() => setSelectedTooth(null)}
        />
      )}
    </div>
  )
}

const chipS: React.CSSProperties = {
  padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 500,
  border: '1px solid #E5E7EB', background: '#FFF', color: '#374151',
  cursor: 'pointer', whiteSpace: 'nowrap',
}
