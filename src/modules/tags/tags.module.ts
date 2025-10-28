import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TagsService } from './tags.service'
import { TagsController } from './tags.controller'
import { Tag } from './entities/tag.entity'
import { TagRepository } from '@core/database/repositories/tag.repository'
import { CacheConfigModule } from '@core/cache/cache.module'
import { AclModule } from '../acl/acl.module'

@Module({
  imports: [TypeOrmModule.forFeature([Tag]), CacheConfigModule, AclModule],
  controllers: [TagsController],
  providers: [TagsService, TagRepository],
  exports: [TagsService, TagRepository],
})
export class TagsModule {}
