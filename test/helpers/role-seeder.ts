import { DataSource } from 'typeorm'
import { Role } from '@modules/acl/entities/role.entity'

const DEFAULT_ROLES: Array<Pick<Role, 'name' | 'description' | 'priority'>> = [
  { name: 'super-admin', description: 'Super administrator', priority: 100 },
  { name: 'admin', description: 'Administrator', priority: 80 },
  { name: 'user', description: 'Standard user', priority: 10 }
]

export type SeededRoles = Record<string, Role>

/**
 * Ensure default roles exist for integration tests.
 * Returns a map keyed by role name for convenient lookup.
 */
export async function seedDefaultRoles(dataSource: DataSource): Promise<SeededRoles> {
  const roleRepository = dataSource.getRepository(Role)
  const roles: SeededRoles = {}

  for (const roleDef of DEFAULT_ROLES) {
    let role = await roleRepository.findOne({ where: { name: roleDef.name } })

    if (!role) {
      role = roleRepository.create({
        ...roleDef,
        isActive: true,
        isSystem: true
      })
      role = await roleRepository.save(role)
    }

    roles[roleDef.name] = role
  }

  return roles
}
