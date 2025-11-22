import { ApiProperty } from '@nestjs/swagger'

import { ResponseContentDto } from './response-content.dto'

/**
 * DTO for paginated content list responses
 */
export class ContentListResponseDto {
  @ApiProperty({ description: 'Content items', type: [ResponseContentDto] })
  data: ResponseContentDto[]

  @ApiProperty({ description: 'Total count' })
  total: number

  @ApiProperty({ description: 'Items per page' })
  limit: number

  @ApiProperty({ description: 'Offset' })
  offset: number
}
