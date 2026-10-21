import { createHash } from 'crypto'

import { S3Service } from '@modules/attachments/services/s3.service'

/** The error S3 answers when an If-Match / CopySourceIfMatch ETag no longer matches */
const preconditionFailed = () =>
  Object.assign(new Error('PreconditionFailed'), {
    name: 'PreconditionFailed',
    $metadata: { httpStatusCode: 412 }
  })

/**
 * In-memory stand-in for S3, installed with jest spies on the app's S3Service: tests
 * "upload" directly by putting bytes under a presigned key, and inspect which objects
 * exist and which are public.
 */
export class FakeStorage {
  readonly objects = new Map<string, Buffer>()
  readonly publicKeys = new Set<string>()
  /** isPublic of each multipart upload, by key */
  readonly uploads = new Map<string, boolean | undefined>()
  /** Every ACL change, in order */
  readonly aclChanges: Array<{ key: string; isPublic: boolean }> = []

  install(s3: S3Service) {
    jest.spyOn(s3, 'createPresignedUpload').mockImplementation(async ({ key, contentType }) => ({
      url: 'https://storage.test/bucket',
      fields: { key, 'Content-Type': contentType, Policy: 'signed-policy' }
    }))
    jest.spyOn(s3, 'getMetadata').mockImplementation(async key => {
      const body = this.objects.get(key)
      if (!body) throw new Error('NotFound')
      return { contentLength: body.length, etag: this.etag(key) }
    })
    jest.spyOn(s3, 'readHead').mockImplementation(async (key, bytes, ifMatch) => {
      if (ifMatch && this.etag(key) !== ifMatch) throw preconditionFailed()
      return this.objects.get(key)!.subarray(0, bytes)
    })
    jest.spyOn(s3, 'copyIfUnchanged').mockImplementation(async (from, to, ifMatch) => {
      if (this.etag(from) !== ifMatch) throw preconditionFailed()
      this.objects.set(to, this.objects.get(from)!)
      this.publicKeys.delete(to)
    })
    jest.spyOn(s3, 'download').mockImplementation(async key => {
      const body = this.objects.get(key)
      if (!body) throw new Error('NotFound')
      return body
    })
    jest.spyOn(s3, 'delete').mockImplementation(async key => {
      this.objects.delete(key)
      this.publicKeys.delete(key)
    })
    jest.spyOn(s3, 'upload').mockImplementation(async options => {
      this.uploads.set(options.key, options.isPublic)
      this.objects.set(options.key, options.buffer)
      if (options.isPublic) this.publicKeys.add(options.key)
      else this.publicKeys.delete(options.key)
      return { key: options.key, bucket: 'bucket', location: `https://storage.test/${options.key}` }
    })
    // makePublic delegates to setAcl
    jest.spyOn(s3, 'setAcl').mockImplementation(async (key, isPublic) => {
      this.aclChanges.push({ key, isPublic })
      if (isPublic) this.publicKeys.add(key)
      else this.publicKeys.delete(key)
    })
    jest
      .spyOn(s3, 'getPresignedUrl')
      .mockImplementation(async key => `https://storage.test/${key}?signed`)
  }

  /** ETag of the object stored under a key (a hash of its bytes, as S3's for simple uploads) */
  etag(key: string): string | undefined {
    const body = this.objects.get(key)
    return body ? `"${createHash('md5').update(body).digest('hex')}"` : undefined
  }
}
