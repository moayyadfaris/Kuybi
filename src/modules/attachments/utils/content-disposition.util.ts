/**
 * attachment; filename="..." with the uploaded name made header-safe: an ASCII fallback
 * (quotes, backslashes and control characters replaced) plus the RFC 5987 UTF-8 form.
 * Interpolating the raw name broke the header on quotes and threw on CR/LF.
 */
export function contentDisposition(originalName: string): string {
  const fallback = originalName.replace(/[^\x20-\x7e]|["\\]/g, '_') || 'download'
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(originalName)}`
}
