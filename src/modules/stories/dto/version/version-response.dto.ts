import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

import { VersionStatus, VersionType } from '../../entities/story-version.entity'

/**
 * User info embedded in version response
 */
export class VersionUserDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  email: string

  @ApiProperty()
  firstName: string

  @ApiProperty()
  lastName: string
}

/**
 * Response DTO for version data
 */
export class VersionResponseDto {
  @ApiProperty({ description: 'Version ID' })
  id: string

  @ApiProperty({ description: 'Story ID' })
  storyId: number

  @ApiProperty({ description: 'Sequential version number' })
  versionNumber: number

  @ApiPropertyOptional({ description: 'Optional version label' })
  versionLabel?: string

  @ApiProperty({ enum: VersionType, description: 'Type of version' })
  versionType: VersionType

  @ApiProperty({ enum: VersionStatus, description: 'Version status' })
  status: VersionStatus

  @ApiProperty({ description: 'Branch name' })
  branchName: string

  @ApiPropertyOptional({ description: 'Version tag' })
  tag?: string

  @ApiProperty({ description: 'Number of changes from previous version' })
  changesCount: number

  @ApiPropertyOptional({ description: 'Summary of changes' })
  changeSummary?: string

  @ApiProperty({ type: VersionUserDto, description: 'User who created this version' })
  createdBy: VersionUserDto

  @ApiProperty({ description: 'Version creation timestamp' })
  createdAt: Date

  @ApiPropertyOptional({ description: 'Commit message' })
  commitMessage?: string

  @ApiProperty({ description: 'Whether this version is pinned' })
  isPinned: boolean

  @ApiPropertyOptional({ description: 'Expiration timestamp for auto-cleanup' })
  expiresAt?: Date
}
