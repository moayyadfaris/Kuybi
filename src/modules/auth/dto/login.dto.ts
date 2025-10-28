import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class LoginDto {
  @ApiProperty({ example: 'admin@susano.dev' })
  @IsEmail()
  email: string

  @ApiProperty({ example: 'Admin@123' })
  @IsString()
  @MinLength(6)
  password: string

  @ApiPropertyOptional({ description: 'Client supplied device type label', example: 'Web' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceType?: string
}
