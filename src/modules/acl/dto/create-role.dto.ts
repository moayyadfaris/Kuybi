import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateRoleDto {
  @ApiProperty({
    description: 'Role name (unique)',
    example: 'editor',
    minLength: 2,
    maxLength: 50
  })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string

  @ApiPropertyOptional({
    description: 'Role description',
    example: 'Can edit and publish content'
  })
  @IsOptional()
  @IsString()
  description?: string

  @ApiPropertyOptional({
    description: 'Is this a system role (cannot be deleted)',
    example: false,
    default: false
  })
  @IsOptional()
  @IsBoolean()
  isSystem?: boolean

  @ApiPropertyOptional({
    description: 'Is the role active',
    example: true,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @ApiPropertyOptional({
    description: 'Role priority (1-100, higher = more permissions)',
    example: 50,
    minimum: 1,
    maximum: 100,
    default: 50
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  priority?: number
}
