import { ApiProperty } from '@nestjs/swagger'
import { IsString, Length } from 'class-validator'

export class TagVersionDto {
  @ApiProperty({ description: 'Tag, unique per story', example: 'release-1.0' })
  @IsString()
  @Length(1, 100)
  tag: string
}
