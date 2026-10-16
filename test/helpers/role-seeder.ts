import { DataSource } from 'typeorm'

import { Permission } from '@modules/acl/entities/permission.entity'
import { Role } from '@modules/acl/entities/role.entity'
import { RolePermission } from '@modules/acl/entities/role-permission.entity'
import { AclSeeder } from '@modules/acl/seeders/acl.seeder'

const DEFAULT_ROLES: Array<Pick<Role, 'name' | 'description' | 'priority'>> = [
  { name: 'super-admin', description: 'Super administrator', priority: 100 },
  { name: 'admin', description: 'Administrator', priority: 90 },
  { name: 'moderator', description: 'Moderator', priority: 70 },
  { name: 'user', description: 'Standard user', priority: 50 },
  { name: 'guest', description: 'Guest', priority: 10 }
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

/**
 * Seed roles AND their permissions using the production ACL seeder,
 * so authorization in tests matches a real deployment.
 */
export async function seedRolesWithPermissions(dataSource: DataSource): Promise<SeededRoles> {
  const seeder = new AclSeeder(
    dataSource.getRepository(Role),
    dataSource.getRepository(Permission),
    dataSource.getRepository(RolePermission)
  )
  await seeder.seed()

  const roles = await dataSource.getRepository(Role).find()
  return Object.fromEntries(roles.map(role => [role.name, role]))
}
