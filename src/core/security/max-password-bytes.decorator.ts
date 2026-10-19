import { IsByteLength } from 'class-validator'

import { PASSWORD_MAX_BYTES } from './password-hasher'

/**
 * New passwords fit bcrypt's input: it ignores everything after 72 bytes, so a longer
 * password would be stored as just its first 72 bytes. Characters outside ASCII (accents,
 * emoji) take 2 to 4 bytes each.
 */
export const MaxPasswordBytes = () =>
  IsByteLength(0, PASSWORD_MAX_BYTES, {
    message: `Password must not exceed ${PASSWORD_MAX_BYTES} bytes (${PASSWORD_MAX_BYTES} plain characters; accented letters and emoji count as 2 to 4)`
  })
