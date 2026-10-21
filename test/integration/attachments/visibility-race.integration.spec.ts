/**
 * A21: the owner's visibility changes, deletion and the image worker's publish step are
 * serialized on the attachment row, so storage ends with the visibility the row ends
 * with. Before, an owner making a file private could pause between changing the ACLs
 * and writing the row; the worker read the still-public row meanwhile and published the
 * objects again, leaving a "private" file publicly downloadable.
 */
import { Queue } from 'bullmq'
import { PinoLogger } from 'nestjs-pino'

import { AttachmentsModule } from '@modules/attachments/attachments.module'
import { Attachment } from '@modules/attachments/entities/attachment.entity'
import { AttachmentProcessor } from '@modules/attachments/jobs/attachment.processor'
import { AttachmentRepository } from '@modules/attachments/repositories/attachment.repository'
import { AttachmentVisibilityService } from '@modules/attachments/services/attachment-visibility.service'
import { DirectUploadService } from '@modules/attachments/services/direct-upload.service'
import { ImagePipelineService } from '@modules/attachments/services/image-pipeline.service'
import { S3Service } from '@modules/attachments/services/s3.service'

import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'attachments',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]
const KEYS = ['uploads/u/photo.jpg', 'uploads/u/photo-thumb.webp']

describe('Attachment visibility is serialized', () => {
  let t: HttpTestApp
  let owner: Actor
  let admin: Actor
  /** Public-read ACL per stored object */
  const acl = new Map<string, boolean>()
  /** While set, calls that make objects private pause after applying their ACL */
  let privateGate: Promise<void> | null = null

  const visibility = () => t.app.get(AttachmentVisibilityService)
  const worker = () =>
    new AttachmentProcessor(
      t.app.get(ImagePipelineService),
      t.app.get(S3Service),
      t.app.get(AttachmentRepository),
      {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      } as unknown as PinoLogger,
      { add: jest.fn() } as unknown as Queue,
      visibility(),
      t.app.get(DirectUploadService)
    )
  const row = (id: string) => t.dataSource.getRepository(Attachment).findOneByOrFail({ id })
  const storagePublic = () => KEYS.map(key => acl.get(key))
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  const createAttachment = async (isPublic: boolean) => {
    const saved = await t.dataSource.getRepository(Attachment).save({
      userId: owner.user.id,
      path: KEYS[0],
      thumbnailPath: KEYS[1],
      mimeType: 'image/webp',
      size: 100,
      originalName: 'photo.jpg',
      isPublic,
      securityStatus: 'completed',
      metadata: {}
    } as Attachment)
    for (const key of KEYS) acl.set(key, isPublic)
    return saved
  }

  beforeAll(async () => {
    t = await createHttpTestApp([AttachmentsModule], { resetTables: TABLES })
    owner = await t.signUp('owner@visibility-race.test', 'user')
    admin = await t.signUp('admin@visibility-race.test', 'super-admin')
    jest.spyOn(t.app.get(S3Service), 'setAcl').mockImplementation(async (key, isPublic) => {
      acl.set(key, isPublic)
      if (!isPublic && privateGate) await privateGate
    })
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('does not let the worker republish a file the owner is making private', async () => {
    const attachment = await createAttachment(true)
    let release!: () => void
    privateGate = new Promise(resolve => (release = resolve))

    // The owner's ACLs are private now; the row is not written yet
    const ownerChange = visibility().setVisibility(attachment, false)
    await sleep(100)
    // The worker finishes processing and applies the row's visibility meanwhile
    const workerPublish = worker()['applyCurrentVisibility'](attachment.id, attachment)
    await sleep(300)
    privateGate = null
    release()
    await Promise.all([ownerChange, workerPublish])

    expect((await row(attachment.id)).isPublic).toBe(false)
    expect(storagePublic()).toEqual([false, false])
  })

  it('makes the stored objects private on delete and restores them with the file', async () => {
    const attachment = await createAttachment(true)

    await t.http().delete(`/api/v1/attachments/${attachment.id}`).set(owner.auth).expect(200)
    expect(storagePublic()).toEqual([false, false])

    // A worker finishing after the delete keeps it private
    await worker()['applyCurrentVisibility'](attachment.id, attachment)
    expect(storagePublic()).toEqual([false, false])

    await t.http().post(`/api/v1/attachments/${attachment.id}/restore`).set(admin.auth).expect(201)
    expect(storagePublic()).toEqual([true, true])
  })
})
