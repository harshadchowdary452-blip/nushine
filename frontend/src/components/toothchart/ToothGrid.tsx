import React, { useState, useCallback, useMemo } from 'react'
import {
  type ToothFinding,
  type ToothCondition,
  type ToothSurface,
  type FindingFormData,
  type ToothChartProps,
  CONDITION_COLORS,
  MOCK_FINDINGS,
  ALL_CONDITIONS,
  CONDITION_LABELS,
  SURFACE_LABELS,
  TOOTH_NAMES,
  MATERIAL_OPTIONS,
} from './types'

// Universal 1-32 adult, A1-T2 primary (using sequential numbers for display)
const ADULT_UPPER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
const ADULT_LOWER = [32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17]
const CHILD_UPPER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
const CHILD_LOWER = ['T', 'S', 'R', 'Q', 'P', 'O', 'N', 'M', 'L', 'K']

export { type ToothFinding } from './types'
export { MOCK_FINDINGS } from './types'
export { CONDITION_COLORS, CONDITION_LABELS, SURFACE_LABELS, TOOTH_NAMES } from './types'

const BOX_SIZE = 58
const BOX_GAP = 4

const SURFACE_BTN_COLORS: Record<string, string> = {
  Mesial: '#F59E0B',
  Distal: '#8B5CF6',
  Buccal: '#3B82F6',
  Lingual: '#10B981',
  Occlusal: '#EF4444',
  Incisal: '#EC4899',
  Labial: '#6366F1',
  Palatal: '#14B8A6',
}

function displayId(n: number | string): string {
  return String(n)
}

function getPrimaryCondition(findings: ToothFinding[], toothId: number | string): ToothCondition | null {
  const id = Number(toothId)
  const wholeTooth: ToothCondition[] = ['Missing', 'Implant', 'Impacted', 'Bridge', 'Denture']
  for (const w of wholeTooth) {
    if (findings.some((f) => f.toothNumber === id && f.condition === w)) return w
  }
  const ranked: ToothCondition[] = ['Decayed', 'Defective', 'Erupt', 'Restored']
  for (const r of ranked) {
    if (findings.some((f) => f.toothNumber === id && f.condition === r)) return r
  }
  return null
}

export default function ToothGrid({
  findings: externalFindings,
  onFindingsChange,
  patientName,
  readonly: extReadonly,
}: ToothChartProps) {
  const [localFindings, setLocalFindings] = useState<ToothFinding[]>(MOCK_FINDINGS)
  const [isChild, setIsChild] = useState(false)
  const [selectedId, setSelectedId] = useState<number | string | null>(null)
  const [selectedSurface, setSelectedSurface] = useState<string | null>(null)
  const [undoStack, setUndoStack] = useState<ToothFinding[][]>([])

  const findings = externalFindings ?? localFindings
  const readonly = extReadonly ?? false
  const upperTeeth = isChild ? CHILD_UPPER : ADULT_UPPER
  const lowerTeeth = isChild ? CHILD_LOWER : ADULT_LOWER

  const emitChange = useCallback(
    (updated: ToothFinding[]) => {
      if (externalFindings === undefined) setLocalFindings(updated)
      onFindingsChange(updated)
    },
    [externalFindings, onFindingsChange]
  )

  const getFindingsFor = useCallback(
    (id: number | string) => findings.filter((f) => f.toothNumber === Number(id)),
    [findings]
  )

  const [newCondition, setNewCondition] = useState<ToothCondition>('Decayed')
  const [newSurfaces, setNewSurfaces] = useState<ToothSurface[]>([])
  const [newMaterial, setNewMaterial] = useState('')
  const [newDescription, setNewDescription] = useState('')

  const toggleSurface = (s: ToothSurface) => {
    setNewSurfaces((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))
  }

  const addFinding = () => {
    if (readonly || selectedId === null) return
    const id = Number(selectedId)
    setUndoStack((p) => [...p, [...findings]])
    const wholeTooth: ToothCondition[] = ['Missing', 'Implant', 'Impacted', 'Bridge', 'Denture', 'Erupt']
    const isWhole = wholeTooth.includes(newCondition)
    const nf: ToothFinding = {
      id: `f-${Date.now()}`,
      toothNumber: id,
      condition: newCondition,
      surfaces: isWhole ? undefined : (newSurfaces.length > 0 ? newSurfaces : undefined),
      material: isWhole ? undefined : newMaterial || undefined,
      description: newDescription || undefined,
      date: new Date().toISOString().split('T')[0],
    }
    emitChange([...findings, nf])
    setNewSurfaces([])
    setNewMaterial('')
    setNewDescription('')
  }

  const removeFinding = (fid: string) => {
    if (readonly) return
    setUndoStack((p) => [...p, [...findings]])
    emitChange(findings.filter((f) => f.id !== fid))
  }

  const handleUndo = () => {
    if (undoStack.length === 0 || readonly) return
    const prev = undoStack[undoStack.length - 1]
    setUndoStack((s) => s.slice(0, -1))
    emitChange(prev)
  }

  const selectedFindings = selectedId !== null ? getFindingsFor(selectedId) : []
  const selectedNum = selectedId !== null ? Number(selectedId) : null
  const selectedName = selectedNum ? TOOTH_NAMES[selectedNum] : ''

  const showSurfaces = !['Missing', 'Implant', 'Impacted', 'Bridge', 'Denture', 'Erupt'].includes(newCondition)

  function renderArch(teeth: (number | string)[], label: string) {
    return (
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 10, color: '#9CA3AF', textAlign: 'center', marginBottom: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: BOX_GAP }}>
          {teeth.map((id) => {
            const tf = getFindingsFor(id)
            const primary = getPrimaryCondition(tf, id)
            const isSelected = selectedId === id
            const bg = primary ? (CONDITION_COLORS[primary] + '30') : '#F5F0E8'
            const border = primary ? CONDITION_COLORS[primary] : '#E5E7EB'
            return (
              <div
                key={id}
                onClick={() => { setSelectedId(id); setSelectedSurface(null) }}
                style={{
                  width: BOX_SIZE,
                  height: BOX_SIZE,
                  borderRadius: 6,
                  background: bg,
                  border: `${isSelected ? 2 : 1}px solid ${isSelected ? '#2563EB' : border}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.15s',
                  boxShadow: isSelected ? '0 0 0 2px rgba(37,99,235,0.2)' : 'none',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: primary ? '#1F2937' : '#6B7280', lineHeight: 1 }}>
                  {displayId(id)}
                </span>
                {tf.length > 0 && !primary?.match(/Missing|Implant|Denture/) && (
                  <div style={{ display: 'flex', gap: 2, marginTop: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {tf.slice(0, 3).map((f) => (
                      <span
                        key={f.id}
                        style={{ width: 6, height: 6, borderRadius: '50%', background: CONDITION_COLORS[f.condition] || '#999' }}
                      />
                    ))}
                    {tf.length > 3 && <span style={{ fontSize: 7, color: '#9CA3AF' }}>+{tf.length - 3}</span>}
                  </div>
                )}
                {primary === 'Missing' && (
                  <span style={{ fontSize: 8, color: '#EF4444', fontWeight: 600, marginTop: 1 }}>X</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', minHeight: 400 }}>
      <div style={{ flex: 1, minWidth: 0, background: '#F8FAFC', padding: 16 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Clinical Findings — Tooth Chart</div>
            {patientName && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>Patient: {patientName}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
              background: isChild ? '#FEF3C7' : '#DBEAFE',
              color: isChild ? '#92400E' : '#1E40AF',
            }}>
              {isChild ? 'Primary' : 'Permanent'}
            </span>
            <button onClick={() => setIsChild(!isChild)} style={{
              padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 500,
              border: '1px solid #E5E7EB', background: '#FFF', color: '#374151', cursor: 'pointer',
            }}>
              {isChild ? 'Switch to Adult' : 'Switch to Child'}
            </button>
            <button onClick={handleUndo} disabled={undoStack.length === 0 || readonly} style={{
              padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 500,
              border: '1px solid #E5E7EB', background: '#FFF',
              color: undoStack.length > 0 ? '#374151' : '#D1D5DB', cursor: undoStack.length > 0 ? 'pointer' : 'default',
            }}>
              Undo
            </button>
            <button onClick={() => window.print()} style={{
              padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 500,
              border: '1px solid #E5E7EB', background: '#FFF', color: '#374151', cursor: 'pointer',
            }}>
              Print
            </button>
          </div>
        </div>

        {/* Chart */}
        <div style={{
          background: '#FFF', borderRadius: 10, border: '1px solid #E5E7EB',
          padding: '16px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          {renderArch(upperTeeth, 'Upper Arch (Maxillary)')}
          <div style={{ borderTop: '1px dashed #E5E7EB', margin: '8px 40px' }} />
          {renderArch(lowerTeeth, 'Lower Arch (Mandibular)')}
        </div>

        {/* Findings count */}
        <div style={{ textAlign: 'center', fontSize: 10, color: '#9CA3AF', marginTop: 8 }}>
          {findings.length} finding{findings.length !== 1 ? 's' : ''} · {new Set(findings.map((f) => f.toothNumber)).size} teeth affected
        </div>
      </div>

      {/* Right Panel */}
      {selectedId !== null && !readonly && (
        <div style={{
          width: 280, flexShrink: 0, background: '#FFF', borderLeft: '1px solid #E5E7EB',
          display: 'flex', flexDirection: 'column', overflowY: 'auto',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #E5E7EB', background: '#F8FAFC' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>#{displayId(selectedId)}</span>
                {selectedName && <span style={{ fontSize: 11, color: '#6B7280', marginLeft: 6 }}>{selectedName}</span>}
              </div>
              <button onClick={() => setSelectedId(null)} style={{
                width: 24, height: 24, borderRadius: '50%', border: '1px solid #E5E7EB',
                background: '#FFF', cursor: 'pointer', fontSize: 12, color: '#6B7280', lineHeight: 1,
              }}>✕</button>
            </div>
          </div>

          {/* Current Findings */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#374151', marginBottom: 6, letterSpacing: '0.02em' }}>
              FINDINGS ({selectedFindings.length})
            </div>
            {selectedFindings.length === 0 ? (
              <div style={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' }}>No findings</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 150, overflowY: 'auto' }}>
                {selectedFindings.map((f) => (
                  <div key={f.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '3px 8px', borderRadius: 4, background: (CONDITION_COLORS[f.condition] || '#999') + '12',
                    borderLeft: `3px solid ${CONDITION_COLORS[f.condition] || '#999'}`,
                  }}>
                    <div style={{ fontSize: 11, color: '#374151' }}>
                      <span style={{ fontWeight: 600 }}>{f.condition}</span>
                      {f.surfaces && f.surfaces.length > 0 && (
                        <span style={{ color: '#6B7280', marginLeft: 3 }}>
                          ({f.surfaces.map((s) => SURFACE_LABELS[s]).join(',')})
                        </span>
                      )}
                      {f.description && <span style={{ color: '#9CA3AF', marginLeft: 3 }}>— {f.description}</span>}
                    </div>
                    <button onClick={() => removeFinding(f.id)} style={{
                      background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 12, padding: '0 4px',
                    }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Finding */}
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#374151', letterSpacing: '0.02em' }}>ADD FINDING</div>

            <select value={newCondition} onChange={(e) => setNewCondition(e.target.value as ToothCondition)} style={is}>
              {ALL_CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABELS[c]}</option>)}
            </select>

            {showSurfaces && (
              <div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {(['Mesial', 'Distal', 'Buccal', 'Lingual', 'Occlusal', 'Incisal'] as ToothSurface[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => toggleSurface(s)}
                      style={{
                        width: 30, height: 28, fontSize: 9, fontWeight: 600,
                        borderRadius: 4, border: `1px solid ${newSurfaces.includes(s) ? SURFACE_BTN_COLORS[s] : '#D1D5DB'}`,
                        background: newSurfaces.includes(s) ? SURFACE_BTN_COLORS[s] : '#FFF',
                        color: newSurfaces.includes(s) ? '#FFF' : '#6B7280',
                        cursor: 'pointer',
                      }}
                    >{SURFACE_LABELS[s]}</button>
                  ))}
                </div>
              </div>
            )}

            {showSurfaces && (
              <select value={newMaterial} onChange={(e) => setNewMaterial(e.target.value)} style={is}>
                <option value="">No material</option>
                {MATERIAL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            )}

            <input type="text" placeholder="Notes..." value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              style={{ ...is, marginBottom: 0 }} />

            <button onClick={addFinding} style={{
              width: '100%', padding: '7px', borderRadius: 6, border: 'none',
              background: '#3B82F6', color: '#FFF', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>+ Add Finding</button>
          </div>
        </div>
      )}
    </div>
  )
}

const is: React.CSSProperties = {
  width: '100%', padding: '5px 8px', borderRadius: 5, border: '1px solid #D1D5DB',
  fontSize: 11, color: '#374151', background: '#FFF', outline: 'none', marginBottom: 4,
}
