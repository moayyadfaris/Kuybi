# Cache

Redis-backed cache (`CacheService`), used almost only through repositories. The rules
are in [ADR 0003](../../../docs/adr/0003-data-access-and-cache-contract.md); this page is
the practical summary.

## Configuration

```bash
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=          # optional
REDIS_DB=0
REDIS_TTL=3600           # default TTL in seconds
CACHE_NAMESPACE=kuybi    # prefix of every key
```

Every key is under the app's namespace: entries at `kuybi:<entity>:<parts>` (e.g.
`kuybi:story:id:42`), tag sets at `kuybi:_tags:<tag>`. The Redis server may be shared with
other projects: clean up through tag invalidation (or, for a full reset, delete
`kuybi:*` with SCAN + UNLINK), never `FLUSHALL` / `FLUSHDB`. Tests use their own
namespace in database 15, and `TestRedis.clearCache` deletes only that namespace.

Tag sets never expire before the entries they track (their TTL only grows), tagging and
invalidation are atomic Lua scripts, and tag calls connect the Redis client themselves (a
worker job may make the first cache call of its process).

## Caching in a repository

Repositories extend `BaseRepository` and cache through `cached()`:

```typescript
findBySlug(slug: string): Promise<Category | null> {
  return this.cached(this.buildCacheKey('slug', slug), () =>
    this.repository.findOne({ where: { slug } })
  )
}
```

Every entry is tagged, and writes through the repository invalidate the tags:

| Cached value                                                            | Tags                 | Dropped by              |
| ----------------------------------------------------------------------- | -------------------- | ----------------------- |
| One row by a unique key (id, slug, email)                               | row `<entity>:<id>`  | a write to that row     |
| A list, count, boolean or stats                                         | list `<entity>:list` | any write to the entity |
| One row picked by a query (latest, newest match): `{ selection: true }` | row and list         | either                  |

All entries also carry the entity tag (`invalidateCacheByTag()` drops them all).

- Writes through `create`/`update`/`save`/`delete`/`softDelete` invalidate for you.
- Raw or bulk writes (query builder updates, inserts into join tables) call
  `invalidateCacheByEntityId(id)`, `invalidateListCaches()` or `invalidateCacheByTag()`.
- `transaction(work, { touched })` invalidates after the commit.
- Lint keeps repositories off `cacheService.set/del`: keys written outside the tags are
  never invalidated. There are no pattern deletes.

Outside repositories, `CacheService` serves non-entity data with its own keys and TTLs
(e.g. the token blacklist).

## Troubleshooting

- `GET /health/ready` checks Redis connectivity; cache errors are logged and reads fall
  through to the database.
- Inspect keys with `redis-cli --scan --pattern 'kuybi:story:*'` (SCAN, not `KEYS`).
