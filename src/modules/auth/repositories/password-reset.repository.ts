import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThan, Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'
import { hashTokenSecret } from '@core/security'

import { PasswordReset } from '../entities/password-reset.entity'

/** Password reset tokens. Single-use secrets: never cached. */
@Injectable()
export class PasswordResetRepository extends BaseRepository<PasswordReset> {
  protected entityName = 'password_reset'

  constructor(
    @InjectRepository(PasswordReset)
    repository: Repository<PasswordReset>,
    cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  /** By the token from the email link (stored hashed) */
  findByToken(token: string): Promise<PasswordReset | null> {
    return this.repository.findOne({
      where: { token: hashTokenSecret(token) },
      relations: { user: true }
    })
  }

  /** Deletes tokens that expired before the cutoff; returns how many */
  async deleteExpiredBefore(cutoff: Date): Promise<number> {
    const result = await this.repository.delete({ expiresAt: LessThan(cutoff) })
    return result.affected ?? 0
  }
}
