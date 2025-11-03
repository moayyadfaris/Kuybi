import { posix as pathPosix } from 'path'

const DEFAULT_PUBLIC_CATEGORIES = new Set([
  'profile-image',
  'profile_image',
  'profile',
  'story-main-image',
  'story_main_image',
  'story-main'
])

export const mapFormatToContentType = (format?: string): string => {
  switch (format) {
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'avif':
      return 'image/avif'
    case 'gif':
      return 'image/gif'
    case 'jpeg':
    case 'jpg':
    default:
      return 'image/jpeg'
  }
}

export const extractFormatFromMime = (mime?: string): string | undefined => {
  if (!mime) {
    return undefined
  }
  if (mime.startsWith('image/')) {
    return mime.split('/')[1]
  }
  return undefined
}

export const resolveExtensionFromFormat = (
  format?: string,
  fallbackMime?: string,
  fallbackName?: string
): string => {
  if (format) {
    if (format === 'jpeg' || format === 'jpg') return '.jpg'
    if (format === 'png') return '.png'
    if (format === 'webp') return '.webp'
    if (format === 'avif') return '.avif'
    if (format === 'gif') return '.gif'
  }

  if (fallbackMime) {
    if (fallbackMime.includes('jpeg') || fallbackMime.includes('jpg')) return '.jpg'
    if (fallbackMime.includes('png')) return '.png'
    if (fallbackMime.includes('webp')) return '.webp'
    if (fallbackMime.includes('avif')) return '.avif'
    if (fallbackMime.includes('gif')) return '.gif'
  }

  if (fallbackName) {
    const ext = pathPosix.extname(fallbackName)
    if (ext) {
      return ext
    }
  }

  return '.bin'
}

export const shouldForcePublic = (category?: string): boolean => {
  if (!category) {
    return false
  }

  const normalized = category.toLowerCase()
  if (DEFAULT_PUBLIC_CATEGORIES.has(normalized)) {
    return true
  }

  if (normalized.includes('profile')) {
    return true
  }

  if (normalized.includes('story') && normalized.includes('main')) {
    return true
  }

  return false
}

export type ThumbnailMetadata = {
  key: string
  width: number
  height: number
  size: number
  format: string
}

export type AttachmentOptimizationMetadata = {
  originalSize?: number
  optimizedSize?: number
  compressionRatio?: number
  format?: string
  width?: number
  height?: number
  hasWebP?: boolean
  hasAVIF?: boolean
  hasPlaceholder?: boolean
  placeholderKey?: string
}

export type AttachmentMetadata = {
  optimization?: AttachmentOptimizationMetadata
  thumbnails?: Record<string, ThumbnailMetadata>
  validation?: unknown
  [key: string]: unknown
}
