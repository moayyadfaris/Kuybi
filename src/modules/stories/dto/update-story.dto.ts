import { IntersectionType, PartialType } from '@nestjs/swagger'
import { ExpectedVersionDto } from '@shared/dto'

import { CreateStoryDto } from './create-story.dto'

export class UpdateStoryDto extends IntersectionType(
  PartialType(CreateStoryDto),
  ExpectedVersionDto
) {}
