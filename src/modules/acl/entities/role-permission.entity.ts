import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm'

import { Permission } from './permission.entity'
import { Role } from './role.entity'

/**
 * Junction table for Role-Permission many-to-many relationship
 */
// A permission is granted to a role once
@Index('UQ_ROLE_PERMISSIONS_ROLE_PERMISSION', ['roleId', 'permissionId'], { unique: true })
@Index('IDX_ROLE_PERMISSIONS_PERMISSION', ['permissionId'])
@Entity({ name: 'role_permissions' })
export class RolePermission {
  @PrimaryGeneratedColumn('increment')
  id: number

  @Column()
  roleId: number

  @Column()
  permissionId: number

  @ManyToOne(() => Role, role => role.rolePermissions, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'roleId' })
  role: Role

  @ManyToOne(() => Permission, permission => permission.rolePermissions, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'permissionId' })
  permission: Permission

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}
