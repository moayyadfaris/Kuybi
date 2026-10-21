import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ToBoolean } from '@shared/decorators/to-boolean.decorator'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString
} from 'class-validator'

import { Action } from '../types/actions.enum'
import { Subject } from '../types/subjects.enum'

export class CreatePermissionDto {
  @ApiProperty({
    description: 'Action to perform',
    enum: Action,
    example: Action.Read
  })
  @IsEnum(Action)
  action: Action

  @ApiProperty({
    description: 'Subject/resource the action applies to',
    enum: Subject,
    example: Subject.Story
  })
  @IsEnum(Subject)
  subject: Subject

  @ApiPropertyOptional({
    description: 'Conditions for the permission (e.g., ownership check)',
    example: { userId: '{{userId}}' },
    type: 'object',
    additionalProperties: true
  })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>

  @ApiPropertyOptional({
    description:
      'Field-level permissions are not supported yet: leave empty (a permission covers every field)',
    example: [],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(0, {
    message: 'Field-level permissions are not supported: a permission covers every field'
  })
  @IsString({ each: true })
  fields?: string[]

  @ApiPropertyOptional({
    description: 'If true, represents a "cannot" instead of "can"',
    example: false,
    default: false
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  inverted?: boolean

  @ApiPropertyOptional({
    description: 'Reason/documentation for this permission',
    example: 'Users can read their own stories'
  })
  @IsOptional()
  @IsString()
  reason?: string
}
