import { Injectable, Logger } from '@nestjs/common'

import { CategoryRepository } from '@core/database/repositories/category.repository'

@Injectable()
export class CategoriesSeeder {
  private readonly logger = new Logger(CategoriesSeeder.name)

  constructor(private readonly categoryRepository: CategoryRepository) {}

  async seed() {
    try {
      this.logger.log('Starting categories seeder...')

      const categories = [
        {
          name: 'Politics',
          slug: 'politics',
          description: 'Political news and updates',
          isActive: true
        },
        {
          name: 'Technology',
          slug: 'technology',
          description: 'Tech trends, gadgets, and software',
          isActive: true
        },
        {
          name: 'Sports',
          slug: 'sports',
          description: 'Sports news, scores, and highlights',
          isActive: true
        },
        {
          name: 'Entertainment',
          slug: 'entertainment',
          description: 'Movies, music, and celebrity news',
          isActive: true
        },
        {
          name: 'Health',
          slug: 'health',
          description: 'Health tips, medical news, and wellness',
          isActive: true
        },
        {
          name: 'Business',
          slug: 'business',
          description: 'Market analysis, finance, and economy',
          isActive: true
        }
      ]

      for (const categoryData of categories) {
        const existing = await this.categoryRepository.findBySlug(categoryData.slug)

        if (existing) {
          await this.categoryRepository.update(existing.id, categoryData)
          this.logger.debug(`Updated category ${categoryData.slug}`)
        } else {
          await this.categoryRepository.create(categoryData)
          this.logger.debug(`Inserted category ${categoryData.slug}`)
        }
      }

      this.logger.log('Categories seed completed successfully')
    } catch (error) {
      this.logger.error('Failed to seed categories', error)
      throw error
    }
  }
}
