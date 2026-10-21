import { ConflictException } from '@nestjs/common'

import { ErrorCode } from './error-code'

/** 409 for an update made against a version that is no longer current */
export const versionConflict = (what = 'record') =>
  new ConflictException({
    code: ErrorCode.VERSION_CONFLICT,
    message: `The ${what} was changed by someone else; reload it and try again`
  })
