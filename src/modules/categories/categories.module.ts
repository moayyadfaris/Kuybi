import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CategoriesController } from './controllers/categories.controller'
import { CategoriesService } from './services/categories.service'
import { Category } from './entities/category.entity'
import { CategoryRepository } from '@core/database/repositories/category.repository'
import { CacheService } from '@core/cache/services/cache.service'
import { AclModule } from '../acl/acl.module'

@Module({
  imports: [TypeOrmModule.forFeature([Category]), AclModule],
  controllers: [CategoriesController],
  providers: [CategoriesService, CategoryRepository, CacheService],
  exports: [CategoriesService, CategoryRepository]
})
export class CategoriesModule {}
