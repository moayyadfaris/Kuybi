import { QueryFailedError } from 'typeorm'

/** Postgres unique_violation: an INSERT/UPDATE hit a unique index or constraint */
const UNIQUE_VIOLATION = '23505'

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === UNIQUE_VIOLATION
  )
}
