import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm'

export class CreateSecurityTables1762187700000 implements MigrationInterface {
  name = 'CreateSecurityTables1762187700000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create ENUM types
    await queryRunner.query(`
      CREATE TYPE alert_rule_type_enum AS ENUM ('threshold', 'pattern', 'anomaly', 'compliance');
    `)

    await queryRunner.query(`
      CREATE TYPE alert_severity_enum AS ENUM ('low', 'medium', 'high', 'critical');
    `)

    await queryRunner.query(`
      CREATE TYPE alert_status_enum AS ENUM ('active', 'inactive', 'draft');
    `)

    await queryRunner.query(`
      CREATE TYPE alert_instance_status_enum AS ENUM ('active', 'acknowledged', 'resolved', 'escalated', 'false_positive');
    `)

    await queryRunner.query(`
      CREATE TYPE alert_source_enum AS ENUM ('audit_log', 'system_metric', 'manual', 'integration');
    `)

    await queryRunner.query(`
      CREATE TYPE escalation_status_enum AS ENUM ('pending', 'sent', 'failed', 'acknowledged');
    `)

    await queryRunner.query(`
      CREATE TYPE notification_channel_enum AS ENUM ('email', 'sms', 'webhook', 'slack', 'pagerduty', 'teams');
    `)

    await queryRunner.query(`
      CREATE TYPE notification_status_enum AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');
    `)

    // Create alert_rules table
    await queryRunner.createTable(
      new Table({
        name: 'alert_rules',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()'
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
            isNullable: false
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true
          },
          {
            name: 'type',
            type: 'alert_rule_type_enum',
            isNullable: false
          },
          {
            name: 'severity',
            type: 'alert_severity_enum',
            default: "'medium'",
            isNullable: false
          },
          {
            name: 'status',
            type: 'alert_status_enum',
            default: "'active'",
            isNullable: false
          },
          {
            name: 'enabled',
            type: 'boolean',
            default: true,
            isNullable: false
          },
          {
            name: 'conditions',
            type: 'jsonb',
            isNullable: false
          },
          {
            name: 'actions',
            type: 'jsonb',
            isNullable: false
          },
          {
            name: 'cooldownMinutes',
            type: 'integer',
            default: 60,
            isNullable: false
          },
          {
            name: 'thresholdCount',
            type: 'integer',
            isNullable: true
          },
          {
            name: 'category',
            type: 'varchar',
            length: '100',
            isNullable: true
          },
          {
            name: 'tags',
            type: 'jsonb',
            isNullable: true
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true
          },
          {
            name: 'createdById',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'updatedById',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
            isNullable: false
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
            isNullable: false
          }
        ]
      }),
      true
    )

    // Create alerts table
    await queryRunner.createTable(
      new Table({
        name: 'alerts',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()'
          },
          {
            name: 'ruleId',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
            isNullable: false
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true
          },
          {
            name: 'severity',
            type: 'alert_severity_enum',
            isNullable: false
          },
          {
            name: 'status',
            type: 'alert_instance_status_enum',
            default: "'active'",
            isNullable: false
          },
          {
            name: 'source',
            type: 'alert_source_enum',
            default: "'audit_log'",
            isNullable: false
          },
          {
            name: 'relatedEntities',
            type: 'jsonb',
            isNullable: true
          },
          {
            name: 'assignedToId',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'acknowledgedAt',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'acknowledgedById',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'resolvedAt',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'resolvedById',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'lastEscalatedAt',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'triggerData',
            type: 'jsonb',
            isNullable: true
          },
          {
            name: 'context',
            type: 'jsonb',
            isNullable: true
          },
          {
            name: 'tags',
            type: 'jsonb',
            isNullable: true
          },
          {
            name: 'resolutionNotes',
            type: 'text',
            isNullable: true
          },
          {
            name: 'escalationCount',
            type: 'integer',
            default: 0,
            isNullable: false
          },
          {
            name: 'timeToAcknowledgeMinutes',
            type: 'integer',
            isNullable: true
          },
          {
            name: 'timeToResolveMinutes',
            type: 'integer',
            isNullable: true
          },
          {
            name: 'createdById',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
            isNullable: false
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
            isNullable: false
          }
        ]
      }),
      true
    )

    // Create alert_escalations table
    await queryRunner.createTable(
      new Table({
        name: 'alert_escalations',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()'
          },
          {
            name: 'alertId',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'level',
            type: 'integer',
            default: 1,
            isNullable: false
          },
          {
            name: 'channel',
            type: 'notification_channel_enum',
            isNullable: false
          },
          {
            name: 'recipients',
            type: 'jsonb',
            isNullable: false
          },
          {
            name: 'status',
            type: 'escalation_status_enum',
            default: "'pending'",
            isNullable: false
          },
          {
            name: 'delayMinutes',
            type: 'integer',
            default: 0,
            isNullable: false
          },
          {
            name: 'scheduledFor',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'sentAt',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'errorMessage',
            type: 'text',
            isNullable: true
          },
          {
            name: 'channelConfig',
            type: 'jsonb',
            isNullable: true
          },
          {
            name: 'acknowledgedById',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'acknowledgedAt',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
            isNullable: false
          }
        ]
      }),
      true
    )

    // Create alert_notifications table
    await queryRunner.createTable(
      new Table({
        name: 'alert_notifications',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()'
          },
          {
            name: 'alertId',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'escalationId',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'channel',
            type: 'notification_channel_enum',
            isNullable: false
          },
          {
            name: 'recipient',
            type: 'varchar',
            length: '500',
            isNullable: false
          },
          {
            name: 'status',
            type: 'notification_status_enum',
            default: "'pending'",
            isNullable: false
          },
          {
            name: 'messageId',
            type: 'varchar',
            length: '1000',
            isNullable: true
          },
          {
            name: 'sentAt',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'deliveredAt',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'readAt',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'errorMessage',
            type: 'text',
            isNullable: true
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true
          },
          {
            name: 'retryCount',
            type: 'integer',
            default: 0,
            isNullable: false
          },
          {
            name: 'nextRetryAt',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
            isNullable: false
          }
        ]
      }),
      true
    )

    // Create indexes for alert_rules
    await queryRunner.createIndex(
      'alert_rules',
      new TableIndex({
        name: 'IDX_alert_rules_type_severity',
        columnNames: ['type', 'severity']
      })
    )

    await queryRunner.createIndex(
      'alert_rules',
      new TableIndex({
        name: 'IDX_alert_rules_enabled_status',
        columnNames: ['enabled', 'status']
      })
    )

    // Create indexes for alerts
    await queryRunner.createIndex(
      'alerts',
      new TableIndex({
        name: 'IDX_alerts_status_severity_createdAt',
        columnNames: ['status', 'severity', 'createdAt']
      })
    )

    await queryRunner.createIndex(
      'alerts',
      new TableIndex({
        name: 'IDX_alerts_ruleId_createdAt',
        columnNames: ['ruleId', 'createdAt']
      })
    )

    await queryRunner.createIndex(
      'alerts',
      new TableIndex({
        name: 'IDX_alerts_assignedToId',
        columnNames: ['assignedToId']
      })
    )

    await queryRunner.createIndex(
      'alerts',
      new TableIndex({
        name: 'IDX_alerts_source',
        columnNames: ['source']
      })
    )

    // Create indexes for alert_escalations
    await queryRunner.createIndex(
      'alert_escalations',
      new TableIndex({
        name: 'IDX_alert_escalations_alertId',
        columnNames: ['alertId']
      })
    )

    await queryRunner.createIndex(
      'alert_escalations',
      new TableIndex({
        name: 'IDX_alert_escalations_status_scheduledFor',
        columnNames: ['status', 'scheduledFor']
      })
    )

    // Create indexes for alert_notifications
    await queryRunner.createIndex(
      'alert_notifications',
      new TableIndex({
        name: 'IDX_alert_notifications_alertId',
        columnNames: ['alertId']
      })
    )

    await queryRunner.createIndex(
      'alert_notifications',
      new TableIndex({
        name: 'IDX_alert_notifications_status_nextRetryAt',
        columnNames: ['status', 'nextRetryAt']
      })
    )

    // Create foreign keys for alert_rules
    await queryRunner.createForeignKey(
      'alert_rules',
      new TableForeignKey({
        name: 'FK_alert_rules_createdBy',
        columnNames: ['createdById'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )

    await queryRunner.createForeignKey(
      'alert_rules',
      new TableForeignKey({
        name: 'FK_alert_rules_updatedBy',
        columnNames: ['updatedById'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )

    // Create foreign keys for alerts
    await queryRunner.createForeignKey(
      'alerts',
      new TableForeignKey({
        name: 'FK_alerts_rule',
        columnNames: ['ruleId'],
        referencedTableName: 'alert_rules',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    )

    await queryRunner.createForeignKey(
      'alerts',
      new TableForeignKey({
        name: 'FK_alerts_assignedTo',
        columnNames: ['assignedToId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )

    await queryRunner.createForeignKey(
      'alerts',
      new TableForeignKey({
        name: 'FK_alerts_acknowledgedBy',
        columnNames: ['acknowledgedById'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )

    await queryRunner.createForeignKey(
      'alerts',
      new TableForeignKey({
        name: 'FK_alerts_resolvedBy',
        columnNames: ['resolvedById'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )

    await queryRunner.createForeignKey(
      'alerts',
      new TableForeignKey({
        name: 'FK_alerts_createdBy',
        columnNames: ['createdById'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )

    // Create foreign keys for alert_escalations
    await queryRunner.createForeignKey(
      'alert_escalations',
      new TableForeignKey({
        name: 'FK_alert_escalations_alert',
        columnNames: ['alertId'],
        referencedTableName: 'alerts',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    )

    await queryRunner.createForeignKey(
      'alert_escalations',
      new TableForeignKey({
        name: 'FK_alert_escalations_acknowledgedBy',
        columnNames: ['acknowledgedById'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )

    // Create foreign keys for alert_notifications
    await queryRunner.createForeignKey(
      'alert_notifications',
      new TableForeignKey({
        name: 'FK_alert_notifications_alert',
        columnNames: ['alertId'],
        referencedTableName: 'alerts',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    )

    await queryRunner.createForeignKey(
      'alert_notifications',
      new TableForeignKey({
        name: 'FK_alert_notifications_escalation',
        columnNames: ['escalationId'],
        referencedTableName: 'alert_escalations',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )

    console.log('✅ Created security monitoring tables with optimized indexes and foreign keys')
    console.log('✅ Created 8 ENUM types for alert system')
    console.log('📊 Tables created: alert_rules, alerts, alert_escalations, alert_notifications')
    console.log('🚀 Added performance indexes for common query patterns')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys in reverse order
    await queryRunner.dropForeignKey('alert_notifications', 'FK_alert_notifications_escalation')
    await queryRunner.dropForeignKey('alert_notifications', 'FK_alert_notifications_alert')
    await queryRunner.dropForeignKey('alert_escalations', 'FK_alert_escalations_acknowledgedBy')
    await queryRunner.dropForeignKey('alert_escalations', 'FK_alert_escalations_alert')
    await queryRunner.dropForeignKey('alerts', 'FK_alerts_createdBy')
    await queryRunner.dropForeignKey('alerts', 'FK_alerts_resolvedBy')
    await queryRunner.dropForeignKey('alerts', 'FK_alerts_acknowledgedBy')
    await queryRunner.dropForeignKey('alerts', 'FK_alerts_assignedTo')
    await queryRunner.dropForeignKey('alerts', 'FK_alerts_rule')
    await queryRunner.dropForeignKey('alert_rules', 'FK_alert_rules_updatedBy')
    await queryRunner.dropForeignKey('alert_rules', 'FK_alert_rules_createdBy')

    // Drop indexes
    await queryRunner.dropIndex('alert_notifications', 'IDX_alert_notifications_status_nextRetryAt')
    await queryRunner.dropIndex('alert_notifications', 'IDX_alert_notifications_alertId')
    await queryRunner.dropIndex('alert_escalations', 'IDX_alert_escalations_status_scheduledFor')
    await queryRunner.dropIndex('alert_escalations', 'IDX_alert_escalations_alertId')
    await queryRunner.dropIndex('alerts', 'IDX_alerts_source')
    await queryRunner.dropIndex('alerts', 'IDX_alerts_assignedToId')
    await queryRunner.dropIndex('alerts', 'IDX_alerts_ruleId_createdAt')
    await queryRunner.dropIndex('alerts', 'IDX_alerts_status_severity_createdAt')
    await queryRunner.dropIndex('alert_rules', 'IDX_alert_rules_enabled_status')
    await queryRunner.dropIndex('alert_rules', 'IDX_alert_rules_type_severity')

    // Drop tables
    await queryRunner.dropTable('alert_notifications', true)
    await queryRunner.dropTable('alert_escalations', true)
    await queryRunner.dropTable('alerts', true)
    await queryRunner.dropTable('alert_rules', true)

    // Drop ENUM types
    await queryRunner.query('DROP TYPE IF EXISTS notification_status_enum')
    await queryRunner.query('DROP TYPE IF EXISTS notification_channel_enum')
    await queryRunner.query('DROP TYPE IF EXISTS escalation_status_enum')
    await queryRunner.query('DROP TYPE IF EXISTS alert_source_enum')
    await queryRunner.query('DROP TYPE IF EXISTS alert_instance_status_enum')
    await queryRunner.query('DROP TYPE IF EXISTS alert_status_enum')
    await queryRunner.query('DROP TYPE IF EXISTS alert_severity_enum')
    await queryRunner.query('DROP TYPE IF EXISTS alert_rule_type_enum')

    console.log('✅ Dropped security monitoring tables, indexes, and ENUM types')
  }
}
