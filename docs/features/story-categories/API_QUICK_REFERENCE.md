# Story-Category API Quick Reference

## Authentication

All modification endpoints require JWT authentication:

```bash
Authorization: Bearer YOUR_JWT_TOKEN
```

Get your token by logging in:
```bash
curl -X POST http://localhost:4040/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password"}'
```

---

## Endpoints

### 1. Create Story with Categories

**Request:**
```bash
POST /api/v1/stories
Content-Type: application/json
Authorization: Bearer {token}

{
  "title": "Breaking News Story",
  "details": "Story content here...",
  "type": "STORY",
  "status": "DRAFT",
  "priority": "HIGH",
  "categoryIds": [
    "550e8400-e29b-41d4-a716-446655440000",
    "550e8400-e29b-41d4-a716-446655440001"
  ]
}
```

**Response:** `201 Created`
```json
{
  "id": 123,
  "title": "Breaking News Story",
  "categories": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Politics",
      "slug": "politics"
    }
  ]
}
```

---

### 2. Update Story Categories

**Request:**
```bash
PATCH /api/v1/stories/123
Content-Type: application/json
Authorization: Bearer {token}

{
  "categoryIds": [
    "550e8400-e29b-41d4-a716-446655440002"
  ]
}
```

**Response:** `200 OK`

---

### 3. Attach Categories to Story

**Request:**
```bash
POST /api/v1/stories/123/categories
Content-Type: application/json
Authorization: Bearer {token}

{
  "categoryIds": [
    "550e8400-e29b-41d4-a716-446655440003",
    "550e8400-e29b-41d4-a716-446655440004"
  ]
}
```

**Response:** `200 OK`
```json
{
  "id": 123,
  "title": "Story Title",
  "categories": [
    { "id": "...", "name": "Technology" },
    { "id": "...", "name": "Science" }
  ]
}
```

**Features:**
- Adds to existing categories (doesn't replace)
- Automatically prevents duplicates
- Returns updated story with all categories

---

### 4. Detach Categories from Story

**Request:**
```bash
DELETE /api/v1/stories/123/categories
Content-Type: application/json
Authorization: Bearer {token}

{
  "categoryIds": [
    "550e8400-e29b-41d4-a716-446655440003"
  ]
}
```

**Response:** `200 OK`
```json
{
  "id": 123,
  "title": "Story Title",
  "categories": [
    { "id": "...", "name": "Science" }
  ]
}
```

---

### 5. Get Story Categories

**Request:**
```bash
GET /api/v1/stories/123/categories
```

**Response:** `200 OK`
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Politics",
    "slug": "politics",
    "description": "Political news and analysis",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00Z"
  }
]
```

**Note:** No authentication required (public endpoint)

---

## cURL Examples

### Create Story with Categories
```bash
curl -X POST http://localhost:4040/api/v1/stories \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Tech Innovation Story",
    "details": "Detailed content about technology...",
    "type": "STORY",
    "status": "DRAFT",
    "priority": "NORMAL",
    "categoryIds": [
      "550e8400-e29b-41d4-a716-446655440000"
    ]
  }'
```

### Attach Categories
```bash
curl -X POST http://localhost:4040/api/v1/stories/123/categories \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryIds": [
      "550e8400-e29b-41d4-a716-446655440001",
      "550e8400-e29b-41d4-a716-446655440002"
    ]
  }'
```

### Detach Categories
```bash
curl -X DELETE http://localhost:4040/api/v1/stories/123/categories \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryIds": [
      "550e8400-e29b-41d4-a716-446655440001"
    ]
  }'
```

### Get Story Categories
```bash
curl -X GET http://localhost:4040/api/v1/stories/123/categories
```

---

## Validation Rules

### categoryIds Field

**Type:** `string[]` (array of UUID v4)

**Constraints:**
- Each UUID must be valid v4 format
- Minimum: 1 item (for attach/detach operations)
- Maximum: 20 items
- All categories must exist in database
- All categories must be active (not soft-deleted)

**Examples:**

✅ **Valid:**
```json
{
  "categoryIds": [
    "550e8400-e29b-41d4-a716-446655440000",
    "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
  ]
}
```

❌ **Invalid:**
```json
{
  "categoryIds": [
    "invalid-uuid",  // Not UUID v4 format
    "550e8400-e29b-41d4-a716-446655440000"
  ]
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": "One or more categories not found or inactive",
  "error": "Bad Request"
}
```

**Causes:**
- Invalid UUID format
- Category doesn't exist
- Category is inactive/deleted
- Exceeds 20 categories limit

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

**Causes:**
- Missing JWT token
- Invalid JWT token
- Expired JWT token

### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "You do not have permission to modify this story",
  "error": "Forbidden"
}
```

**Causes:**
- Not the story owner
- Insufficient permissions
- ACL check failed

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Story with ID 123 not found",
  "error": "Not Found"
}
```

**Causes:**
- Story doesn't exist
- Story is soft-deleted

---

## ACL Permissions

### Required Permissions

| Endpoint | Permission |
|----------|------------|
| POST /stories | `Action.Create` on `Subject.Story` |
| PATCH /stories/:id | `Action.Update` on `Subject.Story` |
| POST /stories/:id/categories | `Action.Update` on `Subject.Story` |
| DELETE /stories/:id/categories | `Action.Update` on `Subject.Story` |
| GET /stories/:id/categories | None (public) |

### Role Capabilities

| Role | Can Create | Can Update | Can Attach | Can Detach | Can View |
|------|-----------|------------|------------|------------|----------|
| super-admin | ✅ | ✅ All | ✅ All | ✅ All | ✅ |
| admin | ✅ | ✅ All | ✅ All | ✅ All | ✅ |
| moderator | ✅ | ✅ All | ✅ All | ✅ All | ✅ |
| user | ✅ | ✅ Own | ✅ Own | ✅ Own | ✅ |
| guest | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## Testing Workflow

### 1. Get Authentication Token
```bash
TOKEN=$(curl -s -X POST http://localhost:4040/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "password"}' \
  | jq -r '.access_token')
```

### 2. Create a Story with Categories
```bash
STORY_ID=$(curl -s -X POST http://localhost:4040/api/v1/stories \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Story",
    "type": "STORY",
    "status": "DRAFT",
    "priority": "NORMAL",
    "categoryIds": ["category-uuid-here"]
  }' | jq -r '.id')

echo "Created story ID: $STORY_ID"
```

### 3. Get Story Categories
```bash
curl -X GET http://localhost:4040/api/v1/stories/$STORY_ID/categories | jq
```

### 4. Attach More Categories
```bash
curl -X POST http://localhost:4040/api/v1/stories/$STORY_ID/categories \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryIds": ["another-category-uuid"]
  }' | jq
```

### 5. Detach Categories
```bash
curl -X DELETE http://localhost:4040/api/v1/stories/$STORY_ID/categories \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryIds": ["category-to-remove-uuid"]
  }' | jq
```

---

## Postman Collection

### Import this JSON into Postman:

```json
{
  "info": {
    "name": "Story Categories API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:4040/api/v1"
    },
    {
      "key": "token",
      "value": "YOUR_JWT_TOKEN"
    }
  ],
  "item": [
    {
      "name": "Create Story with Categories",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"title\": \"Test Story\",\n  \"type\": \"STORY\",\n  \"status\": \"DRAFT\",\n  \"priority\": \"NORMAL\",\n  \"categoryIds\": [\"category-uuid\"]\n}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        },
        "url": "{{baseUrl}}/stories"
      }
    },
    {
      "name": "Attach Categories",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"categoryIds\": [\"category-uuid\"]\n}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        },
        "url": "{{baseUrl}}/stories/123/categories"
      }
    },
    {
      "name": "Detach Categories",
      "request": {
        "method": "DELETE",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"categoryIds\": [\"category-uuid\"]\n}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        },
        "url": "{{baseUrl}}/stories/123/categories"
      }
    },
    {
      "name": "Get Story Categories",
      "request": {
        "method": "GET",
        "url": "{{baseUrl}}/stories/123/categories"
      }
    }
  ]
}
```

---

## Common Use Cases

### 1. Multi-Category Story
```bash
# Create a story in multiple categories
curl -X POST http://localhost:4040/api/v1/stories \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Breaking News",
    "type": "STORY",
    "status": "PUBLISHED",
    "priority": "URGENT",
    "categoryIds": [
      "politics-uuid",
      "world-news-uuid",
      "breaking-news-uuid"
    ]
  }'
```

### 2. Recategorize Story
```bash
# Update story to different categories
curl -X PATCH http://localhost:4040/api/v1/stories/123 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryIds": [
      "technology-uuid",
      "innovation-uuid"
    ]
  }'
```

### 3. Add Category to Multiple Stories
```bash
# Attach same category to multiple stories
for id in 123 124 125; do
  curl -X POST http://localhost:4040/api/v1/stories/$id/categories \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"categoryIds": ["featured-uuid"]}'
done
```

---

## Performance Tips

1. **Batch Operations:** When creating stories, include categories in creation request
2. **Cache Aware:** Cache is invalidated after attach/detach, consider batching updates
3. **Max 20 Categories:** Enforced limit for performance reasons
4. **Index Usage:** Queries use indexed junction table for fast lookups

---

## Support & Resources

- [Full API Documentation](./README.md)
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md)
- [Enterprise Database Guide](../../../docs/ENTERPRISE_DATABASE.md)
- [ACL System Documentation](../acl/README.md)

---

**Last Updated:** October 25, 2024  
**API Version:** v1  
**Status:** Production Ready ✅
