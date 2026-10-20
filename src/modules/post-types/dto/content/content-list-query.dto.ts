import { ApiPropertyOptional } from '@nestjs/swagger'
import { ToBoolean } from '@shared/decorators/to-boolean.decorator'
import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min
} from 'class-validator'

import { ContentStatus } from '../../enums/content-status.enum'

/** Filters of a content list; status and includeDeleted apply to editors only */
export class ContentListQueryDto {
  @ApiPropertyOptional({ enum: ContentStatus })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0

  @ApiPropertyOptional({ description: 'Full-text search in title and excerpt' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  includeDeleted?: boolean
}
