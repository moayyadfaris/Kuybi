import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import * as request from 'supertest'
import { AppModule } from '../../src/app.module'

/**
 * Story Version API Performance Tests
 *
 * Tests the performance of version-related APIs under load.
 * Run with: npm run test:performance
 */
describe('Story Version API Performance Tests', () => {
  let app: INestApplication
  let authToken: string
  let storyId: number

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile()

    app = moduleFixture.createNestApplication()
    app.setGlobalPrefix('api')
    await app.init()

    // Login to get auth token
    const loginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'admin@kuybi.dev',
      password: 'Admin@123'
    })

    authToken = loginResponse.body.data.accessToken

    // Create a test story for version testing
    const storyResponse = await request(app.getHttpServer())
      .post('/api/v1/stories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Performance Test Story',
        details: 'Content for performance testing',
        type: 'STORY',
        status: 'DRAFT',
        priority: 'NORMAL'
      })

    storyId = storyResponse.body.data.id

    // Create multiple versions for testing
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .post(`/api/v1/stories/${storyId}/versions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          versionType: 'MANUAL',
          commitMessage: `Test version ${i + 1}`
        })
    }
  }, 60000)

  afterAll(async () => {
    await app.close()
  })

  describe('GET /api/v1/stories/:storyId/versions - Performance', () => {
    it('should respond within 200ms for version history', async () => {
      const startTime = Date.now()

      const response = await request(app.getHttpServer())
        .get(`/api/v1/stories/${storyId}/versions`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      const duration = Date.now() - startTime

      console.log(`✓ Version history response time: ${duration}ms`)
      expect(duration).toBeLessThan(200)
      expect(response.body.data).toBeInstanceOf(Array)
    })

    it('should handle 100 concurrent requests efficiently', async () => {
      const requests = Array.from({ length: 100 }, () =>
        request(app.getHttpServer())
          .get(`/api/v1/stories/${storyId}/versions`)
          .set('Authorization', `Bearer ${authToken}`)
      )

      const startTime = Date.now()
      const responses = await Promise.all(requests)
      const duration = Date.now() - startTime

      const avgTime = duration / 100

      console.log(`✓ 100 concurrent requests completed in ${duration}ms`)
      console.log(`✓ Average response time: ${avgTime.toFixed(2)}ms`)

      responses.forEach(response => {
        expect(response.status).toBe(200)
      })

      // All 100 requests should complete within 5 seconds
      expect(duration).toBeLessThan(5000)
      // Average should be under 100ms
      expect(avgTime).toBeLessThan(100)
    }, 15000)

    it('should maintain performance with pagination', async () => {
      const measurements = []

      for (let offset = 0; offset < 50; offset += 10) {
        const startTime = Date.now()

        await request(app.getHttpServer())
          .get(`/api/v1/stories/${storyId}/versions?limit=10&offset=${offset}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200)

        const duration = Date.now() - startTime
        measurements.push(duration)
      }

      const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length
      const maxTime = Math.max(...measurements)

      console.log(`✓ Pagination average time: ${avgTime.toFixed(2)}ms`)
      console.log(`✓ Pagination max time: ${maxTime}ms`)

      expect(avgTime).toBeLessThan(150)
      expect(maxTime).toBeLessThan(300)
    })
  })

  describe('GET /api/v1/stories/:storyId/versions/:versionNumber - Performance', () => {
    it('should respond within 150ms for single version', async () => {
      const startTime = Date.now()

      await request(app.getHttpServer())
        .get(`/api/v1/stories/${storyId}/versions/5`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      const duration = Date.now() - startTime

      console.log(`✓ Single version response time: ${duration}ms`)
      expect(duration).toBeLessThan(150)
    })
  })

  describe('POST /api/v1/stories/:storyId/versions/compare - Performance', () => {
    it('should compare versions within 300ms', async () => {
      const startTime = Date.now()

      await request(app.getHttpServer())
        .post(`/api/v1/stories/${storyId}/versions/compare`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fromVersionNumber: 1,
          toVersionNumber: 5
        })
        .expect(200)

      const duration = Date.now() - startTime

      console.log(`✓ Version comparison time: ${duration}ms`)
      expect(duration).toBeLessThan(300)
    })

    it('should handle 50 concurrent comparisons', async () => {
      const requests = Array.from({ length: 50 }, (_, i) =>
        request(app.getHttpServer())
          .post(`/api/v1/stories/${storyId}/versions/compare`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            fromVersionNumber: 1,
            toVersionNumber: (i % 10) + 1
          })
      )

      const startTime = Date.now()
      const responses = await Promise.all(requests)
      const duration = Date.now() - startTime

      console.log(`✓ 50 concurrent comparisons in ${duration}ms`)

      responses.forEach(response => {
        expect(response.status).toBe(200)
      })

      expect(duration).toBeLessThan(3000)
    }, 10000)
  })

  describe('POST /api/v1/stories/:storyId/versions/rollback - Performance', () => {
    it('should rollback within 500ms', async () => {
      const startTime = Date.now()

      await request(app.getHttpServer())
        .post(`/api/v1/stories/${storyId}/versions/rollback`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          versionNumber: 5,
          commitMessage: 'Performance test rollback'
        })
        .expect(200)

      const duration = Date.now() - startTime

      console.log(`✓ Rollback response time: ${duration}ms`)
      expect(duration).toBeLessThan(500)
    })
  })

  describe('Response Size Analysis', () => {
    it('should measure and report response sizes', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/stories/${storyId}/versions`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      const responseSize = JSON.stringify(response.body).length
      const sizeInKB = (responseSize / 1024).toFixed(2)

      console.log(`✓ Response size: ${sizeInKB} KB`)
      console.log(`✓ Number of versions: ${response.body.data.length}`)

      // Should be less than 100KB for 10 versions
      expect(responseSize).toBeLessThan(100 * 1024)
    })
  })

  describe('Cache Performance', () => {
    it('should show improved performance on repeated requests (cache test)', async () => {
      // First request (cache miss)
      const startTime1 = Date.now()
      await request(app.getHttpServer())
        .get(`/api/v1/stories/${storyId}/versions`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
      const duration1 = Date.now() - startTime1

      // Second request (cache hit)
      const startTime2 = Date.now()
      await request(app.getHttpServer())
        .get(`/api/v1/stories/${storyId}/versions`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
      const duration2 = Date.now() - startTime2

      console.log(`✓ First request (cache miss): ${duration1}ms`)
      console.log(`✓ Second request (cache hit): ${duration2}ms`)
      console.log(`✓ Cache improvement: ${((1 - duration2 / duration1) * 100).toFixed(1)}%`)

      // Second request should be faster due to caching
      expect(duration2).toBeLessThanOrEqual(duration1)
    })
  })

  describe('Memory and CPU Profiling', () => {
    it('should not cause memory leaks with sustained load', async () => {
      const initialMemory = process.memoryUsage().heapUsed

      // Make 200 requests
      for (let i = 0; i < 200; i++) {
        await request(app.getHttpServer())
          .get(`/api/v1/stories/${storyId}/versions`)
          .set('Authorization', `Bearer ${authToken}`)
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = ((finalMemory - initialMemory) / 1024 / 1024).toFixed(2)

      console.log(`✓ Initial memory: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`)
      console.log(`✓ Final memory: ${(finalMemory / 1024 / 1024).toFixed(2)} MB`)
      console.log(`✓ Memory increase: ${memoryIncrease} MB`)

      // Memory increase should be reasonable (less than 50MB for 200 requests)
      expect(parseFloat(memoryIncrease)).toBeLessThan(50)
    }, 30000)
  })
})
