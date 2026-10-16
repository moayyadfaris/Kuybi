/**
 * Slug generation shared by every module that derives URL slugs from names or titles.
 *
 * Produces lowercase ASCII kebab-case (`[a-z0-9]+(-[a-z0-9]+)*`):
 * - Arabic (and Persian) letters are transliterated to Latin ("مقالات" -> "mqalat")
 * - Accented Latin letters lose their diacritics ("Café" -> "cafe")
 * - Anything else becomes a separator
 * When nothing usable remains (e.g. "!!!"), the fallback is returned instead of an empty slug.
 */

export const DEFAULT_SLUG_MAX_LENGTH = 120

const ARABIC_TO_LATIN: Record<string, string> = {
  // Hamza and alef forms
  ء: '',
  آ: 'a',
  أ: 'a',
  إ: 'e',
  ا: 'a',
  ؤ: 'o',
  ئ: 'e',
  ى: 'a',
  ة: 'a',
  // Letters
  ب: 'b',
  ت: 't',
  ث: 'th',
  ج: 'j',
  ح: 'h',
  خ: 'kh',
  د: 'd',
  ذ: 'th',
  ر: 'r',
  ز: 'z',
  س: 's',
  ش: 'sh',
  ص: 's',
  ض: 'd',
  ط: 't',
  ظ: 'z',
  ع: 'a',
  غ: 'gh',
  ف: 'f',
  ق: 'q',
  ك: 'k',
  ل: 'l',
  م: 'm',
  ن: 'n',
  ه: 'h',
  و: 'w',
  ي: 'y',
  // Persian letters
  پ: 'p',
  چ: 'ch',
  ژ: 'zh',
  گ: 'g',
  ک: 'k',
  ی: 'y',
  // Tatweel (kashida) is decorative
  ـ: ''
}

// Arabic harakat, tanween, shadda, sukun and superscript alef
const ARABIC_DIACRITICS_REGEX = /[ً-ٰٟ]/g
const ARABIC_INDIC_DIGITS_REGEX = /[٠-٩]/g
const PERSIAN_DIGITS_REGEX = /[۰-۹]/g
const COMBINING_MARKS_REGEX = /\p{M}/gu
const NON_SLUG_CHARS_REGEX = /[^a-z0-9]+/g
const EDGE_HYPHENS_REGEX = /^-+|-+$/g

export interface SlugifyOptions {
  /** Maximum slug length (default 120). Truncation never leaves a trailing hyphen. */
  maxLength?: number
  /** Returned when the input contains nothing slug-worthy (default "item"). */
  fallback?: string
}

export function slugify(input: string, options: SlugifyOptions = {}): string {
  const maxLength = options.maxLength ?? DEFAULT_SLUG_MAX_LENGTH
  const fallback = options.fallback ?? 'item'

  const transliterated = (input ?? '')
    .replace(ARABIC_DIACRITICS_REGEX, '')
    .replace(ARABIC_INDIC_DIGITS_REGEX, d => String(d.charCodeAt(0) - 0x0660))
    .replace(PERSIAN_DIGITS_REGEX, d => String(d.charCodeAt(0) - 0x06f0))
    .replace(/./gu, char => ARABIC_TO_LATIN[char] ?? char)

  const slug = transliterated
    .normalize('NFKD')
    .replace(COMBINING_MARKS_REGEX, '')
    .toLowerCase()
    .replace(NON_SLUG_CHARS_REGEX, '-')
    .replace(EDGE_HYPHENS_REGEX, '')
    .slice(0, maxLength)
    .replace(EDGE_HYPHENS_REGEX, '')

  return slug || fallback
}

/**
 * Returns `base` if unused, otherwise the first free `base-2`, `base-3`, ...
 * The suffix is kept within `maxLength` by trimming the base.
 */
export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
  maxLength: number = DEFAULT_SLUG_MAX_LENGTH
): Promise<string> {
  if (!(await exists(base))) {
    return base
  }

  for (let n = 2; n < 1000; n++) {
    const suffix = `-${n}`
    const candidate =
      base.slice(0, maxLength - suffix.length).replace(EDGE_HYPHENS_REGEX, '') + suffix
    if (!(await exists(candidate))) {
      return candidate
    }
  }

  throw new Error(`Could not find a free slug for '${base}'`)
}
