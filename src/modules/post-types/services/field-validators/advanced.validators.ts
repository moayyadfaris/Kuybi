import { FieldDefinition } from '../../entities/field-definition.entity'

import { FieldValidationError } from './types'

export function validateColor(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
  const errors: FieldValidationError[] = []

  if (typeof value !== 'string') {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_TYPE',
      message: `Field '${fieldDef.label}' must be a string (color code)`,
      value
    })
    return errors
  }

  const options = fieldDef.fieldOptions || {}
  const format = options.format || 'hex'

  if (format === 'hex') {
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3}|[A-Fa-f0-9]{8})$/
    if (!hexRegex.test(value)) {
      errors.push({
        fieldName: fieldDef.name,
        fieldType: fieldDef.fieldType,
        errorCode: 'INVALID_COLOR',
        message: `Field '${fieldDef.label}' must be a valid hex color (e.g., #FFFFFF)`,
        value
      })
    }
  } else if (format === 'rgb' || format === 'rgba') {
    const rgbRegex = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/
    if (!rgbRegex.test(value)) {
      errors.push({
        fieldName: fieldDef.name,
        fieldType: fieldDef.fieldType,
        errorCode: 'INVALID_COLOR',
        message: `Field '${fieldDef.label}' must be a valid RGB color (e.g., rgb(255, 255, 255))`,
        value
      })
    }
  }

  return errors
}

export function validateJson(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
  const errors: FieldValidationError[] = []

  // JSON fields accept objects or arrays
  if (typeof value !== 'object' || value === null) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_TYPE',
      message: `Field '${fieldDef.label}' must be a valid JSON object or array`,
      value
    })
    return errors
  }

  const rules = fieldDef.validationRules || {}

  // Max depth validation
  if (rules.maxDepth !== undefined) {
    const depth = getObjectDepth(value)
    if (depth > rules.maxDepth) {
      errors.push({
        fieldName: fieldDef.name,
        fieldType: fieldDef.fieldType,
        errorCode: 'MAX_DEPTH_EXCEEDED',
        message: `Field '${fieldDef.label}' JSON depth must be at most ${rules.maxDepth}`,
        value,
        constraint: rules.maxDepth
      })
    }
  }

  return errors
}

export function validateRepeater(
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

  const rules = fieldDef.validationRules || {}

  // Min items
  if (rules.min !== undefined && value.length < rules.min) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'MIN_ITEMS',
      message: `Field '${fieldDef.label}' must have at least ${rules.min} items`,
      value,
      constraint: rules.min
    })
  }

  // Max items
  if (rules.max !== undefined && value.length > rules.max) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'MAX_ITEMS',
      message: `Field '${fieldDef.label}' must have at most ${rules.max} items`,
      value,
      constraint: rules.max
    })
  }

  // Validate each item is an object
  value.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) {
      errors.push({
        fieldName: fieldDef.name,
        fieldType: fieldDef.fieldType,
        errorCode: 'INVALID_ITEM',
        message: `Field '${fieldDef.label}' item ${index + 1} must be an object`,
        value: item
      })
    }
  })

  return errors
}

export function validateGroup(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
  const errors: FieldValidationError[] = []

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_TYPE',
      message: `Field '${fieldDef.label}' must be an object`,
      value
    })
  }

  return errors
}

/**
 * Calculate the depth of a nested object
 */
export function getObjectDepth(obj: unknown, currentDepth = 1): number {
  if (typeof obj !== 'object' || obj === null) {
    return currentDepth
  }

  const depths = Object.values(obj).map(value => getObjectDepth(value, currentDepth + 1))

  return Math.max(currentDepth, ...depths)
}
