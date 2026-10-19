import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ToBoolean } from '@shared/decorators/to-boolean.decorator'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min
} from 'class-validator'

import { MAX_UPLOAD_BYTES } from '../services/file-validation.service'

/** Step 1 of a direct upload: describe the file; the server answers with where to send it */
export class InitiateUploadDto {
  @ApiProperty({ example: 'holiday.jpg' })
  @IsString()
  @MaxLength(255)
  originalName: string

  @ApiProperty({ example: 'image/jpeg', description: 'Verified against the content on completion' })
  @IsString()
  @MaxLength(100)
  mimeType: string

  @ApiProperty({ example: 1048576, description: 'Exact size in bytes; storage rejects any other' })
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  size: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[]

  @ApiPropertyOptional({ default: false, description: 'Private unless requested' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isPublic?: boolean

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  generateThumbnails?: boolean
}

export class InitiateUploadResponseDto {
  @ApiProperty()
  attachmentId: string

  @ApiProperty({
    description:
      'multipart/form-data POST: send every field, then the file as the last field named "file"'
  })
  upload: { method: 'POST'; url: string; fields: Record<string, string> }

  @ApiProperty()
  expiresAt: Date
}
