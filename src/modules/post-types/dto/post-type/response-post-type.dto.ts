import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose, Type } from 'class-transformer'
import { ResponseFieldDefinitionDto } from '../field-definition/response-field-definition.dto'

/**
 * DTO for post type responses
 */
export class ResponsePostTypeDto {
  @ApiProperty({ description: 'Post type ID', example: 'uuid' })
  @Expose()
  id: string

  @ApiProperty({ description: 'Post type name', example: 'Recipe' })
  @Expose()
  name: string

  @ApiProperty({ description: 'URL-friendly slug', example: 'recipe' })
  @Expose()
  slug: string

  @ApiProperty({ description: 'Singular label', example: 'Recipe' })
  @Expose()
  singularLabel: string

  @ApiProperty({ description: 'Plural label', example: 'Recipes' })
  @Expose()
  pluralLabel: string

  @ApiPropertyOptional({ description: 'Description' })
  @Expose()
  description?: string

  @ApiPropertyOptional({ description: 'Icon identifier' })
  @Expose()
  icon?: string

  @ApiPropertyOptional({ description: 'Menu icon identifier' })
  @Expose()
  menuIcon?: string

  @ApiPropertyOptional({ description: 'Menu position' })
  @Expose()
  menuPosition?: number

  @ApiProperty({ description: 'Hierarchical support' })
  @Expose()
  isHierarchical: boolean

  @ApiProperty({ description: 'Comments support' })
  @Expose()
  supportsComments: boolean

  @ApiProperty({ description: 'Revisions support' })
  @Expose()
  supportsRevisions: boolean

  @ApiProperty({ description: 'Show in REST API' })
  @Expose()
  showInRest: boolean

  @ApiPropertyOptional({ description: 'REST base path' })
  @Expose()
  restBase?: string

  @ApiPropertyOptional({ description: 'Capability type' })
  @Expose()
  capabilityType?: string

  @ApiProperty({ description: 'Is active' })
  @Expose()
  isActive: boolean

  @ApiProperty({ description: 'Is system type (protected)' })
  @Expose()
  isSystem: boolean

  @ApiPropertyOptional({ description: 'Additional settings' })
  @Expose()
  settings?: Record<string, any>

  @ApiProperty({ description: 'Created at timestamp' })
  @Expose()
  createdAt: Date

  @ApiProperty({ description: 'Updated at timestamp' })
  @Expose()
  updatedAt: Date

  @ApiPropertyOptional({
    description: 'Field definitions (if included)',
    type: [ResponseFieldDefinitionDto]
  })
  @Expose()
  @Type(() => ResponseFieldDefinitionDto)
  fieldDefinitions?: ResponseFieldDefinitionDto[]
}
