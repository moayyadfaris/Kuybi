import { IsEnum, IsOptional, IsBoolean, IsObject, IsArray, IsString } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Action } from '../types/actions.enum'
import { Subject } from '../types/subjects.enum'

export class CreatePermissionDto {
  @ApiProperty({
    description: 'Action to perform',
    enum: Action,
    example: Action.Read,
  })
  @IsEnum(Action)
  action: Action

  @ApiProperty({
    description: 'Subject/resource the action applies to',
    enum: Subject,
    example: Subject.Story,
  })
  @IsEnum(Subject)
  subject: Subject

  @ApiPropertyOptional({
    description: 'Conditions for the permission (e.g., ownership check)',
    example: { userId: '{{userId}}' },
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, any>

  @ApiPropertyOptional({
    description: 'Specific fields this permission applies to',
    example: ['title', 'content'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fields?: string[]

  @ApiPropertyOptional({
    description: 'If true, represents a "cannot" instead of "can"',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  inverted?: boolean

  @ApiPropertyOptional({
    description: 'Reason/documentation for this permission',
    example: 'Users can read their own stories',
  })
  @IsOptional()
  @IsString()
  reason?: string
}
