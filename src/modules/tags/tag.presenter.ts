import { Tag } from './entities/tag.entity'

/** A tag as the API returns it (tags are public): who created or changed it stays internal */
export const presentTag = (tag: Tag) => ({
  id: tag.id,
  name: tag.name,
  color: tag.color ?? null,
  sortOrder: tag.sortOrder,
  isSystem: tag.isSystem,
  metadata: tag.metadata ?? null,
  createdAt: tag.createdAt,
  updatedAt: tag.updatedAt
})

export type PresentedTag = ReturnType<typeof presentTag>
