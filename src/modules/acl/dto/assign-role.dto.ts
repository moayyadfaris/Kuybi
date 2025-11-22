import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsDateString, IsInt, IsOptional } from 'class-validator'

export class AssignRoleDto {
  @ApiProperty({
    description: 'Role ID to assign to the user',
    example: 2
  })
  @IsInt()
  roleId: number

  @ApiPropertyOptional({
    description: 'When the role assignment expires (ISO 8601 format)',
    example: '2026-12-31T23:59:59Z'
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string

  @ApiPropertyOptional({
    description: 'Is the role assignment active',
    example: true,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
