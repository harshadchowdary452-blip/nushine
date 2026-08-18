import { useState, useCallback, useRef } from "react"

export type ValidationErrors = Record<string, string>

export interface UseFormValidationOptions<T extends Record<string, unknown>> {
  validate: (values: T) => ValidationErrors
  initialValues?: T
}

/**
 * Enterprise form validation hook.
 * Validates on blur (per-field) and on submit (all fields).
 * No validation while typing — only after meaningful interaction.
 */
export function useFormValidation<T extends Record<string, unknown>>(
  options: UseFormValidationOptions<T>,
) {
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = useState(false)
  const firstErrorRef = useRef<string | null>(null)

  const validateField = useCallback(
    (name: string, value: unknown, allValues?: T) => {
      const testValues = allValues || ({ [name]: value } as T)
      const allErrors = options.validate(testValues)
      return allErrors[name] || ""
    },
    [options],
  )

  const handleBlur = useCallback(
    (name: string, value: unknown, allValues?: T) => {
      setTouched((prev) => ({ ...prev, [name]: true }))
      const error = validateField(name, value, allValues)
      setErrors((prev) => {
        const next = { ...prev }
        if (error) {
          next[name] = error
        } else {
          delete next[name]
        }
        return next
      })
    },
    [validateField],
  )

  const validateAll = useCallback(
    (values: T): boolean => {
      const allErrors = options.validate(values)
      setErrors(allErrors)
      setSubmitted(true)

      const allTouched: Record<string, boolean> = {}
      for (const key of Object.keys(values)) {
        allTouched[key] = true
      }
      setTouched(allTouched)

      firstErrorRef.current = Object.keys(allErrors)[0] || null
      return Object.keys(allErrors).length === 0
    },
    [options],
  )

  const clearError = useCallback((name: string) => {
    setErrors((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }, [])

  const getError = useCallback(
    (name: string) => (submitted || touched[name] ? errors[name] : undefined),
    [errors, touched, submitted],
  )

  const hasError = useCallback(
    (name: string) => Boolean(getError(name)),
    [getError],
  )

  const reset = useCallback(() => {
    setErrors({})
    setTouched({})
    setSubmitted(false)
    firstErrorRef.current = null
  }, [])

  return {
    errors,
    touched,
    submitted,
    firstErrorRef,
    handleBlur,
    validateAll,
    clearError,
    getError,
    hasError,
    reset,
  }
}

export function getFieldId(prefix: string, name: string): string {
  return `${prefix}-${name}`
}
