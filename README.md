# Susanoo Nest Scaffold

This NestJS project bootstraps a modern service template modeled after the existing Susanoo API. It ships with:

- Global configuration & validation (`@nestjs/config`)
- PostgreSQL integration via TypeORM
- Global error filter and response interceptor for consistent envelopes
- Swagger UI served at `/api/docs` with JSON spec at `/api/swagger.json`
- Countries feature module mirroring the current enterprise endpoints

## Getting Started

```bash
cd nest-app
npm install
cp .env.example .env
npm run migration:run
npm run db:seed:countries
npm run db:seed:users
npm run start:dev
```

The API will be available at `http://localhost:4000/api`, with documentation at `http://localhost:4000/api/docs`.

## Countries Endpoint

`GET /api/countries`

Query parameters:

| Parameter | Description |
|-----------|-------------|
| `page` | Zero-based page index (default `0`) |
| `limit` | Page size up to 500 (default `50`) |
| `search` | Fuzzy search across `name`, `nicename`, `iso`, `iso3` |
| `continent` | Exact match on continent (case insensitive) |
| `isActive` | Boolean filter (`true`, `false`, `1`, `0`) |
| `fields` | Comma separated projection list |
| `orderBy` | Sort field (`name`, `continent`, `currencyCode`, `phonecode`) |
| `orderDirection` | `asc` or `desc` |

The response envelope matches the legacy API: `{ success, data }`, where `data` includes `results`, `total`, and `pagination` metadata.

## Auth Endpoint

`POST /api/auth/login`

Body:

```json
{
  "email": "admin@susano.dev",
  "password": "Admin@123",
  "deviceType": "Web"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "accessToken": "<JWT>",
    "refreshToken": "<refresh-token>",
    "user": {
      "id": "...",
      "name": "Susanoo Admin",
      "email": "admin@susano.dev",
      "role": "ROLE_SUPERADMIN"
    }
  }
}
```

Use the bearer `accessToken` for protected endpoints. Persist the `refreshToken` securely to obtain new access tokens without prompting for credentials.

`POST /api/auth/refresh`

Body:

```json
{
  "refreshToken": "<refresh-token>"
}
```

Response mirrors the login payload but only contains the token pair:

```json
{
  "success": true,
  "data": {
    "accessToken": "<new-JWT>",
    "refreshToken": "<rotated-refresh-token>"
  }
}
```

`POST /api/auth/logout`

- Requires bearer token in `Authorization` header
- Body: `{ "refreshToken": "<token>", "logoutAll": false, "reason": "user_initiated" }`
- Invalidates the provided refresh token (and optionally all sessions)

`GET /api/auth/sessions`

- Requires bearer token
- Query params support pagination (`page`, `limit`), status filters (`filterByStatus`), device filters (`filterByDevice`), and anonymization flags
- Returns session list with optional risk assessment metadata

## Database Tasks

- `npm run migration:run` — applies TypeORM migrations using the shared data source.
- `npm run migration:revert` — rolls back the last migration.
- `npm run db:seed:countries` — upserts the curated set of enhanced countries.
- `npm run db:seed:users` — provisions the initial admin account (`admin@susano.dev / Admin@123`).

## Attachments Endpoint

`POST /api/attachments`

- Requires `Authorization: Bearer <accessToken>` header
- Multipart form-data with `file` field; optional fields: `category`, `description`, `tags`, `generateThumbnails`, `isPublic`, `allowDuplicates`
- Returns an attachment payload containing download/preview URLs and metadata

> Notes:
> - Uploaded files are streamed to the S3 bucket defined in your `.env` (`S3_BUCKET`, `S3_REGION`, `S3_BASE_URL`).
> - Ensure the process has AWS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional session tokens) with write access to the bucket.

## Next Steps

- Add your remaining domain modules following the Countries blueprint
- Register additional entities in `DatabaseModule`
- Extend the common layer with guards, policies, and metrics as needed

Happy building!
