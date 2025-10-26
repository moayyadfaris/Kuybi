# Domain-Driven Design (DDD) Architecture Guide

## Understanding the Code Review Feedback

### What the Feedback Means

**"Formalize domain layers or bounded contexts (domain services, shared kernel packages) to prevent cross-module coupling as features grow."**

This feedback is highlighting a **critical architectural concern** in our current codebase:

#### Current Problems Identified:

1. **Cross-Module Coupling** 
   ```typescript
   // ❌ Stories module importing from Attachments module
   import { Attachment } from '../attachments/entities/attachment.entity'
   import { Tag } from '../tags/entities/tag.entity'
   
   // ❌ Direct repository access across modules
   @InjectRepository(Attachment)
   private readonly attachmentRepository: Repository<Attachment>
   ```

2. **No Clear Domain Boundaries**
   - Stories knows about Attachments
   - Stories knows about Tags
   - ACL knows about Users
   - Auth knows about Sessions
   - **Everything is coupled to everything!**

3. **Shared Kernel Not Formalized**
   - Common types scattered across modules
   - No clear "shared domain" for cross-cutting concerns
   - No domain services for business logic

### Why This Matters

As your application grows:

- **Maintenance becomes difficult**: Changing one module breaks others
- **Testing is hard**: Can't test modules in isolation
- **Scalability issues**: Can't split into microservices later
- **Team productivity drops**: Multiple teams stepping on each other's toes
- **Technical debt accumulates**: Refactoring becomes impossible

---

## Current Architecture Analysis

### Your Current Structure (Module-Centric)

```
src/
├── acl/              # Access Control (knows about users, permissions)
├── attachments/      # File management
├── auth/             # Authentication (knows about users, sessions)
├── cache/            # Caching infrastructure
├── categories/       # Category management
├── countries/        # Country data
├── database/         # Database layer (SHARED by everyone!)
│   ├── repositories/ # ❌ All modules depend on this
│   └── migrations/
├── stories/          # Stories (knows about attachments, tags, users)
├── tags/             # Tags
├── users/            # User management
└── common/           # ⚠️ Not well-defined
```

### Problems with Current Structure

```typescript
// Example: StoriesService has too many responsibilities
@Injectable()
export class StoriesService {
  constructor(
    private storyRepository: StoryRepository,
    @InjectRepository(Story) private storyRepo: Repository<Story>,
    @InjectRepository(Attachment) private attachmentRepo: Repository<Attachment>, // ❌ Cross-module!
    @InjectRepository(Tag) private tagRepo: Repository<Tag>,                       // ❌ Cross-module!
  ) {}
}
```

**Issues:**
1. ❌ Stories module **directly depends** on Attachments and Tags modules
2. ❌ No abstraction - can't change Attachments without affecting Stories
3. ❌ Can't test Stories without mocking Attachments and Tags
4. ❌ Violates **Single Responsibility Principle**

---

## Recommended DDD Architecture

### 1. Define Bounded Contexts

**Bounded Contexts** = Independent business domains with clear boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Content    │  │   Identity   │  │    Media     │      │
│  │   Context    │  │   Context    │  │   Context    │      │
│  │              │  │              │  │              │      │
│  │ - Stories    │  │ - Users      │  │ - Attachments│      │
│  │ - Categories │  │ - Auth       │  │ - S3         │      │
│  │ - Tags       │  │ - ACL        │  │ - Images     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                 │                  │               │
│         └─────────────────┴──────────────────┘               │
│                           ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Shared Kernel (Domain Core)              │  │
│  │  - Common Types                                       │  │
│  │  - Domain Events                                      │  │
│  │  - Value Objects                                      │  │
│  │  - Base Entities                                      │  │
│  └───────────────────────────────────────────────────────┘  │
│                           ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │            Infrastructure Layer                       │  │
│  │  - Database                                           │  │
│  │  - Cache                                              │  │
│  │  - External APIs                                      │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2. Proposed Folder Structure

```
src/
├── bounded-contexts/           # 🆕 Domain-driven modules
│   ├── content/                # Content Management Context
│   │   ├── domain/
│   │   │   ├── entities/
│   │   │   │   ├── story.entity.ts
│   │   │   │   ├── category.entity.ts
│   │   │   │   └── tag.entity.ts
│   │   │   ├── value-objects/
│   │   │   │   ├── story-metadata.vo.ts
│   │   │   │   └── location.vo.ts
│   │   │   ├── repositories/  # Interfaces only!
│   │   │   │   ├── story.repository.interface.ts
│   │   │   │   └── category.repository.interface.ts
│   │   │   └── services/       # Domain services
│   │   │       ├── story-publishing.service.ts
│   │   │       └── content-moderation.service.ts
│   │   ├── application/
│   │   │   ├── commands/       # CQRS commands
│   │   │   │   ├── create-story.command.ts
│   │   │   │   └── publish-story.command.ts
│   │   │   ├── queries/        # CQRS queries
│   │   │   │   ├── get-story.query.ts
│   │   │   │   └── list-stories.query.ts
│   │   │   └── handlers/
│   │   │       ├── create-story.handler.ts
│   │   │       └── publish-story.handler.ts
│   │   ├── infrastructure/
│   │   │   ├── persistence/
│   │   │   │   ├── story.repository.impl.ts
│   │   │   │   └── story.schema.ts
│   │   │   └── adapters/
│   │   │       └── s3-storage.adapter.ts
│   │   └── presentation/
│   │       ├── controllers/
│   │       │   └── stories.controller.ts
│   │       └── dto/
│   │           └── create-story.dto.ts
│   │
│   ├── identity/               # Identity & Access Context
│   │   ├── domain/
│   │   │   ├── entities/
│   │   │   │   ├── user.entity.ts
│   │   │   │   ├── role.entity.ts
│   │   │   │   └── permission.entity.ts
│   │   │   ├── value-objects/
│   │   │   │   ├── email.vo.ts
│   │   │   │   └── password.vo.ts
│   │   │   └── services/
│   │   │       ├── authentication.service.ts
│   │   │       └── authorization.service.ts
│   │   ├── application/
│   │   ├── infrastructure/
│   │   └── presentation/
│   │
│   └── media/                  # Media Management Context
│       ├── domain/
│       │   ├── entities/
│       │   │   └── attachment.entity.ts
│       │   ├── value-objects/
│       │   │   ├── file-metadata.vo.ts
│       │   │   └── image-dimensions.vo.ts
│       │   └── services/
│       │       ├── image-processing.service.ts
│       │       └── file-validation.service.ts
│       ├── application/
│       ├── infrastructure/
│       └── presentation/
│
├── shared-kernel/              # 🆕 Shared domain logic
│   ├── domain/
│   │   ├── base-entity.ts
│   │   ├── base-repository.interface.ts
│   │   ├── domain-event.ts
│   │   └── value-objects/
│   │       ├── id.vo.ts
│   │       ├── timestamp.vo.ts
│   │       └── money.vo.ts
│   ├── application/
│   │   ├── pagination.dto.ts
│   │   ├── filter.dto.ts
│   │   └── result.dto.ts
│   └── infrastructure/
│       ├── database/
│       ├── cache/
│       └── event-bus/
│
├── integration/                # 🆕 Cross-context communication
│   ├── events/
│   │   ├── story-published.event.ts
│   │   ├── user-registered.event.ts
│   │   └── attachment-uploaded.event.ts
│   ├── handlers/
│   │   ├── story-published.handler.ts
│   │   └── user-registered.handler.ts
│   └── facades/                # Anti-corruption layer
│       ├── content.facade.ts
│       ├── identity.facade.ts
│       └── media.facade.ts
│
└── app.module.ts
```

---

## Step-by-Step Migration Plan

### Phase 1: Create Shared Kernel (Week 1)

**Goal**: Extract common domain logic into a shared package

#### 1.1 Create Base Abstractions

```typescript
// src/shared-kernel/domain/base-entity.ts
export abstract class BaseEntity {
  id: string
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date

  constructor(id: string) {
    this.id = id
    this.createdAt = new Date()
    this.updatedAt = new Date()
  }

  isDeleted(): boolean {
    return !!this.deletedAt
  }

  softDelete(): void {
    this.deletedAt = new Date()
  }
}
```

```typescript
// src/shared-kernel/domain/repository.interface.ts
export interface IRepository<T extends BaseEntity> {
  findById(id: string): Promise<T | null>
  findAll(): Promise<T[]>
  save(entity: T): Promise<T>
  delete(id: string): Promise<void>
}
```

```typescript
// src/shared-kernel/domain/value-objects/pagination.vo.ts
export class Pagination {
  readonly page: number
  readonly limit: number
  readonly offset: number

  constructor(page: number = 1, limit: number = 20) {
    if (page < 1) throw new Error('Page must be >= 1')
    if (limit < 1 || limit > 100) throw new Error('Limit must be 1-100')

    this.page = page
    this.limit = limit
    this.offset = (page - 1) * limit
  }
}
```

#### 1.2 Create Domain Events

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
// src/integration/events/story-published.event.ts
import { DomainEvent } from '../../shared-kernel/domain/domain-event'

export class StoryPublishedEvent extends DomainEvent {
  constructor(
    public readonly storyId: string,
    public readonly title: string,
    public readonly authorId: string,
    public readonly publishedAt: Date
  ) {
    super(storyId)
  }

  getEventName(): string {
    return 'story.published'
  }
}
```

---

### Phase 2: Define Bounded Contexts (Week 2-3)

#### 2.1 Content Context (Stories, Categories, Tags)

```typescript
// src/bounded-contexts/content/domain/entities/story.entity.ts
import { BaseEntity } from '../../../../shared-kernel/domain/base-entity'
import { StoryMetadata } from '../value-objects/story-metadata.vo'

export class Story extends BaseEntity {
  title: string
  content: string
  metadata: StoryMetadata
  authorId: string  // ✅ Reference by ID only, not object!
  
  // ✅ Domain methods (business logic)
  publish(): void {
    if (!this.canPublish()) {
      throw new Error('Story cannot be published')
    }
    this.metadata.publish()
  }

  private canPublish(): boolean {
    return this.title.length > 0 && this.content.length > 100
  }
}
```

```typescript
// src/bounded-contexts/content/domain/repositories/story.repository.interface.ts
import { IRepository } from '../../../../shared-kernel/domain/repository.interface'
import { Story } from '../entities/story.entity'

export interface IStoryRepository extends IRepository<Story> {
  findByAuthorId(authorId: string): Promise<Story[]>
  findByStatus(status: string): Promise<Story[]>
  findPublished(): Promise<Story[]>
}

// ✅ Use token for DI
export const STORY_REPOSITORY = Symbol('IStoryRepository')
```

```typescript
// src/bounded-contexts/content/infrastructure/persistence/story.repository.impl.ts
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { IStoryRepository } from '../../domain/repositories/story.repository.interface'
import { Story } from '../../domain/entities/story.entity'
import { StorySchema } from './story.schema'

@Injectable()
export class StoryRepositoryImpl implements IStoryRepository {
  constructor(
    @InjectRepository(StorySchema)
    private readonly ormRepository: Repository<StorySchema>
  ) {}

  async findById(id: string): Promise<Story | null> {
    const schema = await this.ormRepository.findOne({ where: { id } })
    return schema ? this.toDomain(schema) : null
  }

  // ✅ Map between ORM schema and domain entity
  private toDomain(schema: StorySchema): Story {
    // Mapping logic
  }

  private toSchema(entity: Story): StorySchema {
    // Mapping logic
  }
}
```

#### 2.2 Create Application Services (Use Cases)

```typescript
// src/bounded-contexts/content/application/commands/create-story.command.ts
export class CreateStoryCommand {
  constructor(
    public readonly title: string,
    public readonly content: string,
    public readonly authorId: string,
    public readonly categoryId?: string,
    public readonly tagIds?: string[]
  ) {}
}
```

```typescript
// src/bounded-contexts/content/application/handlers/create-story.handler.ts
import { Injectable, Inject } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { STORY_REPOSITORY, IStoryRepository } from '../../domain/repositories/story.repository.interface'
import { Story } from '../../domain/entities/story.entity'
import { CreateStoryCommand } from '../commands/create-story.command'
import { StoryCreatedEvent } from '../../../../integration/events/story-created.event'

@Injectable()
export class CreateStoryHandler {
  constructor(
    @Inject(STORY_REPOSITORY)
    private readonly storyRepository: IStoryRepository,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(command: CreateStoryCommand): Promise<Story> {
    // ✅ Business logic in domain
    const story = new Story(command.title, command.content, command.authorId)
    
    // ✅ Persist
    const savedStory = await this.storyRepository.save(story)
    
    // ✅ Emit event for other contexts
    this.eventEmitter.emit(
      'story.created',
      new StoryCreatedEvent(savedStory.id, savedStory.authorId)
    )
    
    return savedStory
  }
}
```

---

### Phase 3: Implement Cross-Context Communication (Week 4)

Instead of direct imports, use **Domain Events** and **Facades**

#### 3.1 Domain Events for Async Communication

```typescript
// src/integration/events/attachment-uploaded.event.ts
export class AttachmentUploadedEvent extends DomainEvent {
  constructor(
    public readonly attachmentId: string,
    public readonly uploadedBy: string,
    public readonly fileUrl: string
  ) {
    super(attachmentId)
  }

  getEventName(): string {
    return 'attachment.uploaded'
  }
}
```

```typescript
// src/bounded-contexts/content/application/handlers/attachment-uploaded.handler.ts
import { Injectable, Inject } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { AttachmentUploadedEvent } from '../../../../integration/events/attachment-uploaded.event'
import { STORY_REPOSITORY, IStoryRepository } from '../../domain/repositories/story.repository.interface'

@Injectable()
export class AttachmentUploadedHandler {
  constructor(
    @Inject(STORY_REPOSITORY)
    private readonly storyRepository: IStoryRepository
  ) {}

  @OnEvent('attachment.uploaded')
  async handle(event: AttachmentUploadedEvent): Promise<void> {
    // ✅ React to events from Media context
    // Update story metadata, trigger notifications, etc.
    console.log(`Attachment ${event.attachmentId} uploaded by ${event.uploadedBy}`)
  }
}
```

#### 3.2 Facades for Sync Communication (Anti-Corruption Layer)

```typescript
// src/integration/facades/media.facade.ts
import { Injectable } from '@nestjs/common'

// ✅ Interface - doesn't know about internal implementation
export interface AttachmentInfo {
  id: string
  url: string
  mimeType: string
  size: number
}

@Injectable()
export class MediaFacade {
  // ✅ Simple, stable API for other contexts
  async getAttachmentInfo(id: string): Promise<AttachmentInfo> {
    // Internally calls Media context
    // But hides implementation details
  }

  async validateAttachmentAccess(attachmentId: string, userId: string): Promise<boolean> {
    // Business rule checking
  }
}
```

```typescript
// src/bounded-contexts/content/application/handlers/attach-media.handler.ts
import { Injectable } from '@nestjs/common'
import { MediaFacade } from '../../../../integration/facades/media.facade'

@Injectable()
export class AttachMediaHandler {
  constructor(
    private readonly mediaFacade: MediaFacade  // ✅ Use facade, not direct import!
  ) {}

  async execute(storyId: string, attachmentId: string, userId: string): Promise<void> {
    // ✅ Check attachment exists via facade
    const attachment = await this.mediaFacade.getAttachmentInfo(attachmentId)
    
    // ✅ Check access via facade
    const hasAccess = await this.mediaFacade.validateAttachmentAccess(attachmentId, userId)
    
    if (!hasAccess) {
      throw new Error('No access to attachment')
    }
    
    // Attach to story
    // ...
  }
}
```

---

## Benefits of DDD Architecture

### Before (Current)

```typescript
// ❌ Tight coupling
@Injectable()
export class StoriesService {
  constructor(
    private storyRepo: StoryRepository,
    @InjectRepository(Attachment) private attachmentRepo: Repository<Attachment>,
    @InjectRepository(Tag) private tagRepo: Repository<Tag>,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}
  
  // 700 lines of mixed concerns...
}
```

**Problems:**
- 4 different repositories injected
- Can't test Stories without Attachments, Tags, Users
- Changes in Attachment entity break Stories
- No clear business logic location

### After (DDD)

```typescript
// ✅ Clean separation
@Injectable()
export class CreateStoryHandler {
  constructor(
    @Inject(STORY_REPOSITORY) private storyRepo: IStoryRepository,
    private mediaFacade: MediaFacade,  // Abstraction!
    private eventEmitter: EventEmitter2
  ) {}
  
  async execute(command: CreateStoryCommand): Promise<Story> {
    const story = new Story(command.title, command.content)
    const saved = await this.storyRepo.save(story)
    
    this.eventEmitter.emit('story.created', new StoryCreatedEvent(saved.id))
    
    return saved
  }
}
```

**Benefits:**
- ✅ Single responsibility
- ✅ Easy to test (mock facade)
- ✅ Clear business logic
- ✅ Event-driven architecture
- ✅ Can split into microservices later

---

## Migration Strategy (Minimal Disruption)

### Option 1: Gradual Migration (Recommended)

**Week 1-2**: Create parallel structure
```
src/
├── stories/           # ⚠️ Keep existing
└── bounded-contexts/  # 🆕 Start here
    └── content/
```

**Week 3-4**: Migrate one context at a time
- Start with `Content` context (Stories, Categories, Tags)
- Keep old code, add deprecation warnings
- Update consumers gradually

**Week 5-6**: Migrate another context
- `Identity` context (Users, Auth, ACL)
- Then `Media` context (Attachments)

**Week 7**: Remove old code
- Delete deprecated modules
- Update documentation

### Option 2: Big Bang (Risky)

- Migrate everything in one PR
- High risk of bugs
- Team blocked for weeks
- **NOT RECOMMENDED**

---

## Quick Wins (Start Today)

### 1. Extract Shared Kernel

Create these immediately:

```bash
mkdir -p src/shared-kernel/{domain,application,infrastructure}
```

```typescript
// src/shared-kernel/domain/pagination.ts
export class Pagination {
  constructor(
    public readonly page: number = 1,
    public readonly limit: number = 20
  ) {}
  
  get offset(): number {
    return (this.page - 1) * this.limit
  }
}
```

### 2. Create Repository Interfaces

```typescript
// src/shared-kernel/domain/repository.interface.ts
export interface IRepository<T> {
  findById(id: string): Promise<T | null>
  save(entity: T): Promise<T>
  delete(id: string): Promise<void>
}
```

### 3. Use Dependency Injection Tokens

```typescript
// Instead of:
constructor(private storyRepository: StoryRepository) {}

// Use:
constructor(
  @Inject(STORY_REPOSITORY) 
  private storyRepository: IStoryRepository
) {}
```

### 4. Add Event Emitter

```bash
npm install @nestjs/event-emitter
```

```typescript
// app.module.ts
import { EventEmitterModule } from '@nestjs/event-emitter'

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    // ...
  ]
})
```

---

## Summary

### What to Do

1. **✅ Create Shared Kernel** - Extract common domain logic
2. **✅ Define Bounded Contexts** - Group related features
3. **✅ Use Repository Interfaces** - Abstract persistence
4. **✅ Implement Domain Events** - Decouple contexts
5. **✅ Create Facades** - Provide stable APIs
6. **✅ Move Business Logic to Domain** - Keep services thin

### What NOT to Do

1. **❌ Direct cross-module imports** - Use facades
2. **❌ Shared database repositories** - Each context owns its data
3. **❌ Anemic domain models** - Rich domain entities
4. **❌ God services** - Single responsibility
5. **❌ Tight coupling** - Loose coupling via events

### Next Steps

1. Review this document with your team
2. Decide on migration strategy (gradual vs big bang)
3. Start with Shared Kernel creation
4. Migrate one context as proof-of-concept
5. Measure improvements (test coverage, coupling metrics)
6. Continue migration iteratively

---

## Resources

- [Domain-Driven Design by Eric Evans](https://www.domainlanguage.com/ddd/)
- [Implementing DDD by Vaughn Vernon](https://www.oreilly.com/library/view/implementing-domain-driven-design/9780133039900/)
- [NestJS CQRS](https://docs.nestjs.com/recipes/cqrs)
- [NestJS Event Emitter](https://docs.nestjs.com/techniques/events)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
