import { ApiProperty } from '@nestjs/swagger'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator'

export class DetachCategoriesDto {
  @ApiProperty({
    description: 'Array of category IDs to detach from the story',
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    minItems: 1,
    maxItems: 20
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  categoryIds: string[]
}
