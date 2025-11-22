import { PartialType } from '@nestjs/swagger'

import { CreateContentDto } from './create-content.dto'

/**
 * DTO for updating existing content
 * All fields from CreateContentDto are optional
 */
export class UpdateContentDto extends PartialType(CreateContentDto) {}
