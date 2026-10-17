/**
 * Read-only scan for uploads stored with a content type that browsers can execute.
 *
 * Before content verification was added, uploads were stored with the client-declared
 * MIME type and SVG/XML were allowed. This lists existing attachments that may still be
 * served as active content, so they can be reviewed and removed or re-uploaded.
 *
 * Usage: npm run security:scan-uploads
 * It only runs a SELECT; nothing is modified.
 */
import { AppDataSource } from '../data-source'

const ACTIVE_MIME_TYPES = [
  'image/svg+xml',
  'application/xml',
  'text/xml',
  'text/html',
  'application/xhtml+xml'
]
const ACTIVE_EXTENSION_PATTERN = '\\.(svg|svgz|xml|html?|xhtml|xht)$'

interface RiskyAttachment {
  id: string
  userId: string
  path: string
  mimeType: string
  originalName: string
  isPublic: boolean
  createdAt: Date
}

async function scanRiskyUploads() {
  try {
    await AppDataSource.initialize()

    const rows: RiskyAttachment[] = await AppDataSource.query(
      `SELECT id, "userId", path, "mimeType", "originalName", "isPublic", "createdAt"
         FROM attachments
        WHERE "deletedAt" IS NULL
          AND (lower("mimeType") = ANY($1) OR "originalName" ~* $2)
        ORDER BY "isPublic" DESC, "createdAt" DESC`,
      [ACTIVE_MIME_TYPES, ACTIVE_EXTENSION_PATTERN]
    )

    if (rows.length === 0) {
      console.log('No attachments with active content types or extensions found.')
      return
    }

    const severity = (row: RiskyAttachment) => {
      const active = ACTIVE_MIME_TYPES.includes(row.mimeType.toLowerCase())
      if (active && row.isPublic) return 'HIGH  ' // executable and publicly readable
      if (active) return 'MEDIUM' // executable, private (served via signed URLs)
      return 'LOW   ' // active extension, stored with a non-executable type
    }

    console.log(`Found ${rows.length} attachment(s) to review:\n`)
    for (const row of rows) {
      console.log(
        `${severity(row)}  ${row.id}  ${row.mimeType.padEnd(22)} public=${row.isPublic}  ` +
          `${row.originalName}  ->  ${row.path}`
      )
    }
    console.log('\nHIGH: executable content type and public-read. Remove or re-upload these first.')
    process.exitCode = 2
  } catch (error) {
    console.error('Failed to scan attachments', error)
    process.exitCode = 1
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy()
    }
  }
}

scanRiskyUploads()
