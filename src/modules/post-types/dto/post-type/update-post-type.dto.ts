import { ApiPropertyOptional, IntersectionType, PartialType } from '@nestjs/swagger'
import { ToBoolean } from '@shared/decorators/to-boolean.decorator'
import { ExpectedVersionDto } from '@shared/dto'
import { IsBoolean, IsOptional } from 'class-validator'

import { CreatePostTypeDto } from './create-post-type.dto'

/**
 * DTO for updating an existing post type
 * All fields from CreatePostTypeDto are optional
 */
export class UpdatePostTypeDto extends IntersectionType(
  PartialType(CreatePostTypeDto),
  ExpectedVersionDto
) {
  @ApiPropertyOptional({
    description: 'Whether the post type is active',
    example: true
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean
}
