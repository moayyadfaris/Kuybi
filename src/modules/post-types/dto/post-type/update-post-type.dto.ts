import { ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { IsBoolean, IsOptional } from 'class-validator'

import { CreatePostTypeDto } from './create-post-type.dto'

/**
 * DTO for updating an existing post type
 * All fields from CreatePostTypeDto are optional
 */
export class UpdatePostTypeDto extends PartialType(CreatePostTypeDto) {
  @ApiPropertyOptional({
    description: 'Whether the post type is active',
    example: true
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
