import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { MedicationInput } from "@/types"

export type { MedicationInput }

interface MedicationPrescriptionEditorProps {
  value: MedicationInput[]
  onChange: (items: MedicationInput[]) => void
  disabled?: boolean
  compact?: boolean
}

const COMMON_MEDICATIONS = [
  "Amoxicillin",
  "Augmentin (Amoxicillin + Clavulanate)",
  "Metronidazole",
  "Paracetamol",
  "Ibuprofen",
  "Diclofenac",
  "Meftal Spas",
  "Aceclofenac",
  "Chlorhexidine Mouthwash",
  "Calcium + Vitamin D3",
  "Cefixime",
  "Azithromycin",
  "Hydrogen Peroxide Mouthwash",
  "Benzocaine Gel",
  "Lignocaine Gel",
]

const FREQUENCIES = [
  "Once a day",
  "Twice a day",
  "3 times a day",
  "4 times a day",
  "Every 6 hours",
  "Every 8 hours",
  "Before food",
  "After food",
  "At bedtime",
  "As needed",
]

function normalizeMed(med: MedicationInput): MedicationInput {
  return {
    medication_name: (med.medication_name || "").trim(),
    dosage: med.dosage?.trim() || null,
    frequency: med.frequency?.trim() || null,
    duration: med.duration?.trim() || null,
    instructions: med.instructions?.trim() || null,
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function cleanMedications(items: MedicationInput[] | null | undefined): MedicationInput[] {
  if (!items) return []
  return items.map(normalizeMed).filter((m) => m.medication_name)
}

export function MedicationTable({ medications }: { medications: MedicationInput[] | null | undefined }) {
  const meds = Array.isArray(medications) ? medications.filter((m) => m?.medication_name) : []
  if (meds.length === 0) {
    return <p className="text-sm text-muted-foreground italic py-2">No medication prescribed.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--ds-border)] text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Medicine</th>
            <th className="py-2 pr-3 font-medium">Dosage</th>
            <th className="py-2 pr-3 font-medium">Frequency</th>
            <th className="py-2 pr-3 font-medium">Duration</th>
            <th className="py-2 font-medium">Instructions</th>
          </tr>
        </thead>
        <tbody>
          {meds.map((m, i) => (
            <tr key={i} className="border-b border-[var(--ds-border)]/50 last:border-0">
              <td className="py-2 pr-3 font-medium">{m.medication_name}</td>
              <td className="py-2 pr-3">{m.dosage || "—"}</td>
              <td className="py-2 pr-3">{m.frequency || "—"}</td>
              <td className="py-2 pr-3">{m.duration || "—"}</td>
              <td className="py-2">{m.instructions || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function MedicationPrescriptionEditor({
  value,
  onChange,
  disabled,
  compact,
}: MedicationPrescriptionEditorProps) {
  const meds = Array.isArray(value) ? value : []

  function updateRow(index: number, patch: Partial<MedicationInput>) {
    onChange(meds.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  }

  function removeRow(index: number) {
    onChange(meds.filter((_, i) => i !== index))
  }

  const cellClass = compact ? "h-7 text-xs" : undefined
  const labelClass = compact ? "text-[10px]" : undefined

  return (
    <div className="space-y-3">
      {meds.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No medications prescribed.</p>
      )}

      {meds.map((med, index) => (
        <div key={index} className="rounded-md border border-[var(--ds-border)] p-3 space-y-2">
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-5">
              <Label className={labelClass}>Medicine *</Label>
              <Input
                list="medication-name-options"
                value={med.medication_name || ""}
                onChange={(e) => updateRow(index, { medication_name: e.target.value })}
                placeholder="e.g. Amoxicillin"
                className={cellClass}
                disabled={disabled}
              />
            </div>
            <div className="col-span-3">
              <Label className={labelClass}>Dosage</Label>
              <Input
                value={med.dosage || ""}
                onChange={(e) => updateRow(index, { dosage: e.target.value })}
                placeholder="e.g. 500mg"
                className={cellClass}
                disabled={disabled}
              />
            </div>
            <div className="col-span-4 flex items-end gap-2">
              <div className="flex-1">
                <Label className={labelClass}>Frequency</Label>
                <Input
                  list="medication-frequency-options"
                  value={med.frequency || ""}
                  onChange={(e) => updateRow(index, { frequency: e.target.value })}
                  placeholder="e.g. 3 times a day"
                  className={cellClass}
                  disabled={disabled}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removeRow(index)}
                disabled={disabled}
                aria-label={`Remove ${med.medication_name || "medication"}`}
              >
                <Trash2 className="h-4 w-4 text-[var(--ds-danger)]" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className={labelClass}>Duration</Label>
              <Input
                value={med.duration || ""}
                onChange={(e) => updateRow(index, { duration: e.target.value })}
                placeholder="e.g. 7 days"
                className={cellClass}
                disabled={disabled}
              />
            </div>
            <div>
              <Label className={labelClass}>Instructions</Label>
              <Input
                value={med.instructions || ""}
                onChange={(e) => updateRow(index, { instructions: e.target.value })}
                placeholder="e.g. After food"
                className={cellClass}
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      ))}

      <datalist id="medication-name-options">
        {COMMON_MEDICATIONS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <datalist id="medication-frequency-options">
        {FREQUENCIES.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>

      {!disabled && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...meds, { medication_name: "" }])}>
          <Plus className="h-4 w-4" /> Add Medication
        </Button>
      )}
    </div>
  )
}
