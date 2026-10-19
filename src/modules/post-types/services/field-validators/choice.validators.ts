import { FieldDefinition } from '../../entities/field-definition.entity'

import { FieldValidationError } from './types'

export function validateCheckbox(
  fieldDef: FieldDefinition,
  value: unknown
): FieldValidationError[] {
  const errors: FieldValidationError[] = []

  if (typeof value !== 'boolean') {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_TYPE',
      message: `Field '${fieldDef.label}' must be a boolean`,
      value
    })
  }

  return errors
}

export function validateRadio(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
  const errors: FieldValidationError[] = []

  const options = fieldDef.fieldOptions || {}
  const choices = options.choices || []

  if (!Array.isArray(choices) || choices.length === 0) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'NO_CHOICES',
      message: `Field '${fieldDef.label}' has no choices defined`,
      value
    })
    return errors
  }

  if (!choices.includes(value)) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_CHOICE',
      message: `Field '${fieldDef.label}' must be one of: ${choices.join(', ')}`,
      value,
      constraint: choices
    })
  }

  return errors
}

export function validateSelect(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
  // Same as radio
  return validateRadio(fieldDef, value)
}

export function validateMultiselect(
  fieldDef: FieldDefinition,
  value: unknown
): FieldValidationError[] {
  const errors: FieldValidationError[] = []

  if (!Array.isArray(value)) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_TYPE',
      message: `Field '${fieldDef.label}' must be an array`,
      value
    })
    return errors
  }

  const options = fieldDef.fieldOptions || {}
  const choices = options.choices || []
  const rules = fieldDef.validationRules || {}

  // Validate each selected value
  for (const item of value) {
    if (!choices.includes(item) && !options.allowOther) {
      errors.push({
        fieldName: fieldDef.name,
        fieldType: fieldDef.fieldType,
        errorCode: 'INVALID_CHOICE',
        message: `Field '${fieldDef.label}' contains invalid choice: ${item}`,
        value: item,
        constraint: choices
      })
    }
  }

  // Min selections
  if (rules.min !== undefined && value.length < rules.min) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'MIN_SELECTIONS',
      message: `Field '${fieldDef.label}' must have at least ${rules.min} selections`,
      value,
      constraint: rules.min
    })
  }

  // Max selections
  if (rules.max !== undefined && value.length > rules.max) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'MAX_SELECTIONS',
      message: `Field '${fieldDef.label}' must have at most ${rules.max} selections`,
      value,
      constraint: rules.max
    })
  }

  return errors
}

export function validateToggle(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
  // Same as checkbox
  return validateCheckbox(fieldDef, value)
}
