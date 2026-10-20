/**
 * Uploaded photos must not keep where they were taken. Runs the real image services on
 * real JPEGs (sharp), in the order the upload paths use them: strip, optimize, thumbnails.
 *
 * Until October 2026 both "strip" steps called sharp's withMetadata(), which KEEPS the
 * input's EXIF: every stored original kept its GPS coordinates and camera details.
 */
import { PinoLogger } from 'nestjs-pino'
import sharp from 'sharp'

import { ExifProcessorService } from '@modules/attachments/services/exif-processor.service'
import { ImageOptimizationService } from '@modules/attachments/services/image-optimization.service'
import { ImageProcessingService } from '@modules/attachments/services/image-processing.service'
import { hasGpsData } from '@modules/attachments/utils/exif-gps.util'

const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }

/** A JPEG as a phone would produce it: camera make/model and GPS coordinates */
const geotaggedPhoto = (width = 800, height = 600, orientation?: number) => {
  let image = sharp({ create: { width, height, channels: 3, background: '#336699' } })
    .jpeg()
    .withIccProfile('p3')
    .withExif({
      IFD0: { Make: 'Canon', Model: 'EOS R5', Software: 'PhotoTool 1.0' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '31/1 57/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '35/1 55/1 0/1'
      }
    })
  if (orientation) image = image.withMetadata({ orientation })
  return image.toBuffer()
}

const metadataOf = (buffer: Buffer) => sharp(buffer).metadata()

describe('image privacy (real sharp pipeline)', () => {
  const exif = new ExifProcessorService(logger as unknown as PinoLogger)
  const optimizer = new ImageOptimizationService(logger as unknown as PinoLogger)
  const thumbnails = new ImageProcessingService()

  it('detects GPS in a geotagged photo and not in a plain one', async () => {
    const photo = await geotaggedPhoto()
    const plain = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#fff' }
    })
      .jpeg()
      .toBuffer()

    expect(hasGpsData((await metadataOf(photo)).exif)).toBe(true)
    expect(hasGpsData((await metadataOf(plain)).exif)).toBe(false)
  })

  it('strips EXIF (GPS, camera) but keeps the colour profile', async () => {
    const photo = await geotaggedPhoto()

    const result = await exif.stripSensitiveData(photo, { stripSensitiveData: true })

    const out = await metadataOf(result.buffer)
    expect(out.exif).toBeUndefined()
    expect(hasGpsData(out.exif)).toBe(false)
    expect(out.icc).toBeDefined()
    expect(result.stripped).toEqual(expect.arrayContaining(['exif', 'gps']))
  })

  it('applies the EXIF orientation to the pixels before dropping the tag', async () => {
    const sideways = await geotaggedPhoto(40, 30, 6) // stored landscape, displayed portrait

    const result = await exif.stripSensitiveData(sideways)

    const out = await metadataOf(result.buffer)
    expect([out.width, out.height]).toEqual([30, 40])
    expect(out.orientation ?? 1).toBe(1)
    expect(result.stripped).toContain('orientation')
  })

  it('stores an optimized image without GPS, and so are its placeholder and thumbnails', async () => {
    const photo = await geotaggedPhoto()
    const stripped = (await exif.stripSensitiveData(photo)).buffer

    const optimized = await optimizer.optimizeImage(stripped, {
      maxWidth: 2048,
      quality: 85,
      stripMetadata: true,
      autoRotate: false,
      generatePlaceholder: true
    })
    const thumbs = await thumbnails.generateThumbnails(optimized.buffer)

    const buffers = [
      optimized.buffer,
      optimized.placeholder!,
      ...Object.values(thumbs).map(t => t.buffer)
    ]
    for (const buffer of buffers) {
      expect(hasGpsData((await metadataOf(buffer)).exif)).toBe(false)
    }
  })

  it('strips metadata in optimizeImage even when given the original photo', async () => {
    const optimized = await optimizer.optimizeImage(await geotaggedPhoto(), {
      stripMetadata: true,
      generatePlaceholder: false
    })

    const out = await metadataOf(optimized.buffer)
    expect(out.exif).toBeUndefined()
    expect(out.icc).toBeDefined()
  })

  it('keeps metadata only when asked to', async () => {
    const optimized = await optimizer.optimizeImage(await geotaggedPhoto(), {
      stripMetadata: false,
      generatePlaceholder: false
    })

    expect(hasGpsData((await metadataOf(optimized.buffer)).exif)).toBe(true)
  })

  it('reports a location flag but never the coordinates in the summary', async () => {
    const summary = await exif.generateMetadataSummary(await geotaggedPhoto())

    expect(summary.hasLocation).toBe(true)
    expect(JSON.stringify(summary)).not.toMatch(/31|35\/1|57\/1/)
  })
})

describe('hasGpsData', () => {
  it('reads big-endian and little-endian TIFF and rejects garbage', () => {
    expect(hasGpsData(undefined)).toBe(false)
    expect(hasGpsData(Buffer.from('not exif at all'))).toBe(false)
    // MM (big-endian), IFD0 at 8 with one entry: GPS pointer to an IFD with 1 entry
    const be = Buffer.alloc(40)
    be.write('MM', 0, 'latin1')
    be.writeUInt16BE(42, 2)
    be.writeUInt32BE(8, 4)
    be.writeUInt16BE(1, 8)
    be.writeUInt16BE(0x8825, 10)
    be.writeUInt16BE(4, 12)
    be.writeUInt32BE(1, 14)
    be.writeUInt32BE(26, 18)
    be.writeUInt16BE(1, 26)
    expect(hasGpsData(be)).toBe(true)
    be.writeUInt16BE(0, 26) // empty GPS IFD
    expect(hasGpsData(be)).toBe(false)
    be.writeUInt32BE(9999, 18) // pointer out of bounds
    expect(hasGpsData(be)).toBe(false)
  })
})
