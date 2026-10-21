import { IntersectionType, PartialType } from '@nestjs/swagger'
import { ExpectedVersionDto } from '@shared/dto'

import { CreateTagDto } from './create-tag.dto'

export class UpdateTagDto extends IntersectionType(PartialType(CreateTagDto), ExpectedVersionDto) {}
