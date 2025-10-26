import { IsArray, IsInt, ArrayMinSize } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class AssignPermissionsDto {
  @ApiProperty({
    description: 'Array of permission IDs to assign to the role',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  permissionIds: number[]
}

export class RemovePermissionsDto {
  @ApiProperty({
    description: 'Array of permission IDs to remove from the role',
    example: [1, 2],
    type: [Number],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  permissionIds: number[]
}
