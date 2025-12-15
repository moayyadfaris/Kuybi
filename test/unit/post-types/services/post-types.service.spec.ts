import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { Connection } from 'typeorm'

import { PostType } from '@modules/post-types/entities/post-type.entity'
import { PostTypeRepository } from '@modules/post-types/repositories/post-type.repository'
import { PostTypesService } from '@modules/post-types/services/post-types.service'

import { CacheService } from '@core/cache/services/cache.service'

import { PostTypeFactory } from '../../../factories/post-type.factory'

describe('PostTypesService', () => {
  let service: PostTypesService
  let repository: jest.Mocked<PostTypeRepository>
  let _cacheService: jest.Mocked<CacheService>
  let _connection: jest.Mocked<Connection>

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findAll: jest.fn(),
      findActive: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      findBySlug: jest.fn(),
      findByName: jest.fn(),
      slugExists: jest.fn(),
      nameExists: jest.fn(),
      invalidateCache: jest.fn(),
      invalidateAllCaches: jest.fn(),
      softDelete: jest.fn()
    }

    const mockCacheService = {
      del: jest.fn(),
      reset: jest.fn()
    }

    const mockConnection = {
      transaction: jest.fn(async cb =>
        cb({
          getRepository: jest.fn().mockReturnValue({
            save: jest.fn(),
            softDelete: jest.fn()
          })
        })
      )
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostTypesService,
        {
          provide: PostTypeRepository,
          useValue: mockRepository
        },
        {
          provide: CacheService,
          useValue: mockCacheService
        },
        {
          provide: Connection,
          useValue: mockConnection
        }
      ]
    }).compile()

    service = module.get<PostTypesService>(PostTypesService)
    repository = module.get(PostTypeRepository)
    _cacheService = module.get(CacheService)
    _connection = module.get(Connection)
  })

  describe('create', () => {
    const createDto = {
      name: 'Test Type',
      slug: 'test-type',
      singularLabel: 'Test',
      pluralLabel: 'Tests',
      description: 'Test Description',
      icon: 'test-icon',
      menuPosition: 1,
      isActive: true,
      isSystem: false,
      supportsRevisions: true,
      supportsComments: true,
      showInRest: true
    }

    it('should create a post type successfully', async () => {
      repository.slugExists.mockResolvedValue(false)
      repository.nameExists.mockResolvedValue(false)
      const createdPostType = PostTypeFactory.create(createDto)
      repository.save.mockResolvedValue(createdPostType as PostType)

      const result = await service.create(createDto, 'user-id')

      expect(result).toEqual(createdPostType)
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: createDto.name,
          slug: createDto.slug,
          createdBy: 'user-id',
          isSystem: false
        })
      )
      expect(repository.invalidateAllCaches).toHaveBeenCalled()
    })

    it('should throw ConflictException if slug exists', async () => {
      repository.slugExists.mockResolvedValue(true)

      await expect(service.create(createDto, 'user-id')).rejects.toThrow(ConflictException)
    })

    it('should throw ConflictException if name exists', async () => {
      repository.slugExists.mockResolvedValue(false)
      repository.nameExists.mockResolvedValue(true)

      await expect(service.create(createDto, 'user-id')).rejects.toThrow(ConflictException)
    })
  })

  describe('findAll', () => {
    it('should return all post types', async () => {
      const postTypes = PostTypeFactory.createMany(2)
      repository.findActive.mockResolvedValue(postTypes as PostType[])

      const result = await service.findAll()

      expect(result).toEqual(postTypes)
      expect(repository.findActive).toHaveBeenCalled()
    })
  })

  describe('findOne', () => {
    it('should return a post type by id', async () => {
      const postType = PostTypeFactory.create({ id: 'test-id' })
      repository.findById.mockResolvedValue(postType as PostType)

      const result = await service.findOne('test-id')

      expect(result).toEqual(postType)
    })

    it('should throw NotFoundException if post type not found', async () => {
      repository.findById.mockResolvedValue(null)

      await expect(service.findOne('test-id')).rejects.toThrow(NotFoundException)
    })
  })

  describe('update', () => {
    const updateDto = { name: 'Updated Name' }
    const existingPostType = PostTypeFactory.create({ id: 'test-id', name: 'Old Name' })

    it('should update a post type successfully', async () => {
      repository.findById.mockResolvedValue({ ...existingPostType } as PostType)
      repository.nameExists.mockResolvedValue(false)
      repository.save.mockResolvedValue({ ...existingPostType, ...updateDto } as PostType)

      const result = await service.update('test-id', updateDto, 'user-id')

      expect(result.name).toBe(updateDto.name)
      expect(repository.invalidateCache).toHaveBeenCalled()
    })

    it('should throw NotFoundException if post type not found', async () => {
      repository.findById.mockResolvedValue(null)

      await expect(service.update('test-id', updateDto, 'user-id')).rejects.toThrow(
        NotFoundException
      )
    })

    it('should throw ConflictException if new name exists', async () => {
      repository.findById.mockResolvedValue({ ...existingPostType } as PostType)
      repository.nameExists.mockResolvedValue(true)

      await expect(service.update('test-id', updateDto, 'user-id')).rejects.toThrow(
        ConflictException
      )
      expect(repository.nameExists).toHaveBeenCalled()
    })
  })

  describe('remove', () => {
    it('should soft delete a post type', async () => {
      const postType = PostTypeFactory.create({ id: 'test-id', isSystem: false })
      repository.findById.mockResolvedValue(postType as PostType)
      const mockTypeOrmRepo = {
        softDelete: jest.fn()
      }
      // @ts-expect-error - Mocking TypeORM repository method
      repository.getRepository = jest.fn().mockReturnValue(mockTypeOrmRepo)

      await service.remove('test-id')

      expect(mockTypeOrmRepo.softDelete).toHaveBeenCalledWith('test-id')
      expect(repository.invalidateCache).toHaveBeenCalled()
    })

    it('should throw BadRequestException if trying to delete system post type', async () => {
      const postType = PostTypeFactory.create({ id: 'test-id', isSystem: true })
      repository.findById.mockResolvedValue(postType as PostType)

      await expect(service.remove('test-id')).rejects.toThrow(BadRequestException)
    })
  })
})
