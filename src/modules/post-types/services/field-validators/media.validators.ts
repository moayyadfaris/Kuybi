import { FieldDefinition } from '../../entities/field-definition.entity'

import { FieldValidationError, FileFieldValue } from './types'

/**
 * File URLs are rendered as links and media sources: only absolute http(s) URLs, so a
 * stored javascript: or data: URL cannot run when clicked
 */
const isHttpUrl = (value: unknown): boolean => {
  if (typeof value !== 'string') return false
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

export function validateFile(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
  const errors: FieldValidationError[] = []

  // Expect either a URL string or file metadata object
  if (value === null || (typeof value !== 'string' && typeof value !== 'object')) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_TYPE',
      message: `Field '${fieldDef.label}' must be a file URL or file metadata object`,
      value
    })
    return errors
  }

  const options = fieldDef.fieldOptions || {}
  const invalidUrl = (url: unknown): FieldValidationError => ({
    fieldName: fieldDef.name,
    fieldType: fieldDef.fieldType,
    errorCode: 'INVALID_FILE_URL',
    message: `Field '${fieldDef.label}' must link to an http(s) URL`,
    value: url
  })

  if (typeof value === 'string') {
    if (!isHttpUrl(value)) errors.push(invalidUrl(value))
    return errors
  }

  // An object carries the URL plus the file's declared type and size
  if (typeof value === 'object') {
    const file = value as FileFieldValue
    if (!file.url) {
      errors.push({
        fieldName: fieldDef.name,
        fieldType: fieldDef.fieldType,
        errorCode: 'MISSING_FILE_URL',
        message: `Field '${fieldDef.label}' file metadata must include a URL`,
        value
      })
    } else if (!isHttpUrl(file.url)) {
      errors.push(invalidUrl(file.url))
    }

    // Validate file type
    if (options.allowedTypes && file.mimeType) {
      const allowedTypes = Array.isArray(options.allowedTypes)
        ? options.allowedTypes
        : [options.allowedTypes]
      if (!allowedTypes.includes(file.mimeType)) {
        errors.push({
          fieldName: fieldDef.name,
          fieldType: fieldDef.fieldType,
          errorCode: 'INVALID_FILE_TYPE',
          message: `Field '${fieldDef.label}' only accepts: ${allowedTypes.join(', ')}`,
          value: file.mimeType,
          constraint: allowedTypes
        })
      }
    }

    // Validate file size
    if (options.maxSize && typeof file.size === 'number' && file.size > options.maxSize) {
      errors.push({
        fieldName: fieldDef.name,
        fieldType: fieldDef.fieldType,
        errorCode: 'FILE_TOO_LARGE',
        message: `Field '${fieldDef.label}' file exceeds maximum size of ${options.maxSize} bytes`,
        value: file.size,
        constraint: options.maxSize
      })
    }
  }

  return errors
}

export function validateImage(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
  const errors = validateFile(fieldDef, value)

  // Additional image-specific validation
  const image = typeof value === 'object' && value !== null ? (value as FileFieldValue) : null
  if (image && image.width && image.height) {
    const options = fieldDef.fieldOptions || {}

    // Min dimensions
    if (options.minWidth && image.width < options.minWidth) {
      errors.push({
        fieldName: fieldDef.name,
        fieldType: fieldDef.fieldType,
        errorCode: 'IMAGE_TOO_SMALL',
        message: `Field '${fieldDef.label}' image width must be at least ${options.minWidth}px`,
        value: image.width,
        constraint: options.minWidth
      })
    }

    if (options.minHeight && image.height < options.minHeight) {
      errors.push({
        fieldName: fieldDef.name,
        fieldType: fieldDef.fieldType,
        errorCode: 'IMAGE_TOO_SMALL',
        message: `Field '${fieldDef.label}' image height must be at least ${options.minHeight}px`,
        value: image.height,
        constraint: options.minHeight
      })
    }

    // Max dimensions
    if (options.maxWidth && image.width > options.maxWidth) {
      errors.push({
        fieldName: fieldDef.name,
        fieldType: fieldDef.fieldType,
        errorCode: 'IMAGE_TOO_LARGE',
        message: `Field '${fieldDef.label}' image width must be at most ${options.maxWidth}px`,
        value: image.width,
        constraint: options.maxWidth
      })
    }

    if (options.maxHeight && image.height > options.maxHeight) {
      errors.push({
        fieldName: fieldDef.name,
        fieldType: fieldDef.fieldType,
        errorCode: 'IMAGE_TOO_LARGE',
        message: `Field '${fieldDef.label}' image height must be at most ${options.maxHeight}px`,
        value: image.height,
        constraint: options.maxHeight
      })
    }
  }

  return errors
}

export function validateGallery(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
  const errors: FieldValidationError[] = []

  if (!Array.isArray(value)) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'INVALID_TYPE',
      message: `Field '${fieldDef.label}' must be an array of images`,
      value
    })
    return errors
  }

  const options = fieldDef.fieldOptions || {}
  const rules = fieldDef.validationRules || {}

  // Min count
  if (rules.min !== undefined && value.length < rules.min) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'MIN_IMAGES',
      message: `Field '${fieldDef.label}' must have at least ${rules.min} images`,
      value,
      constraint: rules.min
    })
  }

  // Max count
  if (options.maxCount !== undefined && value.length > options.maxCount) {
    errors.push({
      fieldName: fieldDef.name,
      fieldType: fieldDef.fieldType,
      errorCode: 'MAX_IMAGES',
      message: `Field '${fieldDef.label}' must have at most ${options.maxCount} images`,
      value,
      constraint: options.maxCount
    })
  }

  // Validate each image
  value.forEach((image, index) => {
    const imageErrors = validateImage(fieldDef, image)
    imageErrors.forEach(err => {
      errors.push({
        ...err,
        message: `${err.message} (image ${index + 1})`
      })
    })
  })

  return errors
}

export function validateVideo(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
  // Similar to file validation
  return validateFile(fieldDef, value)
}
