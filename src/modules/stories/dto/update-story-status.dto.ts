import { ApiProperty } from '@nestjs/swagger'
import { IsEnum } from 'class-validator'

import { StoryStatus } from '../entities/story.entity'

export class UpdateStoryStatusDto {
  @ApiProperty({ enum: StoryStatus, example: StoryStatus.PUBLISHED })
  @IsEnum(StoryStatus)
  status: StoryStatus
}
