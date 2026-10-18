import { Repository } from 'typeorm'

import { Role } from './entities/role.entity'

/** Role assigned to self-registered and admin-created users unless one is given. */
export const DEFAULT_ROLE_NAME = 'user'

/**
 * Resolve the default role's id by name. Role ids are assigned by the database at
 * seed time, so they must never be hardcoded.
 */
export async function findDefaultRoleId(roleRepository: Repository<Role>): Promise<number> {
  const role = await roleRepository.findOne({
    where: { name: DEFAULT_ROLE_NAME },
    select: { id: true }
  })
  if (!role) {
    throw new Error(
      `Default role '${DEFAULT_ROLE_NAME}' not found. Run the ACL seeder (npm run db:seed:acl).`
    )
  }
  return role.id
}
