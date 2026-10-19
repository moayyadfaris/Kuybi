# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: **Security → Report a
vulnerability** on this repository. Do not open a public issue.

Include what is affected, how to reproduce it, and the impact you expect. You will get an
acknowledgement within a few days; fixes are released as soon as they are verified, and
the report is credited unless you prefer otherwise.

## Supported versions

Only the latest `main` is supported. There are no maintained release branches.

## How the service protects data

- **Passwords**: bcrypt through one `PasswordHasher` (`src/core/security`), cost
  `BCRYPT_ROUNDS` (default 12, at least 10 when deployed). Weaker stored hashes are
  upgraded at the next login. New passwords are limited to 72 bytes, bcrypt's input limit.
  Unknown emails take the same time as wrong passwords; repeated failures lock the account.
- **Sessions**: short-lived JWT access tokens, revocable server-side sessions, rotating
  refresh tokens stored as SHA-256 hashes.
- **Authorization**: CASL rules from the `permissions` table, checked per route and per
  record; list queries apply the same rules ([ADR 0010](docs/adr/0010-story-read-visibility.md)).
- **Configuration fails closed**: outside development/test the app refuses to boot with
  missing or placeholder secrets, an open CORS policy, or a weak bcrypt cost
  ([ADR 0007](docs/adr/0007-fail-closed-configuration.md)).
- **Uploads**: content type checked from the bytes, images re-encoded without EXIF/GPS
  before they are stored or published ([ADR 0009](docs/adr/0009-attachment-visibility-and-uploads.md)).
- **Dependencies**: `npm audit` runs in CI; upgrades use releases at least two weeks old.

## Deploying

Set `JWT_SECRET`, `DB_PASSWORD`, `CORS_ORIGIN` and (behind a proxy) `TRUST_PROXY`.
Set `SEED_ADMIN_PASSWORD` before running `npm run db:seed:all`, and run
`npm run db:seed:acl:prod` after upgrades that change permissions.
