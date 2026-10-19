# 0010. Stories: readers see published stories and their own; lists follow the permissions

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

Every role with story read access (moderator, admin, user, guest) had an unconditional
`read Story` rule, and read routes checked only the route-level permission. Any signed-in
user could read every story in every status (drafts, stories in review, rejected,
suspended, archived) by id, in every list (`/stories`, `/status/:status`, `/user/:id`,
`/type/:type`, children), through its tags, categories, attachments and versions, and in
the stats. `includeDeleted` also exposed soft-deleted stories to anyone.

## Decision

- **Published stories** are readable by every role with story read access, guest included.
- **Every other status, ARCHIVED included**, is readable by the author and by roles with an
  unconditional read rule (moderator, admin, super-admin).
- The ACL seed expresses this: `user` gets `read Story {status: PUBLISHED}` and
  `read Story {userId: ${userId}}`, `guest` gets the first; the old unconditional grant is
  revoked from both on the next seed run.
- **List queries follow the same rules** as per-record checks: `recordScope()` (acl) turns
  the user's CASL rules into SQL conditions, so lists and stats come from the permissions
  table, not from a second hard-coded rule. It fails closed: conditions it cannot express
  exactly (operators, unknown columns, `cannot` rules) grant nothing. Cached lists are
  keyed by scope.
- A story the user may not read **answers 404**, by id and through its links and versions,
  so a hidden draft's existence is not confirmed. Writes on a visible story the user may
  not change still answer 403.
- Soft-deleted stories are listed (and counted) only for unrestricted readers. The public
  web API serves published, live stories only.

## Consequences

- Authors must use their own lists to find drafts; others never see them.
- Stats differ per reader (counts over what they can see).
- A custom role's read conditions apply to lists automatically, as long as they are plain
  `column: value` pairs on the story columns in `STORY_SCOPE_COLUMNS`.
- Existing deployments need `npm run db:seed:acl:prod` to replace the old grants.

## Enforcement

- Tests: `story-visibility.integration.spec.ts` (each role, every read route, stats, cache
  separation, public web API), `record-scope.spec.ts` (fail-closed translation),
  `authorization-audit.integration.spec.ts` (404 for hidden, 403 for visible).
