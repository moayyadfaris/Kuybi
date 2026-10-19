import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcrypt'
import { randomBytes } from 'crypto'

/** bcrypt reads at most this many bytes of the password and silently ignores the rest */
export const PASSWORD_MAX_BYTES = 72

/** Cost when BCRYPT_ROUNDS is not set (each step doubles the work) */
export const DEFAULT_BCRYPT_ROUNDS = 12

/**
 * The one place passwords are hashed and checked, at the cost from config
 * (security.bcryptRounds). Hashes made at a lower cost still verify; needsRehash() tells
 * the login to upgrade them.
 */
@Injectable()
export class PasswordHasher {
  readonly rounds: number
  private dummyHash?: Promise<string>

  constructor(config: ConfigService) {
    this.rounds = config.get<number>('security.bcryptRounds') ?? DEFAULT_BCRYPT_ROUNDS
  }

  /** Hashes a new password; 400 when bcrypt would truncate it */
  async hash(password: string): Promise<string> {
    if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
      throw new BadRequestException(`Password must not exceed ${PASSWORD_MAX_BYTES} bytes`)
    }
    return bcrypt.hash(password, this.rounds)
  }

  /**
   * Whether the password matches the hash. Without a hash it still spends the time of a
   * real check, so timing does not reveal whether an account (or its password) exists.
   */
  async verify(password: string, hash: string | null | undefined): Promise<boolean> {
    if (!hash) {
      await bcrypt.compare(password, await this.getDummyHash())
      return false
    }
    return bcrypt.compare(password, hash)
  }

  /** Whether a stored hash was made at a lower cost than configured */
  needsRehash(hash: string): boolean {
    try {
      return bcrypt.getRounds(hash) < this.rounds
    } catch {
      return false // not a bcrypt hash: leave it alone
    }
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= bcrypt.hash(randomBytes(16).toString('hex'), this.rounds)
    return this.dummyHash
  }
}
