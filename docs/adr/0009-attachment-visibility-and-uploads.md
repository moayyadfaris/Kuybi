# 0009. Attachments: public by default, uploader-controlled, ACL follows the flag

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

Attachments are stored in S3: an original plus, for images, a thumbnail, size variants
and a placeholder. Two upload paths exist: multipart through the API, and direct to S3
with a presigned POST that the API then verifies (size, content type from the first
bytes) before the file can be used. The paths had different defaults (public versus
private), and changing visibility later updated only the database flag, leaving S3
serving "private" files publicly and answering 403 for "public" ones.

## Decision

- Uploads are **public by default**; the uploader chooses per file (`isPublic`), on both
  paths, and can change it later. Forced-public categories (profile images) reject a
  private request with 400.
- Visibility changes go through `AttachmentVisibilityService`: the ACL of every stored
  object changes first, then the flag. If S3 fails part way the flag is unchanged and a
  retry completes the change.
- Uploading the same content again returns the existing attachment (deduplicated by
  checksum per user) with the visibility the new request asked for.
- Direct uploads are not usable (profile, story, links) until verified; images stay
  private until processing has replaced them with an EXIF-stripped copy, then take their
  requested visibility from the current row.

## Consequences

- Public by default suits the product's media-first use; users must opt into private.
- Each visibility change costs one S3 ACL call per stored object.
- Private files are reachable only through short-lived presigned URLs.

## Enforcement

- Tests: `direct-upload.integration.spec.ts` (default public, private ↔ public changes the
  stored object, profile images stay public, re-upload takes the requested visibility)
  and `attachment-visibility.service.spec.ts`.
