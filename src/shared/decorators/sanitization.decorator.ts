/**
 * Custom sanitization decorators using class-validator
 * These decorators sanitize input data during validation
 * No dependency on class-transformer for better maintainability
 */

import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments
} from 'class-validator'
import DOMPurify from 'isomorphic-dompurify'

export interface SanitizeHtmlOptions extends ValidationOptions {
  allowedTags?: string[]
  allowedAttributes?: Record<string, string[]>
  allowedSchemes?: string[]
  stripTags?: boolean
  escapeHtml?: boolean
}

// Default allowed HTML tags for rich text
const DEFAULT_ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'a',
  'blockquote',
  'code',
  'pre',
  'img'
]

const DEFAULT_ALLOWED_ATTRIBUTES = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height']
}

/**
 * Sanitize HTML content to prevent XSS attacks
 * Uses DOMPurify to clean HTML while preserving allowed tags
 */
@ValidatorConstraint({ name: 'sanitizeHtml', async: false })
class SanitizeHtmlConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      return true // Let other validators handle type checking
    }

    const options = args.constraints[0] as SanitizeHtmlOptions
    const sanitized = this.sanitize(value, options)

    // Mutate the object property with sanitized value
    // This is the key: we modify the value during validation
    const object = args.object as Record<string, unknown>
    object[args.property] = sanitized

    return true // Always return true as we're sanitizing, not validating
  }

  private sanitize(value: string, options: SanitizeHtmlOptions = {}): string {
    if (options.stripTags) {
      return value.replace(/<[^>]*>/g, '')
    }

    if (options.escapeHtml) {
      return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;')
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = {
      ALLOWED_TAGS: options.allowedTags || DEFAULT_ALLOWED_TAGS,
      ALLOWED_ATTR: options.allowedAttributes || DEFAULT_ALLOWED_ATTRIBUTES
    }

    if (options.allowedSchemes) {
      config.ALLOWED_URI_REGEXP = new RegExp(`^(${options.allowedSchemes.join('|')}):`, 'i')
    }

    return String(DOMPurify.sanitize(value, config))
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} has been sanitized for security`
  }
}

export function SanitizeHtml(options?: SanitizeHtmlOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: options,
      constraints: [options || {}],
      validator: SanitizeHtmlConstraint
    })
  }
}

/**
 * Trim whitespace from string values
 */
@ValidatorConstraint({ name: 'trim', async: false })
class TrimConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value === 'string') {
      const object = args.object as Record<string, unknown>
      object[args.property] = value.trim()
    }
    return true
  }
}

export function Trim(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: TrimConstraint
    })
  }
}

/**
 * Convert string to lowercase
 */
@ValidatorConstraint({ name: 'toLowerCase', async: false })
class ToLowerCaseConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value === 'string') {
      const object = args.object as Record<string, unknown>
      object[args.property] = value.toLowerCase()
    }
    return true
  }
}

export function ToLowerCase(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: ToLowerCaseConstraint
    })
  }
}

/**
 * Convert string to uppercase
 */
@ValidatorConstraint({ name: 'toUpperCase', async: false })
class ToUpperCaseConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value === 'string') {
      const object = args.object as Record<string, unknown>
      object[args.property] = value.toUpperCase()
    }
    return true
  }
}

export function ToUpperCase(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: ToUpperCaseConstraint
    })
  }
}

/**
 * Sanitize to prevent SQL injection
 * NOTE: This is a basic defense layer. Always use parameterized queries!
 */
@ValidatorConstraint({ name: 'sanitizeSql', async: false })
class SanitizeSqlConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value === 'string') {
      const sanitized = value.replace(/('|(\\')|(\\")|(;)|(--)|(\/\*)|(\*\/))/g, '').trim()
      const object = args.object as Record<string, unknown>
      object[args.property] = sanitized
    }
    return true
  }

  defaultMessage(): string {
    return 'Value has been sanitized for SQL injection prevention'
  }
}

export function SanitizeSql(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: SanitizeSqlConstraint
    })
  }
}

/**
 * Allow only alphanumeric characters and specified additional characters
 */
@ValidatorConstraint({ name: 'alphanumericOnly', async: false })
class AlphanumericOnlyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value === 'string') {
      const allowedChars = (args.constraints[0] as string) || ''
      const pattern = new RegExp(
        `[^a-zA-Z0-9${allowedChars.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}]`,
        'g'
      )
      const sanitized = value.replace(pattern, '')
      const object = args.object as Record<string, unknown>
      object[args.property] = sanitized
    }
    return true
  }
}

export function AlphanumericOnly(
  allowedChars = '',
  validationOptions?: ValidationOptions
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      constraints: [allowedChars],
      validator: AlphanumericOnlyConstraint
    })
  }
}

/**
 * Sanitize email addresses (lowercase + trim)
 */
@ValidatorConstraint({ name: 'sanitizeEmail', async: false })
class SanitizeEmailConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value === 'string') {
      const sanitized = value.toLowerCase().trim()
      const object = args.object as Record<string, unknown>
      object[args.property] = sanitized
    }
    return true
  }
}

export function SanitizeEmail(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: SanitizeEmailConstraint
    })
  }
}

/**
 * Sanitize URLs to prevent XSS and ensure valid protocols
 */
@ValidatorConstraint({ name: 'sanitizeUrl', async: false })
class SanitizeUrlConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value === 'string') {
      const allowedProtocols = (args.constraints[0] as string[]) || ['http', 'https']
      let sanitized = ''

      try {
        const url = new URL(value)
        if (allowedProtocols.includes(url.protocol.replace(':', ''))) {
          sanitized = url.toString()
        }
      } catch {
        sanitized = ''
      }

      const object = args.object as Record<string, unknown>
      object[args.property] = sanitized
    }
    return true
  }
}

export function SanitizeUrl(
  allowedProtocols: string[] = ['http', 'https'],
  validationOptions?: ValidationOptions
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      constraints: [allowedProtocols],
      validator: SanitizeUrlConstraint
    })
  }
}

/**
 * Remove script tags and javascript: protocol
 */
@ValidatorConstraint({ name: 'removeScripts', async: false })
class RemoveScriptsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value === 'string') {
      let sanitized = value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      sanitized = sanitized.replace(/javascript:/gi, '')
      sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')

      const object = args.object as Record<string, unknown>
      object[args.property] = sanitized
    }
    return true
  }
}

export function RemoveScripts(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: RemoveScriptsConstraint
    })
  }
}

/**
 * Sanitize filename to prevent directory traversal
 */
@ValidatorConstraint({ name: 'sanitizeFilename', async: false })
class SanitizeFilenameConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value === 'string') {
      const sanitized = value
        .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace special chars
        .replace(/\.{2,}/g, '.') // Remove multiple dots
        .replace(/^\.+/, '') // Remove leading dots
        .substring(0, 255) // Limit length

      const object = args.object as Record<string, unknown>
      object[args.property] = sanitized
    }
    return true
  }
}

export function SanitizeFilename(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: SanitizeFilenameConstraint
    })
  }
}
