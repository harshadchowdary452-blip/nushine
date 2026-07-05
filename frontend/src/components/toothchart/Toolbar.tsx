import React from 'react'
import { type ToothCondition, ALL_CONDITIONS, CONDITION_LABELS, CONDITION_COLORS } from './types'

interface ToolbarProps {
  activeFilter: ToothCondition | null
  setActiveFilter: (c: ToothCondition | null) => void
  onUndo: () => void
  canUndo: boolean
  onViewChange: (v: 'chart' | 'table') => void
  currentView: 'chart' | 'table'
  patientName?: string
}

const CONDITION_ICONS: Record<string, string> = {
  Decayed: '🦷',
  Restored: '⬜',
  Defective: '╳',
  Missing: '○',
  Erupt: '⬆',
  Implant: '⦿',
  Impacted: '↻',
  Bridge: '═',
  Denture: '▤',
}

export default function Toolbar({
  activeFilter,
  setActiveFilter,
  onUndo,
  canUndo,
  onViewChange,
  currentView,
  patientName,
}: ToolbarProps) {
  const toggleFilter = (cond: ToothCondition) => {
    setActiveFilter(activeFilter === cond ? null : cond)
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 bg-white border-b border-gray-200 flex-wrap">
      <button
        onClick={() => onViewChange(currentView === 'chart' ? 'table' : 'chart')}
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
        title="Toggle view"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
      </button>
      <button className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Print">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
          <path d="M6 14h12v8H6z" />
        </svg>
      </button>
      <div className="w-px h-5 bg-gray-300 mx-1" />
      <span className="text-xs text-gray-500 font-medium mr-1">Filter:</span>
      {ALL_CONDITIONS.map((cond) => {
        const isActive = activeFilter === cond
        return (
          <button
            key={cond}
            onClick={() => toggleFilter(cond)}
            className={`px-2 py-0.5 text-xs rounded border transition-all ${
              isActive
                ? 'text-white border-transparent shadow-sm'
                : 'text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
            style={isActive ? { backgroundColor: CONDITION_COLORS[cond] } : {}}
            title={`Show ${CONDITION_LABELS[cond]} teeth`}
          >
            {cond}
          </button>
        )
      })}
      <div className="flex-1" />
      <button
        onClick={onUndo}
        disabled={!canUndo}
        className={`p-1.5 rounded ${canUndo ? 'hover:bg-gray-100 text-gray-600' : 'text-gray-300 cursor-not-allowed'}`}
        title="Undo last finding"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 10h13a4 4 0 010 8H7" />
          <path d="M3 10l3-3M3 10l3 3" />
        </svg>
      </button>
      {patientName && (
        <span className="text-xs text-gray-400 ml-2">{patientName}</span>
      )}
    </div>
  )
}
