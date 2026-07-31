import React, { useMemo, useState } from 'react'
import { type ToothFinding, SURFACE_LABELS, TOOTH_NAMES } from './types'

interface FindingsLogTableProps {
  findings: ToothFinding[]
  onHighlightTooth: (n: number | null) => void
}

type SortKey = 'date' | 'toothNumber'

export default function FindingsLogTable({ findings, onHighlightTooth }: FindingsLogTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortAsc, setSortAsc] = useState(false)

  const sorted = useMemo(() => {
    const copy = [...findings]
    copy.sort((a, b) => {
      let cmp: number
      if (sortKey === 'date') {
        cmp = a.date.localeCompare(b.date)
      } else {
        cmp = a.toothNumber - b.toothNumber
      }
      return sortAsc ? cmp : -cmp
    })
    return copy
  }, [findings, sortKey, sortAsc])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  if (findings.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-[var(--ds-text-tertiary)] text-center border-t border-[var(--ds-border)] bg-[var(--ds-surface)]">
        No findings recorded. Click a tooth to add your first finding.
      </div>
    )
  }

  return (
    <div className="border-t border-[var(--ds-border)] bg-[var(--ds-surface)]">
      <div className="px-3 py-1.5 text-xs font-semibold text-[var(--ds-text-secondary)] bg-[var(--ds-background-subtle)] border-b border-[var(--ds-border)] flex items-center justify-between">
        <span>Findings Log</span>
        <span className="text-[var(--ds-text-tertiary)] font-normal">{findings.length} entries</span>
      </div>
      <div className="overflow-x-auto" style={{ maxHeight: 200 }}>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)] sticky top-0">
              <th
                className="px-2 py-1.5 text-left font-medium cursor-pointer hover:text-[var(--ds-text-secondary)] whitespace-nowrap"
                onClick={() => toggleSort('date')}
              >
                Date {sortKey === 'date' ? (sortAsc ? '↑' : '↓') : ''}
              </th>
              <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">Condition</th>
              <th
                className="px-2 py-1.5 text-left font-medium cursor-pointer hover:text-[var(--ds-text-secondary)] whitespace-nowrap"
                onClick={() => toggleSort('toothNumber')}
              >
                Tooth # {sortKey === 'toothNumber' ? (sortAsc ? '↑' : '↓') : ''}
              </th>
              <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">Area</th>
              <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">Surf/Root</th>
              <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">Material</th>
              <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">Description</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((f) => (
              <tr
                key={f.id}
                className="border-t border-[var(--ds-border-light)] hover:bg-blue-50 cursor-pointer transition-colors"
                onClick={() => onHighlightTooth(f.toothNumber)}
                onMouseLeave={() => onHighlightTooth(null)}
              >
                <td className="px-2 py-1.5 text-[var(--ds-text-secondary)] whitespace-nowrap">{f.date}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <span className="font-medium">{f.condition}</span>
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">#{f.toothNumber}</td>
                <td className="px-2 py-1.5 whitespace-nowrap text-[var(--ds-text-secondary)]">
                  {TOOTH_NAMES[f.toothNumber]?.includes('Upper') ? 'Upper' : 'Lower'}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {f.surfaces && f.surfaces.length > 0
                    ? f.surfaces.map((s) => SURFACE_LABELS[s]).join(', ')
                    : '-'}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap text-[var(--ds-text-secondary)]">{f.material || '-'}</td>
                <td className="px-2 py-1.5 text-[var(--ds-text-secondary)] truncate max-w-[200px]">{f.description || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
