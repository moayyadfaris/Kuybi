# DDD Migration Plan for Kuybi

## Executive Summary

This document provides a **practical, step-by-step plan** to migrate the Kuybi NestJS application from a module-centric architecture to a Domain-Driven Design (DDD) architecture with clear bounded contexts.

**Estimated Timeline**: 6-8 weeks  
**Team Size**: 2-3 developers  
**Risk Level**: Medium (gradual migration reduces risk)

---

## Current State Analysis

### Identified Issues

1. **Cross-Module Dependencies**
   ```typescript
   // StoriesService imports from 3 different modules
   import { Attachment } from '../attachments/entities/attachment.entity'
   import { Tag } from '../tags/entities/tag.entity'
   @InjectRepository(Attachment) private attachmentRepo: Repository<Attachment>
   @InjectRepository(Tag) private tagRepo: Repository<Tag>
   ```

2. **Shared Database Layer**
   - All modules depend on `src/database/repositories/`
   - Tight coupling to TypeORM
   - No abstraction layer

3. **No Domain Logic**
   - Anemic entities (just data holders)
   - All business logic in services
   - No value objects

4. **No Event-Driven Communication**
   - Direct method calls between modules
   - Synchronous coupling

### Proposed Bounded Contexts

Based on your codebase, we identify **4 main bounded contexts**:

1. **Content Context**: Stories, Categories, Tags
2. **Identity Context**: Users, Auth, ACL (Roles, Permissions)
3. **Media Context**: Attachments, S3, Image Processing
4. **Infrastructure Context**: Countries, Settings (read-only data)

---

## Migration Phases

### Phase 0: Preparation (Week 1)

**Goal**: Set up infrastructure and install dependencies

#### Tasks

1. **Install Event Emitter**
   ```bash
   npm install @nestjs/event-emitter
   ```

2. **Create Directory Structure**
   ```bash
   mkdir -p src/shared-kernel/{domain,application,infrastructure}
   mkdir -p src/bounded-contexts/{content,identity,media,infrastructure}
   mkdir -p src/integration/{events,handlers,facades}
   ```

3. **Update app.module.ts**
   ```typescript
   import { EventEmitterModule } from '@nestjs/event-emitter'
   
   @Module({
     imports: [
       EventEmitterModule.forRoot({
         wildcard: false,
         delimiter: '.',
         maxListeners: 10,
       }),
       // ... existing imports
     ]
   })
   ```

4. **Documentation**
   - ✅ Read `DOMAIN_DRIVEN_DESIGN.md`
   - Share with team
   - Get buy-in

---

### Phase 1: Shared Kernel Creation (Week 2)

**Goal**: Extract common domain logic into shared-kernel

#### 1.1 Base Entities

```typescript
// src/shared-kernel/domain/base-entity.ts
export abstract class BaseEntity {
  id: string
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date

  protected constructor(id?: string) {
    this.id = id || crypto.randomUUID()
    this.createdAt = new Date()
    this.updatedAt = new Date()
  }

  isDeleted(): boolean {
    return this.deletedAt !== null && this.deletedAt !== undefined
  }

  softDelete(): void {
    this.deletedAt = new Date()
    this.updatedAt = new Date()
  }

  restore(): void {
    this.deletedAt = undefined
    this.updatedAt = new Date()
  }
}
```

#### 1.2 Repository Interface

```typescript
// src/shared-kernel/domain/repository.interface.ts
export interface IRepository<T extends BaseEntity> {
  findById(id: string): Promise<T | null>
  findAll(): Promise<T[]>
  save(entity: T): Promise<T>
  update(id: string, entity: Partial<T>): Promise<T>
  delete(id: string): Promise<void>
}

export interface IReadRepository<T> {
  findById(id: string): Promise<T | null>
  findAll(): Promise<T[]>
}
```

#### 1.3 Value Objects

```typescript
// src/shared-kernel/domain/value-objects/pagination.vo.ts
export class Pagination {
  readonly page: number
  readonly limit: number

  constructor(page: number = 1, limit: number = 20) {
    if (page < 1) {
      throw new Error('Page must be at least 1')
    }
    if (limit < 1 || limit > 100) {
      throw new Error('Limit must be between 1 and 100')
    }
    this.page = page
    this.limit = limit
  }

  get offset(): number {
    return (this.page - 1) * this.limit
  }

  get skip(): number {
    return this.offset
  }

  get take(): number {
    return this.limit
  }
}
```

```typescript
// src/shared-kernel/domain/value-objects/email.vo.ts
export class Email {
  private readonly value: string

  constructor(email: string) {
    if (!this.isValid(email)) {
      throw new Error('Invalid email format')
    }
    this.value = email.toLowerCase().trim()
  }

  toString(): string {
    return this.value
  }

  equals(other: Email): boolean {
    return this.value === other.value
  }

  private isValid(email: string): boolean {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return regex.test(email)
  }
}
```

#### 1.4 Domain Events

```typescript
// src/shared-kernel/domain/domain-event.ts
export abstract class DomainEvent {
  readonly occurredOn: Date
  readonly aggregateId: string

  constructor(aggregateId: string) {
    this.aggregateId = aggregateId
    this.occurredOn = new Date()
  }

  abstract getEventName(): string
}
```

```typescript
// src/shared-kernel/domain/domain-event-publisher.ts
import { EventEmitter2 } from '@nestjs/event-emitter'
import { DomainEvent } from './domain-event'

export class DomainEventPublisher {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  publish(event: DomainEvent): void {
    this.eventEmitter.emit(event.getEventName(), event)
  }

  publishAll(events: DomainEvent[]): void {
    events.forEach((event) => this.publish(event))
  }
}
```

#### 1.5 Common DTOs

```typescript
// src/shared-kernel/application/pagination.dto.ts
import { IsOptional, IsInt, Min, Max } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class PaginationDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20
}
```

```typescript
// src/shared-kernel/application/paginated-result.dto.ts
export class PaginatedResultDto<T> {
  data: T[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }

  constructor(data: T[], total: number, page: number, limit: number) {
    this.data = data
    this.meta = {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPreviousPage: page > 1,
    }
  }
}
```

---

### Phase 2: Define Integration Events (Week 3)

**Goal**: Create events for cross-context communication

#### 2.1 Content Context Events

```typescript
// src/integration/events/story-created.event.ts
import { DomainEvent } from '../../shared-kernel/domain/domain-event'

export class StoryCreatedEvent extends DomainEvent {
  constructor(
    public readonly storyId: string,
    public readonly title: string,
    public readonly authorId: string,
    public readonly type: string
  ) {
    super(storyId)
  }

  getEventName(): string {
    return 'story.created'
  }
}
```

```typescript
// src/integration/events/story-published.event.ts
import { DomainEvent } from '../../shared-kernel/domain/domain-event'

export class StoryPublishedEvent extends DomainEvent {
  constructor(
    public readonly storyId: string,
    public readonly publishedBy: string,
    public readonly publishedAt: Date
  ) {
    super(storyId)
  }

  getEventName(): string {
    return 'story.published'
  }
}
```

#### 2.2 Identity Context Events

```typescript
// src/integration/events/user-registered.event.ts
import { DomainEvent } from '../../shared-kernel/domain/domain-event'

export class UserRegisteredEvent extends DomainEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly registeredAt: Date
  ) {
    super(userId)
  }

  getEventName(): string {
    return 'user.registered'
  }
}
```

```typescript
// src/integration/events/user-role-assigned.event.ts
import { DomainEvent } from '../../shared-kernel/domain/domain-event'

export class UserRoleAssignedEvent extends DomainEvent {
  constructor(
    public readonly userId: string,
    public readonly roleId: number,
    public readonly assignedBy: string
  ) {
    super(userId)
  }

  getEventName(): string {
    return 'user.role.assigned'
  }
}
```

#### 2.3 Media Context Events

```typescript
// src/integration/events/attachment-uploaded.event.ts
import { DomainEvent } from '../../shared-kernel/domain/domain-event'

export class AttachmentUploadedEvent extends DomainEvent {
  constructor(
    public readonly attachmentId: string,
    public readonly uploadedBy: string,
    public readonly fileUrl: string,
    public readonly mimeType: string
  ) {
    super(attachmentId)
  }

  getEventName(): string {
    return 'attachment.uploaded'
  }
}
```

---

### Phase 3: Create Facades (Week 4)

**Goal**: Provide stable APIs for cross-context communication

#### 3.1 Media Facade

```typescript
// src/integration/facades/media.facade.ts
import { Injectable } from '@nestjs/common'
import { AttachmentRepository } from '../../database/repositories/attachment.repository'

export interface AttachmentInfo {
  id: string
  url: string
  mimeType: string
  size: number
  filename: string
}

@Injectable()
export class MediaFacade {
  constructor(
    private readonly attachmentRepository: AttachmentRepository
  ) {}

  async getAttachmentInfo(id: string): Promise<AttachmentInfo | null> {
    const attachment = await this.attachmentRepository.findById(id)
    
    if (!attachment) {
      return null
    }

    return {
      id: attachment.id,
      url: attachment.fileUrl,
      mimeType: attachment.mimeType,
      size: attachment.size,
      filename: attachment.filename,
    }
  }

  async getAttachmentsByIds(ids: string[]): Promise<AttachmentInfo[]> {
    const attachments = await this.attachmentRepository.findByIds(ids)
    
    return attachments.map(a => ({
      id: a.id,
      url: a.fileUrl,
      mimeType: a.mimeType,
      size: a.size,
      filename: a.filename,
    }))
  }

  async validateAttachmentAccess(attachmentId: string, userId: string): Promise<boolean> {
    const attachment = await this.attachmentRepository.findById(attachmentId)
    return attachment && attachment.uploadedBy === userId
  }
}
```

#### 3.2 Identity Facade

```typescript
// src/integration/facades/identity.facade.ts
import { Injectable } from '@nestjs/common'
import { UserRepository } from '../../database/repositories/user.repository'

export interface UserInfo {
  id: string
  email: string
  name: string
  role: string
}

@Injectable()
export class IdentityFacade {
  constructor(
    private readonly userRepository: UserRepository
  ) {}

  async getUserInfo(userId: string): Promise<UserInfo | null> {
    const user = await this.userRepository.findById(userId)
    
    if (!user) {
      return null
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    }
  }

  async validateUserExists(userId: string): Promise<boolean> {
    const user = await this.userRepository.findById(userId)
    return !!user
  }

  async hasPermission(userId: string, action: string, subject: string): Promise<boolean> {
    // Call ACL service
    // Return boolean
    return true // placeholder
  }
}
```

#### 3.3 Content Facade

```typescript
// src/integration/facades/content.facade.ts
import { Injectable } from '@nestjs/common'
import { StoryRepository } from '../../database/repositories/story.repository'

export interface StoryInfo {
  id: string
  title: string
  authorId: string
  status: string
  publishedAt?: Date
}

@Injectable()
export class ContentFacade {
  constructor(
    private readonly storyRepository: StoryRepository
  ) {}

  async getStoryInfo(storyId: string): Promise<StoryInfo | null> {
    const story = await this.storyRepository.findById(storyId)
    
    if (!story) {
      return null
    }

    return {
      id: story.id,
      title: story.title,
      authorId: story.userId,
      status: story.status,
      publishedAt: story.publishedAt,
    }
  }

  async getStoriesByAuthor(authorId: string): Promise<StoryInfo[]> {
    const stories = await this.storyRepository.findByUserId(authorId)
    
    return stories.map(s => ({
      id: s.id,
      title: s.title,
      authorId: s.userId,
      status: s.status,
      publishedAt: s.publishedAt,
    }))
  }
}
```

#### 3.4 Register Facades Module

```typescript
// src/integration/integration.module.ts
import { Module } from '@nestjs/common'
import { MediaFacade } from './facades/media.facade'
import { IdentityFacade } from './facades/identity.facade'
import { ContentFacade } from './facades/content.facade'
import { DatabaseModule } from '../database/database.module'

@Module({
  imports: [DatabaseModule],
  providers: [MediaFacade, IdentityFacade, ContentFacade],
  exports: [MediaFacade, IdentityFacade, ContentFacade],
})
export class IntegrationModule {}
```

---

### Phase 4: Refactor Stories Module (Week 5)

**Goal**: Migrate Stories to use facades instead of direct imports

#### Before (Current)

```typescript
// ❌ Tight coupling
@Injectable()
export class StoriesService {
  constructor(
    private storyRepository: StoryRepository,
    @InjectRepository(Attachment) private attachmentRepo: Repository<Attachment>,
    @InjectRepository(Tag) private tagRepo: Repository<Tag>,
  ) {}

  async attachMedia(storyId: string, attachmentIds: string[]): Promise<void> {
    // Direct database access to attachments
    const attachments = await this.attachmentRepo.findBy({ id: In(attachmentIds) })
    // ...
  }
}
```

#### After (DDD)

```typescript
// ✅ Loose coupling via facades
import { MediaFacade } from '../../integration/facades/media.facade'
import { IdentityFacade } from '../../integration/facades/identity.facade'

@Injectable()
export class StoriesService {
  constructor(
    private storyRepository: StoryRepository,
    private mediaFacade: MediaFacade,
    private identityFacade: IdentityFacade,
    private eventEmitter: EventEmitter2,
  ) {}

  async attachMedia(storyId: string, attachmentIds: string[], userId: string): Promise<void> {
    // ✅ Use facade instead of direct repository
    const attachments = await this.mediaFacade.getAttachmentsByIds(attachmentIds)
    
    if (attachments.length !== attachmentIds.length) {
      throw new BadRequestException('Some attachments not found')
    }

    // Validate access
    for (const attachment of attachments) {
      const hasAccess = await this.mediaFacade.validateAttachmentAccess(attachment.id, userId)
      if (!hasAccess) {
        throw new ForbiddenException(`No access to attachment ${attachment.id}`)
      }
    }

    // Update story (implementation)
    // ...

    // ✅ Emit event
    this.eventEmitter.emit('story.media.attached', {
      storyId,
      attachmentIds,
      userId,
    })
  }

  async create(dto: CreateStoryDto, userId: string): Promise<Story> {
    // ✅ Validate user exists via facade
    const userExists = await this.identityFacade.validateUserExists(userId)
    if (!userExists) {
      throw new BadRequestException('User not found')
    }

    // Create story
    const story = await this.storyRepository.save({...dto, userId})

    // ✅ Emit event
    this.eventEmitter.emit(
      'story.created',
      new StoryCreatedEvent(story.id, story.title, userId, story.type)
    )

    return story
  }
}
```

#### Update Stories Module

```typescript
// src/stories/stories.module.ts
import { IntegrationModule } from '../integration/integration.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Story, StoryAttachment, StoryTag]),
    IntegrationModule,  // ✅ Import facades
    CacheConfigModule,
  ],
  providers: [StoriesService, StoryRepository],
  controllers: [StoriesController],
  exports: [StoriesService],
})
export class StoriesModule {}
```

---

### Phase 5: Implement Event Handlers (Week 6)

**Goal**: React to events from other contexts

#### Example: Notify when story is published

```typescript
// src/integration/handlers/story-published.handler.ts
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { StoryPublishedEvent } from '../events/story-published.event'
import { IdentityFacade } from '../facades/identity.facade'
import { PinoLogger } from 'nestjs-pino'

@Injectable()
export class StoryPublishedHandler {
  constructor(
    private readonly identityFacade: IdentityFacade,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(StoryPublishedHandler.name)
  }

  @OnEvent('story.published')
  async handle(event: StoryPublishedEvent): Promise<void> {
    this.logger.info(
      { storyId: event.storyId, publishedBy: event.publishedBy },
      'Story published'
    )

    // Get author info
    const author = await this.identityFacade.getUserInfo(event.publishedBy)
    
    if (author) {
      // Send notification (email, push, etc.)
      // Update statistics
      // Trigger analytics
      this.logger.info(
        { authorEmail: author.email, storyId: event.storyId },
        'Notifying author of publication'
      )
    }
  }
}
```

#### Register Handlers

```typescript
// src/integration/integration.module.ts
import { StoryPublishedHandler } from './handlers/story-published.handler'
import { UserRegisteredHandler } from './handlers/user-registered.handler'
import { AttachmentUploadedHandler } from './handlers/attachment-uploaded.handler'

@Module({
  imports: [DatabaseModule],
  providers: [
    MediaFacade,
    IdentityFacade,
    ContentFacade,
    StoryPublishedHandler,
    UserRegisteredHandler,
    AttachmentUploadedHandler,
  ],
  exports: [MediaFacade, IdentityFacade, ContentFacade],
})
export class IntegrationModule {}
```

---

### Phase 6: Testing & Validation (Week 7-8)

**Goal**: Ensure system works correctly

#### Unit Tests with Facades

```typescript
// src/stories/stories.service.spec.ts
describe('StoriesService', () => {
  let service: StoriesService
  let mediaFacade: jest.Mocked<MediaFacade>
  let identityFacade: jest.Mocked<IdentityFacade>

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoriesService,
        {
          provide: MediaFacade,
          useValue: {
            getAttachmentsByIds: jest.fn(),
            validateAttachmentAccess: jest.fn(),
          },
        },
        {
          provide: IdentityFacade,
          useValue: {
            validateUserExists: jest.fn(),
            getUserInfo: jest.fn(),
          },
        },
        // ... other mocks
      ],
    }).compile()

    service = module.get<StoriesService>(StoriesService)
    mediaFacade = module.get(MediaFacade)
    identityFacade = module.get(IdentityFacade)
  })

  it('should attach media to story', async () => {
    // ✅ Easy to mock facades
    mediaFacade.getAttachmentsByIds.mockResolvedValue([
      { id: '1', url: 'url', mimeType: 'image/png', size: 100, filename: 'test.png' }
    ])
    mediaFacade.validateAttachmentAccess.mockResolvedValue(true)

    await service.attachMedia('story-1', ['1'], 'user-1')

    expect(mediaFacade.getAttachmentsByIds).toHaveBeenCalledWith(['1'])
  })
})
```

#### Integration Tests

```typescript
// test/stories.e2e-spec.ts
describe('Stories (e2e)', () => {
  it('should create story and emit event', async (done) => {
    const eventEmitter = app.get(EventEmitter2)
    
    eventEmitter.on('story.created', (event) => {
      expect(event.storyId).toBeDefined()
      expect(event.authorId).toBe('user-1')
      done()
    })

    await request(app.getHttpServer())
      .post('/api/v1/stories')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test', content: 'Content' })
      .expect(201)
  })
})
```

---

## Success Metrics

### Code Quality Metrics

- [ ] **Coupling reduced by 50%+**
  - Measure with `madge --circular src/`
  - Target: 0 circular dependencies

- [ ] **Test coverage improved to 80%+**
  - Current: ~0%
  - Target: 80%

- [ ] **Module independence**
  - Each context can be tested in isolation
  - Facades have 100% test coverage

### Performance Metrics

- [ ] **No performance regression**
  - API response times unchanged
  - Event processing adds <10ms overhead

### Developer Experience

- [ ] **Easier to understand**
  - New developers can understand one context at a time
  - Clear separation of concerns

- [ ] **Faster feature development**
  - Changes isolated to single context
  - Less fear of breaking other modules

---

## Rollback Plan

If migration causes issues:

1. **Keep old code in parallel** (deprecated)
2. **Feature flags** for new/old code paths
3. **Gradual rollout** - migrate module by module
4. **Monitoring** - track errors, performance

---

## Next Steps

1. **Week 1**: Team review & approval
2. **Week 2**: Create shared-kernel
3. **Week 3**: Define events
4. **Week 4**: Create facades
5. **Week 5**: Refactor Stories module (POC)
6. **Week 6**: Implement event handlers
7. **Week 7-8**: Testing & validation
8. **Week 9+**: Migrate remaining modules

---

## Questions?

Reach out to architecture team or schedule a design review session.
