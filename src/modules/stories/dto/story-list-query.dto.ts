import { ApiPropertyOptional } from '@nestjs/swagger'
import { ToBoolean } from '@shared/decorators/to-boolean.decorator'
import { Type } from 'class-transformer'
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator'

/** Paging for the per-user, per-status and per-type story lists */
export class StoryListQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({
    description: 'Include soft-deleted stories (only for readers of every story)',
    default: false
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  includeDeleted?: boolean
}
