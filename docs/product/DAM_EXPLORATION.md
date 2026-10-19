# Digital Asset Management (DAM) — Exploration

> Status: Discussion / Pre-planning
> Related: [Business opportunities](./BUSINESS_OPPORTUNITIES.md)
>
> **Since written (2026-10-19):** thumbnails and size variants, duplicate detection by checksum, processing status, per-file metadata and presigned (expiring) download URLs now exist in the attachments module.

---

## What is a DAM?

A Digital Asset Management system is where teams store, organize, find, and distribute digital files — images, videos, documents, brand assets, design files. Think of it as a smart shared drive with metadata, permissions, and workflows built in.

Target users: marketing teams, design teams, media companies, agencies, enterprises managing brand assets.

---

## What Kuybi Already Has (The Head Start)

| DAM Requirement                  | Kuybi Feature                            | Status     |
| -------------------------------- | ---------------------------------------- | ---------- |
| File storage                     | Attachments module + S3                  | ✅ Ready   |
| Access control                   | RBAC + CASL                              | ✅ Ready   |
| Organize by type                 | Categories + Tags                        | ✅ Ready   |
| Custom metadata per asset type   | Dynamic Post Types                       | ✅ Ready   |
| Change history                   | Audit logging                            | ✅ Ready   |
| Background processing            | BullMQ (attachment-processing-queue)     | ✅ Ready   |
| Search                           | Basic PostgreSQL full-text               | ⚠️ Partial |
| Thumbnails / previews            | Not implemented                          | ❌ Missing |
| Asset versioning                 | Story versions exist, not on attachments | ❌ Missing |
| Bulk operations                  | Not implemented                          | ❌ Missing |
| Asset expiry / rights management | Not implemented                          | ❌ Missing |
| Collections / lightboxes         | Not implemented                          | ❌ Missing |
| Public share links               | Not implemented                          | ❌ Missing |

---

## What Needs to Be Built

### Must-Have (Core DAM)

**1. Asset Versioning**
Files get updated. You need to keep the history — who uploaded what version and when. The story versioning pattern already exists and can be adapted for attachments.

**2. Image & Video Processing**
When a file is uploaded, automatically generate:

- Thumbnails (small, medium, large)
- Web-optimized versions
- Preview for PDFs and documents
- Video poster frames

The `attachment-processing-queue` in BullMQ is already registered and waiting for this.

**3. Metadata & Custom Fields**
Different asset types need different metadata:

- Images → dimensions, color profile, photographer, license
- Videos → duration, resolution, codec
- Documents → author, page count, language
- Brand assets → usage rights, expiry date, campaign

Dynamic Post Types already support this pattern.

**4. Advanced Search & Filtering**
Search by filename, metadata, tags, categories, upload date, file type, dimensions, uploader. The current basic search won't cut it for a DAM — this is where Elasticsearch or PostgreSQL full-text with proper indexing becomes important.

**5. Collections / Lightboxes**
Users need to group assets temporarily for a project or share a curated set with a client. A lightweight "collection" entity that references multiple assets.

**6. Public / Expiring Share Links**
Generate a time-limited URL to share an asset externally without requiring login. Common for sharing with clients or external collaborators.

---

### Nice-to-Have (Competitive Edge)

**7. Rights & License Management**
Track usage rights, expiry dates, and licensing terms per asset. Alert when an asset's license is about to expire. Critical for stock photos, licensed music, etc.

**8. Duplicate Detection**
Hash-based detection to prevent uploading the same file twice. Saves storage and avoids confusion.

**9. AI Tagging (future)**
Auto-tag images using a vision API (AWS Rekognition, Google Vision). Reduces manual tagging effort significantly.

**10. Usage Analytics**
Which assets are downloaded most? Which are never used? Helps teams clean up and understand what content is valuable.

---

## Proposed Data Model Changes

```
Attachment (existing)
  + version: number
  + versionHistory: AttachmentVersion[]
  + metadata: JSON (dynamic, per asset type)
  + processingStatus: 'pending' | 'processing' | 'ready' | 'failed'
  + thumbnails: { small: string, medium: string, large: string }
  + hash: string (for duplicate detection)
  + expiresAt: Date (for rights management)
  + license: string

AttachmentVersion (new)
  - id
  - attachmentId
  - fileUrl
  - size
  - uploadedBy
  - uploadedAt
  - changeNote

Collection (new)
  - id
  - name
  - description
  - ownerId
  - assets: Attachment[]
  - isPublic: boolean
  - createdAt

ShareLink (new)
  - id
  - attachmentId (or collectionId)
  - token (unique, random)
  - expiresAt
  - downloadCount
  - maxDownloads (optional)
  - createdBy
```

---

## Architecture Fit

The BullMQ `attachment-processing-queue` becomes the engine for all async processing:

```
Upload → Save to S3 → Queue job → Worker processes:
  ├── Generate thumbnails (sharp)
  ├── Extract metadata (exiftool / ffprobe)
  ├── Compute hash (duplicate check)
  ├── Index to search
  └── Send upload notification
```

This is clean and already scaffolded. The worker process is separate, so heavy image/video processing doesn't block the API.

---

## Competitive Landscape

| Product       | Price  | Self-hosted? | Kuybi Advantage                         |
| ------------- | ------ | ------------ | --------------------------------------- |
| Cloudinary    | $$$    | No           | Self-hosted, no per-transformation fees |
| Bynder        | $$$$   | No           | Much cheaper, customizable              |
| Brandfolder   | $$$$   | No           | Open/self-hosted option                 |
| ResourceSpace | Free/$ | Yes          | Better auth, RBAC, audit trail          |
| Pimcore       | Free   | Yes          | Simpler, faster to deploy               |

Kuybi's angle: **self-hosted DAM with enterprise-grade auth and audit trail**, aimed at teams that can't send assets to a third-party SaaS for compliance or cost reasons.

---

## Open Questions

Before going further, these need answers:

1. **Who is the primary user?** Marketing teams? Developers? Both?
2. **What file types matter most?** Images only, or video + documents too?
3. **Self-hosted only, or also a cloud offering?**
4. **Is rights/license management a priority?** (Adds significant complexity)
5. **What's the expected asset volume?** Thousands or millions of files?
6. **Do you need a frontend/UI, or is this API-only?**

---

## Rough Build Estimate

| Phase     | What                                             | Effort         |
| --------- | ------------------------------------------------ | -------------- |
| Phase 1   | Asset versioning + processing queue + thumbnails | 2-3 weeks      |
| Phase 2   | Metadata/custom fields + advanced search         | 2-3 weeks      |
| Phase 3   | Collections + share links                        | 1-2 weeks      |
| Phase 4   | Rights management + analytics                    | 2-3 weeks      |
| **Total** |                                                  | **7-11 weeks** |

Phase 1 alone gives you a functional DAM. Phases 2-4 make it competitive.
