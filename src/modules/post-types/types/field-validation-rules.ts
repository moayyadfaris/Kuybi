/**
 * Validation settings a field definition may carry (stored as jsonb). Which ones apply
 * depends on the field type; FieldValidationService reads them.
 */
export interface FieldValidationRules {
  /** number / range fields */
  min?: number
  max?: number
  step?: number
  integer?: boolean
  decimals?: number
  /** text fields */
  minLength?: number
  maxLength?: number
  /** text fields: regular expression the value must match */
  pattern?: string
  /** date fields (ISO dates) */
  minDate?: string
  maxDate?: string
  /** url fields: allowed schemes, e.g. ['https'] */
  protocol?: string | string[]
  /** repeater / nested fields */
  maxDepth?: number
  [rule: string]: unknown
}

/** Type-specific settings of a field definition (stored as jsonb) */
export interface FieldOptions {
  /** select / radio / checkbox fields */
  choices?: unknown[]
  allowOther?: boolean
  multiple?: boolean
  /** date / text formatting */
  format?: string
  /** file / image / gallery fields */
  allowedTypes?: string[]
  maxSize?: number
  maxCount?: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  [option: string]: unknown
}
