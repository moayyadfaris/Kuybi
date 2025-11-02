import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/**
 * Conflict information for merge operations
 */
export class ConflictInfoDto {
  @ApiProperty({ description: 'Field name that has a conflict' })
  field: string

  @ApiProperty({ description: 'Value from base version (common ancestor)' })
  baseValue: unknown

  @ApiProperty({ description: 'Value from source branch' })
  sourceValue: unknown

  @ApiProperty({ description: 'Value from target branch' })
  targetValue: unknown

  @ApiPropertyOptional({ description: 'Suggested resolution (if auto-resolvable)' })
  suggestedResolution?: unknown
}
