import { Injectable, NestMiddleware } from '@nestjs/common'
import { requestIdOf } from '@shared/utils/request.util'
import { NextFunction, Request, Response } from 'express'

/**
 * Assigns the request id (see requestIdOf), returns it in the X-Request-Id header and
 * stamps the arrival time. Runs first (configureApp).
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    req.receivedAt = Date.now()
    res.setHeader('X-Request-Id', requestIdOf(req))
    next()
  }
}
