import { PartialType } from '@nestjs/swagger'

import { CreateFieldDefinitionDto } from './create-field-definition.dto'

/**
 * DTO for updating an existing field definition
 * All fields from CreateFieldDefinitionDto are optional
 */
export class UpdateFieldDefinitionDto extends PartialType(CreateFieldDefinitionDto) {}
