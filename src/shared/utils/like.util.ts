/**
 * A LIKE/ILIKE pattern matching `term` anywhere in the value. The LIKE wildcards (% and _)
 * and the escape character in `term` are escaped, so user input matches literally:
 * a search for "100%" must not match "1000". Postgres escapes with a backslash by default.
 */
export function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, char => `\\${char}`)}%`
}
