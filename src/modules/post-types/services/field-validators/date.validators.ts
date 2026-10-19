import { FieldDefinition } from '../../entities/field-definition.entity'

import { FieldValidationError } from './types'

export function validateDate(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
  const errors: FieldValidationError[] = []

  let date: Date
  if (typeof value === 'string') {
    date = new Date(value)
  } else if (value instanceof Date) {
    date = value
  } else {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_TYPE',
      message: `Field '${fieldDef.label}' must be a valid date`,
      value
    })
    return errors
  }

  if (isNaN(date.getTime())) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_DATE',
      message: `Field '${fieldDef.label}' must be a valid date`,
      value
    })
    return errors
  }

  const rules = fieldDef.validationRules || {}

  // Min date
  if (rules.minDate) {
    const minDate = rules.minDate === 'today' ? new Date() : new Date(rules.minDate)
    minDate.setHours(0, 0, 0, 0)
    const checkDate = new Date(date)
    checkDate.setHours(0, 0, 0, 0)

    if (checkDate < minDate) {
      errors.push({
        fieldName: fieldDef.name,
        fieldType: fieldDef.fieldType,
        errorCode: 'MIN_DATE',
        message: `Field '${fieldDef.label}' must be on or after ${minDate.toISOString().split('T')[0]}`,
        value,
        constraint: rules.minDate
      })
    }
  }

  // Max date
  if (rules.maxDate) {
    const maxDate = rules.maxDate === 'today' ? new Date() : new Date(rules.maxDate)
    maxDate.setHours(23, 59, 59, 999)
    const checkDate = new Date(date)
    checkDate.setHours(23, 59, 59, 999)

    if (checkDate > maxDate) {
      errors.push({
        fieldName: fieldDef.name,
        fieldType: fieldDef.fieldType,
        errorCode: 'MAX_DATE',
        message: `Field '${fieldDef.label}' must be on or before ${maxDate.toISOString().split('T')[0]}`,
        value,
        constraint: rules.maxDate
      })
    }
  }

  return errors
}

export function validateDateTime(
  fieldDef: FieldDefinition,
  value: unknown
): FieldValidationError[] {
  // Similar to date but includes time
  return validateDate(fieldDef, value)
}

export function validateTime(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
  const errors: FieldValidationError[] = []

  if (typeof value !== 'string') {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_TYPE',
      message: `Field '${fieldDef.label}' must be a string (time format HH:MM or HH:MM:SS)`,
      value
    })
    return errors
  }

  // Validate time format (HH:MM or HH:MM:SS)
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/
  if (!timeRegex.test(value)) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_TIME',
      message: `Field '${fieldDef.label}' must be a valid time (HH:MM or HH:MM:SS)`,
      value
    })
  }

  return errors
}
