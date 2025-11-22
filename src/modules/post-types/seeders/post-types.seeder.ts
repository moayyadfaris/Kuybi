import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { UserRepository } from '@core/database/repositories/user.repository'

import { FieldDefinition } from '../entities/field-definition.entity'
import { PostType } from '../entities/post-type.entity'
import { FieldType } from '../enums/field-type.enum'

/**
 * Post Types Seeder - Create default post types with field definitions
 *
 * Creates two post types:
 * 1. Story (System) - Migrated from existing stories module
 * 2. Event (Custom) - Example custom post type
 *
 * Run this after migrations to set up initial post types.
 */
@Injectable()
export class PostTypesSeeder {
  private readonly logger = new Logger(PostTypesSeeder.name)

  constructor(
    @InjectRepository(PostType)
    private readonly postTypeRepository: Repository<PostType>,
    @InjectRepository(FieldDefinition)
    private readonly fieldDefinitionRepository: Repository<FieldDefinition>,
    private readonly userRepository: UserRepository
  ) {}

  /**
   * Run the seeder
   */
  async seed(): Promise<void> {
    this.logger.log('Starting post types seeder...')

    // Find super-admin user
    const admins = await this.userRepository.findByRole('super-admin')
    if (!admins || admins.length === 0) {
      this.logger.warn('No super-admin found. Skipping post types seeding.')
      return
    }
    const adminId = admins[0].id

    // Create Story post type (system type)
    const storyPostType = await this.createStoryPostType(adminId)
    if (storyPostType) {
      await this.createStoryFields(storyPostType.id, adminId)
      this.logger.log('Created Story post type with fields')
    }

    // Create Event post type (custom type)
    const eventPostType = await this.createEventPostType(adminId)
    if (eventPostType) {
      await this.createEventFields(eventPostType.id, adminId)
      this.logger.log('Created Event post type with fields')
    }

    this.logger.log('Post types seeder completed successfully')
  }

  /**
   * Create Story post type (system type)
   */
  /**
   * Create Story post type (system type)
   */
  private async createStoryPostType(adminId: string): Promise<PostType | null> {
    const existing = await this.postTypeRepository.findOne({
      where: { slug: 'story' }
    })

    if (existing) {
      this.logger.log('Story post type already exists, skipping...')
      return existing
    }

    const storyPostType = this.postTypeRepository.create({
      name: 'Story',
      slug: 'story',
      singularLabel: 'Story',
      pluralLabel: 'Stories',
      description: 'Traditional blog-style content with rich text editing',
      icon: 'book',
      menuIcon: 'book',
      menuPosition: 5,
      isHierarchical: false,
      supportsComments: false,
      supportsRevisions: true,
      showInRest: true,
      restBase: 'stories',
      capabilityType: 'story',
      isActive: true,
      isSystem: true, // System type - cannot be deleted
      settings: {
        supports: ['thumbnail', 'excerpt', 'author', 'custom-fields', 'tags', 'categories'],
        public: true,
        showInMenu: true,
        showInAdminBar: true,
        showInNavMenus: true,
        hasArchive: true,
        rewrite: {
          slug: 'stories',
          withFront: true,
          feeds: true,
          pages: true
        },
        queryVar: 'story'
      },
      createdBy: adminId,
      updatedBy: adminId
    })

    return await this.postTypeRepository.save(storyPostType)
  }

  /**
   * Create Story field definitions
   */
  /**
   * Create Story field definitions
   */
  private async createStoryFields(postTypeId: string, adminId: string): Promise<void> {
    const fields = [
      // Content field (WYSIWYG editor)
      {
        postTypeId,
        name: 'content',
        label: 'Content',
        fieldType: FieldType.WYSIWYG,
        description: 'Main story content with rich text formatting',
        defaultValue: '',
        isRequired: true,
        isSearchable: true,
        isFilterable: false,
        isSortable: false,
        isUnique: false,
        displayOrder: 1,
        validationRules: {
          minLength: 100,
          maxLength: 50000
        },
        fieldOptions: {
          toolbar: 'full',
          mediaUpload: true,
          height: 500
        },
        createdBy: adminId,
        updatedBy: adminId
      },
      // Excerpt field (short summary)
      {
        postTypeId,
        name: 'excerpt',
        label: 'Excerpt',
        fieldType: FieldType.TEXTAREA,
        description: 'Short summary or introduction (shown in listings)',
        defaultValue: '',
        isRequired: false,
        isSearchable: true,
        isFilterable: false,
        isSortable: false,
        isUnique: false,
        displayOrder: 2,
        validationRules: {
          maxLength: 500
        },
        fieldOptions: {
          rows: 4,
          placeholder: 'Write a brief summary...'
        },
        createdBy: adminId,
        updatedBy: adminId
      },
      // Featured toggle
      {
        postTypeId,
        name: 'featured',
        label: 'Featured',
        fieldType: FieldType.TOGGLE,
        description: 'Mark this story as featured (shown on homepage)',
        defaultValue: 'false', // Store as string
        isRequired: false,
        isSearchable: false,
        isFilterable: true,
        isSortable: true,
        isUnique: false,
        displayOrder: 3,
        validationRules: {},
        fieldOptions: {
          trueLabel: 'Featured',
          falseLabel: 'Not Featured'
        },
        createdBy: adminId,
        updatedBy: adminId
      }
    ]

    for (const fieldData of fields) {
      const existing = await this.fieldDefinitionRepository.findOne({
        where: { postTypeId, name: fieldData.name }
      })

      if (!existing) {
        const field = this.fieldDefinitionRepository.create(fieldData)
        await this.fieldDefinitionRepository.save(field)
      }
    }
  }

  /**
   * Create Event post type (custom type)
   */
  /**
   * Create Event post type (custom type)
   */
  private async createEventPostType(adminId: string): Promise<PostType | null> {
    const existing = await this.postTypeRepository.findOne({
      where: { slug: 'event' }
    })

    if (existing) {
      this.logger.log('Event post type already exists, skipping...')
      return existing
    }

    const eventPostType = this.postTypeRepository.create({
      name: 'Event',
      slug: 'event',
      singularLabel: 'Event',
      pluralLabel: 'Events',
      description: 'Calendar events with dates, locations, and attendance management',
      icon: 'calendar',
      menuIcon: 'calendar',
      menuPosition: 6,
      isHierarchical: false,
      supportsComments: true,
      supportsRevisions: true,
      showInRest: true,
      restBase: 'events',
      capabilityType: 'event',
      isActive: true,
      isSystem: false, // Custom type - can be modified/deleted
      settings: {
        supports: [
          'thumbnail',
          'excerpt',
          'author',
          'comments',
          'custom-fields',
          'tags',
          'categories'
        ],
        public: true,
        showInMenu: true,
        showInAdminBar: true,
        showInNavMenus: true,
        hasArchive: true,
        rewrite: {
          slug: 'events',
          withFront: true,
          feeds: true,
          pages: true
        },
        queryVar: 'event'
      },
      createdBy: adminId,
      updatedBy: adminId
    })

    return await this.postTypeRepository.save(eventPostType)
  }

  /**
   * Create Event field definitions
   */
  /**
   * Create Event field definitions
   */
  private async createEventFields(postTypeId: string, adminId: string): Promise<void> {
    const fields = [
      // Event date
      {
        postTypeId,
        name: 'event_date',
        label: 'Event Date',
        fieldType: FieldType.DATE,
        description: 'When the event takes place',
        defaultValue: null,
        isRequired: true,
        isSearchable: false,
        isFilterable: true,
        isSortable: true,
        isUnique: false,
        displayOrder: 1,
        validationRules: {
          min: new Date().toISOString().split('T')[0] // Cannot be in the past
        },
        fieldOptions: {
          format: 'YYYY-MM-DD',
          placeholder: 'Select event date'
        },
        createdBy: adminId,
        updatedBy: adminId
      },
      // Location
      {
        postTypeId,
        name: 'location',
        label: 'Location',
        fieldType: FieldType.TEXT,
        description: 'Event venue or location',
        defaultValue: '',
        isRequired: true,
        isSearchable: true,
        isFilterable: true,
        isSortable: true,
        isUnique: false,
        displayOrder: 2,
        validationRules: {
          minLength: 3,
          maxLength: 200
        },
        fieldOptions: {
          placeholder: 'Enter venue name or address'
        },
        createdBy: adminId,
        updatedBy: adminId
      },
      // Ticket price
      {
        postTypeId,
        name: 'price',
        label: 'Ticket Price',
        fieldType: FieldType.CURRENCY,
        description: 'Cost per ticket (0 for free events)',
        defaultValue: '0', // Store as string
        isRequired: true,
        isSearchable: false,
        isFilterable: true,
        isSortable: true,
        isUnique: false,
        displayOrder: 3,
        validationRules: {
          min: 0,
          max: 10000
        },
        fieldOptions: {
          currency: 'USD',
          decimals: 2,
          prefix: '$'
        },
        createdBy: adminId,
        updatedBy: adminId
      },
      // Max attendees
      {
        postTypeId,
        name: 'max_attendees',
        label: 'Maximum Attendees',
        fieldType: FieldType.NUMBER,
        description: 'Maximum number of people who can attend',
        defaultValue: '100', // Store as string
        isRequired: true,
        isSearchable: false,
        isFilterable: true,
        isSortable: true,
        isUnique: false,
        displayOrder: 4,
        validationRules: {
          min: 1,
          max: 10000
        },
        fieldOptions: {
          step: 1,
          placeholder: 'Enter capacity'
        },
        createdBy: adminId,
        updatedBy: adminId
      },
      // Event description
      {
        postTypeId,
        name: 'description',
        label: 'Description',
        fieldType: FieldType.WYSIWYG,
        description: 'Full event description with details',
        defaultValue: '',
        isRequired: true,
        isSearchable: true,
        isFilterable: false,
        isSortable: false,
        isUnique: false,
        displayOrder: 5,
        validationRules: {
          minLength: 50,
          maxLength: 10000
        },
        fieldOptions: {
          toolbar: 'basic',
          mediaUpload: true,
          height: 300
        },
        createdBy: adminId,
        updatedBy: adminId
      }
    ]

    for (const fieldData of fields) {
      const existing = await this.fieldDefinitionRepository.findOne({
        where: { postTypeId, name: fieldData.name }
      })

      if (!existing) {
        const field = this.fieldDefinitionRepository.create(fieldData)
        await this.fieldDefinitionRepository.save(field)
      }
    }
  }
}
