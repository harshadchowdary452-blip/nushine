import React, { useRef, useEffect, useState, useMemo } from 'react'
import { X, Pencil } from 'lucide-react'
import type { ToothFinding } from './types'
import {
  FINDING_TYPES, QUICK_FINDINGS,
  getFindingColor, getFindingLabel,
} from './findingConfig'

interface Props {
  findings: ToothFinding[]
  onFindingsChange: (findings: ToothFinding[]) => void
  patientName?: string
  opNumber?: string
  doctorName?: string
  visitDate?: string
  readonly?: boolean
  patientDateOfBirth?: string
}

// ─── Responsive box size ──────────────────────────────────────────────

function useBoxSize(): number {
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

// ─── FDI numbering ────────────────────────────────────────────────────

const FDI_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
const FDI_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]
const FDI_UPPER_C = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65]
const FDI_LOWER_C = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75]

// ─── Helpers ──────────────────────────────────────────────────────────

function toothName(n: number): string {
  const d = n % 10, q = Math.floor(n / 10)
  const arch = q <= 2 ? 'Upper' : 'Lower'
  const side = [1, 4, 5, 8].includes(q) ? 'Right' : 'Left'
  const names: Record<number, string> = { 1:'Central Incisor', 2:'Lateral Incisor', 3:'Canine', 4:'First Premolar', 5:'Second Premolar', 6:'First Molar', 7:'Second Molar', 8:'Third Molar' }
  return `${arch} ${side} ${names[d] || ''}`
}
function quad(n: number): number { return Math.floor(n / 10) }
function uid(): string { return `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }

function findingLabel(f: ToothFinding): string {
  return f.findingType || f.originalFindingType || f.condition
}

function findingColor(f: ToothFinding): string {
  return getFindingColor(findingLabel(f))
}

// ─── ToothBox ─────────────────────────────────────────────────────────

function ToothBox({ n, findings, sel, sz, onClick }: {
  n: number; findings: ToothFinding[]; sel: boolean; sz: number; onClick: () => void
}) {
  const tf = findings.filter((f) => f.toothNumber === n)
  const max = 4
  const miss = tf.some((f) => f.condition === 'Missing')
  const impl = tf.some((f) => f.condition === 'Implant')

  let bg = 'var(--ds-surface)', bd = 'var(--ds-border)'
  if (sel) { bg = 'var(--ds-primary-50)'; bd = 'var(--ds-primary-500)' }
  else if (miss) { bg = 'var(--ds-neutral-100)'; bd = 'var(--ds-neutral-300)' }
  else if (impl) { bg = 'var(--ds-info-50)'; bd = 'var(--ds-neutral-400)' }
  else if (tf.length) { const c = findingColor(tf[0]); bg = `color-mix(in srgb, ${c} 5%, transparent)`; bd = `color-mix(in srgb, ${c} 19%, transparent)` }

  const dots = tf.slice(0, max).map((f) => ({ label: findingLabel(f), color: findingColor(f) }))
  const over = tf.length - max

  return (
    <div
      onClick={onClick}
      title={`Tooth ${n} — ${tf.map((f) => findingLabel(f)).join(', ') || 'Healthy'}`}
      style={{
        width: sz, minWidth: sz, height: sz, borderRadius: 8, cursor: 'pointer',
        background: bg, border: `${sel ? 2 : 1}px solid ${bd}`,
        boxShadow: sel ? '0 0 0 2px var(--ds-primary-200)' : 'none',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 1, transition: 'all 0.12s', userSelect: 'none',
      }}
      onMouseEnter={(e) => { if (!sel && !miss) { e.currentTarget.style.background = 'var(--ds-primary-50)'; e.currentTarget.style.borderColor = 'var(--ds-primary-300)' } }}
      onMouseLeave={(e) => { if (!sel) { e.currentTarget.style.background = bg; e.currentTarget.style.borderColor = bd } }}
    >
      <span style={{ fontSize: Math.max(10, sz * 0.27), fontWeight: 700, lineHeight: 1.2,
        color: sel ? 'var(--ds-primary-500)' : miss ? 'var(--ds-neutral-400)' : 'var(--ds-text)' }}>{n}</span>
      {tf.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 10 }}>
          {dots.map((d, i) => (
            <span key={i} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: (i === max - 1 && over > 0) ? 'transparent' : d.color,
              border: `1px solid ${d.color}`, flexShrink: 0,
            }} />
          ))}
          {over > 0 && <span style={{ fontSize: 7, fontWeight: 700, color: 'var(--ds-text-secondary)' }}>+{over}</span>}
        </div>
      )}
    </div>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────

function Legend({ findings }: { findings: ToothFinding[] }) {
  const active = useMemo(() => new Set(findings.map((f) => findingLabel(f))), [findings])
  return (
    <div style={{ background: 'var(--ds-surface)', borderRadius: 8, border: '1px solid #E5E7EB', padding: '8px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ds-text)', marginBottom: 5, letterSpacing: '0.03em' }}>LEGEND</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {FINDING_TYPES.map((item) => {
          const a = active.has(item.name)
          return (
            <div key={item.name} style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 500,
              background: a ? `${item.color}12` : 'var(--ds-background-subtle)',
              border: `1px solid ${a ? item.color : 'var(--ds-border)'}`,
              color: 'var(--ds-text)', opacity: a ? 1 : 0.4,
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

function Summary({ findings, onUpdate }: { findings: ToothFinding[]; onUpdate?: (updated: ToothFinding[]) => void }) {
  const [q, setQ] = useState('')
  const [rem, setRem] = useState<Record<string, string>>({})

  const commitRemark = (id: string) => {
    if (!onUpdate) return
    const val = rem[id]
    if (val === undefined) return
    const updated = findings.map(f =>
      f.id === id ? { ...f, description: val || undefined } : f
    )
    onUpdate(updated)
  }

  const rows = useMemo(() => {
    const ql = q.toLowerCase().trim()
    return findings
      .map((f) => ({ f, label: findingLabel(f), color: findingColor(f), k: f.id }))
      .filter((r) => !ql || String(r.f.toothNumber).includes(ql) || r.label.toLowerCase().includes(ql) || (r.f.description || '').toLowerCase().includes(ql))
      .sort((a, b) => a.f.toothNumber - b.f.toothNumber)
  }, [findings, q])

  return (
    <div style={{ background: 'var(--ds-surface)', borderRadius: 8, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
      <div style={{
        padding: '6px 12px', borderBottom: '1px solid #E5E7EB', background: 'var(--ds-background-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ds-text)' }}>
          Clinical Summary ({findings.length} finding{findings.length !== 1 ? 's' : ''})
        </span>
          <input type="text" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
            style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #D1D5DB', fontSize: 10, width: 160, outline: 'none', background: 'var(--ds-surface)' }} />
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 200 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--ds-surface-secondary)', color: 'var(--ds-text)' }}>
              {['Tooth', 'Finding', 'Surface', 'Remarks'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, borderBottom: '2px solid #E5E7EB', letterSpacing: '0.03em', whiteSpace: 'nowrap', fontSize: 10 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 14, color: 'var(--ds-text-tertiary)', fontStyle: 'italic' }}>{q ? 'No matches' : 'No findings'}</td></tr>
            ) : rows.map((r) => (
              <tr key={r.k} style={{ borderBottom: '1px solid var(--ds-border-light)' }}>
                <td style={{ padding: '3px 8px', whiteSpace: 'nowrap', fontSize: 10, fontWeight: 600 }}>#{r.f.toothNumber}</td>
                <td style={{ padding: '3px 8px', whiteSpace: 'nowrap', fontSize: 10 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
                    {r.label}
                  </span>
                </td>
                <td style={{ padding: '3px 8px', whiteSpace: 'nowrap', fontSize: 10 }}>{r.f.surfaces?.map((s) => SURF_LABEL[s]).join(', ') || '—'}</td>
                <td style={{ padding: '3px 8px', whiteSpace: 'nowrap', fontSize: 10 }}>
                  <input type="text" value={(rem[r.k] ?? r.f.description) || ''}
                    onChange={(e) => setRem((p) => ({ ...p, [r.k]: e.target.value }))}
                    onBlur={() => commitRemark(r.k)}
                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                    placeholder="Add remarks..."
                    style={{ border: 'none', background: 'transparent', width: '100%', fontSize: 10, outline: 'none', color: 'var(--ds-text-secondary)', borderBottom: '1px dotted #E5E7EB' }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const SURF_LABEL: Record<string, string> = { Mesial: 'M', Distal: 'D', Buccal: 'B', Lingual: 'L', Occlusal: 'O', Incisal: 'I', Labial: 'La' }

// ─── Right Panel ──────────────────────────────────────────────────────

function RightPanel({ n, fings, ro, onAdd, onRemove, onUpdateFinding, onClose }: {
  n: number; fings: ToothFinding[]; ro: boolean
  onAdd: (ft: string, desc: string) => void
  onRemove: (id: string) => void
  onUpdateFinding: (id: string, updates: Partial<ToothFinding>) => void
  onClose: () => void
}) {
  const [findingType, setFindingType] = useState('')
  const [desc, setDesc] = useState('')
  const [editId, setEditId] = useState<string | null>(null)

  const handleAdd = () => {
    if (!findingType) return
    onAdd(findingType, desc)
    setFindingType('')
    setDesc('')
  }

  const handleQuick = (label: string) => {
    onAdd(label, desc)
    setDesc('')
  }

  const disps = useMemo(() => fings.map((f) => ({ f, label: findingLabel(f), color: findingColor(f) })), [fings])

  const startEdit = (f: ToothFinding) => {
    setEditId(f.id)
    setFindingType(f.findingType || '')
    setDesc(f.description || '')
  }

  const saveEdit = () => {
    if (!editId) return
    if (!findingType) return
    onUpdateFinding(editId, {
      findingType,
      description: desc || undefined,
    })
    setEditId(null)
    setFindingType('')
    setDesc('')
  }

  const cancelEdit = () => {
    setEditId(null)
    setFindingType('')
    setDesc('')
  }

  return (
    <div style={{
      width: 260, flexShrink: 0, background: 'var(--ds-surface)', borderLeft: '1px solid #E5E7EB',
      display: 'flex', flexDirection: 'column', overflowY: 'auto', fontSize: 11,
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #E5E7EB', background: 'var(--ds-background-subtle)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ds-text)' }}>#{n}</span>
              <span style={{ fontSize: 10, color: 'var(--ds-text-secondary)' }}>{toothName(n)}</span>
            </div>
            <div style={{ fontSize: 9, color: 'var(--ds-text-tertiary)' }}>Quadrant {quad(n)}</div>
          </div>
          <button type="button" onClick={onClose} style={{
            width: 22, height: 22, borderRadius: '50%', border: '1px solid #E5E7EB',
            background: 'var(--ds-surface)', cursor: 'pointer', fontSize: 11, color: 'var(--ds-text-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><X size={11} /></button>
        </div>
      </div>

      {/* Current findings */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #E5E7EB' }}>
        <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--ds-text)', marginBottom: 5, letterSpacing: '0.03em' }}>FINDINGS ({fings.length})</div>
        {fings.length === 0 ? (
          <div style={{ fontSize: 10, color: 'var(--ds-text-tertiary)', fontStyle: 'italic' }}>No findings for this tooth</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 130, overflowY: 'auto' }}>
            {disps.map(({ f, label, color }) => (
              <div key={f.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '2px 6px', borderRadius: 4, background: `${color}10`,
                borderLeft: `2px solid ${color}`,
              }}>
                <div style={{ fontSize: 10, lineHeight: 1.3, flex: 1 }}>
                  <span style={{ fontWeight: 600, color: 'var(--ds-text)' }}>{label}</span>
                  {f.surfaces && f.surfaces.length > 0 && (
                    <span style={{ color: 'var(--ds-text-secondary)', fontSize: 9 }}> [{f.surfaces.map((s) => SURF_LABEL[s]).join(',')}]</span>
                  )}
                  {f.description && label !== f.description && (
                    <div style={{ color: 'var(--ds-text-secondary)', fontSize: 9, marginTop: 1 }}>{f.description}</div>
                  )}
                </div>
                {!ro && (
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    {editId !== f.id && (
                      <button type="button" onClick={() => startEdit(f)} style={{
                        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ds-primary-600)',
                        fontSize: 10, padding: 0,
                      }}><Pencil size={11} /></button>
                    )}
                    <button type="button" onClick={() => onRemove(f.id)} style={{
                      background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444',
                      fontSize: 11, padding: 0,
                    }}><X size={12} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick finding chips */}
      {!ro && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--ds-text)', marginBottom: 5, letterSpacing: '0.03em' }}>QUICK FINDINGS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {QUICK_FINDINGS.map((ft) => (
              <button type="button" key={ft.name} onClick={() => handleQuick(ft.name)} style={{
                fontSize: 8, fontWeight: 500, padding: '1px 5px', borderRadius: 3, lineHeight: '16px',
                border: `1px solid ${ft.color}40`, background: 'var(--ds-surface)', color: ft.color, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.background = ft.color + '15' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--ds-surface)' }}>
                {ft.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add / Edit finding form */}
      {!ro && (
        <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4, borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--ds-text)', letterSpacing: '0.03em' }}>
            {editId ? 'EDIT FINDING' : 'ADD FINDING'}
          </div>
          <div>
            <div style={{ fontSize: 8, color: 'var(--ds-text-secondary)', marginBottom: 1 }}>Finding Type *</div>
            <select value={findingType} onChange={(e) => setFindingType(e.target.value)} style={inp}>
              <option value="">Select finding type...</option>
              {FINDING_TYPES.map((ft) => <option key={ft.name} value={ft.name}>{ft.label}</option>)}
            </select>
          </div>
          <input type="text" placeholder="Clinical notes / remarks..." value={desc} onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }} style={inp} />
          {editId ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" onClick={saveEdit} style={{
                flex: 1, padding: '5px', borderRadius: 4, border: 'none',
                background: 'var(--ds-primary)', color: 'var(--ds-surface)', fontSize: 9, fontWeight: 600, cursor: 'pointer',
              }}>Save</button>
              <button type="button" onClick={cancelEdit} style={{
                padding: '5px 10px', borderRadius: 4, border: '1px solid var(--ds-border)',
                background: 'var(--ds-surface)', color: 'var(--ds-text)', fontSize: 9, fontWeight: 500, cursor: 'pointer',
              }}>Cancel</button>
            </div>
          ) : (
            <button type="button" onClick={handleAdd} disabled={!findingType} style={{
              width: '100%', padding: '5px', borderRadius: 4, border: 'none',
              background: !findingType ? 'var(--ds-neutral-200)' : 'var(--ds-primary)',
              color: !findingType ? 'var(--ds-text-tertiary)' : 'var(--ds-surface)',
              fontSize: 9, fontWeight: 600, cursor: !findingType ? 'not-allowed' : 'pointer',
            }}>+ Add Finding</button>
          )}
        </div>
      )}
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%', padding: '3px 6px', borderRadius: 4, border: '1px solid #D1D5DB',
  fontSize: 10, color: 'var(--ds-text)', background: 'var(--ds-surface)', outline: 'none',
}

// ─── Exports ──────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export { getFindingColor, getFindingLabel }

// ─── Main Component ───────────────────────────────────────────────────

export default function ProfessionalOdontogram(props: Props) {
  const [local, setLocal] = useState<ToothFinding[]>([])
  const [isChild, setIsChild] = useState<boolean>(() => {
    if (props.patientDateOfBirth) {
      const age = new Date().getFullYear() - new Date(props.patientDateOfBirth).getFullYear()
      if (age < 12) return true
    }
    return false
  })
  const [sel, setSel] = useState<number | null>(null)
  const autoSetRef = useRef(false)

  const findings = props.findings ?? local
  const ro = props.readonly ?? false

  // Auto-detect dentition type from API-loaded findings (once)
  useEffect(() => {
    if (!autoSetRef.current) {
      const apiFinding = findings.find(f => (f.originalFindingType || f.findingType) && f.dentitionType)
      if (apiFinding) {
        setIsChild(apiFinding.dentitionType === 'CHILD')
        autoSetRef.current = true
      } else if (props.patientDateOfBirth) {
        const age = new Date().getFullYear() - new Date(props.patientDateOfBirth).getFullYear()
        setIsChild(age < 12)
        autoSetRef.current = true
      }
    }
  }, [findings, props.patientDateOfBirth])

  const upper = isChild ? FDI_UPPER_C : FDI_UPPER
  const lower = isChild ? FDI_LOWER_C : FDI_LOWER
  const box = useBoxSize()

  // ── Ref holds the CURRENT findings (both controlled & uncontrolled) ──
  const ref = useRef(findings)
  ref.current = findings

  const emit = (updated: ToothFinding[]) => {
    if (props.findings === undefined) setLocal(updated)
    props.onFindingsChange(updated)
  }

  const add = (findingType: string, description: string) => {
    if (ro || sel === null) return
    const cur = ref.current
    const nf: ToothFinding = {
      id: uid(),
      toothNumber: sel,
      condition: 'Restored',
      description: description || undefined,
      date: new Date().toISOString().split('T')[0],
      findingType,
      dentitionType: isChild ? 'CHILD' : 'ADULT',
    }
    emit([...cur, nf])
  }

  const remove = (id: string) => {
    if (ro) return
    emit(ref.current.filter((f) => f.id !== id))
  }

  const updateFinding = (id: string, updates: Partial<ToothFinding>) => {
    if (ro) return
    const cur = ref.current
    emit(cur.map((f) => f.id === id ? { ...f, ...updates } : f))
  }

  const selFindings = findings.filter((f) => f.toothNumber === sel)

  function arch(teeth: number[], label: string, sz: number) {
    const mid = teeth.length / 2
    const left = teeth.slice(0, mid)
    const right = teeth.slice(mid)
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 8, color: 'var(--ds-text-tertiary)', textAlign: 'center', marginBottom: 5, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {left.map((n) => <ToothBox key={n} n={n} findings={findings} sel={sel === n} sz={sz} onClick={() => setSel(n === sel ? null : n)} />)}
          </div>
          <div style={{ width: 12, textAlign: 'center', color: 'var(--ds-border-hover)', fontSize: 11, fontWeight: 300, lineHeight: `${sz}px` }}>|</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {right.map((n) => <ToothBox key={n} n={n} findings={findings} sel={sel === n} sz={sz} onClick={() => setSel(n === sel ? null : n)} />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', minHeight: 380, borderRadius: 8,
      overflow: 'hidden', border: '1px solid #E5E7EB', background: 'var(--ds-surface)',
    }}>
      {/* Left: chart */}
      <div style={{ flex: 1, minWidth: 0, background: 'var(--ds-background-subtle)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px', background: 'var(--ds-surface)', borderBottom: '1px solid #E5E7EB', flexWrap: 'wrap', gap: 5,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ds-text)' }}>Clinical Findings</div>
            <div style={{ fontSize: 9, color: 'var(--ds-text-secondary)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {props.patientName && <span>Patient: {props.patientName}</span>}
              {props.opNumber && <span>OP: {props.opNumber}</span>}
              {props.doctorName && <span>Dr. {props.doctorName}</span>}
              {props.visitDate && <span>{props.visitDate}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600,
              background: isChild ? 'var(--ds-warning-subtle)' : 'var(--ds-info-100)', color: isChild ? 'var(--ds-warning)' : 'var(--ds-info-800)',
            }}>{isChild ? 'Primary' : 'Permanent'}</span>
            <button type="button" onClick={() => { setIsChild(!isChild); setSel(null) }} style={chip}>
              {isChild ? 'Switch to Permanent' : 'Switch to Primary'}
            </button>
          </div>
        </div>

        {/* Chart body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
          <div style={{ background: 'var(--ds-surface)', borderRadius: 8, border: '1px solid #E5E7EB', padding: '12px 10px 8px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            {arch(upper, isChild ? 'Upper Arch (Maxillary — Primary)' : 'Upper Arch (Maxillary — Permanent)', box)}
            <div style={{ borderTop: '1px dashed #D1D5DB', margin: '0 20px 6px' }} />
            {arch(lower, isChild ? 'Lower Arch (Mandibular — Primary)' : 'Lower Arch (Mandibular — Permanent)', box)}
          </div>
          <div style={{ textAlign: 'center', fontSize: 8, color: 'var(--ds-text-tertiary)', marginTop: 5, marginBottom: 8 }}>
            {findings.length} finding{findings.length !== 1 ? 's' : ''} · {isChild ? 'Primary' : 'Permanent'} dentition
            {sel !== null && <> · Selected: #{sel} — {toothName(sel)}</>}
          </div>
          <div style={{ marginBottom: 6 }}><Legend findings={findings} /></div>
          <Summary findings={findings} onUpdate={emit} />
        </div>
      </div>

      {/* Right panel */}
      {sel !== null && (
        <RightPanel n={sel} fings={selFindings} ro={!!ro} onAdd={add} onRemove={remove} onUpdateFinding={updateFinding} onClose={() => setSel(null)} />
      )}
    </div>
  )
}

const chip: React.CSSProperties = {
  padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 500,
  border: '1px solid #E5E7EB', background: 'var(--ds-surface)', color: 'var(--ds-text)',
  cursor: 'pointer', whiteSpace: 'nowrap',
}
