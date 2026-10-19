import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

export class ExtendSessionQueryDto {
  @ApiPropertyOptional({
    description: 'Days to add to the expiry',
    default: 7,
    minimum: 1,
    maximum: 30
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  days: number = 7
}

export class SessionCleanupQueryDto {
  @ApiPropertyOptional({
    description: 'Delete sessions that ended more than this many days ago',
    default: 30,
    minimum: 1,
    maximum: 365
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  olderThanDays: number = 30
}
