import { createParamDecorator, ExecutionContext } from '@nestjs/common'

import { RequestWithContextLogger } from '../types/request-with-context-logger.interface'

export const ReqLogger = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithContextLogger>()
  return request?.contextLogger ?? request?.log
})
