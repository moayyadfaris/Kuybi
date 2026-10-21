import { BadRequestException } from '@nestjs/common'

import { Attachment } from '@modules/attachments/entities/attachment.entity'
import { AttachmentRepository } from '@modules/attachments/repositories/attachment.repository'
import {
  AttachmentVisibilityService,
  storageKeys
} from '@modules/attachments/services/attachment-visibility.service'
import { S3Service } from '@modules/attachments/services/s3.service'

describe('AttachmentVisibilityService', () => {
  const attachment = (overrides: Partial<Attachment> = {}) =>
    ({
      id: 'a1',
      path: 'uploads/u/file.png',
      thumbnailPath: 'uploads/u/file-thumb.webp',
      isPublic: true,
      metadata: {
        thumbnails: {
          small: { key: 'uploads/u/file-small.webp' },
          medium: { key: 'uploads/u/file-thumb.webp' }
        },
        optimization: { placeholderKey: 'uploads/u/file-blur.webp' }
      },
      ...overrides
    }) as unknown as Attachment

  const build = () => {
    const s3 = { setAcl: jest.fn() }
    const repo = {
      update: jest.fn(async (id: string, data: object) => ({ ...attachment(), ...data })),
      // The locked row is the stored one; writes go through the transaction's manager
      withLockedRow: jest.fn(
        async (_id: string, work: (row: unknown, manager: unknown) => unknown) =>
          work(attachment(), {
            update: (_entity: unknown, id: string, data: object) => repo.update(id, data)
          })
      )
    }
    const service = new AttachmentVisibilityService(
      s3 as unknown as S3Service,
      repo as unknown as AttachmentRepository
    )
    return { service, s3, repo }
  }

  it('collects every stored object once', () => {
    expect(storageKeys(attachment()).sort()).toEqual([
      'uploads/u/file-blur.webp',
      'uploads/u/file-small.webp',
      'uploads/u/file-thumb.webp',
      'uploads/u/file.png'
    ])
  })

  it('changes every object ACL, then the flag', async () => {
    const { service, s3, repo } = build()

    const updated = await service.setVisibility(attachment(), false)

    expect(s3.setAcl).toHaveBeenCalledTimes(4)
    expect(s3.setAcl.mock.calls.every(([, isPublic]) => isPublic === false)).toBe(true)
    expect(repo.update).toHaveBeenCalledWith('a1', { isPublic: false })
    expect(updated.isPublic).toBe(false)
  })

  it('does nothing when the visibility is already right', async () => {
    const { service, s3, repo } = build()

    await service.setVisibility(attachment({ isPublic: true }), true)

    expect(s3.setAcl).not.toHaveBeenCalled()
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('does not record the change when S3 fails', async () => {
    const { service, s3, repo } = build()
    s3.setAcl.mockRejectedValueOnce(new Error('s3 down'))

    await expect(service.setVisibility(attachment(), false)).rejects.toThrow('s3 down')
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('keeps forced-public categories public', async () => {
    const { service } = build()

    await expect(
      service.setVisibility(attachment({ category: 'profile-image' }), false)
    ).rejects.toThrow(BadRequestException)
    expect(() => service.resolveRequested('profile-image', false)).toThrow(BadRequestException)
    expect(service.resolveRequested('profile-image', undefined)).toBe(true)
  })

  it('defaults uploads to public and honours an explicit choice', () => {
    const { service } = build()

    expect(service.resolveRequested(undefined, undefined)).toBe(true)
    expect(service.resolveRequested('documents', false)).toBe(false)
    expect(service.resolveRequested('documents', true)).toBe(true)
  })
})
