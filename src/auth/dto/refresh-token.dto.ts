import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator'

const REFRESH_TOKEN_REGEX = /^[0-9a-fA-F-]{36}\.[0-9a-fA-F-]{36}$/

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token issued during login' })
  @IsString()
  @Matches(REFRESH_TOKEN_REGEX, {
    message: 'refreshToken must be in the format <uuid>.<uuid>'
  })
  refreshToken: string

  @ApiPropertyOptional({ description: 'Updated device type hint', example: 'Web' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceType?: string
}
