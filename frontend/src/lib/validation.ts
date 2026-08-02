/**
 * Enterprise validation system (Part 3D).
 *
 * One framework-free rule engine every module inherits so validation behaves
 * identically across Patients, Appointments, Cases, Treatment Plans, Billing,
 * CRM, Hospitals and Administration.
 *
 * Rules are pure functions: `(value, allValues) => message | undefined`.
 * Modules compose them into a `FieldRules` map consumed by `useFormState`.
 */

export type FieldValue = string | number | boolean | null | undefined

export type FieldValidator = (
  value: FieldValue,
  values: Record<string, FieldValue>,
) => string | undefined

export type FieldRules = Record<string, FieldValidator[]>

export type FieldErrors = Record<string, string | undefined>

/** Value is considered "empty" when null/undefined/blank/empty array. */
export function isEmptyValue(value: FieldValue): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0
  return false
}

export function required(message = "This field is required"): FieldValidator {
  return (value) => (isEmptyValue(value) ? message : undefined)
}

export function minLength(min: number, message?: string): FieldValidator {
  return (value) => {
    const length = String(value ?? "").length
    if (length > 0 && length < min) return message ?? `Must be at least ${min} characters`
    return undefined
  }
}

export function maxLength(max: number, message?: string): FieldValidator {
  return (value) => {
    const length = String(value ?? "").length
    if (length > max) return message ?? `Must be ${max} characters or fewer`
    return undefined
  }
}

export function email(message = "Enter a valid email address (e.g. name@clinic.com)"): FieldValidator {
  return (value) => {
    const v = String(value ?? "").trim()
    if (!v) return undefined
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? undefined : message
  }
}

export function phone(message = "Enter a valid phone number (10–15 digits)"): FieldValidator {
  return (value) => {
    const v = String(value ?? "").replace(/[\s().-]/g, "")
    if (!v) return undefined
    return /^\+?\d{10,15}$/.test(v) ? undefined : message
  }
}

export function url(message = "Enter a valid URL (e.g. https://clinic.com)"): FieldValidator {
  return (value) => {
    const v = String(value ?? "").trim()
    if (!v) return undefined
    return /^https?:\/\/.+/i.test(v) ? undefined : message
  }
}

export function pattern(regex: RegExp, message: string): FieldValidator {
  return (value) => {
    const v = String(value ?? "")
    if (!v) return undefined
    return regex.test(v) ? undefined : message
  }
}

export function min(n: number, message?: string): FieldValidator {
  return (value) => {
    if (isEmptyValue(value)) return undefined
    const num = Number(value)
    if (Number.isFinite(num) && num < n) return message ?? `Must be ${n} or more`
    return undefined
  }
}

export function max(n: number, message?: string): FieldValidator {
  return (value) => {
    if (isEmptyValue(value)) return undefined
    const num = Number(value)
    if (Number.isFinite(num) && num > n) return message ?? `Must be ${n} or less`
    return undefined
  }
}

export function oneOf(options: readonly (string | number)[], message = "Select a valid option"): FieldValidator {
  const set = new Set(options)
  return (value) => {
    if (isEmptyValue(value)) return undefined
    return set.has(value as string | number) ? undefined : message
  }
}

/** Cross-field: require `other` to be non-empty when `value` is present. */
export function requires(other: string, message?: string): FieldValidator {
  return (value, values) => {
    if (isEmptyValue(value)) return undefined
    return isEmptyValue(values[other]) ? message ?? `This requires a value for ${other}` : undefined
  }
}

/** Custom rule wrapper for module-specific business validation. */
export function custom(fn: FieldValidator): FieldValidator {
  return fn
}

/**
 * Runs every rule for every field and returns the first message per field.
 * Rules run in declaration order; the first failure wins.
 */
export function runValidators(rules: FieldRules, values: Record<string, FieldValue>): FieldErrors {
  const errors: FieldErrors = {}
  for (const [field, fieldRules] of Object.entries(rules)) {
    const message = runValidatorsForField(field, fieldRules, values)
    if (message) errors[field] = message
  }
  return errors
}

export function runValidatorsForField(
  field: string,
  fieldRules: FieldValidator[] | undefined,
  values: Record<string, FieldValue>,
): string | undefined {
  for (const rule of fieldRules ?? []) {
    const message = rule(values[field], values)
    if (message) return message
  }
  return undefined
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.values(errors).some(Boolean)
}

export function errorCount(errors: FieldErrors): number {
  return Object.values(errors).filter(Boolean).length
}

/** Human-readable list of all error messages (for summaries/announcements). */
export function errorMessages(errors: FieldErrors): string[] {
  return Object.values(errors).filter((m): m is string => Boolean(m))
}
