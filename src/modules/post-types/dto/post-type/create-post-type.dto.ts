import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsObject,
  MinLength,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for creating a new post type
 */
export class CreatePostTypeDto {
  @ApiProperty({
    description: 'Name of the post type',
    example: 'Recipe',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: 'Singular label for display',
    example: 'Recipe',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  singularLabel: string;

  @ApiProperty({
    description: 'Plural label for display',
    example: 'Recipes',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  pluralLabel: string;

  @ApiPropertyOptional({
    description: 'Description of the post type',
    example: 'Cooking recipes with ingredients and instructions',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Icon identifier',
    example: 'chef-hat',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @ApiPropertyOptional({
    description: 'Menu icon identifier',
    example: 'chef-hat',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  menuIcon?: string;

  @ApiPropertyOptional({
    description: 'Position in menu (higher = lower)',
    example: 10,
    minimum: 0,
    maximum: 999,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  menuPosition?: number;

  @ApiPropertyOptional({
    description: 'Whether this post type supports hierarchical structure (parent-child)',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isHierarchical?: boolean;

  @ApiPropertyOptional({
    description: 'Whether comments are supported',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  supportsComments?: boolean;

  @ApiPropertyOptional({
    description: 'Whether revisions are supported',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  supportsRevisions?: boolean;

  @ApiPropertyOptional({
    description: 'Whether to show in REST API',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  showInRest?: boolean;

  @ApiPropertyOptional({
    description: 'REST API base path',
    example: 'recipes',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  restBase?: string;

  @ApiPropertyOptional({
    description: 'Capability type for ACL',
    example: 'recipe',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  capabilityType?: string;

  @ApiPropertyOptional({
    description: 'Additional settings in JSON format',
    example: { supports: ['thumbnail', 'excerpt', 'author'], public: true },
  })
  @IsOptional()
  @IsObject()
  settings?: Record<string, any>;
}
