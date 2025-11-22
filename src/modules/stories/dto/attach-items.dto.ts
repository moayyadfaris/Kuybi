import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength
} from 'class-validator'

export class AttachAttachmentsDto {
  @ApiProperty({
    description: 'Array of attachment IDs to attach to the story',
    example: ['550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001'],
    type: [String]
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  attachmentIds: string[]
}

export class AttachTagsDto {
  @ApiPropertyOptional({
    description: 'Array of tag IDs to attach to the story',
    example: [1, 2, 3],
    type: [Number]
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  tagIds?: number[]

  @ApiPropertyOptional({
    description: "Array of tag names to attach to the story (will create tags if they don't exist)",
    example: ['sports', 'economy', 'breaking-news'],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MinLength(2, { each: true })
  @MaxLength(50, { each: true })
  tags?: string[]
}

export class DetachAttachmentsDto {
  @ApiProperty({
    description: 'Array of attachment IDs to detach from the story',
    example: ['550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001'],
    type: [String]
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  attachmentIds: string[]
}

export class DetachTagsDto {
  @ApiPropertyOptional({
    description: 'Array of tag IDs to detach from the story',
    example: [1, 2],
    type: [Number]
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  tagIds?: number[]

  @ApiPropertyOptional({
    description: 'Array of tag names to detach from the story',
    example: ['sports', 'economy'],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MinLength(2, { each: true })
  @MaxLength(50, { each: true })
  tags?: string[]
}
