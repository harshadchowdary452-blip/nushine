import { useState } from "react"
import { X, ChevronDown, ChevronUp } from "lucide-react"

const ADULT_TEETH = {
  upperLeft: ["18", "17", "16", "15", "14", "13", "12", "11"],
  upperRight: ["21", "22", "23", "24", "25", "26", "27", "28"],
  lowerLeft: ["48", "47", "46", "45", "44", "43", "42", "41"],
  lowerRight: ["31", "32", "33", "34", "35", "36", "37", "38"],
}

const CHILD_TEETH = {
  upperLeft: ["55", "54", "53", "52", "51"],
  upperRight: ["61", "62", "63", "64", "65"],
  lowerLeft: ["85", "84", "83", "82", "81"],
  lowerRight: ["71", "72", "73", "74", "75"],
}

interface ToothNumberPickerProps {
  selected: string[]
  onChange: (teeth: string[]) => void
  dentitionType?: "ADULT" | "CHILD"
}

export default function ToothNumberPicker({ selected, onChange, dentitionType = "ADULT" }: ToothNumberPickerProps) {
  const [expanded, setExpanded] = useState(false)
  const teeth = dentitionType === "CHILD" ? CHILD_TEETH : ADULT_TEETH

  function toggle(tooth: string) {
    if (selected.includes(tooth)) {
      onChange(selected.filter((t) => t !== tooth))
    } else {
      onChange([...selected, tooth].sort((a, b) => Number(a) - Number(b)))
    }
  }

  function remove(tooth: string) {
    onChange(selected.filter((t) => t !== tooth))
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200"
            >
              {t}
              <button
                type="button"
                onClick={() => remove(t)}
                className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full hover:bg-blue-200 transition-colors"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {selected.length > 0 ? "Edit teeth" : "Select teeth"}
      </button>

      {expanded && (
        <div className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-background-subtle)] p-3 space-y-2">
          <div className="text-[10px] text-[var(--ds-text-secondary)] font-medium uppercase tracking-wide">Upper Arch</div>
          <div className="flex gap-1">
            <div className="flex gap-0.5">
              {teeth.upperLeft.map((t) => (
                <ToothButton key={t} tooth={t} selected={selected.includes(t)} onClick={() => toggle(t)} />
              ))}
            </div>
            <div className="w-px bg-[var(--ds-surface-secondary)] mx-1" />
            <div className="flex gap-0.5">
              {teeth.upperRight.map((t) => (
                <ToothButton key={t} tooth={t} selected={selected.includes(t)} onClick={() => toggle(t)} />
              ))}
            </div>
          </div>

          <div className="text-[10px] text-[var(--ds-text-secondary)] font-medium uppercase tracking-wide">Lower Arch</div>
          <div className="flex gap-1">
            <div className="flex gap-0.5">
              {teeth.lowerLeft.map((t) => (
                <ToothButton key={t} tooth={t} selected={selected.includes(t)} onClick={() => toggle(t)} />
              ))}
            </div>
            <div className="w-px bg-[var(--ds-surface-secondary)] mx-1" />
            <div className="flex gap-0.5">
              {teeth.lowerRight.map((t) => (
                <ToothButton key={t} tooth={t} selected={selected.includes(t)} onClick={() => toggle(t)} />
              ))}
            </div>
          </div>

          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[11px] text-red-500 hover:text-red-700 font-medium mt-1"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ToothButton({ tooth, selected, onClick }: { tooth: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 min-w-[28px] px-1 rounded text-[11px] font-semibold border transition-all ${
        selected
          ? "bg-blue-600 text-white border-blue-600 shadow-sm"
          : "bg-[var(--ds-surface)] text-[var(--ds-text-secondary)] border-[var(--ds-border-strong)] hover:border-blue-400 hover:bg-blue-50"
      }`}
    >
      {tooth}
    </button>
  )
}
