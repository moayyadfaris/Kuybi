import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, Min, IsString, Length, IsBoolean, IsOptional } from 'class-validator'

/**
 * DTO for rolling back a story to a previous version
 */
export class RollbackVersionDto {
  @ApiProperty({ description: 'Version number to rollback to', example: 5 })
  @IsInt()
  @Min(1)
  versionNumber: number

  @ApiProperty({ description: 'Commit message explaining the rollback' })
  @IsString()
  @Length(1, 1000)
  commitMessage: string

  @ApiPropertyOptional({
    description: 'Create new branch for the rollback instead of affecting main branch',
    default: false
  })
  @IsOptional()
  @IsBoolean()
  createBranch?: boolean

  @ApiPropertyOptional({
    description: 'Branch name if createBranch is true',
    example: 'rollback-to-v5'
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  branchName?: string
}
