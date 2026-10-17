import { StreamableFile } from '@nestjs/common'

/**
 * Responses that must reach the HTTP adapter unchanged. Interceptors that reshape JSON
 * responses (envelopes, added fields) must skip these, otherwise the file is serialized
 * as a JSON object instead of being streamed.
 */
export function isBinaryResponse(data: unknown): boolean {
  return data instanceof StreamableFile || Buffer.isBuffer(data)
}
