import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsObject,
  IsIP,
  MaxLength,
  MinLength
} from 'class-validator'
import { Type } from 'class-transformer'

export enum SessionType {
  STANDARD = 'standard',
  PERSISTENT = 'persistent',
  MOBILE = 'mobile',
  API = 'api',
  ADMIN = 'admin',
  SUSPICIOUS = 'suspicious',
  GUEST = 'guest'
}

export enum DeviceType {
  DESKTOP = 'desktop',
  MOBILE = 'mobile',
  TABLET = 'tablet',
  UNKNOWN = 'unknown'
}

/**
 * DTO for creating a new user session
 * Used by SessionsService.createSession()
 */
export class CreateSessionDto {
  @ApiProperty({
    description: 'User ID associated with this session',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsString()
  @IsNotEmpty()
  userId: string

  @ApiPropertyOptional({
    description: 'IP address from which the session was created',
    example: '192.168.1.100',
    required: false
  })
  @IsOptional()
  @IsIP()
  ipAddress?: string

  @ApiPropertyOptional({
    description: 'User agent string from the client browser/app',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',
    maxLength: 500,
    required: false
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string

  @ApiPropertyOptional({
    description: 'Type of device used to create the session',
    enum: DeviceType,
    example: DeviceType.DESKTOP,
    required: false
  })
  @IsOptional()
  @IsEnum(DeviceType)
  deviceType?: DeviceType

  @ApiPropertyOptional({
    description: 'Type of session being created',
    enum: SessionType,
    example: SessionType.STANDARD,
    default: SessionType.STANDARD,
    required: false
  })
  @IsOptional()
  @IsEnum(SessionType)
  sessionType?: SessionType

  @ApiPropertyOptional({
    description: 'Additional metadata for the session (JSON object)',
    example: { loginMethod: 'password', twoFactorEnabled: true },
    required: false
  })
  @IsOptional()
  @IsObject()
  @Type(() => Object)
  metadata?: Record<string, any>

  @ApiPropertyOptional({
    description: 'Device information (browser, OS, etc.)',
    example: {
      browser: 'Chrome',
      browserVersion: '118.0',
      os: 'Windows',
      osVersion: '10'
    },
    required: false
  })
  @IsOptional()
  @IsObject()
  @Type(() => Object)
  deviceInfo?: Record<string, any>
}
