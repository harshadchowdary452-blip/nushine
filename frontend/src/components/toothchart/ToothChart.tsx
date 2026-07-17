import React, { useState, useCallback } from 'react'
import {
  type ToothFinding,
  type ToothCondition,
  type FindingFormData,
  type ToothChartProps,
  MOCK_FINDINGS,
} from './types'
import Toolbar from './Toolbar'
import ToothSVG from './ToothSVG'
import OcclusalRing from './OcclusalRing'
import FindingPanel from './FindingPanel'
import FindingsLogTable from './FindingsLogTable'

const UPPER_TEETH = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
const LOWER_TEETH = [32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17]

export { type ToothFinding } from './types'
export { MOCK_FINDINGS } from './types'

export default function ToothChart({
  findings: externalFindings,
  onFindingsChange,
  patientName,
  patientId: _patientId,
  readonly: extReadonly,
}: ToothChartProps) {
  const [localFindings, setLocalFindings] = useState<ToothFinding[]>(MOCK_FINDINGS)
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null)
  const [hoveredTooth, setHoveredTooth] = useState<number | null>(null)
  const [activeFilter, setActiveFilter] = useState<ToothCondition | null>(null)
  const [undoStack, setUndoStack] = useState<ToothFinding[][]>([])
  const [currentView, setCurrentView] = useState<'chart' | 'table'>('chart')
  const [highlightedTooth, setHighlightedTooth] = useState<number | null>(null)

  const findings = externalFindings ?? localFindings
  const readonly = extReadonly ?? false

  const emitChange = useCallback(
    (updated: ToothFinding[]) => {
      if (externalFindings === undefined) {
        setLocalFindings(updated)
      }
      onFindingsChange(updated)
    },
    [externalFindings, onFindingsChange]
  )

  const addFinding = useCallback(
    (toothNumber: number, data: FindingFormData) => {
      if (readonly) return
      setUndoStack((prev) => [...prev, [...findings]])
      const newFinding: ToothFinding = {
        id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        toothNumber,
        condition: data.condition,
        surfaces: data.surfaces.length > 0 ? data.surfaces : undefined,
        material: data.material || undefined,
        description: data.description || undefined,
        date: new Date().toISOString().split('T')[0],
      }
      emitChange([...findings, newFinding])
    },
    [findings, readonly, emitChange]
  )

  const removeFinding = useCallback(
    (id: string) => {
      if (readonly) return
      setUndoStack((prev) => [...prev, [...findings]])
      emitChange(findings.filter((f) => f.id !== id))
    },
    [findings, readonly, emitChange]
  )

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || readonly) return
    const prev = undoStack[undoStack.length - 1]
    setUndoStack((stack) => stack.slice(0, -1))
    emitChange(prev)
  }, [undoStack, readonly, emitChange])

  const toothFindingsFor = useCallback(
    (n: number) => findings.filter((f) => f.toothNumber === n),
    [findings]
  )

  const handleHighlightTooth = useCallback((n: number | null) => {
    setHighlightedTooth(n)
  }, [])

  const activeHighlight = highlightedTooth || hoveredTooth

  const renderToothColumn = useCallback(
    (toothNumber: number, rowType: 'crown' | 'root', isUpper: boolean) => {
      const tf = toothFindingsFor(toothNumber)
      const sel = selectedTooth === toothNumber
      const hov = activeHighlight === toothNumber
      return (
        <div key={`${toothNumber}-${rowType}`} className="flex items-center justify-center" style={{ width: 48, minWidth: 48, height: rowType === 'crown' || rowType === 'root' ? 64 : 40 }}>
          {rowType === 'crown' || rowType === 'root' ? (
            <ToothSVG
              toothNumber={toothNumber}
              findings={tf}
              isUpper={isUpper}
              view={rowType}
              isSelected={sel}
              isHovered={hov}
              activeFilter={activeFilter}
              onClick={() => setSelectedTooth(toothNumber === selectedTooth ? null : toothNumber)}
              onMouseEnter={() => setHoveredTooth(toothNumber)}
              onMouseLeave={() => setHoveredTooth(null)}
            />
          ) : (
            <OcclusalRing
              toothNumber={toothNumber}
              findings={tf}
              layer={rowType === 'crown' ? 0 : 1}
              isSelected={sel}
              isHovered={hov}
              activeFilter={activeFilter}
              onClick={() => setSelectedTooth(toothNumber === selectedTooth ? null : toothNumber)}
              onMouseEnter={() => setHoveredTooth(toothNumber)}
              onMouseLeave={() => setHoveredTooth(null)}
            />
          )}
        </div>
      )
    },
    [toothFindingsFor, selectedTooth, activeHighlight, activeFilter]
  )

  const renderRow = useCallback(
    (teeth: number[], rowType: 'crown' | 'occlusal1' | 'occlusal2' | 'root', isUpper: boolean) => {
      return (
        <div className="flex" style={{ justifyContent: 'center' }}>
          {teeth.map((n) => {
            if (rowType === 'crown' || rowType === 'root') {
              return renderToothColumn(n, rowType, isUpper)
            }
            const tf = toothFindingsFor(n)
            const sel = selectedTooth === n
            const hov = activeHighlight === n
            return (
              <div key={`${n}-${rowType}`} className="flex items-center justify-center" style={{ width: 48, minWidth: 48, height: 40 }}>
                <OcclusalRing
                  toothNumber={n}
                  findings={tf}
                  layer={rowType === 'occlusal1' ? 0 : 1}
                  isSelected={sel}
                  isHovered={hov}
                  activeFilter={activeFilter}
                  onClick={() => setSelectedTooth(n === selectedTooth ? null : n)}
                  onMouseEnter={() => setHoveredTooth(n)}
                  onMouseLeave={() => setHoveredTooth(null)}
                />
              </div>
            )
          })}
        </div>
      )
    },
    [toothFindingsFor, selectedTooth, activeHighlight, activeFilter, renderToothColumn]
  )

  const NumberStrip = ({ teeth, label: _label }: { teeth: number[]; label: string }) => (
    <div className="flex relative" style={{ justifyContent: 'center' }}>
      {teeth.map((n) => (
        <div
          key={n}
          onClick={() => setSelectedTooth(n === selectedTooth ? null : n)}
          className="flex items-center justify-center text-[10px] font-semibold cursor-pointer transition-colors"
          style={{
            width: 48,
            minWidth: 48,
            height: 18,
            color: selectedTooth === n ? '#2563EB' : activeHighlight === n ? '#3B82F6' : '#6B7280',
            backgroundColor: selectedTooth === n ? 'rgba(37,99,235,0.08)' : 'transparent',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          {n}
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex" style={{ height: '100%', minHeight: 400 }}>
      <div className="flex-1 flex flex-col bg-[#AFCBE0]" style={{ minWidth: 0 }}>
        <Toolbar
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          onUndo={handleUndo}
          canUndo={undoStack.length > 0 && !readonly}
          onViewChange={setCurrentView}
          currentView={currentView}
          patientName={patientName}
        />

        {currentView === 'chart' ? (
          <div className="flex-1 overflow-auto" style={{ backgroundColor: '#AFCBE0' }}>
            <div className="py-2">
              {/* Upper arch */}
              <div className="text-[9px] text-gray-400 text-center uppercase tracking-wider mb-0.5">Maxillary</div>
              <NumberStrip teeth={UPPER_TEETH} label="Upper" />
              <div style={{ backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: '4px 4px 0 0', margin: '0 4px', padding: '2px 0' }}>
                {renderRow(UPPER_TEETH, 'crown', true)}
                {renderRow(UPPER_TEETH, 'occlusal1', true)}
                {renderRow(UPPER_TEETH, 'occlusal2', true)}
                {renderRow(UPPER_TEETH, 'root', true)}
              </div>

              {/* Lower arch */}
              <div className="text-[9px] text-gray-400 text-center uppercase tracking-wider mt-3 mb-0.5">Mandibular</div>
              <NumberStrip teeth={LOWER_TEETH} label="Lower" />
              <div style={{ backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: '0 0 4px 4px', margin: '0 4px', padding: '2px 0' }}>
                {renderRow(LOWER_TEETH, 'crown', false)}
                {renderRow(LOWER_TEETH, 'occlusal1', false)}
                {renderRow(LOWER_TEETH, 'occlusal2', false)}
                {renderRow(LOWER_TEETH, 'root', false)}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto bg-white p-4">
            <FindingsLogTable
              findings={findings}
              onHighlightTooth={handleHighlightTooth}
            />
          </div>
        )}

        {currentView === 'chart' && (
          <FindingsLogTable
            findings={findings}
            onHighlightTooth={handleHighlightTooth}
          />
        )}

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-1 bg-white border-t border-gray-200 text-[10px] text-gray-400">
          <span>{new Date().toLocaleDateString()}</span>
          <span className="text-gray-500 font-medium">Ready to chart!</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <path d="M22 4L12 14.01l-3-3" />
          </svg>
        </div>
      </div>

      {selectedTooth !== null && !readonly && (
        <FindingPanel
          toothNumber={selectedTooth}
          toothFindings={toothFindingsFor(selectedTooth)}
          onAdd={(data) => addFinding(selectedTooth, data)}
          onRemove={removeFinding}
          onClose={() => setSelectedTooth(null)}
        />
      )}
    </div>
  )
}
