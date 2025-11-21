import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TagsService } from './services/tags.service'
import { TagsController } from './controllers/tags.controller'
import { Tag } from './entities/tag.entity'
import { TagRepository } from '@core/database/repositories/tag.repository'
import { CacheConfigModule } from '@core/cache/cache.module'
import { AclModule } from '../acl/acl.module'

import { TagsSeeder } from './seeders/tags.seeder'
import { UsersModule } from '@modules/users/users.module'


@Module({
  imports: [TypeOrmModule.forFeature([Tag]), CacheConfigModule, AclModule, UsersModule],
  controllers: [TagsController],
  providers: [TagsService, TagRepository, TagsSeeder],
  exports: [TagsService, TagRepository]
})


export class TagsModule { }
