# Integration Testing Guide

## Overview

This directory contains integration tests for the Susanoo NestJS application. Integration tests verify that different parts of the application work together correctly with real dependencies (database, Redis, etc.).

## Setup

### Prerequisites

1. **Test Database**: Create a separate PostgreSQL database for testing
```bash
createdb susanoo_test
```

2. **Test Redis**: Use a separate Redis database (DB 15 by default)

3. **Environment Variables**: Copy `.env.test` and configure for your environment
```bash
cp .env.test .env.test.local
# Edit .env.test.local with your test database credentials
```

### Dependencies

Install test dependencies (already in package.json):
```bash
npm install --save-dev @nestjs/testing @types/supertest supertest
```

Optional for mocking S3:
```bash
# Install MinIO for local S3 testing
docker run -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address ":9001"
```

## Running Tests

### Run all integration tests
```bash
npm run test:integration
```

### Run specific test file
```bash
npm run test:integration -- auth.integration.spec
```

### Run with coverage
```bash
npm run test:integration:cov
```

### Run in watch mode
```bash
npm run test:integration:watch
```

### Debug integration tests
```bash
npm run test:debug
```

## Test Structure

```
test/
├── setup.ts                    # Global test setup
├── teardown.ts                 # Global test teardown
├── test.config.ts              # Test configuration
├── helpers/                    # Test utilities
│   ├── test-database.ts       # Database helpers
│   ├── test-redis.ts          # Redis helpers
│   └── test-module.ts         # Module creation helpers
├── factories/                  # Test data factories
│   ├── user.factory.ts
│   └── story.factory.ts
└── integration/                # Integration tests
    ├── auth/
    │   └── auth.integration.spec.ts
    ├── stories/
    │   └── stories.integration.spec.ts
    ├── users/
    ├── attachments/
    └── categories/
```

## Writing Integration Tests

### Basic Test Template

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TestDatabase } from '../../helpers/test-database';
import { TestRedis } from '../../helpers/test-redis';

describe('Module Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await TestDatabase.createConnection([/* entities */]);
    await TestRedis.createConnection();
    
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [/* your modules */],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    await TestDatabase.clearDatabase();
    await TestRedis.clearCache();
  });

  afterAll(async () => {
    await app.close();
    await TestDatabase.closeConnection();
    await TestRedis.closeConnection();
  });

  it('should test something', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/endpoint')
      .expect(200);
    
    expect(response.body).toBeDefined();
  });
});
```

### Using Test Factories

```typescript
import { UserFactory } from '../../factories/user.factory';
import { StoryFactory } from '../../factories/story.factory';

// Create test data
const user = await UserFactory.createWithHashedPassword();
const story = StoryFactory.create({ userId: user.id });
```

### Testing with Authentication

```typescript
let accessToken: string;

beforeEach(async () => {
  // Create user and login
  const user = await UserFactory.createWithHashedPassword();
  const userRepository = TestDatabase.getRepository(User);
  await userRepository.save(user);

  const loginResponse = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: user.email, password: 'Password123!' });

  accessToken = loginResponse.body.accessToken;
});

it('should access protected route', async () => {
  await request(app.getHttpServer())
    .get('/api/protected')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);
});
```

### Testing Database Integration

```typescript
it('should persist data to database', async () => {
  await request(app.getHttpServer())
    .post('/api/v1/stories')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(storyData)
    .expect(201);

  // Verify in database
  const storyRepository = TestDatabase.getRepository(Story);
  const stories = await storyRepository.find();
  
  expect(stories.length).toBe(1);
  expect(stories[0].title).toBe(storyData.title);
});
```

### Testing Cache Integration

```typescript
it('should cache results', async () => {
  // First request - cache miss
  const response1 = await request(app.getHttpServer())
    .get('/api/v1/stories')
    .expect(200);

  // Second request - from cache
  const startTime = Date.now();
  const response2 = await request(app.getHttpServer())
    .get('/api/v1/stories')
    .expect(200);
  const duration = Date.now() - startTime;

  expect(response1.body).toEqual(response2.body);
  expect(duration).toBeLessThan(50); // Should be fast from cache
});
```

## Test Helpers

### TestDatabase

Helper for database operations:

```typescript
// Create connection
await TestDatabase.createConnection([User, Story]);

// Clear all data
await TestDatabase.clearDatabase();

// Get repository
const userRepository = TestDatabase.getRepository(User);

// Close connection
await TestDatabase.closeConnection();
```

### TestRedis

Helper for Redis operations:

```typescript
// Create connection
await TestRedis.createConnection();

// Clear cache
await TestRedis.clearCache();

// Get client
const redis = TestRedis.getClient();

// Close connection
await TestRedis.closeConnection();
```

### TestModuleBuilder

Helper for creating test modules:

```typescript
// Basic module
const module = await TestModuleBuilder.createTestModule(
  [YourModule],
  [YourService],
  [YourController],
);

// Module with database
const module = await TestModuleBuilder.createWithDatabase(
  [User, Story],
  [YourModule],
);

// Module with cache
const module = await TestModuleBuilder.createWithCache(
  [YourModule],
);
```

## Best Practices

### 1. Isolate Tests
- Clear database before each test
- Clear cache before each test
- Don't rely on test execution order

### 2. Use Factories
- Create test data using factories
- Reset factory counters in `beforeEach`
- Override only what's needed

### 3. Test Real Flows
- Test complete user journeys
- Include authentication in tests
- Verify database persistence
- Check cache behavior

### 4. Performance
- Run integration tests in sequence (`--runInBand`)
- Keep tests focused and fast
- Use appropriate timeouts

### 5. Cleanup
- Always close connections in `afterAll`
- Clear data in `beforeEach`, not `afterEach`
- Use proper async/await

## Common Patterns

### Testing Authentication Flow
```typescript
describe('Full auth flow', () => {
  it('should login -> access protected -> refresh -> logout', async () => {
    // 1. Login
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });

    // 2. Access protected route
    await request(app.getHttpServer())
      .get('/api/protected')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(200);

    // 3. Refresh token
    const refreshResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: loginResponse.body.refreshToken });

    // 4. Logout
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${refreshResponse.body.accessToken}`)
      .expect(200);
  });
});
```

### Testing CRUD Operations
```typescript
describe('CRUD flow', () => {
  it('should create -> read -> update -> delete', async () => {
    // Create
    const createResponse = await request(app.getHttpServer())
      .post('/api/v1/resource')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(data)
      .expect(201);

    const id = createResponse.body.id;

    // Read
    await request(app.getHttpServer())
      .get(`/api/v1/resource/${id}`)
      .expect(200);

    // Update
    await request(app.getHttpServer())
      .patch(`/api/v1/resource/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Updated' })
      .expect(200);

    // Delete
    await request(app.getHttpServer())
      .delete(`/api/v1/resource/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);
  });
});
```

## Troubleshooting

### Tests Failing to Connect to Database
- Verify test database exists: `psql -l | grep susanoo_test`
- Check `.env.test` credentials
- Ensure PostgreSQL is running

### Redis Connection Errors
- Verify Redis is running: `redis-cli ping`
- Check Redis DB 15 is accessible
- Verify `.env.test` Redis configuration

### Tests Hanging
- Increase timeout in jest config
- Check for unclosed connections
- Verify `afterAll` cleanup is working

### Database Not Clearing
- Check `TestDatabase.clearDatabase()` is called
- Verify foreign key constraints are handled
- Look for transaction issues

## Coverage Goals

Target coverage for integration tests:
- **Critical Paths**: 100% (auth, payments, etc.)
- **CRUD Operations**: 80%+
- **Error Scenarios**: 70%+
- **Edge Cases**: 60%+

## Next Steps

1. Add more integration test files:
   - `test/integration/users/users.integration.spec.ts`
   - `test/integration/attachments/attachments.integration.spec.ts`
   - `test/integration/categories/categories.integration.spec.ts`
   - `test/integration/tags/tags.integration.spec.ts`

2. Add S3 integration tests with MinIO

3. Add ACL/permissions integration tests

4. Add session management integration tests

5. Add performance benchmarks

---

**Happy Testing!** 🧪
