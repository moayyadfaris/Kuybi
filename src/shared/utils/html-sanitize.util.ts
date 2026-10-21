import DOMPurify from 'isomorphic-dompurify'

/** Tags rich text may keep; everything else (script, iframe, style, svg...) is removed */
export const RICH_TEXT_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'a',
  'blockquote',
  'code',
  'pre',
  'img'
]

/** Attributes rich text may keep (no event handlers, no style) */
export const RICH_TEXT_ATTRIBUTES = [
  'href',
  'title',
  'target',
  'rel',
  'src',
  'alt',
  'width',
  'height'
]

/** Links and images may point at http(s), mailto or a relative URL; never javascript: or data: */
const SAFE_URI = /^(?:https?:|mailto:|\/|#)/i

export interface RichTextOptions {
  allowedTags?: string[]
  allowedAttributes?: string[]
  /** URI schemes links and images may use, instead of http, https and mailto */
  allowedSchemes?: string[]
}

/**
 * HTML from a rich-text editor, reduced to safe markup: allowed tags and attributes only,
 * no event handlers, no script or javascript: URLs. Store this, never the raw input:
 * whoever renders the HTML trusts it.
 */
export function sanitizeRichText(html: string, options: RichTextOptions = {}): string {
  return String(
    DOMPurify.sanitize(html, {
      ALLOWED_TAGS: options.allowedTags ?? RICH_TEXT_TAGS,
      ALLOWED_ATTR: options.allowedAttributes ?? RICH_TEXT_ATTRIBUTES,
      ALLOWED_URI_REGEXP: options.allowedSchemes
        ? new RegExp(`^(${options.allowedSchemes.join('|')}):`, 'i')
        : SAFE_URI
    })
  )
}

/** The text of HTML, every tag removed (content kept) */
export function stripHtml(html: string): string {
  // A regex like /<[^>]*>/ leaves unclosed tags ("<img src=x onerror=...") behind
  return String(DOMPurify.sanitize(html, { ALLOWED_TAGS: [], KEEP_CONTENT: true }))
}
