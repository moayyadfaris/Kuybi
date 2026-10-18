import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AclModule } from '@modules/acl'

import { CacheService } from '@core/cache/services/cache.service'

import { CategoriesController } from './controllers/categories.controller'
import { Category } from './entities/category.entity'
import { CategoryRepository } from './repositories/category.repository'
import { CategoriesSeeder } from './seeders/categories.seeder'
import { CategoriesService } from './services/categories.service'

@Module({
  imports: [TypeOrmModule.forFeature([Category]), AclModule],
  controllers: [CategoriesController],
  providers: [CategoriesService, CategoryRepository, CacheService, CategoriesSeeder],
  exports: [CategoriesService, CategoryRepository]
})
export class CategoriesModule {}
