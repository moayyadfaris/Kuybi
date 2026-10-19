# 0001. Modular monolith on one shared PostgreSQL schema

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

Kuybi is one NestJS codebase with eleven feature modules (`acl`, `attachments`, `audit`,
`auth`, `categories`, `countries`, `post-types`, `stories`, `tags`, `users`, `web`),
deployed as two processes from the same image: the API (`main.ts`) and the worker
(`worker.ts`). All modules share one PostgreSQL database and one Redis.

The data model is genuinely shared: stories reference users, categories, tags and
attachments; role assignments reference users; categories and stories are linked through
a junction table with real foreign keys. Splitting the schema per module would mean
replacing those foreign keys with eventual consistency, which no current requirement
justifies. Other services are being built alongside Kuybi, so a later extraction must stay
possible.

## Decision

- Kuybi is a **modular monolith**: module boundaries are enforced in code, the database
  is shared.
- **Code** crosses a module boundary only through the other module's public API: its
  `index.ts` (`@modules/<name>`) or its entities barrel (`@modules/<name>/entities`).
- **Entities** may reference other modules' entities (TypeORM relations). The schema is
  shared, and the foreign keys stay declared on the entities so migrations keep them.
- A module registers only **its own** entities with `TypeOrmModule.forFeature`, so it can
  reach another module's data only through that module's repository or service
  ([0003](0003-data-access-and-cache-contract.md)).
- Service-level dependencies between modules must not form cycles.

## Consequences

- One deployment, one transaction across modules when needed (e.g. a story and its
  category links), real foreign keys and joins.
- Modules are not independently deployable. Extracting one later means: replacing its
  incoming entity relations with IDs, its public API with an HTTP/event contract, and its
  tables with its own database. The public-API rule keeps that work local to the module.
- Entity-level references are not checked for cycles (`UserRole → User`,
  `Category ↔ Story`); they reflect the schema, not code dependencies.

## Enforcement

- ESLint `import-x/no-restricted-paths`: imports into a module from another module's
  internals fail.
- `scripts/check-module-graph.js` (CI): fails on service-level dependency cycles and on a
  module registering another module's entity in `forFeature`.
