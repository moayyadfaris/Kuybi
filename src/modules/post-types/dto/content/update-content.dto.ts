import { IntersectionType, PartialType } from '@nestjs/swagger'
import { ExpectedVersionDto } from '@shared/dto'

import { CreateContentDto } from './create-content.dto'

/**
 * DTO for updating existing content
 * All fields from CreateContentDto are optional
 */
export class UpdateContentDto extends IntersectionType(
  PartialType(CreateContentDto),
  ExpectedVersionDto
) {}
