import { ApiProperty } from '@nestjs/swagger'

import { StoryPriority, StoryStatus, StoryType } from '../entities/story.entity'

export class StoryStatsDto {
  @ApiProperty({ description: 'Total number of stories' })
  total: number

  @ApiProperty({ description: 'Stories by status' })
  byStatus: Record<StoryStatus, number>

  @ApiProperty({ description: 'Stories by type' })
  byType: Record<StoryType, number>

  @ApiProperty({ description: 'Stories by priority' })
  byPriority: Record<StoryPriority, number>

  @ApiProperty({ description: 'Stories created today' })
  createdToday: number

  @ApiProperty({ description: 'Stories created this week' })
  createdThisWeek: number

  @ApiProperty({ description: 'Stories created this month' })
  createdThisMonth: number

  @ApiProperty({ description: 'Published stories count' })
  published: number

  @ApiProperty({ description: 'Draft stories count' })
  drafts: number

  @ApiProperty({ description: 'Deleted stories count' })
  deleted: number
}
