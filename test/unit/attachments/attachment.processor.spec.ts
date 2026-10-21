/**
 * AttachmentProcessor with the real image pipeline (sharp) and in-memory S3 and
 * repository: what ends up stored, with which visibility, and what happens on failure.
 */
import { Job, Queue } from 'bullmq'
import { PinoLogger } from 'nestjs-pino'
import sharp from 'sharp'

import { Attachment } from '@modules/attachments/entities/attachment.entity'
import { AttachmentProcessor } from '@modules/attachments/jobs/attachment.processor'
import { AttachmentRepository } from '@modules/attachments/repositories/attachment.repository'
import { ExifProcessorService } from '@modules/attachments/services/exif-processor.service'
import { ImageOptimizationService } from '@modules/attachments/services/image-optimization.service'
import { ImagePipelineService } from '@modules/attachments/services/image-pipeline.service'
import { ImageProcessingService } from '@modules/attachments/services/image-processing.service'
import { S3Service } from '@modules/attachments/services/s3.service'
import { hasGpsData } from '@modules/attachments/utils/exif-gps.util'

import { AttachmentJobType } from '@core/queues/jobs/types'

const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  setContext: jest.fn()
} as unknown as PinoLogger

const geotaggedPhoto = () =>
  sharp({ create: { width: 640, height: 480, channels: 3, background: '#884422' } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'Canon' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '31/1 57/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '35/1 55/1 0/1'
      }
    })
    .toBuffer()

class FakeS3 {
  objects = new Map<string, { body: Buffer; isPublic: boolean }>()
  download = jest.fn(async (key: string) => {
    const object = this.objects.get(key)
    if (!object) throw new Error('NoSuchKey')
    return object.body
  })
  upload = jest.fn(
    async ({ key, buffer, isPublic }: { key: string; buffer: Buffer; isPublic?: boolean }) => {
      this.objects.set(key, { body: buffer, isPublic: !!isPublic })
      return { key, bucket: 'b', location: key }
    }
  )
  setAcl = jest.fn(async (key: string, isPublic: boolean) => {
    const object = this.objects.get(key)
    if (object) object.isPublic = isPublic
  })
  delete = jest.fn(async (key: string) => {
    this.objects.delete(key)
  })
  generateVariantKey = (base: string, variant: string, ext: string) => `${base}-${variant}${ext}`
}

describe('AttachmentProcessor', () => {
  const build = (initial: Partial<Attachment>) => {
    const s3 = new FakeS3()
    const updates: Array<Partial<Attachment>> = []
    // The row as the database holds it now; tests change it while the job runs
    const db: { row: Partial<Attachment> | null } = {
      row: {
        id: 'a1',
        path: 'uploads/u/photo.jpg',
        metadata: { source: 'direct-upload' },
        ...initial
      }
    }
    const repository = {
      findById: jest.fn(async () => (db.row ? { ...db.row } : null)),
      update: jest.fn(async (_id: string, data: Partial<Attachment>) => {
        updates.push(data)
        if (!db.row) return null
        db.row = { ...db.row, ...data }
        return { ...db.row }
      })
    }
    const pipeline = new ImagePipelineService(
      new ExifProcessorService(logger),
      new ImageOptimizationService(logger),
      new ImageProcessingService(),
      s3 as unknown as S3Service,
      logger
    )
    const processor = new AttachmentProcessor(
      pipeline,
      s3 as unknown as S3Service,
      repository as unknown as AttachmentRepository,
      logger,
      { add: jest.fn() } as unknown as Queue
    )
    const run = () =>
      processor.process({
        id: 'job-1',
        name: AttachmentJobType.PROCESS_IMAGE,
        data: {
          attachmentId: 'a1',
          s3Key: 'uploads/u/photo.jpg',
          originalName: 'photo.jpg',
          userId: 'u',
          isPublic: false
        }
      } as unknown as Job)
    return { s3, db, updates, repository, processor, run }
  }

  it('replaces the original with a stripped copy and publishes per the current row', async () => {
    const { s3, updates, run } = build({ isPublic: true })
    s3.objects.set('uploads/u/photo.jpg', { body: await geotaggedPhoto(), isPublic: false })

    await run()

    const stored = s3.objects.get('uploads/u/photo.jpg')!
    expect(hasGpsData((await sharp(stored.body).metadata()).exif)).toBe(false)
    // The row says public (changed after the job was queued with isPublic: false)
    expect(stored.isPublic).toBe(true)
    for (const [key, object] of s3.objects) {
      expect({ key, gps: hasGpsData((await sharp(object.body).metadata()).exif) }).toEqual({
        key,
        gps: false
      })
    }
    const final = updates.at(-1)!
    expect(final).toMatchObject({ securityStatus: 'completed' })
    // The worker never writes the visibility: it applies what the row says
    expect(final).not.toHaveProperty('isPublic')
    expect(final.metadata).toMatchObject({
      source: 'direct-upload',
      processingStatus: 'completed',
      hasLocation: true
    })
    expect(final.thumbnailPath).toMatch(/-medium\./)
  })

  it('keeps a file private that its owner made private while it was processed', async () => {
    const { s3, db, updates, run } = build({ isPublic: true, securityStatus: 'processing' })
    s3.objects.set('uploads/u/photo.jpg', { body: await geotaggedPhoto(), isPublic: false })
    // The owner makes it private while the first processed object is being stored
    s3.upload.mockImplementationOnce(async ({ key, buffer, isPublic }) => {
      db.row = { ...db.row, isPublic: false }
      s3.objects.set(key, { body: buffer, isPublic: !!isPublic })
      return { key, bucket: 'b', location: key }
    })

    await run()

    for (const [key, object] of s3.objects)
      expect({ key, public: object.isPublic }).toEqual({ key, public: false })
    expect(db.row!.isPublic).toBe(false)
    expect(updates.some(update => update.isPublic === true)).toBe(false)
  })

  it('leaves nothing stored for a file deleted while it was processed', async () => {
    const { s3, db, run } = build({ isPublic: true, securityStatus: 'processing' })
    s3.objects.set('uploads/u/photo.jpg', { body: await geotaggedPhoto(), isPublic: false })
    // Hard delete during processing: the row and the stored objects go
    s3.upload.mockImplementationOnce(async ({ key }) => {
      db.row = null
      s3.objects.clear()
      return { key, bucket: 'b', location: key }
    })

    await run()

    expect([...s3.objects.keys()]).toEqual([])
  })

  it('keeps a file soft-deleted during processing private', async () => {
    const { s3, db, run } = build({ isPublic: true, securityStatus: 'processing' })
    s3.objects.set('uploads/u/photo.jpg', { body: await geotaggedPhoto(), isPublic: false })
    s3.upload.mockImplementationOnce(async ({ key, buffer }) => {
      db.row = { ...db.row, deletedAt: new Date() }
      s3.objects.set(key, { body: buffer, isPublic: false })
      return { key, bucket: 'b', location: key }
    })

    await run()

    for (const [key, object] of s3.objects)
      expect({ key, public: object.isPublic }).toEqual({ key, public: false })
  })

  it('removes what it stored when the file is deleted while visibility is applied', async () => {
    const { s3, db, run, repository } = build({ isPublic: true, securityStatus: 'processing' })
    s3.objects.set('uploads/u/photo.jpg', { body: await geotaggedPhoto(), isPublic: false })
    // The final update succeeds; the row is hard-deleted before the ACLs are applied
    const update = repository.update.getMockImplementation()!
    repository.update.mockImplementationOnce(async (id: string, data: Partial<Attachment>) => {
      const result = await update(id, data)
      db.row = null
      return result
    })

    await run()

    expect([...s3.objects.keys()]).toEqual([])
  })

  it('gives up on an image that takes too long, as a failure', async () => {
    const { s3, updates, run, processor } = build({ isPublic: true })
    s3.objects.set('uploads/u/photo.jpg', { body: await geotaggedPhoto(), isPublic: false })
    // A decode that never finishes
    s3.download.mockImplementationOnce(() => new Promise<Buffer>(() => undefined))
    ;(processor as unknown as { processingBudgetMs: number }).processingBudgetMs = 100

    await expect(run()).rejects.toThrow(/timed out/)
    expect(updates.at(-1)).toMatchObject({ securityStatus: 'failed' })
  })

  it('keeps the original private and the earlier metadata when processing fails', async () => {
    const { s3, updates, run } = build({ isPublic: true })
    s3.objects.set('uploads/u/photo.jpg', { body: Buffer.from('not an image'), isPublic: false })

    await expect(run()).rejects.toThrow()

    expect(s3.objects.get('uploads/u/photo.jpg')!.isPublic).toBe(false)
    expect(updates.at(-1)).toMatchObject({
      securityStatus: 'failed',
      metadata: { source: 'direct-upload', processingStatus: 'failed' }
    })
  })

  it('ignores unknown job names', async () => {
    const { processor } = build({})

    await expect(
      processor.process({ id: 'job-2', name: 'optimize-image', data: {} } as unknown as Job)
    ).resolves.toEqual({ ignored: true })
  })
})
