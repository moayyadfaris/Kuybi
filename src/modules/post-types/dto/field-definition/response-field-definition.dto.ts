import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose } from 'class-transformer'

import { FieldType } from '../../enums/field-type.enum'
import type { FieldOptions, FieldValidationRules } from '../../types/field-validation-rules'

/**
 * DTO for field definition responses
 */
export class ResponseFieldDefinitionDto {
  @ApiProperty({ description: 'Field definition ID', example: 'uuid' })
  @Expose()
  id: string

  @ApiProperty({ description: 'Post type ID', example: 'uuid' })
  @Expose()
  postTypeId: string

  @ApiProperty({ description: 'Field name', example: 'prep_time' })
  @Expose()
  name: string

  @ApiProperty({ description: 'Field label', example: 'Preparation Time' })
  @Expose()
  label: string

  @ApiProperty({ description: 'Field type', enum: FieldType })
  @Expose()
  fieldType: FieldType

  @ApiPropertyOptional({ description: 'Field description' })
  @Expose()
  description?: string

  @ApiPropertyOptional({ description: 'Default value' })
  @Expose()
  defaultValue?: string

  @ApiPropertyOptional({ description: 'Placeholder text' })
  @Expose()
  placeholder?: string

  @ApiProperty({ description: 'Is required' })
  @Expose()
  isRequired: boolean

  @ApiProperty({ description: 'Is unique' })
  @Expose()
  isUnique: boolean

  @ApiProperty({ description: 'Is searchable' })
  @Expose()
  isSearchable: boolean

  @ApiProperty({ description: 'Is filterable' })
  @Expose()
  isFilterable: boolean

  @ApiProperty({ description: 'Is sortable' })
  @Expose()
  isSortable: boolean

  @ApiProperty({ description: 'Display order' })
  @Expose()
  displayOrder: number

  @ApiPropertyOptional({ description: 'Field group' })
  @Expose()
  fieldGroup?: string

  @ApiPropertyOptional({ description: 'Help text' })
  @Expose()
  helpText?: string

  @ApiPropertyOptional({ description: 'Validation rules' })
  @Expose()
  validationRules?: FieldValidationRules

  @ApiPropertyOptional({ description: 'Field options' })
  @Expose()
  fieldOptions?: FieldOptions

  @ApiPropertyOptional({ description: 'Conditional logic' })
  @Expose()
  conditionalLogic?: Record<string, unknown>

  @ApiProperty({ description: 'Created at timestamp' })
  @Expose()
  createdAt: Date

  @ApiProperty({ description: 'Updated at timestamp' })
  @Expose()
  updatedAt: Date
}
