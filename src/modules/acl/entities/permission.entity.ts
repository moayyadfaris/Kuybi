import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

import { Action } from '../types/actions.enum'
import { Subject } from '../types/subjects.enum'

import { RolePermission } from './role-permission.entity'

/**
 * Permission entity for fine-grained access control
 * Defines what actions can be performed on which subjects
 */
@Entity({ name: 'permissions' })
export class Permission {
  @PrimaryGeneratedColumn('increment')
  id: number

  @Column({
    type: 'enum',
    enum: Action
  })
  action: Action

  @Column({
    type: 'enum',
    enum: Subject
  })
  subject: Subject

  @Column({ type: 'jsonb', nullable: true })
  conditions?: Record<string, unknown> // e.g., { userId: '${userId}' } for ownership

  @Column({ type: 'simple-array', nullable: true })
  /**
   * Fields the rule is limited to. Stored and passed to CASL, but no route checks access
   * per field yet: a field-limited permission grants the whole subject.
   */
  fields?: string[]

  @Column({ default: false })
  inverted: boolean // If true, represents a "cannot" instead of "can"

  @Column({ type: 'text', nullable: true })
  reason?: string // Why this permission exists (documentation)

  @OneToMany(() => RolePermission, rolePermission => rolePermission.permission)
  rolePermissions: RolePermission[]

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}
