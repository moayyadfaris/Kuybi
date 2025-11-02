import { ApiProperty } from '@nestjs/swagger'
import { IsInt, Min } from 'class-validator'

/**
 * DTO for comparing two versions
 */
export class CompareVersionsDto {
  @ApiProperty({ description: 'First version number to compare', example: 5 })
  @IsInt()
  @Min(1)
  versionA: number

  @ApiProperty({ description: 'Second version number to compare', example: 10 })
  @IsInt()
  @Min(1)
  versionB: number
}
