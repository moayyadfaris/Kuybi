import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request, Response } from 'express'

import { MAX_UPLOAD_BYTES } from '../services/file-validation.service'

/** Room for the multipart framing and form fields around the files */
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024
const DEFAULT_MAX_IN_FLIGHT_BYTES = 300 * 1024 * 1024

/** Upload bytes being received or processed by this process, across all requests */
let inFlightBytes = 0

/**
 * Bounds the memory multipart uploads use (they are buffered in memory). Runs before the
 * body is read: the request must declare its size (411 otherwise), may not exceed one
 * file's limit (413), and is refused with 503 + Retry-After while the uploads already
 * in flight in this process would exceed attachments.maxInFlightUploadBytes. Large or
 * many files belong in direct uploads (POST /attachments/uploads), which bypass the API.
 */
@Injectable()
export class UploadBudgetGuard implements CanActivate {
  private readonly maxInFlightBytes: number

  constructor(configService: ConfigService) {
    this.maxInFlightBytes = configService.get<number>(
      'attachments.maxInFlightUploadBytes',
      DEFAULT_MAX_IN_FLIGHT_BYTES
    )
  }

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp()
    const request = http.getRequest<Request>()
    const response = http.getResponse<Response>()

    const declared = Number(request.headers['content-length'])
    if (!Number.isFinite(declared) || declared <= 0) {
      throw new HttpException('Content-Length is required for uploads', HttpStatus.LENGTH_REQUIRED)
    }
    if (declared > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES) {
      throw new PayloadTooLargeException(
        `An upload may be at most ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB; use a direct upload`
      )
    }
    if (inFlightBytes + declared > this.maxInFlightBytes) {
      response.setHeader('Retry-After', '5')
      throw new ServiceUnavailableException('Too many uploads in progress; try again shortly')
    }

    inFlightBytes += declared
    let released = false
    // 'close' fires once the response is done or the connection drops
    response.once('close', () => {
      if (released) return
      released = true
      inFlightBytes -= declared
    })
    return true
  }
}
