import { postFile } from '@shared/utils/post-file.util'
import { mkdtempSync, writeFileSync } from 'fs'
import { createServer, Server } from 'http'
import { AddressInfo } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'

describe('postFile', () => {
  let server: Server
  let url: string
  let received: { bytes: number; headers: Record<string, unknown> }

  beforeAll(done => {
    server = createServer((req, res) => {
      if (req.url === '/hang') return // never answers
      let bytes = 0
      req.on('data', chunk => (bytes += chunk.length))
      req.on('end', () => {
        received = { bytes, headers: req.headers }
        res.end('ok')
      })
    }).listen(0, () => {
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      done()
    })
  })

  afterAll(done => {
    server.close(done)
  })

  it('streams the whole file with the given headers', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'post-file-')), 'archive.gz')
    writeFileSync(file, Buffer.alloc(50_000, 7))

    const response = await postFile(url, file, { 'X-Log-Filename': 'archive.gz' })

    expect(response.status).toBe(200)
    expect(received.bytes).toBe(50_000)
    expect(received.headers['x-log-filename']).toBe('archive.gz')
  })

  it('gives up when the endpoint does not answer in time', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'post-file-')), 'archive.gz')
    writeFileSync(file, Buffer.alloc(1_000, 7))

    const started = Date.now()
    await expect(postFile(`${url}/hang`, file, {}, { timeoutMs: 200 })).rejects.toThrow()
    expect(Date.now() - started).toBeLessThan(2_000)
  })
})
