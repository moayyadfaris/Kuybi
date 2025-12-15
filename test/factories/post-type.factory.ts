import { PostType } from '@modules/post-types/entities/post-type.entity'

export class PostTypeFactory {
  private static counter = 0

  static create(overrides: Partial<PostType> = {}): Partial<PostType> {
    this.counter++
    const name = `Post Type ${this.counter}`
    const slug = `post-type-${this.counter}`

    return {
      name,
      slug,
      description: `Description for ${name}`,
      icon: 'file-text',
      singularLabel: 'Item',
      pluralLabel: 'Items',
      isActive: true,
      isSystem: false,
      supportsRevisions: true,
      supportsComments: true,
      showInRest: true,
      menuPosition: this.counter,
      ...overrides
    }
  }

  static createMany(count: number, overrides: Partial<PostType> = {}): Partial<PostType>[] {
    return Array.from({ length: count }, () => this.create(overrides))
  }

  static reset(): void {
    this.counter = 0
  }
}
