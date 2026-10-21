import { IntersectionType, PartialType } from '@nestjs/swagger'
import { ExpectedVersionDto } from '@shared/dto'

import { CreateCategoryDto } from './create-category.dto'

export class UpdateCategoryDto extends IntersectionType(
  PartialType(CreateCategoryDto),
  ExpectedVersionDto
) {}
