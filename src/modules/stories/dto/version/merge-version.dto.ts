import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsObject, IsOptional, IsString, Length, Min } from 'class-validator'

/**
 * DTO for merging versions from one branch to another
 */
export class MergeVersionDto {
  @ApiProperty({ description: 'Source branch name', example: 'feature-improvements' })
  @IsString()
  @Length(1, 100)
  fromBranch: string

  @ApiProperty({ description: 'Source version number to merge', example: 12 })
  @IsInt()
  @Min(1)
  fromVersionNumber: number

  @ApiProperty({ description: 'Target branch name', example: 'main' })
  @IsString()
  @Length(1, 100)
  targetBranch: string

  @ApiProperty({ description: 'Commit message for the merge' })
  @IsString()
  @Length(1, 1000)
  commitMessage: string

  @ApiPropertyOptional({
    description: 'Manual conflict resolution (field name -> chosen value)',
    example: { title: 'Merged Title', priority: 'HIGH' }
  })
  @IsOptional()
  @IsObject()
  resolveConflicts?: Record<string, unknown>
}
