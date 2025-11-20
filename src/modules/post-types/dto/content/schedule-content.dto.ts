import { IsDateString } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

/**
 * DTO for scheduling content publication
 */
export class ScheduleContentDto {
  @ApiProperty({
    description: 'Date and time to publish the content',
    example: '2025-12-01T09:00:00.000Z',
  })
  @IsDateString()
  scheduledFor: string
}
