import { ApiProperty } from '@nestjs/swagger'

export class AttachmentStatsDto {
  @ApiProperty({ description: 'Total number of attachments', example: 1250 })
  total: number

  @ApiProperty({ description: 'Total storage used in bytes', example: 524288000 })
  totalSize: number

  @ApiProperty({
    description: 'Breakdown by category',
    example: { images: 450, documents: 600, videos: 200 }
  })
  byCategory: Record<string, number>

  @ApiProperty({
    description: 'Breakdown by MIME type',
    example: { 'image/jpeg': 300, 'application/pdf': 500 }
  })
  byMimeType: Record<string, number>

  @ApiProperty({
    description: 'Breakdown by security status',
    example: { approved: 1100, pending: 100, rejected: 50 }
  })
  bySecurityStatus: Record<string, number>
}
