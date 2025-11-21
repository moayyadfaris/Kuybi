import { Injectable, Logger } from '@nestjs/common'
import { TagRepository } from '@core/database/repositories/tag.repository'
import { UserRepository } from '@core/database/repositories/user.repository'

@Injectable()
export class TagsSeeder {
    private readonly logger = new Logger(TagsSeeder.name)

    constructor(
        private readonly tagRepository: TagRepository,
        private readonly userRepository: UserRepository
    ) { }

    async seed() {
        try {
            this.logger.log('Starting tags seeder...')

            const adminEmail = 'admin@kuybi.dev'
            const admin = await this.userRepository.findByEmail(adminEmail)

            if (!admin) {
                this.logger.warn('Admin user not found. Skipping tags seeding.')
                return
            }

            const tags = [
                { name: 'breaking-news', isSystem: true, sortOrder: 1, color: '#FF0000' },
                { name: 'featured', isSystem: true, sortOrder: 2, color: '#00FF00' },
                { name: 'trending', isSystem: true, sortOrder: 3, color: '#0000FF' },
                { name: 'editor-pick', isSystem: true, sortOrder: 4, color: '#FFFF00' },
                { name: 'exclusive', isSystem: false, sortOrder: 5, color: '#FF00FF' },
                { name: 'analysis', isSystem: false, sortOrder: 6, color: '#00FFFF' }
            ]

            for (const tagData of tags) {
                const existing = await this.tagRepository.findByName(tagData.name)

                if (existing) {
                    await this.tagRepository.update(existing.id, {
                        ...tagData,
                        updatedBy: admin.id
                    })
                    this.logger.debug(`Updated tag ${tagData.name}`)
                } else {
                    await this.tagRepository.create({
                        ...tagData,
                        createdBy: admin.id
                    })
                    this.logger.debug(`Inserted tag ${tagData.name}`)
                }
            }

            this.logger.log('Tags seed completed successfully')
        } catch (error) {
            this.logger.error('Failed to seed tags', error)
            throw error
        }
    }
}
