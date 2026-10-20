/** Escapes the LIKE wildcards (% and _) and the escape character (backslash, Postgres' default) */
const escapeLike = (term: string): string => term.replace(/[\\%_]/g, char => `\\${char}`)

/**
 * A LIKE/ILIKE pattern matching `term` anywhere in the value. User input matches
 * literally: a search for "100%" must not match "1000".
 */
export function containsPattern(term: string): string {
  return `%${escapeLike(term)}%`
}

/** A LIKE/ILIKE pattern matching values that start with `term` (literally) */
export function startsWithPattern(term: string): string {
  return `${escapeLike(term)}%`
}
