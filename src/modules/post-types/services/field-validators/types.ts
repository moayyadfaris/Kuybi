import { FieldDefinition } from '../../entities/field-definition.entity'
import { FieldType } from '../../enums/field-type.enum'

export interface FieldValidationResult {
  isValid: boolean
  errors: FieldValidationError[]
}

export interface FieldValidationError {
  fieldName: string
  fieldType: FieldType
  errorCode: string
  message: string
  value?: unknown
  constraint?: unknown
}

/** Validates one non-null value of a field; returns its errors (empty when valid) */
export type FieldValidator = (fieldDef: FieldDefinition, value: unknown) => FieldValidationError[]

/** Client-supplied metadata for file, image, gallery and video fields */
export interface FileFieldValue {
  url?: unknown
  mimeType?: string
  size?: number
  width?: number
  height?: number
}
