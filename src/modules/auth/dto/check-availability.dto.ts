import { IsEmail, IsOptional, IsPhoneNumber, IsString, ValidateIf } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class CheckAvailabilityDto {
  @ApiPropertyOptional({
    description: 'Email address to check availability',
    example: 'user@example.com',
  })
  @IsOptional()
  @ValidateIf((o) => !o.phone) // Required if phone is not provided
  @IsEmail({}, { message: 'Invalid email format' })
  email?: string

  @ApiPropertyOptional({
    description: 'Phone number to check availability (international format)',
    example: '+1234567890',
  })
  @IsOptional()
  @ValidateIf((o) => !o.email) // Required if email is not provided
  @IsString()
  phone?: string
}
