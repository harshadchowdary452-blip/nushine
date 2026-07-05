import React, { useState } from 'react'
import {
  type ToothFinding,
  type ToothCondition,
  type ToothSurface,
  type FindingFormData,
  ALL_CONDITIONS,
  SURFACE_LABELS,
  MATERIAL_OPTIONS,
  CONDITION_LABELS,
  TOOTH_NAMES,
} from './types'

interface FindingPanelProps {
  toothNumber: number | null
  toothFindings: ToothFinding[]
  onAdd: (data: FindingFormData) => void
  onRemove: (id: string) => void
  onClose: () => void
}

const ALL_SURFACES: ToothSurface[] = ['Mesial', 'Distal', 'Buccal', 'Lingual', 'Occlusal', 'Incisal', 'Labial']

const SURFACE_COLORS: Record<ToothSurface, string> = {
  Mesial: '#F59E0B',
  Distal: '#8B5CF6',
  Buccal: '#3B82F6',
  Lingual: '#10B981',
  Occlusal: '#EF4444',
  Incisal: '#EC4899',
  Labial: '#6366F1',
}

export default function FindingPanel({
  toothNumber,
  toothFindings,
  onAdd,
  onRemove,
  onClose,
}: FindingPanelProps) {
  const [condition, setCondition] = useState<ToothCondition>('Decayed')
  const [selectedSurfaces, setSelectedSurfaces] = useState<ToothSurface[]>([])
  const [material, setMaterial] = useState('')
  const [description, setDescription] = useState('')

  if (toothNumber === null) return null

  const wholeToothConditions: ToothCondition[] = ['Missing', 'Implant', 'Impacted', 'Bridge', 'Denture', 'Erupt']
  const isWholeTooth = wholeToothConditions.includes(condition)

  const toggleSurface = (s: ToothSurface) => {
    setSelectedSurfaces((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    )
  }

  const handleAdd = () => {
    onAdd({
      condition,
      surfaces: isWholeTooth ? [] : selectedSurfaces,
      material: isWholeTooth ? '' : material,
      description,
    })
    setSelectedSurfaces([])
    setMaterial('')
    setDescription('')
  }

  const showSurfaces = !isWholeTooth && ['Decayed', 'Restored', 'Defective'].includes(condition)

  return (
    <div className="w-72 bg-white border-l border-gray-200 shadow-lg overflow-y-auto" style={{ maxHeight: '80vh' }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-800">
          Tooth #{toothNumber}
        </span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
      </div>
      <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-50">
        {TOOTH_NAMES[toothNumber]}
      </div>

      <div className="p-3 space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Condition</label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as ToothCondition)}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            {ALL_CONDITIONS.map((c) => (
              <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
            ))}
          </select>
        </div>

        {showSurfaces && (
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Surfaces</label>
            <div className="flex gap-1.5 flex-wrap">
              {ALL_SURFACES.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleSurface(s)}
                  className={`w-8 h-8 text-xs rounded border font-medium transition-all ${
                    selectedSurfaces.includes(s)
                      ? 'text-white border-transparent shadow-sm'
                      : 'text-gray-500 border-gray-300 hover:bg-gray-50'
                  }`}
                  style={selectedSurfaces.includes(s) ? { backgroundColor: SURFACE_COLORS[s] } : {}}
                  title={s}
                >
                  {SURFACE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        {showSurfaces && (
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Material</label>
            <select
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="">None</option>
              {MATERIAL_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., MOD amalgam"
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        <button
          onClick={handleAdd}
          className="w-full py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
        >
          Add Finding
        </button>

        {toothFindings.length > 0 && (
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Current Findings</label>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {toothFindings.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1"
                >
                  <span>
                    <span className="font-medium">{f.condition}</span>
                    {f.surfaces && f.surfaces.length > 0 && (
                      <span className="text-gray-500 ml-1">
                        ({f.surfaces.map((s) => SURFACE_LABELS[s]).join(',')})
                      </span>
                    )}
                    {f.description && <span className="text-gray-400 ml-1">- {f.description}</span>}
                  </span>
                  <button
                    onClick={() => onRemove(f.id)}
                    className="text-red-400 hover:text-red-600 ml-1 leading-none"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
