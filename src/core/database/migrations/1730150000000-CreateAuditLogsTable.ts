import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm'

/**
 * Migration: Create audit_logs table
 *
 * Purpose: Comprehensive audit logging for compliance, security, and troubleshooting.
 * Tracks all user actions, system events, and data changes with full context.
 *
 * Features:
 * - User action tracking (who, what, when, where)
 * - Data change history (before/after values)
 * - Request context (IP, user-agent, endpoint)
 * - Error tracking and status codes
 * - Severity levels for alerting
 * - Retention policies for GDPR compliance
 * - Performance-optimized indexes
 *
 * Compliance:
 * - GDPR Article 30 (Records of processing activities)
 * - SOC 2 (System monitoring and logging)
 * - ISO 27001 (Event logging)
 * - PCI DSS (Audit trail requirements)
 */
export class CreateAuditLogsTable1730150000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create ENUM types
    await queryRunner.query(`
      CREATE TYPE audit_action_enum AS ENUM (
        'login', 'logout', 'logout_all', 'refresh_token', 'change_password', 'reset_password', 'force_password_change',
        'user_create', 'user_update', 'user_delete', 'user_restore',
        'create', 'read', 'update', 'delete', 'restore', 'hard_delete',
        'role_assign', 'role_revoke', 'permission_grant', 'permission_revoke',
        'file_upload', 'file_download', 'file_delete',
        'bulk_create', 'bulk_update', 'bulk_delete',
        'export', 'import',
        'admin_access', 'system_config_change',
        'unauthorized_access', 'suspicious_activity', 'security_violation'
      )
    `)

    await queryRunner.query(`
      CREATE TYPE audit_severity_enum AS ENUM ('low', 'medium', 'high', 'critical')
    `)

    await queryRunner.query(`
      CREATE TYPE audit_status_enum AS ENUM ('success', 'failure', 'pending')
    `)

    // Create audit_logs table
    await queryRunner.createTable(
      new Table({
        name: 'audit_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()'
          },
          // User Information
          {
            name: 'userId',
            type: 'uuid',
            isNullable: true,
            comment: 'User who performed the action (null for system/anonymous)'
          },
          {
            name: 'username',
            type: 'varchar',
            length: '255',
            isNullable: true,
            comment: 'Denormalized username for reporting'
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isNullable: true,
            comment: 'Denormalized email for reporting'
          },
          // Action Details
          {
            name: 'action',
            type: 'audit_action_enum',
            comment: 'Type of action performed'
          },
          {
            name: 'entityType',
            type: 'varchar',
            length: '100',
            isNullable: true,
            comment: 'Type of entity affected (User, Story, etc.)'
          },
          {
            name: 'entityId',
            type: 'varchar',
            length: '255',
            isNullable: true,
            comment: 'ID of the affected entity'
          },
          // Changes Tracking
          {
            name: 'previousValues',
            type: 'jsonb',
            isNullable: true,
            comment: 'Previous state before update'
          },
          {
            name: 'newValues',
            type: 'jsonb',
            isNullable: true,
            comment: 'New state after update'
          },
          {
            name: 'changes',
            type: 'jsonb',
            isNullable: true,
            comment: 'Computed diff of changes'
          },
          // Request Context
          {
            name: 'ipAddress',
            type: 'varchar',
            length: '45',
            isNullable: true,
            comment: 'IP address of the request (IPv4/IPv6)'
          },
          {
            name: 'userAgent',
            type: 'varchar',
            length: '500',
            isNullable: true,
            comment: 'User agent string from request'
          },
          {
            name: 'method',
            type: 'varchar',
            length: '20',
            isNullable: true,
            comment: 'HTTP method (GET, POST, PUT, DELETE)'
          },
          {
            name: 'endpoint',
            type: 'varchar',
            length: '500',
            isNullable: true,
            comment: 'API endpoint called'
          },
          {
            name: 'requestId',
            type: 'varchar',
            length: '100',
            isNullable: true,
            comment: 'Request correlation ID for distributed tracing'
          },
          // Result & Status
          {
            name: 'status',
            type: 'audit_status_enum',
            default: "'success'",
            comment: 'Operation outcome'
          },
          {
            name: 'statusCode',
            type: 'int',
            isNullable: true,
            comment: 'HTTP status code'
          },
          {
            name: 'errorMessage',
            type: 'text',
            isNullable: true,
            comment: 'Error message if failed'
          },
          {
            name: 'errorStack',
            type: 'text',
            isNullable: true,
            comment: 'Error stack trace for debugging'
          },
          // Severity & Classification
          {
            name: 'severity',
            type: 'audit_severity_enum',
            default: "'low'",
            comment: 'Event severity for alerting'
          },
          {
            name: 'tags',
            type: 'jsonb',
            isNullable: true,
            comment: 'Array of tags for categorization'
          },
          // Additional Metadata
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
            comment: 'Additional context (device info, geo location, etc.)'
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
            comment: 'Human-readable description of the event'
          },
          // Compliance & Retention
          {
            name: 'retentionDays',
            type: 'int',
            default: 0,
            comment: 'Retention period in days (0 = keep forever)'
          },
          {
            name: 'isArchived',
            type: 'boolean',
            default: false,
            comment: 'Whether this log has been archived'
          },
          {
            name: 'archivedAt',
            type: 'timestamp',
            isNullable: true,
            comment: 'When the log was archived'
          },
          // Timestamps
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            comment: 'When the event occurred'
          }
        ]
      }),
      true
    )

    // Create foreign key to users table
    await queryRunner.createForeignKey(
      'audit_logs',
      new TableForeignKey({
        name: 'FK_audit_logs_user',
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'SET NULL' // Keep audit logs even if user is deleted
      })
    )

    // Create performance indexes
    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_userId_createdAt',
        columnNames: ['userId', 'createdAt']
      })
    )

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_action_createdAt',
        columnNames: ['action', 'createdAt']
      })
    )

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_entityType_entityId',
        columnNames: ['entityType', 'entityId']
      })
    )

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_ipAddress',
        columnNames: ['ipAddress']
      })
    )

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_severity_createdAt',
        columnNames: ['severity', 'createdAt']
      })
    )

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_status',
        columnNames: ['status']
      })
    )

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_requestId',
        columnNames: ['requestId']
      })
    )

    console.log('✅ Created audit_logs table with indexes and foreign keys')
    console.log('✅ Created ENUM types: audit_action_enum, audit_severity_enum, audit_status_enum')
    console.log('📊 Indexes optimized for:')
    console.log('   - User activity timelines')
    console.log('   - Action-based reporting')
    console.log('   - Entity history tracking')
    console.log('   - IP-based security monitoring')
    console.log('   - Severity-based alerting')
    console.log('   - Failed operation analysis')
    console.log('   - Distributed tracing')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop table (cascades indexes and foreign keys)
    await queryRunner.dropTable('audit_logs', true)

    // Drop ENUM types
    await queryRunner.query('DROP TYPE IF EXISTS audit_action_enum')
    await queryRunner.query('DROP TYPE IF EXISTS audit_severity_enum')
    await queryRunner.query('DROP TYPE IF EXISTS audit_status_enum')

    console.log('✅ Dropped audit_logs table and ENUM types')
  }
}
