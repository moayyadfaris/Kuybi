import { Injectable, NestMiddleware } from '@nestjs/common'
import { requestIdOf } from '@shared/utils/request.util'
import { NextFunction, Request, Response } from 'express'

/** Assigns the request id (see requestIdOf) and returns it in the X-Request-Id header */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    res.setHeader('X-Request-Id', requestIdOf(req))
    next()
  }
}
