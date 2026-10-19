import { FieldDefinition } from '../../entities/field-definition.entity'

import { FieldValidationError } from './types'

/** URL schemes allowed when a url field does not configure `protocol` */
const DEFAULT_URL_PROTOCOLS = ['http', 'https']
/** Schemes that run code when rendered as a link; never accepted */
const EXECUTABLE_URL_PROTOCOLS = ['javascript', 'data', 'vbscript', 'file']
/** E.164 allows at most 15 digits; 7 covers the shortest national numbers */
const PHONE_DIGITS_REGEX = /^\+?\d{7,15}$/
const PHONE_FORMAT_REGEX = /^\+?[\d\s().-]+$/

export function validateText(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
  const errors: FieldValidationError[] = []

  if (typeof value !== 'string') {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_TYPE',
      message: `Field '${fieldDef.label}' must be a string`,
      value
    })
    return errors
  }

  const rules = fieldDef.validationRules || {}

  // Min length
  if (rules.minLength && value.length < rules.minLength) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'MIN_LENGTH',
      message: `Field '${fieldDef.label}' must be at least ${rules.minLength} characters`,
      value,
      constraint: rules.minLength
    })
  }

  // Max length
  if (rules.maxLength && value.length > rules.maxLength) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'MAX_LENGTH',
      message: `Field '${fieldDef.label}' must be at most ${rules.maxLength} characters`,
      value,
      constraint: rules.maxLength
    })
  }

  // Pattern
  if (rules.pattern) {
    const regex = new RegExp(rules.pattern)
    if (!regex.test(value)) {
      errors.push({
        fieldName: fieldDef.name,
        fieldType: fieldDef.fieldType,
        errorCode: 'PATTERN_MISMATCH',
        message: `Field '${fieldDef.label}' does not match the required pattern`,
        value,
        constraint: rules.pattern
      })
    }
  }

  return errors
}

export function validateTextarea(
  fieldDef: FieldDefinition,
  value: unknown
): FieldValidationError[] {
  // Same as text, but typically allows longer content
  return validateText(fieldDef, value)
}

export function validateWysiwyg(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
  const errors: FieldValidationError[] = []

  if (typeof value !== 'string') {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_TYPE',
      message: `Field '${fieldDef.label}' must be a string (HTML content)`,
      value
    })
    return errors
  }

  const rules = fieldDef.validationRules || {}

  // Min/Max length on plain text (strip HTML)
  const plainText = value.replace(/<[^>]*>/g, '')
  if (rules.minLength && plainText.length < rules.minLength) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'MIN_LENGTH',
      message: `Field '${fieldDef.label}' content must be at least ${rules.minLength} characters`,
      value,
      constraint: rules.minLength
    })
  }

  if (rules.maxLength && plainText.length > rules.maxLength) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'MAX_LENGTH',
      message: `Field '${fieldDef.label}' content must be at most ${rules.maxLength} characters`,
      value,
      constraint: rules.maxLength
    })
  }

  return errors
}

export function validateEmail(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
  const errors: FieldValidationError[] = []

  if (typeof value !== 'string') {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_TYPE',
      message: `Field '${fieldDef.label}' must be a string`,
      value
    })
    return errors
  }

  // Email regex validation
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  if (!emailRegex.test(value)) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_EMAIL',
      message: `Field '${fieldDef.label}' must be a valid email address`,
      value
    })
  }

  return errors
}

export function validateUrl(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
  const errors: FieldValidationError[] = []

  if (typeof value !== 'string') {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_TYPE',
      message: `Field '${fieldDef.label}' must be a string`,
      value
    })
    return errors
  }

  try {
    const url = new URL(value)
    const rules = fieldDef.validationRules || {}

    // Protocol validation. Defaults to http/https; schemes that execute code when the URL
    // is rendered as a link are rejected even if a field definition allows them.
    const protocol = url.protocol.replace(':', '').toLowerCase()
    const allowedProtocols: string[] = rules.protocol
      ? Array.isArray(rules.protocol)
        ? rules.protocol
        : [rules.protocol]
      : DEFAULT_URL_PROTOCOLS
    if (EXECUTABLE_URL_PROTOCOLS.includes(protocol) || !allowedProtocols.includes(protocol)) {
      errors.push({
        fieldName: fieldDef.name,
        fieldType: fieldDef.fieldType,
        errorCode: 'INVALID_PROTOCOL',
        message: `Field '${fieldDef.label}' must use one of these protocols: ${allowedProtocols.join(', ')}`,
        value,
        constraint: allowedProtocols
      })
    }
  } catch {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_URL',
      message: `Field '${fieldDef.label}' must be a valid URL`,
      value
    })
  }

  return errors
}

export function validateTel(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
  const errors: FieldValidationError[] = []

  if (typeof value !== 'string') {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_TYPE',
      message: `Field '${fieldDef.label}' must be a string`,
      value
    })
    return errors
  }

  const rules = fieldDef.validationRules || {}

  // Basic phone number validation (digits, spaces, hyphens, parentheses, plus)
  if (rules.pattern) {
    const customRegex = new RegExp(rules.pattern)
    if (!customRegex.test(value)) {
      errors.push({
        fieldName: fieldDef.name,
        fieldType: fieldDef.fieldType,
        errorCode: 'INVALID_PHONE',
        message: `Field '${fieldDef.label}' does not match the required phone format`,
        value,
        constraint: rules.pattern
      })
    }
  } else if (
    !PHONE_FORMAT_REGEX.test(value) ||
    !PHONE_DIGITS_REGEX.test(value.replace(/[\s().-]/g, ''))
  ) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_PHONE',
      message: `Field '${fieldDef.label}' must be a valid phone number`,
      value
    })
  }

  return errors
}

export function validateCode(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
  const errors: FieldValidationError[] = []

  if (typeof value !== 'string') {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_TYPE',
      message: `Field '${fieldDef.label}' must be a string (code)`,
      value
    })
    return errors
  }

  const rules = fieldDef.validationRules || {}

  // Max length for code
  if (rules.maxLength && value.length > rules.maxLength) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'MAX_LENGTH',
      message: `Field '${fieldDef.label}' code must be at most ${rules.maxLength} characters`,
      value,
      constraint: rules.maxLength
    })
  }

  return errors
}
