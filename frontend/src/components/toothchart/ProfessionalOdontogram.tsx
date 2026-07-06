import React, { useRef, useEffect, useState, useMemo } from 'react'
import type { ToothCondition, ToothSurface, ToothFinding } from './types'

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

// ─── Finding color map (direct lookup, no pattern matching) ────────────

const FINDING_COLORS: Record<string, string> = {
  'Dental Caries': '#DC2626', 'Composite Filling': '#3B82F6',
  'Amalgam': '#6B7280', 'RCT Completed': '#9333EA',
  'RCT Required': '#B91C1C', 'Calculus': '#EAB308',
  'Crown': '#D97706', 'Bridge': '#14B8A6', 'Implant': '#6B7280',
  'Fracture': '#000000', 'Mobility': '#F97316',
  'Tenderness': '#EC4899', 'Missing Tooth': '#4B5563',
  'Root Stump': '#92400E', 'Impacted': '#F97316',
  'Erupting': '#10B981', 'Denture': '#8B5CF6',
  'Decayed': '#DC2626', 'Restored': '#3B82F6',
  'Defective': '#D97706', 'Missing': '#4B5563',
  'Erupt': '#10B981',
}

function findingLabel(f: ToothFinding): string {
  return f.findingType || f.originalFindingType || f.condition
}

function findingColor(f: ToothFinding): string {
  return FINDING_COLORS[findingLabel(f)] || '#9CA3AF'
}

// ─── Quick-finding chip map ───────────────────────────────────────────

const QUICK: Record<string, { condition: ToothCondition; material?: string }> = {
  'Dental Caries':     { condition: 'Decayed' },
  'Composite Filling': { condition: 'Restored', material: 'Composite' },
  'Amalgam':           { condition: 'Restored', material: 'Amalgam' },
  'RCT Completed':     { condition: 'Restored' },
  'RCT Required':      { condition: 'Decayed' },
  'Missing':           { condition: 'Missing' },
  'Crown':             { condition: 'Restored' },
  'Implant':           { condition: 'Implant' },
  'Bridge':            { condition: 'Bridge' },
  'Fracture':          { condition: 'Defective' },
  'Calculus':          { condition: 'Defective' },
  'Mobility':          { condition: 'Defective' },
  'Tenderness':        { condition: 'Decayed' },
  'Root Stump':        { condition: 'Defective' },
  'Impaction':         { condition: 'Impacted' },
}

const QLABELS = Object.keys(QUICK)
const MATERIALS = ['Composite', 'Amalgam', 'Gold', 'Ceramic', 'Zirconia', 'Acrylic', 'Metal', 'Porcelain']
const CONDITIONS: ToothCondition[] = ['Decayed', 'Restored', 'Defective', 'Missing', 'Erupt', 'Implant', 'Impacted', 'Bridge', 'Denture']
const SURF_LABEL: Record<string, string> = { Mesial: 'M', Distal: 'D', Buccal: 'B', Lingual: 'L', Occlusal: 'O', Incisal: 'I', Labial: 'La' }
const SURF_COLOR: Record<string, string> = { Mesial: '#F59E0B', Distal: '#8B5CF6', Buccal: '#3B82F6', Lingual: '#10B981', Occlusal: '#EF4444', Incisal: '#EC4899', Labial: '#6366F1' }

const LEGEND = [
  { label: 'Dental Caries', color: '#DC2626' }, { label: 'Composite Filling', color: '#3B82F6' },
  { label: 'Amalgam', color: '#6B7280' }, { label: 'RCT Completed', color: '#9333EA' },
  { label: 'RCT Required', color: '#B91C1C' }, { label: 'Missing Tooth', color: '#4B5563' },
  { label: 'Crown', color: '#D97706' }, { label: 'Implant', color: '#6B7280' },
  { label: 'Bridge', color: '#14B8A6' }, { label: 'Fracture', color: '#000000' },
  { label: 'Calculus', color: '#EAB308' }, { label: 'Mobility', color: '#F97316' },
  { label: 'Tenderness', color: '#EC4899' }, { label: 'Root Stump', color: '#92400E' },
  { label: 'Impacted', color: '#F97316' },
]

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

// ─── ToothBox ─────────────────────────────────────────────────────────

function ToothBox({ n, findings, sel, sz, onClick }: {
  n: number; findings: ToothFinding[]; sel: boolean; sz: number; onClick: () => void
}) {
  const tf = findings.filter((f) => f.toothNumber === n)
  const max = 4
  const miss = tf.some((f) => f.condition === 'Missing')
  const impl = tf.some((f) => f.condition === 'Implant')

  let bg = '#FFFFFF', bd = '#E5E7EB'
  if (sel) { bg = '#EFF6FF'; bd = '#2563EB' }
  else if (miss) { bg = '#F3F4F6'; bd = '#D1D5DB' }
  else if (impl) { bg = '#F0F4F8'; bd = '#94A3B8' }
  else if (tf.length) { const c = findingColor(tf[0]); bg = c + '0D'; bd = c + '30' }

  const dots = tf.slice(0, max).map((f) => ({ label: findingLabel(f), color: findingColor(f) }))
  const over = tf.length - max

  return (
    <div
      onClick={onClick}
      title={`Tooth ${n} — ${tf.map((f) => findingLabel(f)).join(', ') || 'Healthy'}`}
      style={{
        width: sz, minWidth: sz, height: sz, borderRadius: 8, cursor: 'pointer',
        background: bg, border: `${sel ? 2 : 1}px solid ${bd}`,
        boxShadow: sel ? '0 0 0 2px rgba(37,99,235,0.2)' : 'none',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 1, transition: 'all 0.12s', userSelect: 'none',
      }}
      onMouseEnter={(e) => { if (!sel && !miss) { e.currentTarget.style.background = '#F0F5FF'; e.currentTarget.style.borderColor = '#93C5FD' } }}
      onMouseLeave={(e) => { if (!sel) { e.currentTarget.style.background = bg; e.currentTarget.style.borderColor = bd } }}
    >
      <span style={{ fontSize: Math.max(10, sz * 0.27), fontWeight: 700, lineHeight: 1.2,
        color: sel ? '#2563EB' : miss ? '#9CA3AF' : '#374151' }}>{n}</span>
      {tf.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 10 }}>
          {dots.map((d, i) => (
            <span key={i} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: (i === max - 1 && over > 0) ? 'transparent' : d.color,
              border: `1px solid ${d.color}`, flexShrink: 0,
            }} />
          ))}
          {over > 0 && <span style={{ fontSize: 7, fontWeight: 700, color: '#6B7280' }}>+{over}</span>}
        </div>
      )}
    </div>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────

function Legend({ findings }: { findings: ToothFinding[] }) {
  const active = useMemo(() => new Set(findings.map((f) => findingLabel(f))), [findings])
  return (
    <div style={{ background: '#FFF', borderRadius: 8, border: '1px solid #E5E7EB', padding: '8px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#374151', marginBottom: 5, letterSpacing: '0.03em' }}>LEGEND</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {LEGEND.map((item) => {
          const a = active.has(item.label)
          return (
            <div key={item.label} style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 500,
              background: a ? `${item.color}12` : '#F9FAFB',
              border: `1px solid ${a ? item.color : '#E5E7EB'}`,
              color: '#374151', opacity: a ? 1 : 0.4,
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
    <div style={{ background: '#FFF', borderRadius: 8, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
      <div style={{
        padding: '6px 12px', borderBottom: '1px solid #E5E7EB', background: '#F8FAFC',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#374151' }}>
          Clinical Summary ({findings.length} finding{findings.length !== 1 ? 's' : ''})
        </span>
        <input type="text" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)}
          style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #D1D5DB', fontSize: 10, width: 160, outline: 'none', background: '#FFF' }} />
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 200 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F1F3F6', color: '#374151' }}>
              {['Tooth', 'Finding', 'Surface', 'Remarks'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, borderBottom: '2px solid #E5E7EB', letterSpacing: '0.03em', whiteSpace: 'nowrap', fontSize: 10 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 14, color: '#9CA3AF', fontStyle: 'italic' }}>{q ? 'No matches' : 'No findings'}</td></tr>
            ) : rows.map((r) => (
              <tr key={r.k} style={{ borderBottom: '1px solid #F1F3F6' }}>
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
                    placeholder="Add remarks..."
                    style={{ border: 'none', background: 'transparent', width: '100%', fontSize: 10, outline: 'none', color: '#6B7280', borderBottom: '1px dotted #E5E7EB' }} />
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

function RightPanel({ n, fings, ro, onAdd, onRemove, onClose }: {
  n: number; fings: ToothFinding[]; ro: boolean
  onAdd: (c: ToothCondition, s: ToothSurface[], m: string, d: string, ft: string) => void
  onRemove: (id: string) => void; onClose: () => void
}) {
  const [surf, setSurf] = useState<ToothSurface[]>([])
  const [mat, setMat] = useState('')
  const [desc, setDesc] = useState('')
  const [findingType, setFindingType] = useState('')
  const [cond, setCond] = useState<ToothCondition>('Decayed')
  const [txNote, setTxNote] = useState('')
  const [txHist, setTxHist] = useState<{ date: string; note: string }[]>([])

  const toggle = (s: ToothSurface) => setSurf((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s])
  const isPost = n % 10 >= 4
  const allS: ToothSurface[] = isPost
    ? ['Mesial', 'Distal', 'Occlusal', 'Buccal', 'Lingual']
    : ['Mesial', 'Distal', 'Incisal', 'Labial', 'Lingual']

  const handleQuick = (label: string) => {
    const m = QUICK[label]
    if (m) onAdd(m.condition, [], m.material || '', desc, label)
  }

  const addSurface = (c: ToothCondition) => { onAdd(c, surf, mat, desc, findingType || c); setSurf([]); setMat(''); setDesc(''); setFindingType('') }
  const addWhole = (c: ToothCondition) => { onAdd(c, [], '', desc, findingType || c); setDesc(''); setFindingType('') }
  const addTx = () => { if (!txNote.trim()) return; setTxHist((p) => [...p, { date: new Date().toISOString().split('T')[0], note: txNote.trim() }]); setTxNote('') }

  const disps = useMemo(() => fings.map((f) => ({ f, label: findingLabel(f), color: findingColor(f) })), [fings])

  const wc = ['Missing', 'Implant', 'Impacted', 'Bridge', 'Denture']
  const isWhole = wc.includes(cond)

  return (
    <div style={{
      width: 260, flexShrink: 0, background: '#FFF', borderLeft: '1px solid #E5E7EB',
      display: 'flex', flexDirection: 'column', overflowY: 'auto', fontSize: 11,
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #E5E7EB', background: '#F8FAFC' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>#{n}</span>
              <span style={{ fontSize: 10, color: '#6B7280' }}>{toothName(n)}</span>
            </div>
            <div style={{ fontSize: 9, color: '#9CA3AF' }}>Quadrant {quad(n)} · {isPost ? 'Posterior' : 'Anterior'}</div>
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
        <div style={{ fontSize: 9, fontWeight: 600, color: '#374151', marginBottom: 5, letterSpacing: '0.03em' }}>FINDINGS ({fings.length})</div>
        {fings.length === 0 ? (
          <div style={{ fontSize: 10, color: '#9CA3AF', fontStyle: 'italic' }}>No findings for this tooth</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 130, overflowY: 'auto' }}>
            {disps.map(({ f, label, color }) => (
              <div key={f.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '2px 6px', borderRadius: 4, background: `${color}10`,
                borderLeft: `2px solid ${color}`,
              }}>
                <div style={{ fontSize: 10, lineHeight: 1.3 }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{label}</span>
                  {f.surfaces && f.surfaces.length > 0 && (
                    <span style={{ color: '#6B7280', fontSize: 9 }}> ({f.surfaces.map((s) => SURF_LABEL[s]).join(',')})</span>
                  )}
                </div>
                {!ro && (
                  <button onClick={() => onRemove(f.id)} style={{
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
      {!ro && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: '#374151', marginBottom: 5, letterSpacing: '0.03em' }}>QUICK FINDINGS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {QLABELS.map((label) => {
              const c = FINDING_COLORS[label] || '#6B7280'
              return (
                <button key={label} onClick={() => handleQuick(label)} style={{
                  fontSize: 8, fontWeight: 500, padding: '1px 5px', borderRadius: 3, lineHeight: '16px',
                  border: `1px solid ${c}40`, background: '#FFF', color: c, cursor: 'pointer', whiteSpace: 'nowrap',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = c + '15' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#FFF' }}>
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Add finding form */}
      {!ro && (
        <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4, borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: '#374151', letterSpacing: '0.03em' }}>ADD FINDING</div>
          <div>
            <div style={{ fontSize: 8, color: '#6B7280', marginBottom: 1 }}>Condition</div>
            <select value={cond} onChange={(e) => setCond(e.target.value as ToothCondition)} style={inp}>
              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {!isWhole && (
            <div>
              <div style={{ fontSize: 8, color: '#6B7280', marginBottom: 1 }}>Surfaces</div>
              <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {allS.map((s) => (
                  <button key={s} onClick={() => toggle(s)} style={{
                    width: 24, height: 22, fontSize: 8, fontWeight: 600, borderRadius: 3,
                    border: `1px solid ${surf.includes(s) ? SURF_COLOR[s] : '#D1D5DB'}`,
                    background: surf.includes(s) ? SURF_COLOR[s] : '#FFF',
                    color: surf.includes(s) ? '#FFF' : '#6B7280', cursor: 'pointer',
                  }}>{SURF_LABEL[s]}</button>
                ))}
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 8, color: '#6B7280', marginBottom: 1 }}>Material</div>
            <select value={mat} onChange={(e) => setMat(e.target.value)} style={inp}>
              <option value="">None</option>
              {MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 8, color: '#6B7280', marginBottom: 1 }}>Finding Type</div>
            <input type="text" placeholder="e.g. RCT Required, Dental Caries..." value={findingType}
              onChange={(e) => setFindingType(e.target.value)} style={inp} />
          </div>
          <input type="text" placeholder="Clinical notes..." value={desc} onChange={(e) => setDesc(e.target.value)} style={inp} />
          <button onClick={() => { if (wc.includes(cond)) addWhole(cond); else if (surf.length > 0) addSurface(cond); else addWhole(cond) }} style={{
            width: '100%', padding: '5px', borderRadius: 4, border: 'none',
            background: '#2563EB', color: '#FFF', fontSize: 9, fontWeight: 600, cursor: 'pointer',
          }}>+ Add {cond}</button>
        </div>
      )}

      {/* Treatment History */}
      <div style={{ padding: '8px 12px', flex: 1 }}>
        <div style={{ fontSize: 9, fontWeight: 600, color: '#374151', marginBottom: 5, letterSpacing: '0.03em' }}>TREATMENT HISTORY</div>
        {txHist.length === 0 && disps.length === 0 ? (
          <div style={{ fontSize: 10, color: '#9CA3AF', fontStyle: 'italic' }}>No treatment recorded</div>
        ) : (
          <div style={{ maxHeight: 120, overflowY: 'auto', marginBottom: 6 }}>
          {txHist.map((t, i) => (
            <div key={i} style={{
              fontSize: 9, color: '#374151', padding: '2px 6px', marginBottom: 3,
              background: '#F9FAFB', borderRadius: 3, borderLeft: '2px solid #3B82F6',
            }}>
              <span style={{ color: '#6B7280', fontWeight: 600 }}>{t.date}</span> {t.note}
            </div>
          ))}
          {disps.map(({ f, label, color }) => (
            <div key={f.id} style={{
              fontSize: 9, color: '#374151', padding: '2px 6px', marginBottom: 3,
              background: '#F9FAFB', borderRadius: 3, borderLeft: `2px solid ${color}`,
            }}>
              <span style={{ color: '#6B7280', fontWeight: 600 }}>{f.date}</span>{' '}
              {label}{f.description && label !== f.description ? ` — ${f.description}` : ''}
            </div>
          ))}
          </div>
        )}
        {!ro && (
          <div style={{ display: 'flex', gap: 3 }}>
            <input type="text" placeholder="Add treatment note..." value={txNote}
              onChange={(e) => setTxNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTx() }}
              style={{ flex: 1, padding: '2px 6px', borderRadius: 3, border: '1px solid #D1D5DB', fontSize: 10, outline: 'none' }} />
            <button onClick={addTx} style={{
              padding: '2px 8px', borderRadius: 3, border: 'none',
              background: '#2563EB', color: '#FFF', fontSize: 9, fontWeight: 600, cursor: 'pointer',
            }}>Add</button>
          </div>
        )}
      </div>
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%', padding: '3px 6px', borderRadius: 4, border: '1px solid #D1D5DB',
  fontSize: 10, color: '#374151', background: '#FFF', outline: 'none',
}

// ─── Mock data (standalone demo) ──────────────────────────────────────

const MOCK: ToothFinding[] = [
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

// ─── Exports ──────────────────────────────────────────────────────────

export { FINDING_COLORS, LEGEND, CONDITIONS as ALL_CONDITIONS, findingLabel, findingColor, findingLabel as getFindingLabel, findingColor as getFindingColor }

// ─── Main Component ───────────────────────────────────────────────────

export default function ProfessionalOdontogram(props: Props) {
  const [local, setLocal] = useState<ToothFinding[]>([])
  const [isChild, setIsChild] = useState<boolean>(() => {
    // Default based on patient DOB if available (before findings load)
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

  const add = (condition: ToothCondition, surfaces: ToothSurface[], material: string, description: string, findingType: string) => {
    if (ro || sel === null) return
    const cur = ref.current
    const nf: ToothFinding = {
      id: uid(),
      toothNumber: sel,
      condition,
      surfaces: surfaces.length > 0 ? surfaces : undefined,
      material: material || undefined,
      description: description || undefined,
      date: new Date().toISOString().split('T')[0],
      findingType: findingType,
      dentitionType: isChild ? 'CHILD' : 'ADULT',
    }
    emit([...cur, nf])
  }

  const remove = (id: string) => {
    if (ro) return
    emit(ref.current.filter((f) => f.id !== id))
  }

  const selFindings = findings.filter((f) => f.toothNumber === sel)

  function arch(teeth: number[], label: string, sz: number) {
    const mid = teeth.length / 2
    const left = teeth.slice(0, mid)
    const right = teeth.slice(mid)
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 8, color: '#9CA3AF', textAlign: 'center', marginBottom: 5, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {left.map((n) => <ToothBox key={n} n={n} findings={findings} sel={sel === n} sz={sz} onClick={() => setSel(n === sel ? null : n)} />)}
          </div>
          <div style={{ width: 12, textAlign: 'center', color: '#D1D5DB', fontSize: 11, fontWeight: 300, lineHeight: `${sz}px` }}>|</div>
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
      overflow: 'hidden', border: '1px solid #E5E7EB', background: '#FFF',
    }}>
      {/* Left: chart */}
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
            <button onClick={() => { setIsChild(!isChild); setSel(null) }} style={chip}>Child</button>
          </div>
        </div>

        {/* Chart body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
          <div style={{ background: '#FFF', borderRadius: 8, border: '1px solid #E5E7EB', padding: '12px 10px 8px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            {arch(upper, isChild ? 'Upper Arch (Maxillary — Primary)' : 'Upper Arch (Maxillary — Permanent)', box)}
            <div style={{ borderTop: '1px dashed #D1D5DB', margin: '0 20px 6px' }} />
            {arch(lower, isChild ? 'Lower Arch (Mandibular — Primary)' : 'Lower Arch (Mandibular — Permanent)', box)}
          </div>
          <div style={{ textAlign: 'center', fontSize: 8, color: '#9CA3AF', marginTop: 5, marginBottom: 8 }}>
            {findings.length} finding{findings.length !== 1 ? 's' : ''} · {isChild ? 'Primary' : 'Permanent'} dentition
            {sel !== null && <> · Selected: #{sel} — {toothName(sel)}</>}
          </div>
          <div style={{ marginBottom: 6 }}><Legend findings={findings} /></div>
          <Summary findings={findings} onUpdate={emit} />
        </div>
      </div>

      {/* Right panel */}
      {sel !== null && (
        <RightPanel n={sel} fings={selFindings} ro={!!ro} onAdd={add} onRemove={remove} onClose={() => setSel(null)} />
      )}
    </div>
  )
}

const chip: React.CSSProperties = {
  padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 500,
  border: '1px solid #E5E7EB', background: '#FFF', color: '#374151',
  cursor: 'pointer', whiteSpace: 'nowrap',
}
