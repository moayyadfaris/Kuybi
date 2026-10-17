import { ConfigService } from '@nestjs/config'
import sharp from 'sharp'

import {
  FileValidationService,
  MulterFile
} from '@modules/attachments/services/file-validation.service'

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF\n')
const HTML = Buffer.from(
  '<!DOCTYPE html><html><body><script>alert(document.cookie)</script></body></html>'
)
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>'
)
// Compound File Binary header used by legacy .doc/.xls/.ppt
const OLE = Buffer.concat([
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  Buffer.alloc(504)
])
// Minimal ZIP local file header (DOCX/XLSX/PPTX are ZIP containers)
const ZIP = Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(60)])

const file = (originalname: string, mimetype: string, buffer: Buffer): MulterFile => ({
  fieldname: 'file',
  originalname,
  encoding: '7bit',
  mimetype,
  size: buffer.length,
  buffer
})

describe('FileValidationService', () => {
  const service = new FileValidationService({} as ConfigService)
  let JPEG: Buffer
  let PNG: Buffer

  beforeAll(async () => {
    const base = sharp({ create: { width: 8, height: 8, channels: 3, background: '#c33' } })
    JPEG = await base.clone().jpeg().toBuffer()
    PNG = await base.clone().png().toBuffer()
  })

  describe('accepts genuine files', () => {
    it.each([
      ['photo.jpg', 'image/jpeg', () => JPEG],
      ['image.png', 'image/png', () => PNG],
      ['report.pdf', 'application/pdf', () => PDF],
      ['legacy.doc', 'application/msword', () => OLE],
      ['legacy.xls', 'application/vnd.ms-excel', () => OLE],
      [
        'modern.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        () => ZIP
      ],
      ['bundle.zip', 'application/zip', () => ZIP]
    ])('%s declared as %s', async (name, mimetype, buffer) => {
      const result = await service.validateFile(file(name, mimetype, buffer()))

      expect(result.errors).toEqual([])
      expect(result.isValid).toBe(true)
    })

    it.each([
      ['notes.txt', 'text/plain', 'plain text\nsecond line'],
      ['rows.csv', 'text/csv', 'id,name\n1,Ada\n2,عربي'],
      ['data.json', 'application/json', '{"ok":true}']
    ])('text file %s declared as %s', async (name, mimetype, content) => {
      const result = await service.validateFile(file(name, mimetype, Buffer.from(content)))

      expect(result.errors).toEqual([])
      expect(result.isValid).toBe(true)
    })
  })

  describe('rejects content that does not match the declared type', () => {
    it.each([
      ['PDF declared as an image', 'fake.png', 'image/png', () => PDF],
      ['HTML declared as an image', 'fake.jpg', 'image/jpeg', () => HTML],
      ['HTML declared as a PDF', 'fake.pdf', 'application/pdf', () => HTML],
      ['an image declared as plain text', 'fake.txt', 'text/plain', () => PNG],
      ['an OLE container declared as an image', 'fake.png', 'image/png', () => OLE]
    ])('%s', async (_label, name, mimetype, buffer) => {
      const result = await service.validateFile(file(name, mimetype, buffer()))

      expect(result.isValid).toBe(false)
    })

    it('rejects text that contains NUL bytes', async () => {
      const result = await service.validateFile(
        file('bin.txt', 'text/plain', Buffer.from('abc\0def'))
      )

      expect(result.isValid).toBe(false)
    })

    it('reports the type detected from content, not from the extension', async () => {
      const result = await service.validateFile(file('photo.pdf', 'image/png', PNG))

      expect(result.detectedMimeType).toBe('image/png')
    })
  })

  describe('rejects types that can carry active content', () => {
    it.each([
      ['image.svg', 'image/svg+xml', SVG],
      ['feed.xml', 'application/xml', HTML]
    ])('%s declared as %s', async (name, mimetype, buffer) => {
      const result = await service.validateFile(file(name, mimetype, buffer))

      expect(result.isValid).toBe(false)
    })
  })

  describe('existing filename and size rules', () => {
    it('rejects dangerous extensions', async () => {
      const result = await service.validateFile(file('setup.exe', 'application/zip', ZIP))

      expect(result.isValid).toBe(false)
    })

    it('rejects path traversal in the filename', async () => {
      const result = await service.validateFile(file('../../etc/passwd.png', 'image/png', PNG))

      expect(result.isValid).toBe(false)
    })

    it('rejects empty files', async () => {
      const result = await service.validateFile(file('empty.png', 'image/png', Buffer.alloc(0)))

      expect(result.isValid).toBe(false)
    })
  })
})
