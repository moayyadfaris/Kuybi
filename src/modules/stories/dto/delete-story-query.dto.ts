import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength } from 'class-validator'

export class DeleteStoryQueryDto {
  @ApiPropertyOptional({ description: 'Why the story is deleted', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string
}
