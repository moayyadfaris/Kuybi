import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, Length, IsInt, Min, IsOptional } from 'class-validator'

/**
 * DTO for creating a new branch
 */
export class CreateBranchDto {
  @ApiProperty({ description: 'Name of the new branch', example: 'feature-improvements' })
  @IsString()
  @Length(1, 100)
  branchName: string

  @ApiPropertyOptional({
    description: 'Version number to branch from (defaults to latest version)',
    example: 10
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  fromVersionNumber?: number

  @ApiPropertyOptional({ description: 'Commit message for branch creation' })
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  commitMessage?: string
}
