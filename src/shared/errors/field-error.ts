/**
 * One field's problem in an error response (`errors` of a problem, see problem.ts):
 * request validation, post-type field validation, duplicate values. One shape, so a
 * client renders every kind the same way.
 */
export interface FieldError {
  /** JSON Pointer (RFC 6901) into the request body: "/address/city", "/items/0/name" */
  pointer: string
  /** The same path, dotted, for display and form libraries: "address.city" */
  field: string
  /** Machine-readable reason, UPPER_SNAKE: IS_EMAIL, MIN_LENGTH, DUPLICATE ... */
  code: string
  /** English text; clients translate `code` (with `params`) instead */
  message: string
  /** Values the message depends on, for translations: { min: 6 } */
  params?: Record<string, unknown>
}

/** A JSON Pointer from path segments (escapes "~" and "/" as RFC 6901 says) */
export function jsonPointer(path: Array<string | number>): string {
  return path.map(part => `/${String(part).replace(/~/g, '~0').replace(/\//g, '~1')}`).join('')
}

/** "minLength" -> "MIN_LENGTH" */
export function toErrorCode(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toUpperCase()
}

export function fieldError(
  path: Array<string | number>,
  code: string,
  message: string,
  params?: Record<string, unknown>
): FieldError {
  return {
    pointer: jsonPointer(path),
    field: path.join('.'),
    code,
    message,
    ...(params && Object.keys(params).length > 0 ? { params } : {})
  }
}
