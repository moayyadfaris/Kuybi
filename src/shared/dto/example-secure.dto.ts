import { IsString, IsEmail, MaxLength, IsOptional, IsUrl } from 'class-validator'
import {
  SanitizeHtml,
  Trim,
  SanitizeEmail,
  AlphanumericOnly,
  SanitizeUrl
} from '@shared/decorators'

/**
 * Example DTO demonstrating sanitization decorators
 * This shows how to combine sanitization with validation
 */
export class ExampleSecureDto {
  // Email: sanitize (lowercase + trim) then validate
  @Trim()
  @SanitizeEmail()
  @IsEmail()
  email: string

  // Rich text: allow specific HTML tags only
  @Trim()
  @SanitizeHtml({
    allowedTags: ['p', 'strong', 'em', 'a', 'ul', 'ol', 'li'],
    allowedAttributes: { a: ['href', 'title'] }
  })
  @IsString()
  @MaxLength(10000)
  bio: string

  // Plain text: strip all HTML tags
  @Trim()
  @SanitizeHtml({ stripTags: true })
  @IsString()
  @MaxLength(200)
  title: string

  // URL-friendly slug: alphanumeric + hyphens only
  @Trim()
  @AlphanumericOnly('-')
  @IsString()
  @MaxLength(100)
  slug: string

  // URL: ensure https only
  @Trim()
  @SanitizeUrl(['https'])
  @IsOptional()
  @IsUrl()
  website?: string
}
