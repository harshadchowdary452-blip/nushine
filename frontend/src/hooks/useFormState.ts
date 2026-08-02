import { useCallback, useMemo, useRef, useState } from "react"
import {
  type FieldErrors,
  type FieldRules,
  type FieldValue,
  hasErrors,
  runValidators,
  runValidatorsForField,
} from "@/lib/validation"

export interface UseFormStateOptions<T extends Record<string, FieldValue>> {
  initialValues: T
  /** Field-level validation rules shared with the server contract. */
  rules?: FieldRules
  /** When per-field errors surface. `submit` only validates on submit. */
  validateOn?: "blur" | "change" | "submit"
}

export interface UseFormStateResult<T extends Record<string, FieldValue>> {
  values: T
  /** Errors for touched fields — safe to render inline. */
  errors: FieldErrors
  /** Every field error regardless of touch state (after `validate()`). */
  allErrors: FieldErrors
  touched: Record<string, boolean>
  dirty: boolean
  setField: (field: keyof T, value: FieldValue) => void
  setValues: (next: T) => void
  onBlur: (field: keyof T) => void
  /** Runs all rules, marks every field touched, returns whether valid. */
  validate: () => boolean
  /** Runs rules only for the given fields, marks them touched, returns valid. */
  validateFields: (fields: (keyof T)[]) => boolean
  /** The inline error for a field (only when touched / after submit). */
  fieldError: (field: keyof T) => string | undefined
  reset: (next?: T) => void
}

/**
 * One unified form-state engine for every Create/Edit workflow. Owns values,
 * touched state, dirty tracking and smart (on-change / on-blur) validation so
 * modules stop hand-rolling `setForm({...form, x})` + toast-on-submit.
 */
export function useFormState<T extends Record<string, FieldValue>>(
  options: UseFormStateOptions<T>,
): UseFormStateResult<T> {
  const { initialValues, rules = {}, validateOn = "blur" } = options
  const [values, setValues] = useState<T>(initialValues)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<FieldErrors>({})
  const [allErrors, setAllErrors] = useState<FieldErrors>({})

  const initialRef = useRef(initialValues)
  const valuesRef = useRef(values)
  valuesRef.current = values
  const rulesRef = useRef(rules)
  rulesRef.current = rules

  const dirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(initialRef.current),
    [values],
  )

  const setField = useCallback(
    (field: keyof T, value: FieldValue) => {
      setValues((prev) => ({ ...prev, [field]: value }))
      if (validateOn === "change") {
        const next = { ...valuesRef.current, [field]: value }
        const message = runValidatorsForField(String(field), rulesRef.current[String(field)], next)
        setErrors((prev) => ({ ...prev, [field]: message }))
      }
    },
    [validateOn],
  )

  const setValuesWhole = useCallback((next: T) => {
    setValues(next)
  }, [])

  const onBlur = useCallback(
    (field: keyof T) => {
      setTouched((prev) => ({ ...prev, [field]: true }))
      if (validateOn === "blur") {
        const message = runValidatorsForField(
          String(field),
          rulesRef.current[String(field)],
          valuesRef.current,
        )
        setErrors((prev) => ({ ...prev, [field]: message }))
      }
    },
    [validateOn],
  )

  const validate = useCallback((): boolean => {
    const next = runValidators(rulesRef.current, valuesRef.current)
    setErrors(next)
    setAllErrors(next)
    const all: Record<string, boolean> = {}
    for (const key of Object.keys(rulesRef.current)) all[key] = true
    setTouched(all)
    return !hasErrors(next)
  }, [])

  const validateFields = useCallback((fields: (keyof T)[]): boolean => {
    const next: FieldErrors = {}
    let valid = true
    for (const field of fields) {
      const key = String(field)
      const message = runValidatorsForField(key, rulesRef.current[key], valuesRef.current)
      if (message) {
        next[key] = message
        valid = false
      }
    }
    setErrors((prev) => ({ ...prev, ...next }))
    setAllErrors((prev) => ({ ...prev, ...next }))
    setTouched((prev) => {
      const merged = { ...prev }
      for (const field of fields) merged[String(field)] = true
      return merged
    })
    return valid
  }, [])

  const fieldError = useCallback(
    (field: keyof T): string | undefined => {
      const key = field as string
      if (!touched[key]) return undefined
      return errors[key]
    },
    [touched, errors],
  )

  const reset = useCallback((next?: T) => {
    if (next) initialRef.current = next
    setValues(initialRef.current)
    setTouched({})
    setErrors({})
    setAllErrors({})
  }, [])

  return {
    values,
    errors,
    allErrors,
    touched,
    dirty,
    setField,
    setValues: setValuesWhole,
    onBlur,
    validate,
    validateFields,
    fieldError,
    reset,
  }
}
