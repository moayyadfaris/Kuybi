/**
 * Public API of the categories module. Other modules import only from here
 * (or from @modules/categories/entities); everything else is internal.
 */
export { CategoriesModule } from './categories.module'
export { CategoryRepository } from './repositories/category.repository'
export { CategoriesSeeder } from './seeders/categories.seeder'
