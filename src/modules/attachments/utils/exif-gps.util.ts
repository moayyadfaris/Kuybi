/**
 * Minimal EXIF (TIFF) reader: does the EXIF block carry GPS data?
 *
 * sharp exposes metadata().exif as the raw block ("Exif\0\0" + TIFF) without parsing it.
 * GPS lives in its own IFD, referenced from IFD0 by tag 0x8825; a GPS IFD with entries
 * means the photo records where it was taken.
 */
const GPS_IFD_POINTER = 0x8825
const EXIF_HEADER = Buffer.from('Exif\0\0', 'latin1')

export function hasGpsData(exif: Buffer | undefined): boolean {
  if (!exif || exif.length < 8) return false
  const tiff = exif.subarray(0, 6).equals(EXIF_HEADER) ? exif.subarray(6) : exif
  if (tiff.length < 8) return false

  const order = tiff.toString('latin1', 0, 2)
  if (order !== 'II' && order !== 'MM') return false
  const le = order === 'II'
  const u16 = (offset: number) => (le ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset))
  const u32 = (offset: number) => (le ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset))
  const inBounds = (offset: number, bytes: number) => offset >= 0 && offset + bytes <= tiff.length

  const ifd0 = u32(4)
  if (!inBounds(ifd0, 2)) return false
  const entries = u16(ifd0)
  for (let i = 0; i < entries; i++) {
    const entry = ifd0 + 2 + i * 12
    if (!inBounds(entry, 12)) return false
    if (u16(entry) === GPS_IFD_POINTER) {
      const gpsIfd = u32(entry + 8)
      return inBounds(gpsIfd, 2) && u16(gpsIfd) > 0
    }
  }
  return false
}
