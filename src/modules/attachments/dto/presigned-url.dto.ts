import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator'

export class PresignedUrlDto {
  @ApiPropertyOptional({
    description: 'URL expiration time in seconds',
    example: 3600,
    default: 3600,
    minimum: 60,
    maximum: 604800
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(60) // Minimum 1 minute
  @Max(604800) // Maximum 7 days
  expiresIn?: number = 3600

  @ApiPropertyOptional({
    description: 'Custom filename for download',
    example: 'my-document.pdf'
  })
  @IsOptional()
  @IsString()
  downloadFilename?: string
}

export class PresignedUrlResponseDto {
  @ApiProperty({
    description: 'Presigned URL for temporary access',
    example: 'https://bucket.s3.amazonaws.com/file.pdf?X-Amz-Algorithm=...'
  })
  url: string

  @ApiProperty({
    description: 'URL expiration timestamp',
    example: '2024-10-24T15:30:00Z'
  })
  expiresAt: Date

  @ApiProperty({
    description: 'Expiration duration in seconds',
    example: 3600
  })
  expiresIn: number
}
