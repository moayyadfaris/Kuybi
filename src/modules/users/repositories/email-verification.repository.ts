import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'
import { hashTokenSecret } from '@core/security'

import { EmailVerification } from '../entities/email-verification.entity'

/** Email verification tokens. Single-use secrets: never cached. */
@Injectable()
export class EmailVerificationRepository extends BaseRepository<EmailVerification> {
  protected entityName = 'email_verification'

  constructor(
    @InjectRepository(EmailVerification)
    repository: Repository<EmailVerification>,
    cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  /** By the token from the email link (stored hashed) */
  findByToken(token: string): Promise<EmailVerification | null> {
    return this.repository.findOne({
      where: { token: hashTokenSecret(token) },
      relations: { user: true }
    })
  }
}
