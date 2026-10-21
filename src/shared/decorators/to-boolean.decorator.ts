import { Transform } from 'class-transformer'

const TRUE_VALUES = ['true', '1', 'yes', 'on']
const FALSE_VALUES = ['false', '0', 'no', 'off']

/** true/false for boolean-like input, undefined for anything else (fails @IsBoolean) */
export function parseBooleanInput(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw === 1 ? true : raw === 0 ? false : undefined
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (TRUE_VALUES.includes(normalized)) return true
    if (FALSE_VALUES.includes(normalized)) return false
  }
  return undefined
}

/**
 * Parses a boolean field from JSON, a query string or a multipart form.
 *
 * Use this on every @IsBoolean field. The global ValidationPipe enables implicit
 * conversion, which turns the string "false" into Boolean("false") === true before a
 * plain @Transform(({ value }) => ...) runs; this decorator reads the raw input instead.
 * A missing field keeps the property's default. Input that is not boolean-like is kept
 * as is, so @IsBoolean rejects it, on optional fields too (turning it into undefined
 * made @IsOptional skip validation and the field fall back to its default).
 */
export function ToBoolean(): PropertyDecorator {
  return Transform(({ obj, key }) => {
    const raw = (obj as Record<string, unknown>)[key]
    if (raw === undefined || raw === null) return raw
    return parseBooleanInput(raw) ?? raw
  })
}
