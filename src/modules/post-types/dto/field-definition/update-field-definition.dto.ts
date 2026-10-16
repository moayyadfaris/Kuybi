import { OmitType, PartialType } from '@nestjs/swagger'

import { CreateFieldDefinitionDto } from './create-field-definition.dto'

/**
 * DTO for updating an existing field definition.
 *
 * `name` and `fieldType` are immutable: the name is the JSONB key under which existing
 * content stores its value, and changing the type would invalidate stored data.
 * Both are stripped by the global ValidationPipe whitelist if sent.
 */
export class UpdateFieldDefinitionDto extends PartialType(
  OmitType(CreateFieldDefinitionDto, ['name', 'fieldType'] as const)
) {}
