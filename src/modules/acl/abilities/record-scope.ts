import { Action } from '../types/actions.enum'
import { Subject } from '../types/subjects.enum'

import { AppAbility } from './ability.factory'

export type ScopeValue = string | number | boolean | null

/**
 * Which records of a subject an ability allows, as a database filter: every record, or
 * those matching any one of the condition sets (each a set of column = value pairs).
 * An empty `anyOf` allows nothing.
 */
export type RecordScope = { all: true } | { all: false; anyOf: Array<Record<string, ScopeValue>> }

const isScopeValue = (value: unknown): value is ScopeValue =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value)

/**
 * Turns the ability's rules for `action` on `subject` into a RecordScope, so list
 * queries filter by the same permissions that per-record checks enforce.
 *
 * Only what translates exactly to SQL is used, and anything else fails closed: a `can`
 * rule whose conditions are not plain `column: value` pairs on `columns` is skipped,
 * and a `cannot` rule ends the scan (the rules below it rank lower, so it could
 * restrict any of them).
 */
export function recordScope(
  ability: AppAbility,
  action: Action,
  subject: Subject,
  columns: readonly string[]
): RecordScope {
  const anyOf: Array<Record<string, ScopeValue>> = []

  // Highest priority first, as CASL evaluates them
  for (const rule of ability.rulesFor(action, subject)) {
    if (rule.inverted) break
    if (!rule.conditions) return { all: true }

    const entries = Object.entries(rule.conditions)
    const exact = entries.every(([key, value]) => columns.includes(key) && isScopeValue(value))
    if (exact && entries.length > 0) {
      anyOf.push(Object.fromEntries(entries) as Record<string, ScopeValue>)
    }
  }

  return { all: false, anyOf }
}
