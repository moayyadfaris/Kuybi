import { ApiProperty } from '@nestjs/swagger'
import { IsString, MinLength, MaxLength } from 'class-validator'

export class CheckPasswordStrengthDto {
  @ApiProperty({
    description: 'Password to check strength for',
    example: 'MyStr0ngP@ssw0rd!',
    minLength: 1,
    maxLength: 128
  })
  @IsString()
  @MinLength(1, { message: 'Password cannot be empty' })
  @MaxLength(128, { message: 'Password is too long (max 128 characters)' })
  password: string
}
