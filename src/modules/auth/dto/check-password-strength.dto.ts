import { ApiProperty } from '@nestjs/swagger'
import { IsString, MinLength } from 'class-validator'

import { MaxPasswordBytes } from '@core/security'

export class CheckPasswordStrengthDto {
  @ApiProperty({
    description: 'Password to check strength for',
    example: 'MyStr0ngP@ssw0rd!',
    minLength: 1,
    maxLength: 72
  })
  @IsString()
  @MinLength(1, { message: 'Password cannot be empty' })
  @MaxPasswordBytes()
  password: string
}
