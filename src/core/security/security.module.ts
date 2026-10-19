import { Module } from '@nestjs/common'

import { PasswordHasher } from './password-hasher'

@Module({
  providers: [PasswordHasher],
  exports: [PasswordHasher]
})
export class SecurityModule {}
