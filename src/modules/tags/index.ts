/**
 * Public API of the tags module. Other modules import only from here
 * (or from @modules/tags/entities); everything else is internal.
 */
export { TagRepository } from './repositories/tag.repository'
export { TagsSeeder } from './seeders/tags.seeder'
export { TagsModule } from './tags.module'
