import { IsEmail, IsString, IsOptional, IsObject } from 'class-validator'

export class SendEmailDto {
  @IsEmail()
  to: string

  @IsString()
  subject: string

  @IsString()
  @IsOptional()
  text?: string

  @IsString()
  @IsOptional()
  html?: string

  @IsString()
  @IsOptional()
  from?: string

  @IsObject()
  @IsOptional()
  context?: Record<string, any>
}
