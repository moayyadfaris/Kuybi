/**
 * Bootstrap smoke test
 *
 * Compiles the full API and worker dependency graphs. Feature specs build partial
 * modules, so a provider that is missing, duplicated across modules or wired into a
 * circular import only shows up here (or at startup).
 */
import { Test } from '@nestjs/testing'

// The app reads DB_* / REDIS_*; point them at the test services before loading it
process.env.DB_HOST = process.env.TEST_DB_HOST || 'localhost'
process.env.DB_PORT = process.env.TEST_DB_PORT || '5432'
process.env.DB_USERNAME = process.env.TEST_DB_USERNAME || 'postgres'
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'postgres'
process.env.DB_NAME = process.env.TEST_DB_NAME || 'kuybi_test'
process.env.REDIS_HOST = process.env.TEST_REDIS_HOST || 'localhost'
process.env.REDIS_PORT = process.env.TEST_REDIS_PORT || '6379'
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000'

describe('Application bootstrap', () => {
  it('compiles the API module graph', async () => {
    const { AppModule } = await import('../../../src/app.module')
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()

    expect(moduleRef).toBeDefined()
    await moduleRef.close()
  })

  it('compiles the worker module graph', async () => {
    const { QueueWorkerModule } = await import('../../../src/worker.module')
    const moduleRef = await Test.createTestingModule({ imports: [QueueWorkerModule] }).compile()

    expect(moduleRef).toBeDefined()
    await moduleRef.close()
  })
})
