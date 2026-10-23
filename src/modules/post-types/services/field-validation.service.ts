import { BadRequestException, Injectable } from '@nestjs/common'
import { ErrorCode, fieldError } from '@shared/errors'
import { errorMessage } from '@shared/utils/error.util'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { FieldDefinition } from '../entities/field-definition.entity'
import { FieldType } from '../enums/field-type.enum'

import { FIELD_VALIDATORS, FieldValidationError, FieldValidationResult } from './field-validators'

export type { FieldValidationError, FieldValidationResult } from './field-validators'

/**
 * FieldValidationService
 *
 * Validates field data against field definitions for dynamic post types: required and
 * unknown fields here, the per-type rules in ./field-validators (one module per field
 * family, wired up in FIELD_VALIDATORS).
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
    fieldData: Record<string, unknown>
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
      const fieldErrors = this.validateFieldByType(fieldDef, value)
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
  private validateFieldByType(fieldDef: FieldDefinition, value: unknown): FieldValidationError[] {
    const validate = FIELD_VALIDATORS[fieldDef.fieldType]
    if (!validate) {
      // Only reachable with a field type stored outside the enum
      return [
        {
          fieldName: fieldDef.name,
          fieldType: fieldDef.fieldType,
          errorCode: 'UNSUPPORTED_FIELD_TYPE',
          message: `Field type '${fieldDef.fieldType}' is not supported`,
          value
        }
      ]
    }

    try {
      return validate(fieldDef, value)
    } catch (error) {
      this.logger.error(
        { fieldName: fieldDef.name, error: errorMessage(error) },
        'Validation error'
      )
      return [
        {
          fieldName: fieldDef.name,
          fieldType: fieldDef.fieldType,
          errorCode: 'VALIDATION_ERROR',
          message: `Validation failed: ${errorMessage(error)}`,
          value
        }
      ]
    }
  }

  /**
   * Throw BadRequestException if validation fails
   * Convenience method for controllers
   */
  throwIfInvalid(result: FieldValidationResult): void {
    if (!result.isValid) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: result.errors.map(error => error.message).join('; '),
        // Problem `errors`: one per field, pointing into the request's field_data
        errors: result.errors.map(error =>
          fieldError(
            ['field_data', error.fieldName],
            error.errorCode,
            error.message,
            error.constraint === undefined ? undefined : { constraint: error.constraint }
          )
        )
      })
    }
  }
}
