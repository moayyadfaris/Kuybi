import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { VersionResponseDto } from './version-response.dto'

/**
 * Field diff showing old and new values
 */
export class FieldDiff {
  @ApiProperty({ description: 'Old value' })
  old: unknown

  @ApiProperty({ description: 'New value' })
  new: unknown
}

/**
 * Structured diff between two versions
 */
export class VersionDiff {
  @ApiPropertyOptional({ description: 'Fields that were added' })
  added?: Record<string, unknown>

  @ApiPropertyOptional({ description: 'Fields that were modified' })
  modified?: Record<string, FieldDiff>

  @ApiPropertyOptional({ description: 'Fields that were removed' })
  removed?: Record<string, unknown>
}

/**
 * Response DTO for version comparison
 */
export class VersionComparisonDto {
  @ApiProperty({ type: VersionResponseDto, description: 'First version' })
  versionA: VersionResponseDto

  @ApiProperty({ type: VersionResponseDto, description: 'Second version' })
  versionB: VersionResponseDto

  @ApiProperty({ type: VersionDiff, description: 'Structured diff' })
  diff: VersionDiff

  @ApiProperty({ description: 'Total number of changes' })
  changesCount: number

  @ApiProperty({ description: 'List of changed field names' })
  changedFields: string[]
}
