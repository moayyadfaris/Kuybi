import { IsArray, ValidateNested, IsUUID, IsInt, Min } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'

/**
 * Single field order item
 */
class FieldOrderItem {
  @ApiProperty({
    description: 'Field definition ID',
    example: 'uuid'
  })
  @IsUUID()
  id: string

  @ApiProperty({
    description: 'New display order',
    example: 1,
    minimum: 1
  })
  @IsInt()
  @Min(1)
  displayOrder: number
}

/**
 * DTO for reordering fields
 */
export class ReorderFieldsDto {
  @ApiProperty({
    description: 'Array of field IDs with new display orders',
    type: [FieldOrderItem],
    example: [
      { id: 'uuid-1', displayOrder: 1 },
      { id: 'uuid-2', displayOrder: 2 },
      { id: 'uuid-3', displayOrder: 3 }
    ]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldOrderItem)
  fieldOrders: FieldOrderItem[]
}
