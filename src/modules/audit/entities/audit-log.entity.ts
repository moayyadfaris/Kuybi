import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm'

import { User } from '@modules/users/entities/user.entity'

export enum AuditAction {
  // Authentication
  LOGIN = 'login',
  LOGOUT = 'logout',
  LOGOUT_ALL = 'logout_all',
  REFRESH_TOKEN = 'refresh_token',
  CHANGE_PASSWORD = 'change_password',
  RESET_PASSWORD = 'reset_password',
  FORCE_PASSWORD_CHANGE = 'force_password_change',

  // User Management
  USER_CREATE = 'user_create',
  USER_UPDATE = 'user_update',
  USER_DELETE = 'user_delete',
  USER_RESTORE = 'user_restore',

  // CRUD Operations
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  RESTORE = 'restore',
  HARD_DELETE = 'hard_delete',

  // ACL Operations
  ROLE_ASSIGN = 'role_assign',
  ROLE_REVOKE = 'role_revoke',
  PERMISSION_GRANT = 'permission_grant',
  PERMISSION_REVOKE = 'permission_revoke',

  // File Operations
  FILE_UPLOAD = 'file_upload',
  FILE_DOWNLOAD = 'file_download',
  FILE_DELETE = 'file_delete',

  // Bulk Operations
  BULK_CREATE = 'bulk_create',
  BULK_UPDATE = 'bulk_update',
  BULK_DELETE = 'bulk_delete',

  // Export/Import
  EXPORT = 'export',
  IMPORT = 'import',

  // Admin Operations
  ADMIN_ACCESS = 'admin_access',
  SYSTEM_CONFIG_CHANGE = 'system_config_change',

  // Security Events
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  SECURITY_VIOLATION = 'security_violation'
}

export enum AuditSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum AuditStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
  PENDING = 'pending'
}

@Entity('audit_logs')
@Index(['userId', 'createdAt'])
@Index(['action', 'createdAt'])
@Index(['entityType', 'entityId'])
@Index(['ipAddress'])
@Index(['severity', 'createdAt'])
@Index(['status'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string

  // User Information
  @Column({ type: 'uuid', nullable: true })
  userId: string | null // Index via composite ['userId', 'createdAt'] at class level

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user?: User

  @Column({ type: 'varchar', length: 255, nullable: true })
  username: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null

  // Action Details
  @Column({
    type: 'enum',
    enum: AuditAction
  })
  action: AuditAction

  @Column({ type: 'varchar', length: 100, nullable: true })
  entityType: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  entityId: string | null

  // Changes Tracking (for updates)
  @Column({ type: 'jsonb', nullable: true })
  previousValues: Record<string, any> | null

  @Column({ type: 'jsonb', nullable: true })
  newValues: Record<string, any> | null

  @Column({ type: 'jsonb', nullable: true })
  changes: Record<string, any> | null

  // Request Context
  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null // Index defined at class level ['ipAddress']

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null

  @Column({ type: 'varchar', length: 20, nullable: true })
  method: string | null // HTTP method: GET, POST, PUT, DELETE

  @Column({ type: 'varchar', length: 500, nullable: true })
  endpoint: string | null // API endpoint

  @Column({ type: 'varchar', length: 100, nullable: true })
  requestId: string | null // Correlation ID

  // Result & Status
  @Column({
    type: 'enum',
    enum: AuditStatus,
    default: AuditStatus.SUCCESS
  })
  status: AuditStatus

  @Column({ type: 'int', nullable: true })
  statusCode: number | null // HTTP status code

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null

  @Column({ type: 'text', nullable: true })
  errorStack: string | null

  // Severity & Classification
  @Column({
    type: 'enum',
    enum: AuditSeverity,
    default: AuditSeverity.LOW
  })
  severity: AuditSeverity

  @Column({ type: 'jsonb', nullable: true })
  tags: string[] | null

  // Additional Metadata
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null

  @Column({ type: 'text', nullable: true })
  description: string | null

  // Compliance & Retention
  @Column({ type: 'int', default: 0 })
  retentionDays: number // 0 = keep forever, positive = delete after N days

  @Column({ type: 'boolean', default: false })
  isArchived: boolean

  @Column({ type: 'timestamp', nullable: true })
  archivedAt: Date | null

  // Timestamps
  @CreateDateColumn()
  createdAt: Date

  // Computed Properties
  get isError(): boolean {
    return this.status === AuditStatus.FAILURE
  }

  get isCritical(): boolean {
    return this.severity === AuditSeverity.CRITICAL || this.severity === AuditSeverity.HIGH
  }

  get shouldRetain(): boolean {
    if (this.retentionDays === 0) return true
    if (!this.createdAt) return true

    const retentionDate = new Date(this.createdAt)
    retentionDate.setDate(retentionDate.getDate() + this.retentionDays)

    return new Date() < retentionDate
  }
}
