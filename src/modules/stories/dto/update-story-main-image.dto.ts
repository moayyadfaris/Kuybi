import { ApiProperty } from '@nestjs/swagger'
import { IsUUID } from 'class-validator'

export class UpdateStoryMainImageDto {
  @ApiProperty({
    description: 'Attachment ID for the story main image',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  attachmentId: string
}
