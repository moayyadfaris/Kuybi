import { Injectable, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { randomUUID } from 'crypto'

const HEADER_NAME = 'x-request-id'
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { id?: string; requestId?: string }, res: Response, next: NextFunction) {
    const incoming = req.header(HEADER_NAME)
    const requestId = this.normalizeRequestId(incoming)

    req.id = requestId
    ;(req as any).requestId = requestId
    res.setHeader(HEADER_NAME, requestId)

    next()
  }

  private normalizeRequestId(candidate?: string): string {
    if (candidate && REQUEST_ID_PATTERN.test(candidate)) {
      return candidate
    }
    return randomUUID()
  }
}
