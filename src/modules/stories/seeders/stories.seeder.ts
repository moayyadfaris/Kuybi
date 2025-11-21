import { Injectable, Logger } from '@nestjs/common'
import { StoryRepository } from '@core/database/repositories/story.repository'
import { UserRepository } from '@core/database/repositories/user.repository'
import { CategoryRepository } from '@core/database/repositories/category.repository'
import { TagRepository } from '@core/database/repositories/tag.repository'
import { CountryRepository } from '@core/database/repositories/country.repository'
import { StoryType, StoryStatus, StoryPriority } from '../entities/story.entity'

@Injectable()
export class StoriesSeeder {
    private readonly logger = new Logger(StoriesSeeder.name)

    constructor(
        private readonly storyRepository: StoryRepository,
        private readonly userRepository: UserRepository,
        private readonly categoryRepository: CategoryRepository,
        private readonly tagRepository: TagRepository,
        private readonly countryRepository: CountryRepository
    ) { }

    async seed() {
        try {
            this.logger.log('Starting stories seeder...')

            const adminEmail = 'admin@kuybi.dev'
            const admin = await this.userRepository.findByEmail(adminEmail)

            if (!admin) {
                this.logger.warn('Admin user not found. Skipping stories seeding.')
                return
            }

            // Get some dependencies
            const categories = await this.categoryRepository.findAllActive()
            const tags = await this.tagRepository.findAllActive()
            const country = await this.countryRepository.findByIso('US') // Default to US for example

            if (categories.length === 0) {
                this.logger.warn('No categories found. Skipping stories seeding.')
                return
            }

            const stories = [
                {
                    title: 'Welcome to Kuybi',
                    details: 'This is the first story on the platform. Kuybi is a powerful platform for sharing stories and news.',
                    type: StoryType.STORY,
                    status: StoryStatus.PUBLISHED,
                    priority: StoryPriority.HIGH,
                    userId: admin.id,
                    countryId: country?.id,
                    categories: [categories[0]],
                    tags: tags.slice(0, 2)
                },
                {
                    title: 'Tech Trends 2025',
                    details: 'A look into the future of technology. AI, Quantum Computing, and more.',
                    type: StoryType.REPORT,
                    status: StoryStatus.PUBLISHED,
                    priority: StoryPriority.NORMAL,
                    userId: admin.id,
                    countryId: country?.id,
                    categories: categories.filter(c => c.slug === 'technology'),
                    tags: tags.filter(t => t.name === 'technology' || t.name === 'featured')
                },
                {
                    title: 'Draft Story Example',
                    details: 'This is a draft story that is not yet published.',
                    type: StoryType.STORY,
                    status: StoryStatus.DRAFT,
                    priority: StoryPriority.LOW,
                    userId: admin.id,
                    countryId: country?.id,
                    categories: [categories[0]],
                    tags: []
                }
            ]

            for (const storyData of stories) {
                // Check if story with same title exists to avoid duplicates
                const existing = await this.storyRepository.getRepository().findOne({
                    where: { title: storyData.title }
                })

                if (existing) {
                    this.logger.debug(`Story "${storyData.title}" already exists`)
                } else {
                    await this.storyRepository.create(storyData)
                    this.logger.debug(`Inserted story "${storyData.title}"`)
                }
            }

            this.logger.log('Stories seed completed successfully')
        } catch (error) {
            this.logger.error('Failed to seed stories', error)
            throw error
        }
    }
}
