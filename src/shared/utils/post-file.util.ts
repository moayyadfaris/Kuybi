import { createReadStream } from 'fs'
import { Readable } from 'stream'
import type { ReadableStream } from 'stream/web'

/**
 * POST a file as a streamed request body.
 *
 * Node's fetch only accepts web streams as a body, and streamed bodies require
 * `duplex: 'half'`; passing a Node ReadStream directly throws
 * "RequestInit: duplex option is required when sending a body".
 */
export function postFile(
  url: string,
  filePath: string,
  headers: Record<string, string> = {}
): Promise<Response> {
  const body = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', ...headers },
    body: body as unknown as BodyInit,
    duplex: 'half'
  }
  return fetch(url, init)
}
