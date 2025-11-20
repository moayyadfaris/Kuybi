import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsObject,
  IsEnum,
  MinLength,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FieldType } from '../../enums/field-type.enum';

/**
 * DTO for creating a new field definition
 */
export class CreateFieldDefinitionDto {
  @ApiProperty({
    description: 'Field name (snake_case)',
    example: 'prep_time',
    pattern: '^[a-z][a-z0-9_]*$',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message: 'Field name must be snake_case (lowercase letters, numbers, underscores)',
  })
  name: string;

  @ApiProperty({
    description: 'Human-readable label',
    example: 'Preparation Time',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  label: string;

  @ApiProperty({
    description: 'Field type',
    enum: FieldType,
    example: FieldType.NUMBER,
  })
  @IsEnum(FieldType)
  fieldType: FieldType;

  @ApiPropertyOptional({
    description: 'Field description',
    example: 'Time to prepare in minutes',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Default value (as string)',
    example: '30',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  defaultValue?: string;

  @ApiPropertyOptional({
    description: 'Placeholder text',
    example: 'Enter preparation time',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  placeholder?: string;

  @ApiPropertyOptional({
    description: 'Whether field is required',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({
    description: 'Whether field value must be unique',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isUnique?: boolean;

  @ApiPropertyOptional({
    description: 'Whether field is searchable',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isSearchable?: boolean;

  @ApiPropertyOptional({
    description: 'Whether field can be used in filters',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isFilterable?: boolean;

  @ApiPropertyOptional({
    description: 'Whether field can be used for sorting',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isSortable?: boolean;

  @ApiPropertyOptional({
    description: 'Display order (1-based)',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  displayOrder?: number;

  @ApiPropertyOptional({
    description: 'Field group name',
    example: 'Recipe Details',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fieldGroup?: string;

  @ApiPropertyOptional({
    description: 'Help text for users',
    example: 'Enter the time in minutes (e.g., 30)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  helpText?: string;

  @ApiPropertyOptional({
    description: 'Validation rules',
    example: { min: 1, max: 300, step: 5 },
  })
  @IsOptional()
  @IsObject()
  validationRules?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Field-specific options',
    example: { suffix: ' minutes', step: 5 },
  })
  @IsOptional()
  @IsObject()
  fieldOptions?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Conditional logic rules (Phase 2 feature)',
    example: { show_if: { field: 'has_prep', value: true } },
  })
  @IsOptional()
  @IsObject()
  conditionalLogic?: Record<string, any>;
}
