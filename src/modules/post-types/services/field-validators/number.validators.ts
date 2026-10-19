import { FieldDefinition } from '../../entities/field-definition.entity'

import { FieldValidationError } from './types'

/** Tolerance for floating point comparison of step multiples */
const STEP_EPSILON = 1e-9

export function validateNumber(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
  const errors: FieldValidationError[] = []

  const numValue = typeof value === 'string' ? parseFloat(value) : value

  if (typeof numValue !== 'number' || isNaN(numValue)) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_TYPE',
      message: `Field '${fieldDef.label}' must be a number`,
      value
    })
    return errors
  }

  const rules = fieldDef.validationRules || {}

  // Integer validation
  if (rules.integer && !Number.isInteger(numValue)) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'NOT_INTEGER',
      message: `Field '${fieldDef.label}' must be an integer`,
      value,
      constraint: rules.integer
    })
  }

  // Min value
  if (rules.min !== undefined && numValue < rules.min) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'MIN_VALUE',
      message: `Field '${fieldDef.label}' must be at least ${rules.min}`,
      value,
      constraint: rules.min
    })
  }

  // Max value
  if (rules.max !== undefined && numValue > rules.max) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'MAX_VALUE',
      message: `Field '${fieldDef.label}' must be at most ${rules.max}`,
      value,
      constraint: rules.max
    })
  }

  // Step validation
  // Compare with the nearest multiple: 0.3 % 0.1 is 0.0999... in floating point
  const steps = rules.step ? numValue / rules.step : 0
  if (
    rules.step &&
    Math.abs(steps - Math.round(steps)) > STEP_EPSILON * Math.max(1, Math.abs(steps))
  ) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_STEP',
      message: `Field '${fieldDef.label}' must be a multiple of ${rules.step}`,
      value,
      constraint: rules.step
    })
  }

  return errors
}

export function validateCurrency(
  fieldDef: FieldDefinition,
  value: unknown
): FieldValidationError[] {
  const errors: FieldValidationError[] = []

  const numValue = typeof value === 'string' ? parseFloat(value) : value

  if (typeof numValue !== 'number' || isNaN(numValue)) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_TYPE',
      message: `Field '${fieldDef.label}' must be a number`,
      value
    })
    return errors
  }

  const rules = fieldDef.validationRules || {}

  // Min value (typically 0 for prices)
  if (rules.min !== undefined && numValue < rules.min) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'MIN_VALUE',
      message: `Field '${fieldDef.label}' must be at least ${rules.min}`,
      value,
      constraint: rules.min
    })
  }

  // Max value
  if (rules.max !== undefined && numValue > rules.max) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'MAX_VALUE',
      message: `Field '${fieldDef.label}' must be at most ${rules.max}`,
      value,
      constraint: rules.max
    })
  }

  // Decimal places validation
  const decimals = rules.decimals !== undefined ? rules.decimals : 2
  const decimalPart = numValue.toString().split('.')[1]
  if (decimalPart && decimalPart.length > decimals) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_DECIMALS',
      message: `Field '${fieldDef.label}' must have at most ${decimals} decimal places`,
      value,
      constraint: decimals
    })
  }

  return errors
}
