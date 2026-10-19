# 0002. Base modules never depend on feature modules

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

Layers, from the bottom: `shared` (framework-free utilities), `core` and `infrastructure`
(cross-cutting services: cache, outbox, queues, events, email, S3...), then feature
modules. `acl` is a feature-level folder but plays a base role: every other module uses
its guards and ability factory.

`acl` imported the users module's `User` and the stories module's `Story` to type its
ability factory and guards. A base module that knows about features cannot be reused or
reasoned about on its own, and invites cycles as features grow.

## Decision

- `shared` depends on nothing in the app; `core` and `infrastructure` depend only on
  `shared` (and each other), never on feature modules or `src/database`.
- `acl` code depends on no feature module. It describes what it needs:
  - `AclPrincipal` (`acl/types/acl-principal.ts`) is the authenticated principal it
    authorizes; `User` declares `implements AclPrincipal`, so the compiler keeps them in
    step.
  - CASL subjects are the `Subject` strings; per-record checks tag a copy of the record
    with `asSubject(Subject.X, record)`. Records served from the cache are plain JSON,
    which CASL would otherwise see as type `Object` and deny.
- When a base module needs a feature's behaviour, invert the dependency (an interface the
  feature implements, or a domain event, [0006](0006-domain-events-in-process.md)).

## Consequences

- `acl` can be tested and changed without the users or stories modules.
- Entity files are exempt: `UserRole` keeps its foreign key to `users`
  ([0001](0001-modular-monolith-shared-schema.md)).

## Enforcement

- ESLint `import-x/no-restricted-paths` zones for `shared`, `core` and `infrastructure`.
- ESLint `no-restricted-imports` on `src/modules/acl/**` (entities excepted): no
  `@modules/*` other than acl itself.
