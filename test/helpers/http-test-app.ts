import { DynamicModule, INestApplication, Type } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { configureApp } from '@app/app.setup'
import { ENTITIES } from '@app/database/entities'
import { LoggerModule } from 'nestjs-pino'
import request from 'supertest'
import { DataSource } from 'typeorm'

import { AclModule } from '@modules/acl/acl.module'
import { AuthModule } from '@modules/auth/auth.module'
import { User } from '@modules/users/entities/user.entity'
import { UsersModule } from '@modules/users/users.module'

import { CacheService } from '@core/cache/services/cache.service'
import { EventsModule } from '@core/events'
import { LoggingModule } from '@core/logging/logging.module'
import { SentryModule } from '@core/sentry'

import { UserFactory } from '../factories/user.factory'
import { testConfig } from '../test.config'

import { InMemoryCacheService } from './in-memory-cache.service'
import { resetDatabase } from './reset-database'
import { SeededRoles, seedRolesWithPermissions } from './role-seeder'

export interface Actor {
  user: User
  /** Authorization header for requests as this user */
  auth: { Authorization: string }
}

export interface HttpTestApp {
  app: INestApplication
  dataSource: DataSource
  cache: InMemoryCacheService
  roles: SeededRoles
  http: () => ReturnType<typeof request>
  /** Creates a user with the given seeded role and logs it in */
  signUp: (email: string, role: string) => Promise<Actor>
  close: () => Promise<void>
}

const PASSWORD = 'Password123!'

/**
 * The production HTTP pipeline (configureApp) over real Postgres, the production ACL
 * (seeded roles and permissions) and the in-memory cache, with auth, users and acl
 * loaded plus the feature modules under test. `resetTables` are truncated first.
 */
export async function createHttpTestApp(
  modules: Array<Type<unknown> | DynamicModule>,
  options: { resetTables?: string[] } = {}
): Promise<HttpTestApp> {
  const cache = new InMemoryCacheService()
  const moduleRef = await Test.createTestingModule({
    imports: [
      EventsModule,
      SentryModule.forRoot(),
      ConfigModule.forRoot({ isGlobal: true, load: [() => testConfig] }),
      LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
      TypeOrmModule.forRoot({
        type: 'postgres',
        host: testConfig.database.host,
        port: testConfig.database.port,
        username: testConfig.database.username,
        password: testConfig.database.password,
        database: testConfig.database.database,
        entities: ENTITIES,
        synchronize: false,
        logging: false
      }),
      LoggingModule,
      AclModule,
      AuthModule,
      UsersModule,
      ...modules
    ]
  })
    .overrideProvider(CacheService)
    .useValue(cache)
    .compile()

  const app = moduleRef.createNestApplication()
  configureApp(app)
  await app.init()
  const dataSource = app.get(DataSource)
  const http = () => request(app.getHttpServer())
  // Reset before seeding: the tables may include the roles and permissions
  if (options.resetTables?.length) await resetDatabase(dataSource, options.resetTables)
  const roles = await seedRolesWithPermissions(dataSource)

  const signUp = async (email: string, role: string): Promise<Actor> => {
    const data = await UserFactory.createWithHashedPassword({
      email,
      password: PASSWORD,
      primaryRoleId: roles[role].id
    })
    const user = await dataSource.getRepository(User).save(data as User)
    const login = await http().post('/api/v1/auth/login').send({ email, password: PASSWORD })
    if (login.status !== 201) {
      throw new Error(`login as ${email} failed: ${login.status} ${JSON.stringify(login.body)}`)
    }
    return { user, auth: { Authorization: `Bearer ${login.body.data.accessToken}` } }
  }

  return { app, dataSource, cache, roles, http, signUp, close: () => app.close() }
}
