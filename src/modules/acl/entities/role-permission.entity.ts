import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm'

import { Permission } from './permission.entity'
import { Role } from './role.entity'

/**
 * Junction table for Role-Permission many-to-many relationship
 */
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
