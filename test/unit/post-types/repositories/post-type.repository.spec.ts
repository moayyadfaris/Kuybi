import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { PostType } from '@modules/post-types/entities/post-type.entity'
import { PostTypeRepository } from '@modules/post-types/repositories/post-type.repository'

import { CacheService } from '@core/cache/services/cache.service'

describe('PostTypeRepository', () => {
  let repository: PostTypeRepository
  let typeOrmRepo: jest.Mocked<Repository<PostType>>
  let cacheService: jest.Mocked<CacheService>

  const mockPostType: Partial<PostType> = {
    id: 'pt-1',
    name: 'Event',
    slug: 'event',
    singularLabel: 'Event',
    pluralLabel: 'Events',
    description: 'Event post type',
    isActive: true,
    isSystem: false,
    supportsComments: true,
    supportsRevisions: true,
    showInRest: true,
    isHierarchical: false,
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1
  }

  beforeEach(async () => {
    const mockTypeOrmRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      softDelete: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn(),
        getOne: jest.fn()
      }))
    }

    const mockCacheService = {
      buildKey: jest.fn((...parts: unknown[]) => parts.join(':')),
      get: jest.fn(),
      set: jest.fn(),
      wrap: jest.fn((key: string, fn: () => Promise<unknown>, ttl?: number) => fn()),
      del: jest.fn(),
      reset: jest.fn()
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostTypeRepository,
        {
          provide: getRepositoryToken(PostType),
          useValue: mockTypeOrmRepo
        },
        {
          provide: CacheService,
          useValue: mockCacheService
        }
      ]
    }).compile()

    repository = module.get<PostTypeRepository>(PostTypeRepository)
    typeOrmRepo = module.get(getRepositoryToken(PostType))
    cacheService = module.get(CacheService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('findBySlug', () => {
    it('should return cached post type if available', async () => {
      const cacheKey = 'posttype:slug:event'
      cacheService.get.mockResolvedValue(mockPostType)

      const result = await repository.findBySlug('event')

      expect(cacheService.get).toHaveBeenCalledWith(cacheKey)
      expect(typeOrmRepo.findOne).not.toHaveBeenCalled()
      expect(result).toEqual(mockPostType)
    })

    it('should fetch from database and cache if not in cache', async () => {
      const cacheKey = 'posttype:slug:event'
      cacheService.get.mockResolvedValue(null)
      typeOrmRepo.findOne.mockResolvedValue(mockPostType as PostType)

      const result = await repository.findBySlug('event')

      expect(cacheService.get).toHaveBeenCalledWith(cacheKey)
      expect(typeOrmRepo.findOne).toHaveBeenCalledWith({
        where: { slug: 'event', deletedAt: null },
        relations: ['fieldDefinitions']
      })
      expect(cacheService.set).toHaveBeenCalledWith(cacheKey, mockPostType, 1800)
      expect(result).toEqual(mockPostType)
    })

    it('should return null if post type not found', async () => {
      cacheService.get.mockResolvedValue(null)
      typeOrmRepo.findOne.mockResolvedValue(null)

      const result = await repository.findBySlug('non-existent')

      expect(result).toBeNull()
      expect(cacheService.set).not.toHaveBeenCalled()
    })

    it('should bypass cache when option is set', async () => {
      typeOrmRepo.findOne.mockResolvedValue(mockPostType as PostType)

      const result = await repository.findBySlug('event', { bypassCache: true })

      expect(cacheService.get).not.toHaveBeenCalled()
      expect(typeOrmRepo.findOne).toHaveBeenCalled()
      expect(result).toEqual(mockPostType)
    })
  })

  describe('findActive', () => {
    const activePostTypes = [
      { ...mockPostType, id: 'pt-1', slug: 'event' },
      { ...mockPostType, id: 'pt-2', slug: 'story' }
    ]

    it('should return cached active post types if available', async () => {
      const cacheKey = 'posttype:list:active'
      cacheService.get.mockResolvedValue(activePostTypes)

      const result = await repository.findActive()

      expect(cacheService.get).toHaveBeenCalledWith(cacheKey)
      expect(typeOrmRepo.find).not.toHaveBeenCalled()
      expect(result).toEqual(activePostTypes)
    })

    it('should fetch from database and cache if not in cache', async () => {
      const cacheKey = 'posttype:list:active'
      cacheService.get.mockResolvedValue(null)
      typeOrmRepo.find.mockResolvedValue(activePostTypes as PostType[])

      const result = await repository.findActive()

      expect(cacheService.get).toHaveBeenCalledWith(cacheKey)
      expect(typeOrmRepo.find).toHaveBeenCalledWith({
        where: { isActive: true, deletedAt: null },
        order: { menuPosition: 'ASC', name: 'ASC' }
      })
      expect(cacheService.set).toHaveBeenCalledWith(cacheKey, activePostTypes, 1800)
      expect(result).toEqual(activePostTypes)
    })

    it('should return empty array if no active post types found', async () => {
      cacheService.get.mockResolvedValue(null)
      typeOrmRepo.find.mockResolvedValue([])

      const result = await repository.findActive()

      expect(result).toEqual([])
      expect(cacheService.set).toHaveBeenCalledWith('posttype:list:active', [], 1800)
    })
  })

  describe('findSystem', () => {
    const systemPostTypes = [{ ...mockPostType, id: 'pt-1', slug: 'story', isSystem: true }]

    it('should return system post types from cache', async () => {
      const cacheKey = 'posttype:list:system'
      cacheService.get.mockResolvedValue(systemPostTypes)

      const result = await repository.findSystem()

      expect(cacheService.get).toHaveBeenCalledWith(cacheKey)
      expect(result).toEqual(systemPostTypes)
    })

    it('should fetch system post types from database', async () => {
      cacheService.get.mockResolvedValue(null)
      typeOrmRepo.find.mockResolvedValue(systemPostTypes as PostType[])

      const result = await repository.findSystem()

      expect(typeOrmRepo.find).toHaveBeenCalledWith({
        where: { isSystem: true, deletedAt: null },
        order: { name: 'ASC' }
      })
      expect(cacheService.set).toHaveBeenCalledWith('posttype:list:system', systemPostTypes, 1800)
      expect(result).toEqual(systemPostTypes)
    })
  })

  describe('findByName', () => {
    it('should return post type by name from cache', async () => {
      const cacheKey = 'posttype:name:Event'
      cacheService.get.mockResolvedValue(mockPostType)

      const result = await repository.findByName('Event')

      expect(cacheService.get).toHaveBeenCalledWith(cacheKey)
      expect(result).toEqual(mockPostType)
    })

    it('should fetch by name from database if not cached', async () => {
      cacheService.get.mockResolvedValue(null)
      typeOrmRepo.findOne.mockResolvedValue(mockPostType as PostType)

      const result = await repository.findByName('Event')

      expect(typeOrmRepo.findOne).toHaveBeenCalledWith({
        where: { name: 'Event', deletedAt: null }
      })
      expect(cacheService.set).toHaveBeenCalledWith('posttype:name:Event', mockPostType, 1800)
      expect(result).toEqual(mockPostType)
    })
  })

  describe('slugExists', () => {
    it('should return true if slug exists', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockPostType)
      }
      typeOrmRepo.createQueryBuilder.mockReturnValue(qb as any)

      const result = await repository.slugExists('event')

      expect(result).toBe(true)
      expect(qb.where).toHaveBeenCalledWith('slug = :slug', { slug: 'event' })
      expect(qb.andWhere).toHaveBeenCalledWith('deletedAt IS NULL')
    })

    it('should return false if slug does not exist', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null)
      }
      typeOrmRepo.createQueryBuilder.mockReturnValue(qb as any)

      const result = await repository.slugExists('non-existent')

      expect(result).toBe(false)
    })

    it('should exclude specific ID when checking', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null)
      }
      typeOrmRepo.createQueryBuilder.mockReturnValue(qb as any)

      await repository.slugExists('event', 'pt-1')

      expect(qb.andWhere).toHaveBeenCalledWith('id != :excludeId', { excludeId: 'pt-1' })
    })
  })

  describe('nameExists', () => {
    it('should return true if name exists', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockPostType)
      }
      typeOrmRepo.createQueryBuilder.mockReturnValue(qb as any)

      const result = await repository.nameExists('Event')

      expect(result).toBe(true)
      expect(qb.where).toHaveBeenCalledWith('name = :name', { name: 'Event' })
    })

    it('should exclude specific ID when checking', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null)
      }
      typeOrmRepo.createQueryBuilder.mockReturnValue(qb as any)

      await repository.nameExists('Event', 'pt-1')

      expect(qb.andWhere).toHaveBeenCalledWith('id != :excludeId', { excludeId: 'pt-1' })
    })
  })

  describe('invalidateCache', () => {
    it('should delete specific post type caches', async () => {
      await repository.invalidateCache(mockPostType as PostType)

      expect(cacheService.del).toHaveBeenCalledWith('posttype:id:pt-1')
      expect(cacheService.del).toHaveBeenCalledWith('posttype:slug:event')
      expect(cacheService.del).toHaveBeenCalledWith('posttype:name:Event')
      expect(cacheService.del).toHaveBeenCalledTimes(6) // id, slug, name + 3 list caches
    })
  })

  describe('invalidateAllCaches', () => {
    it('should delete all post type related caches', async () => {
      await repository.invalidateAllCaches()

      expect(cacheService.del).toHaveBeenCalledWith('posttype:list:all')
      expect(cacheService.del).toHaveBeenCalledWith('posttype:list:active')
      expect(cacheService.del).toHaveBeenCalledWith('posttype:list:system')
      expect(cacheService.del).toHaveBeenCalledTimes(3)
    })
  })
})
