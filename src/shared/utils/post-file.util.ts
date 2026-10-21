import { createReadStream } from 'fs'
import { Readable } from 'stream'
import type { ReadableStream } from 'stream/web'

const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000

/**
 * POST a file as a streamed request body.
 *
 * Node's fetch only accepts web streams as a body, and streamed bodies require
 * `duplex: 'half'`; passing a Node ReadStream directly throws
 * "RequestInit: duplex option is required when sending a body".
 *
 * The request is aborted after `timeoutMs` (default 2 minutes) or when `signal` aborts.
 */
export async function postFile(
  url: string,
  filePath: string,
  headers: Record<string, string> = {},
  options: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<Response> {
  // A deadline for the whole upload (connect, send, response headers): a slow or silent
  // endpoint must not keep the caller (log rotation) waiting indefinitely
  const deadline = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const signal = options.signal ? AbortSignal.any([deadline, options.signal]) : deadline
  const file = createReadStream(filePath)
  const body = Readable.toWeb(file) as ReadableStream<Uint8Array>
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', ...headers },
    body: body as unknown as BodyInit,
    duplex: 'half',
    signal
  }
  try {
    return await fetch(url, init)
  } catch (error) {
    file.destroy()
    throw error
  }
}
