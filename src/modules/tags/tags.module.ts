import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { UsersModule } from '@modules/users/users.module'

import { CacheConfigModule } from '@core/cache/cache.module'
import { TagRepository } from '@core/database/repositories/tag.repository'

import { AclModule } from '../acl/acl.module'

import { TagsController } from './controllers/tags.controller'
import { Tag } from './entities/tag.entity'
import { TagsSeeder } from './seeders/tags.seeder'
import { TagsService } from './services/tags.service'

@Module({
  imports: [TypeOrmModule.forFeature([Tag]), CacheConfigModule, AclModule, UsersModule],
  controllers: [TagsController],
  providers: [TagsService, TagRepository, TagsSeeder],
  exports: [TagsService, TagRepository]
})
export class TagsModule {}
