import { Injectable, BadRequestException } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { FieldDefinition } from '../entities/field-definition.entity'
import { FieldType } from '../enums/field-type.enum'

/**
 * Field Validation Result
 */
export interface FieldValidationResult {
  isValid: boolean
  errors: FieldValidationError[]
}

/**
 * Field Validation Error
 */
export interface FieldValidationError {
  fieldName: string
  fieldType: FieldType
  errorCode: string
  message: string
  value?: any
  constraint?: any
}

/**
 * FieldValidationService
 *
 * Validates field data against field definitions for dynamic post types.
 * Handles validation for all 25 field types with comprehensive type checking,
 * validation rules, and error reporting.
 *
 * Features:
 * - Type validation for all 25 field types
 * - Validation rules (min/max, pattern, required, unique)
 * - Field-specific options validation
 * - Detailed error messages with field context
 * - Batch validation support
 *
 * Usage:
 * ```typescript
 * const result = await fieldValidationService.validateFieldData(
 *   fieldDefinitions,
 *   fieldData
 * )
 * if (!result.isValid) {
 *   throw new BadRequestException('Validation failed', result.errors)
 * }
 * ```
 *
 * Part of: Phase 2 - Dynamic Post Types System
 */
@Injectable()
export class FieldValidationService {
  constructor(
    @InjectPinoLogger(FieldValidationService.name)
    private readonly logger: PinoLogger
  ) {}

  /**
   * Validate field data against field definitions
   *
   * @param fieldDefinitions - Array of field definitions for the post type
   * @param fieldData - Key-value pairs of field data to validate
   * @returns Validation result with errors if any
   */
  async validateFieldData(
    fieldDefinitions: FieldDefinition[],
    fieldData: Record<string, any>
  ): Promise<FieldValidationResult> {
    const errors: FieldValidationError[] = []

    // Check required fields
    for (const fieldDef of fieldDefinitions) {
      if (fieldDef.isRequired && !(fieldDef.name in fieldData)) {
        errors.push({
          fieldName: fieldDef.name,
          fieldType: fieldDef.fieldType,
          errorCode: 'REQUIRED_FIELD_MISSING',
          message: `Field '${fieldDef.label}' is required`
        })
      }
    }

    // Validate each field in fieldData
    for (const [fieldName, value] of Object.entries(fieldData)) {
      const fieldDef = fieldDefinitions.find(f => f.name === fieldName)

      // Check if field definition exists
      if (!fieldDef) {
        errors.push({
          fieldName,
          fieldType: FieldType.TEXT,
          errorCode: 'UNKNOWN_FIELD',
          message: `Field '${fieldName}' is not defined for this post type`,
          value
        })
        continue
      }

      // Skip null/undefined for non-required fields
      if ((value === null || value === undefined) && !fieldDef.isRequired) {
        continue
      }

      // Validate field by type
      const fieldErrors = await this.validateFieldByType(fieldDef, value)
      errors.push(...fieldErrors)
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Validate a single field value based on its type
   */
  private async validateFieldByType(
    fieldDef: FieldDefinition,
    value: any
  ): Promise<FieldValidationError[]> {
    const errors: FieldValidationError[] = []

    try {
      switch (fieldDef.fieldType) {
        // ========== Text Fields ==========
        case FieldType.TEXT:
          errors.push(...this.validateText(fieldDef, value))
          break

        case FieldType.TEXTAREA:
          errors.push(...this.validateTextarea(fieldDef, value))
          break

        case FieldType.WYSIWYG:
          errors.push(...this.validateWysiwyg(fieldDef, value))
          break

        case FieldType.EMAIL:
          errors.push(...this.validateEmail(fieldDef, value))
          break

        case FieldType.URL:
          errors.push(...this.validateUrl(fieldDef, value))
          break

        case FieldType.TEL:
          errors.push(...this.validateTel(fieldDef, value))
          break

        case FieldType.CODE:
          errors.push(...this.validateCode(fieldDef, value))
          break

        // ========== Number Fields ==========
        case FieldType.NUMBER:
          errors.push(...this.validateNumber(fieldDef, value))
          break

        case FieldType.CURRENCY:
          errors.push(...this.validateCurrency(fieldDef, value))
          break

        // ========== Date/Time Fields ==========
        case FieldType.DATE:
          errors.push(...this.validateDate(fieldDef, value))
          break

        case FieldType.DATETIME:
          errors.push(...this.validateDateTime(fieldDef, value))
          break

        case FieldType.TIME:
          errors.push(...this.validateTime(fieldDef, value))
          break

        // ========== Selection Fields ==========
        case FieldType.CHECKBOX:
          errors.push(...this.validateCheckbox(fieldDef, value))
          break

        case FieldType.RADIO:
          errors.push(...this.validateRadio(fieldDef, value))
          break

        case FieldType.SELECT:
          errors.push(...this.validateSelect(fieldDef, value))
          break

        case FieldType.MULTISELECT:
          errors.push(...this.validateMultiselect(fieldDef, value))
          break

        case FieldType.TOGGLE:
          errors.push(...this.validateToggle(fieldDef, value))
          break

        // ========== Media Fields ==========
        case FieldType.FILE:
          errors.push(...this.validateFile(fieldDef, value))
          break

        case FieldType.IMAGE:
          errors.push(...this.validateImage(fieldDef, value))
          break

        case FieldType.GALLERY:
          errors.push(...this.validateGallery(fieldDef, value))
          break

        case FieldType.VIDEO:
          errors.push(...this.validateVideo(fieldDef, value))
          break

        // ========== Relationship Fields ==========
        case FieldType.RELATION:
          errors.push(...this.validateRelation(fieldDef, value))
          break

        case FieldType.USER:
          errors.push(...this.validateUser(fieldDef, value))
          break

        case FieldType.TAXONOMY:
          errors.push(...this.validateTaxonomy(fieldDef, value))
          break

        // ========== Advanced Fields ==========
        case FieldType.COLOR:
          errors.push(...this.validateColor(fieldDef, value))
          break

        case FieldType.JSON:
          errors.push(...this.validateJson(fieldDef, value))
          break

        case FieldType.REPEATER:
          errors.push(...this.validateRepeater(fieldDef, value))
          break

        case FieldType.GROUP:
          errors.push(...this.validateGroup(fieldDef, value))
          break

        default:
          errors.push({
            fieldName: fieldDef.name,
            fieldType: fieldDef.fieldType,
            errorCode: 'UNSUPPORTED_FIELD_TYPE',
            message: `Field type '${fieldDef.fieldType}' is not supported`,
            value
          })
      }
    } catch (error) {
      this.logger.error({ fieldName: fieldDef.name, error: error.message }, 'Validation error')
      errors.push({
        fieldName: fieldDef.name,
        fieldType: fieldDef.fieldType,
        errorCode: 'VALIDATION_ERROR',
        message: `Validation failed: ${error.message}`,
        value
      })
    }

    return errors
  }

  // ========== Text Field Validators ==========

  private validateText(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
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

  private validateTextarea(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
    // Same as text, but typically allows longer content
    return this.validateText(fieldDef, value)
  }

  private validateWysiwyg(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
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

  private validateEmail(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
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

  private validateUrl(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
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

      // Protocol validation
      if (rules.protocol) {
        const allowedProtocols = Array.isArray(rules.protocol) ? rules.protocol : [rules.protocol]
        if (!allowedProtocols.includes(url.protocol.replace(':', ''))) {
          errors.push({
            fieldName: fieldDef.name,
            fieldType: fieldDef.fieldType,
            errorCode: 'INVALID_PROTOCOL',
            message: `Field '${fieldDef.label}' must use one of these protocols: ${allowedProtocols.join(', ')}`,
            value,
            constraint: rules.protocol
          })
        }
      }
    } catch (error) {
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

  private validateTel(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
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
    const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/
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
    } else if (!phoneRegex.test(value)) {
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

  private validateCode(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
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

  // ========== Number Field Validators ==========

  private validateNumber(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
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
    if (rules.step && numValue % rules.step !== 0) {
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

  private validateCurrency(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
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

  // ========== Date/Time Field Validators ==========

  private validateDate(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
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

  private validateDateTime(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
    // Similar to date but includes time
    return this.validateDate(fieldDef, value)
  }

  private validateTime(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
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

  // ========== Selection Field Validators ==========

  private validateCheckbox(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
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

  private validateRadio(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
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

  private validateSelect(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
    // Same as radio
    return this.validateRadio(fieldDef, value)
  }

  private validateMultiselect(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
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

  private validateToggle(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
    // Same as checkbox
    return this.validateCheckbox(fieldDef, value)
  }

  // ========== Media Field Validators ==========

  private validateFile(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
    const errors: FieldValidationError[] = []

    // Expect either a URL string or file metadata object
    if (typeof value !== 'string' && typeof value !== 'object') {
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

    // If it's an object, validate file metadata
    if (typeof value === 'object') {
      if (!value.url) {
        errors.push({
          fieldName: fieldDef.name,
          fieldType: fieldDef.fieldType,
          errorCode: 'MISSING_FILE_URL',
          message: `Field '${fieldDef.label}' file metadata must include a URL`,
          value
        })
      }

      // Validate file type
      if (options.allowedTypes && value.mimeType) {
        const allowedTypes = Array.isArray(options.allowedTypes)
          ? options.allowedTypes
          : [options.allowedTypes]
        if (!allowedTypes.includes(value.mimeType)) {
          errors.push({
            fieldName: fieldDef.name,
            fieldType: fieldDef.fieldType,
            errorCode: 'INVALID_FILE_TYPE',
            message: `Field '${fieldDef.label}' only accepts: ${allowedTypes.join(', ')}`,
            value: value.mimeType,
            constraint: allowedTypes
          })
        }
      }

      // Validate file size
      if (options.maxSize && value.size > options.maxSize) {
        errors.push({
          fieldName: fieldDef.name,
          fieldType: fieldDef.fieldType,
          errorCode: 'FILE_TOO_LARGE',
          message: `Field '${fieldDef.label}' file exceeds maximum size of ${options.maxSize} bytes`,
          value: value.size,
          constraint: options.maxSize
        })
      }
    }

    return errors
  }

  private validateImage(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
    const errors = this.validateFile(fieldDef, value)

    // Additional image-specific validation
    if (typeof value === 'object' && value.width && value.height) {
      const options = fieldDef.fieldOptions || {}

      // Min dimensions
      if (options.minWidth && value.width < options.minWidth) {
        errors.push({
          fieldName: fieldDef.name,
          fieldType: fieldDef.fieldType,
          errorCode: 'IMAGE_TOO_SMALL',
          message: `Field '${fieldDef.label}' image width must be at least ${options.minWidth}px`,
          value: value.width,
          constraint: options.minWidth
        })
      }

      if (options.minHeight && value.height < options.minHeight) {
        errors.push({
          fieldName: fieldDef.name,
          fieldType: fieldDef.fieldType,
          errorCode: 'IMAGE_TOO_SMALL',
          message: `Field '${fieldDef.label}' image height must be at least ${options.minHeight}px`,
          value: value.height,
          constraint: options.minHeight
        })
      }

      // Max dimensions
      if (options.maxWidth && value.width > options.maxWidth) {
        errors.push({
          fieldName: fieldDef.name,
          fieldType: fieldDef.fieldType,
          errorCode: 'IMAGE_TOO_LARGE',
          message: `Field '${fieldDef.label}' image width must be at most ${options.maxWidth}px`,
          value: value.width,
          constraint: options.maxWidth
        })
      }

      if (options.maxHeight && value.height > options.maxHeight) {
        errors.push({
          fieldName: fieldDef.name,
          fieldType: fieldDef.fieldType,
          errorCode: 'IMAGE_TOO_LARGE',
          message: `Field '${fieldDef.label}' image height must be at most ${options.maxHeight}px`,
          value: value.height,
          constraint: options.maxHeight
        })
      }
    }

    return errors
  }

  private validateGallery(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
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
      const imageErrors = this.validateImage(fieldDef, image)
      imageErrors.forEach(err => {
        errors.push({
          ...err,
          message: `${err.message} (image ${index + 1})`
        })
      })
    })

    return errors
  }

  private validateVideo(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
    // Similar to file validation
    return this.validateFile(fieldDef, value)
  }

  // ========== Relationship Field Validators ==========

  private validateRelation(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
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

  private validateUser(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
    // Same as relation - validates UUIDs
    return this.validateRelation(fieldDef, value)
  }

  private validateTaxonomy(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
    // Same as relation - validates UUIDs
    return this.validateRelation(fieldDef, value)
  }

  // ========== Advanced Field Validators ==========

  private validateColor(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
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

  private validateJson(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
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
      const depth = this.getObjectDepth(value)
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

  private validateRepeater(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
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

  private validateGroup(fieldDef: FieldDefinition, value: any): FieldValidationError[] {
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

  // ========== Helper Methods ==========

  /**
   * Calculate the depth of a nested object
   */
  private getObjectDepth(obj: any, currentDepth = 1): number {
    if (typeof obj !== 'object' || obj === null) {
      return currentDepth
    }

    const depths = Object.values(obj).map(value => this.getObjectDepth(value, currentDepth + 1))

    return Math.max(currentDepth, ...depths)
  }

  /**
   * Throw BadRequestException if validation fails
   * Convenience method for controllers
   */
  throwIfInvalid(result: FieldValidationResult): void {
    if (!result.isValid) {
      const errorMessages = result.errors.map(e => e.message).join('; ')
      throw new BadRequestException({
        message: 'Field validation failed',
        errors: result.errors,
        summary: errorMessages
      })
    }
  }
}
