import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TagsService } from './services/tags.service'
import { TagsController } from './controllers/tags.controller'
import { Tag } from './entities/tag.entity'
import { TagRepository } from '@core/database/repositories/tag.repository'
import { CacheConfigModule } from '@core/cache/cache.module'
import { AclModule } from '../acl/acl.module'

import { UserRepository } from '@core/database/repositories/user.repository'
import { TagsSeeder } from './seeders/tags.seeder'

import { User } from '../users/entities/user.entity'

@Module({
  imports: [TypeOrmModule.forFeature([Tag, User]), CacheConfigModule, AclModule],

  controllers: [TagsController],
  providers: [TagsService, TagRepository, UserRepository, TagsSeeder],
  exports: [TagsService, TagRepository]
})

export class TagsModule { }
