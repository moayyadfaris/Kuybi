import * as bcrypt from 'bcrypt'
import { createHash, timingSafeEqual } from 'crypto'

const SHA256_PREFIX = 'sha256$'

/**
 * Hash of a random token secret (e.g. a refresh token). Secrets are high-entropy, so a
 * fast hash is enough: a slow one (bcrypt) protects guessable passwords, not random ones.
 */
export function hashTokenSecret(secret: string): string {
  return SHA256_PREFIX + createHash('sha256').update(secret).digest('hex')
}

/** Checks a secret against hashTokenSecret() output, or a bcrypt hash from before it */
export async function verifyTokenSecret(secret: string, stored: string): Promise<boolean> {
  if (!stored.startsWith(SHA256_PREFIX)) {
    return bcrypt.compare(secret, stored)
  }
  const expected = Buffer.from(stored)
  const actual = Buffer.from(hashTokenSecret(secret))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
