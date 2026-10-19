# 0003. Data access only through the owning repository; one cache contract

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

Repositories extend `BaseRepository`, which caches reads in Redis. In October 2026 an
audit found two ways to reach the database: eleven services, jobs and guards injected raw
TypeORM repositories (or a `DataSource`) next to the caching repositories. Writes through
the raw path never invalidated the cache. In addition, most cached reads were stored
without the tag that writes invalidate, so even writes through repositories left them
stale for up to an hour. Examples that reached users: role changes not visible in role
listings, a just-registered email reported as available, and story relationship edits
served stale.

## Decision

- **Only repositories touch TypeORM.** Services, jobs, guards and controllers use the
  owning module's repository. Transactions run through `<repository>.transaction(work)`;
  no service injects a `DataSource` or `EntityManager`.
- Every entity's repository lives in the module that owns the entity.
- **Cache contract** (`BaseRepository`):
  - Every cached entry carries the entity tag plus either the row tag
    (`<entity>:<id>`, when the value is one row) or the list tag (`<entity>:list`:
    lists, counts, booleans). Misses are not cached.
  - A write invalidates the row it touched and the list tag; other rows stay cached.
  - `transaction(work, { touched })` invalidates after the commit (a rollback leaves the
    cache alone): the touched rows when given, otherwise every entry of the entity.
  - Subclasses cache only through `cached()` / `cacheSet()`.
  - A cached row that embeds other entities (a user with its roles) is invalidated
    explicitly by whoever changes those (`invalidateCacheByEntityId`).
- Cache hits are plain JSON: code that needs entity methods or real `Date`s reads with
  `{ bypassCache: true }` or tolerates strings (see `version-snapshot.ts`).
  Security-relevant decisions (authentication, lock state, role priority, attachment
  visibility in the image processor) always read fresh.

## Consequences

- One place decides cache invalidation; a write cannot bypass it.
- Writing a repository method costs slightly more than calling TypeORM inline.
- Entity-wide invalidation in `transaction()` without `touched` is coarse; hot paths pass
  `touched`.

## Enforcement

- ESLint (feature modules outside `repositories/`, `database/`, `seeders/`): no
  `@InjectRepository`, `@InjectDataSource`, `@InjectEntityManager`, or `DataSource` /
  `EntityManager` constructor parameters.
- ESLint (repositories): no `this.cacheService.wrap/set`; use `cached()` / `cacheSet()`.
- `scripts/check-module-graph.js`: `forFeature` only with the module's own entities.
- Tests: `base-repository-cache.integration.spec.ts` (real Postgres and Redis) and the
  role-change / availability coherence tests in `user-profile.integration.spec.ts`.
