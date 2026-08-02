import * as React from "react"

/** Minimal view of a parent record that create flows inherit from. */
export interface WorkflowParentRecord {
  id: string
  full_name?: string | null
  phone?: string | null
  email?: string | null
  doctor_id?: string | null
  hospital_id?: string | null
  op_no?: string | null
}

export interface WorkflowContextValue {
  /** Parent patient (e.g. opening "New Appointment" from a patient). */
  patient?: WorkflowParentRecord | null
  /** Parent case (e.g. opening "New Treatment Plan" from a case). */
  caseRef?: WorkflowParentRecord | null
  /** Parent treatment plan (e.g. opening "New Sitting" from a plan). */
  treatmentPlan?: WorkflowParentRecord | null
  /** Where the workflow was launched from — used for breadcrumb/back behaviour. */
  origin?: string | null
}

export const WorkflowContext = React.createContext<WorkflowContextValue | undefined>(undefined)

/**
 * Provides the active "parent record" context so that any create form opened
 * beneath it inherits related fields automatically (context-aware forms).
 *
 * Usage: wrap a detail workspace (or a page that opens create dialogs) with
 * <WorkflowProvider patient={patient}> and read it with useWorkflowContext().
 */
export function WorkflowProvider({
  patient,
  caseRef,
  treatmentPlan,
  origin,
  children,
}: WorkflowContextValue & { children: React.ReactNode }) {
  const value = React.useMemo<WorkflowContextValue>(
    () => ({ patient, caseRef, treatmentPlan, origin }),
    [patient, caseRef, treatmentPlan, origin],
  )
  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>
}

/** Read the inherited parent record context for the current workflow. */
export function useWorkflowContext(): WorkflowContextValue {
  const ctx = React.useContext(WorkflowContext)
  return ctx ?? {}
}
