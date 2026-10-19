import { Transform } from 'class-transformer'

/**
 * Accepts one value or several for an array query parameter: `?action=login` arrives as
 * a string, `?action=login&action=logout` as an array, and `?action=login,logout` is
 * split on commas. Reads the raw input (see ToBoolean on implicit conversion).
 */
export function ToArray(): PropertyDecorator {
  return Transform(({ obj, key }) => {
    const raw = (obj as Record<string, unknown>)[key]
    if (raw === undefined || raw === null || raw === '') return undefined
    const values = Array.isArray(raw) ? raw : [raw]
    return values.flatMap(value =>
      typeof value === 'string'
        ? value
            .split(',')
            .map(part => part.trim())
            .filter(Boolean)
        : [value]
    )
  })
}
