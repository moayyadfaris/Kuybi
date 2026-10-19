import { FieldDefinition } from '../../entities/field-definition.entity'

import { FieldValidationError } from './types'

export function validateRelation(
  fieldDef: FieldDefinition,
  value: unknown
): FieldValidationError[] {
  const errors: FieldValidationError[] = []

  const options = fieldDef.fieldOptions || {}

  if (options.multiple) {
    if (!Array.isArray(value)) {
      errors.push({
        fieldName: fieldDef.name,
        fieldType: fieldDef.fieldType,
        errorCode: 'INVALID_TYPE',
        message: `Field '${fieldDef.label}' must be an array of UUIDs`,
        value
      })
      return errors
    }

    // Validate each UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    value.forEach(id => {
      if (typeof id !== 'string' || !uuidRegex.test(id)) {
        errors.push({
          fieldName: fieldDef.name,
          fieldType: fieldDef.fieldType,
          errorCode: 'INVALID_UUID',
          message: `Field '${fieldDef.label}' contains invalid UUID: ${id}`,
          value: id
        })
      }
    })
  } else {
    if (typeof value !== 'string') {
      errors.push({
        fieldName: fieldDef.name,
        fieldType: fieldDef.fieldType,
        errorCode: 'INVALID_TYPE',
        message: `Field '${fieldDef.label}' must be a UUID string`,
        value
      })
      return errors
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(value)) {
      errors.push({
        fieldName: fieldDef.name,
        fieldType: fieldDef.fieldType,
        errorCode: 'INVALID_UUID',
        message: `Field '${fieldDef.label}' must be a valid UUID`,
        value
      })
    }
  }

  return errors
}

export function validateUser(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
  // Same as relation - validates UUIDs
  return validateRelation(fieldDef, value)
}

export function validateTaxonomy(
  fieldDef: FieldDefinition,
  value: unknown
): FieldValidationError[] {
  // Same as relation - validates UUIDs
  return validateRelation(fieldDef, value)
}
