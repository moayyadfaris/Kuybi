import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsBoolean, IsNumber, IsEnum, Min, Max } from 'class-validator'
import { Transform, Type } from 'class-transformer'

export class AttachmentQueryDto {
  @ApiPropertyOptional({ description: 'Category filter', example: 'images' })
  @IsOptional()
  @IsString()
  category?: string

  @ApiPropertyOptional({ description: 'MIME type filter (supports prefix)', example: 'image/' })
  @IsOptional()
  @IsString()
  mimeType?: string

  @ApiPropertyOptional({ description: 'Filter by public/private', example: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === '1') return true
    if (value === 'false' || value === '0') return false
    return value
  })
  @IsBoolean()
  isPublic?: boolean

  @ApiPropertyOptional({ 
    description: 'Security status filter',
    example: 'approved',
    enum: ['pending', 'approved', 'rejected', 'scanning']
  })
  @IsOptional()
  @IsString()
  @IsEnum(['pending', 'approved', 'rejected', 'scanning'])
  securityStatus?: string

  @ApiPropertyOptional({ description: 'Minimum file size in bytes', example: 1024 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minSize?: number

  @ApiPropertyOptional({ description: 'Maximum file size in bytes', example: 10485760 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxSize?: number

  @ApiPropertyOptional({ description: 'Start date filter (ISO 8601)', example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  startDate?: Date

  @ApiPropertyOptional({ description: 'End date filter (ISO 8601)', example: '2024-12-31T23:59:59Z' })
  @IsOptional()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  endDate?: Date

  @ApiPropertyOptional({ description: 'Include soft-deleted attachments', default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1')
  @IsBoolean()
  includeDeleted?: boolean

  @ApiPropertyOptional({ description: 'Page number for pagination', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1

  @ApiPropertyOptional({ description: 'Items per page', default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20

  @ApiPropertyOptional({ 
    description: 'Sort by field',
    example: 'createdAt',
    enum: ['createdAt', 'size', 'originalName', 'downloadCount']
  })
  @IsOptional()
  @IsString()
  @IsEnum(['createdAt', 'size', 'originalName', 'downloadCount'])
  sortBy?: string = 'createdAt'

  @ApiPropertyOptional({ 
    description: 'Sort order',
    example: 'DESC',
    enum: ['ASC', 'DESC']
  })
  @IsOptional()
  @IsString()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC'
}
