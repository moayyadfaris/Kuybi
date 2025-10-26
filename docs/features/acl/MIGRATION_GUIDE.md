# ACL Migration Guide

## Overview

This guide helps you integrate the ACL system into your existing controllers and services.

## Step-by-Step Migration

### 1. Update Controller Imports

**Before:**
```typescript
import { Controller, Get, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'

@Controller('api/v1/stories')
@UseGuards(JwtAuthGuard)
export class StoriesController {
  // ...
}
```

**After:**
```typescript
import { Controller, Get, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { AbilityGuard, CheckAbility } from '../acl'
import { Action, Subject } from '../acl/types'

@Controller('api/v1/stories')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class StoriesController {
  // ...
}
```

### 2. Add Permission Decorators

**Before:**
```typescript
@Post()
async create(@Body() dto: CreateStoryDto) {
  return this.storiesService.create(dto)
}

@Put(':id')
async update(@Param('id') id: string, @Body() dto: UpdateStoryDto) {
  return this.storiesService.update(id, dto)
}
```

**After:**
```typescript
@Post()
@CheckAbility({ action: Action.Create, subject: Subject.Story })
async create(@Body() dto: CreateStoryDto) {
  return this.storiesService.create(dto)
}

@Put(':id')
@CheckAbility({ action: Action.Update, subject: Subject.Story })
async update(@Param('id') id: string, @Body() dto: UpdateStoryDto) {
  return this.storiesService.update(id, dto)
}
```

### 3. Add User Context to Services

**Before:**
```typescript
@Injectable()
export class StoriesService {
  async update(id: string, dto: UpdateStoryDto) {
    // Update without permission check
    return this.storyRepository.update(id, dto)
  }
}
```

**After:**
```typescript
import { ForbiddenException } from '@nestjs/common'
import { AbilityFactory } from '../acl'
import { Action } from '../acl/types'

@Injectable()
export class StoriesService {
  constructor(
    private storyRepository: StoryRepository,
    private abilityFactory: AbilityFactory
  ) {}

  async update(user: User, id: string, dto: UpdateStoryDto) {
    const story = await this.storyRepository.findById(id)
    const ability = await this.abilityFactory.createForUser(user)
    
    // Check permission with ownership
    if (ability.cannot(Action.Update, story)) {
      throw new ForbiddenException('You cannot update this story')
    }
    
    return this.storyRepository.update(id, dto)
  }
}
```

## Controller Migration Examples

### Stories Controller

```typescript
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { AbilityGuard, CheckAbility } from '../acl'
import { Action, Subject } from '../acl/types'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { User } from '../users/entities/user.entity'

@Controller('api/v1/stories')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class StoriesController {
  constructor(private storiesService: StoriesService) {}

  // Public endpoint - no permission needed
  @Get()
  async findAll(@Query() query: FindStoriesDto) {
    return this.storiesService.findAll(query)
  }

  // Public endpoint - no permission needed
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.storiesService.findOne(id)
  }

  // Requires create:Story permission
  @Post()
  @CheckAbility({ action: Action.Create, subject: Subject.Story })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateStoryDto
  ) {
    return this.storiesService.create(user, dto)
  }

  // Requires update:Story permission (ownership checked in service)
  @Put(':id')
  @CheckAbility({ action: Action.Update, subject: Subject.Story })
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateStoryDto
  ) {
    return this.storiesService.update(user, id, dto)
  }

  // Requires delete:Story OR manage:all
  @Delete(':id')
  @CheckAbility(
    { action: Action.Delete, subject: Subject.Story },
    { action: Action.Manage, subject: Subject.All }
  )
  async remove(
    @CurrentUser() user: User,
    @Param('id') id: string
  ) {
    return this.storiesService.remove(user, id)
  }

  // Requires publish:Story permission (moderator+)
  @Post(':id/publish')
  @CheckAbility({ action: Action.Publish, subject: Subject.Story })
  async publish(@Param('id') id: string) {
    return this.storiesService.publish(id)
  }

  // Requires moderate:Story permission (moderator+)
  @Post(':id/moderate')
  @CheckAbility({ action: Action.Moderate, subject: Subject.Story })
  async moderate(
    @Param('id') id: string,
    @Body() dto: ModerateStoryDto
  ) {
    return this.storiesService.moderate(id, dto)
  }
}
```

### Attachments Controller

```typescript
import { Controller, Get, Post, Delete, Param, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { AbilityGuard, CheckAbility } from '../acl'
import { Action, Subject } from '../acl/types'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { User } from '../users/entities/user.entity'

@Controller('api/v1/attachments')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class AttachmentsController {
  constructor(private attachmentsService: AttachmentsService) {}

  // Requires create:Attachment permission
  @Post()
  @CheckAbility({ action: Action.Create, subject: Subject.Attachment })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File
  ) {
    return this.attachmentsService.upload(user, file)
  }

  // Public endpoint - read attachment
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.attachmentsService.findOne(id)
  }

  // Requires delete:Attachment permission (ownership checked in service)
  @Delete(':id')
  @CheckAbility({ action: Action.Delete, subject: Subject.Attachment })
  async remove(
    @CurrentUser() user: User,
    @Param('id') id: string
  ) {
    return this.attachmentsService.remove(user, id)
  }
}
```

### Categories Controller

```typescript
import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { AbilityGuard, CheckAbility } from '../acl'
import { Action, Subject } from '../acl/types'

@Controller('api/v1/categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  // Public endpoint - no auth needed
  @Get()
  async findAll() {
    return this.categoriesService.findAll()
  }

  // Public endpoint - no auth needed
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id)
  }

  // Requires create:Category permission (admin only)
  @Post()
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Create, subject: Subject.Category })
  async create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto)
  }

  // Requires update:Category permission (admin only)
  @Put(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.Category })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto
  ) {
    return this.categoriesService.update(id, dto)
  }

  // Requires delete:Category permission (admin only)
  @Delete(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Delete, subject: Subject.Category })
  async remove(@Param('id') id: string) {
    return this.categoriesService.remove(id)
  }
}
```

## Service Migration Pattern

### Pattern 1: Simple Permission Check

```typescript
@Injectable()
export class StoryService {
  constructor(private abilityFactory: AbilityFactory) {}

  async delete(user: User, id: string): Promise<void> {
    const ability = await this.abilityFactory.createForUser(user)
    
    // Simple action check (no ownership)
    if (ability.cannot(Action.Delete, Subject.Story)) {
      throw new ForbiddenException('You cannot delete stories')
    }
    
    await this.storyRepository.delete(id)
  }
}
```

### Pattern 2: Ownership Check

```typescript
@Injectable()
export class StoryService {
  constructor(private abilityFactory: AbilityFactory) {}

  async update(user: User, id: string, dto: UpdateStoryDto): Promise<Story> {
    const story = await this.storyRepository.findById(id)
    
    if (!story) {
      throw new NotFoundException('Story not found')
    }
    
    const ability = await this.abilityFactory.createForUser(user)
    
    // Check with story instance (enables ownership check)
    if (ability.cannot(Action.Update, story)) {
      throw new ForbiddenException('You cannot update this story')
    }
    
    return this.storyRepository.update(id, dto)
  }
}
```

### Pattern 3: Conditional Logic

```typescript
@Injectable()
export class StoryService {
  constructor(private abilityFactory: AbilityFactory) {}

  async findAll(user: User | null, query: FindStoriesDto): Promise<Story[]> {
    let ability
    
    if (user) {
      ability = await this.abilityFactory.createForUser(user)
    } else {
      ability = await this.abilityFactory.createForGuest()
    }
    
    // Get all stories
    const stories = await this.storyRepository.findAll(query)
    
    // Filter based on user's read permissions
    return stories.filter(story => ability.can(Action.Read, story))
  }
}
```

## Checklist for Each Controller

- [ ] Import `AbilityGuard` and `CheckAbility`
- [ ] Import `Action` and `Subject` enums
- [ ] Add `AbilityGuard` to `@UseGuards()` decorator
- [ ] Add `@CheckAbility()` to protected endpoints
- [ ] Pass `@CurrentUser()` to service methods
- [ ] Update service methods to accept `User` parameter
- [ ] Add permission checks in service layer for ownership
- [ ] Test all endpoints with different roles

## Testing Your Migration

### 1. Unit Tests

```typescript
describe('StoriesController', () => {
  let controller: StoriesController
  let service: StoriesService
  let abilityFactory: AbilityFactory

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [StoriesController],
      providers: [
        StoriesService,
        AbilityFactory,
        // ... other providers
      ],
    }).compile()

    controller = module.get<StoriesController>(StoriesController)
    service = module.get<StoriesService>(StoriesService)
    abilityFactory = module.get<AbilityFactory>(AbilityFactory)
  })

  it('should allow admin to create story', async () => {
    const admin = createMockUser({ roles: ['admin'] })
    const dto = { title: 'Test', content: 'Content' }
    
    const result = await controller.create(admin, dto)
    
    expect(result).toBeDefined()
  })

  it('should deny guest from creating story', async () => {
    const guest = createMockUser({ roles: ['guest'] })
    const dto = { title: 'Test', content: 'Content' }
    
    await expect(controller.create(guest, dto)).rejects.toThrow(ForbiddenException)
  })
})
```

### 2. Integration Tests

```typescript
describe('Stories API (e2e)', () => {
  let app: INestApplication
  let adminToken: string
  let userToken: string

  beforeAll(async () => {
    // Setup test app
    // Create test users with roles
    // Get JWT tokens
  })

  it('/api/v1/stories (POST) - admin can create', () => {
    return request(app.getHttpServer())
      .post('/api/v1/stories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Test', content: 'Content' })
      .expect(201)
  })

  it('/api/v1/stories (POST) - guest cannot create', () => {
    return request(app.getHttpServer())
      .post('/api/v1/stories')
      .send({ title: 'Test', content: 'Content' })
      .expect(401)
  })

  it('/api/v1/stories/:id (PUT) - user can update own story', async () => {
    // Create story as user
    // Update own story
    // Should succeed
  })

  it('/api/v1/stories/:id (PUT) - user cannot update other story', async () => {
    // Create story as admin
    // Try to update as user
    // Should fail with 403
  })
})
```

## Common Migration Issues

### Issue 1: User not available in service

**Problem:**
```typescript
// Service doesn't have access to current user
async update(id: string, dto: UpdateStoryDto) { ... }
```

**Solution:**
```typescript
// Pass user from controller
async update(user: User, id: string, dto: UpdateStoryDto) {
  const ability = await this.abilityFactory.createForUser(user)
  // ... check permissions
}
```

### Issue 2: Guard not enforcing permissions

**Problem:**
Guards added but permissions not checked

**Solution:**
Ensure both guards are present and in correct order:
```typescript
@UseGuards(JwtAuthGuard, AbilityGuard) // Correct order
@CheckAbility({ action: Action.Create, subject: Subject.Story })
```

### Issue 3: Ownership check not working

**Problem:**
Permission check passes for stories owned by other users

**Solution:**
Use story instance, not string:
```typescript
// ❌ Wrong - no ownership check
ability.can(Action.Update, 'Story')

// ✅ Correct - ownership checked
ability.can(Action.Update, story)
```

## Rollout Strategy

### Phase 1: New Endpoints Only
- Implement ACL on all new endpoints
- Don't modify existing endpoints yet
- Build confidence with the system

### Phase 2: Non-Critical Endpoints
- Migrate read-only endpoints first
- Migrate admin-only endpoints
- Test thoroughly

### Phase 3: Critical Endpoints
- Migrate create/update/delete endpoints
- Extensive testing required
- Prepare rollback plan

### Phase 4: Cleanup
- Remove old authorization logic
- Update documentation
- Train team on new system

## Support

For issues or questions:
- See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
- See [README.md](./README.md)
- Check CASL documentation: https://casl.js.org/
