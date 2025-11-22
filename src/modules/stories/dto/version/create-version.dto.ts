import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsEnum, IsOptional, IsString, Length } from 'class-validator'

import { VersionType } from '../../entities/story-version.entity'

/**
 * DTO for creating a manual version
 */
export class CreateVersionDto {
  @ApiPropertyOptional({ description: 'Optional version label (e.g., v1.0, beta-1)' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  versionLabel?: string

  @ApiProperty({
    description: 'Type of version to create',
    enum: VersionType,
    default: VersionType.MANUAL
  })
  @IsEnum(VersionType)
  versionType: VersionType = VersionType.MANUAL

  @ApiPropertyOptional({ description: 'Branch name (defaults to "main")', default: 'main' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  branchName?: string

  @ApiPropertyOptional({ description: 'Optional tag (e.g., release-2024-11)' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  tag?: string

  @ApiPropertyOptional({ description: 'Commit message describing the changes' })
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  commitMessage?: string

  @ApiPropertyOptional({ description: 'Pin this version to prevent auto-cleanup', default: false })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean
}
