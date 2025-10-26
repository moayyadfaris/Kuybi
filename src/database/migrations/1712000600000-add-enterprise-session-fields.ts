import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm'

export class AddEnterpriseSessionFields1712000600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add enterprise fields to sessions table
    await queryRunner.addColumns('sessions', [
      new TableColumn({
        name: 'fingerprint',
        type: 'varchar',
        length: '200',
        isNullable: true,
        comment: 'Device fingerprint for multi-device tracking'
      }),
      new TableColumn({
        name: 'securityLevel',
        type: 'varchar',
        length: '20',
        default: "'low'",
        isNullable: false,
        comment: 'Security risk level: low, medium, high, critical'
      }),
      new TableColumn({
        name: 'sessionType',
        type: 'varchar',
        length: '30',
        default: "'standard'",
        isNullable: false,
        comment: 'Session type: standard, persistent, mobile, api, admin, suspicious, guest'
      }),
      new TableColumn({
        name: 'isActive',
        type: 'boolean',
        default: true,
        isNullable: false
      }),
      new TableColumn({
        name: 'metadata',
        type: 'jsonb',
        default: "'{}'",
        isNullable: false
      }),
      new TableColumn({
        name: 'deviceInfo',
        type: 'jsonb',
        isNullable: true
      }),
      new TableColumn({
        name: 'deletedAt',
        type: 'timestamptz',
        isNullable: true
      }),
      new TableColumn({
        name: 'createdBy',
        type: 'uuid',
        isNullable: true
      }),
      new TableColumn({
        name: 'updatedBy',
        type: 'uuid',
        isNullable: true
      }),
      new TableColumn({
        name: 'deletedBy',
        type: 'uuid',
        isNullable: true
      }),
      new TableColumn({
        name: 'version',
        type: 'integer',
        default: 1,
        isNullable: false
      })
    ])

    // Create composite indexes for common queries
    await queryRunner.createIndex(
      'sessions',
      new TableIndex({
        name: 'IDX_SESSIONS_USER_ACTIVE',
        columnNames: ['userId', 'isActive']
      })
    )

    await queryRunner.createIndex(
      'sessions',
      new TableIndex({
        name: 'IDX_SESSIONS_EXPIRES_ACTIVE',
        columnNames: ['expiresAt', 'isActive']
      })
    )

    await queryRunner.createIndex(
      'sessions',
      new TableIndex({
        name: 'IDX_SESSIONS_SECURITY_LEVEL',
        columnNames: ['securityLevel']
      })
    )

    await queryRunner.createIndex(
      'sessions',
      new TableIndex({
        name: 'IDX_SESSIONS_TYPE',
        columnNames: ['sessionType']
      })
    )

    await queryRunner.createIndex(
      'sessions',
      new TableIndex({
        name: 'IDX_SESSIONS_FINGERPRINT',
        columnNames: ['fingerprint']
      })
    )

    await queryRunner.createIndex(
      'sessions',
      new TableIndex({
        name: 'IDX_SESSIONS_DELETED_AT',
        columnNames: ['deletedAt']
      })
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('sessions', 'IDX_SESSIONS_DELETED_AT')
    await queryRunner.dropIndex('sessions', 'IDX_SESSIONS_FINGERPRINT')
    await queryRunner.dropIndex('sessions', 'IDX_SESSIONS_TYPE')
    await queryRunner.dropIndex('sessions', 'IDX_SESSIONS_SECURITY_LEVEL')
    await queryRunner.dropIndex('sessions', 'IDX_SESSIONS_EXPIRES_ACTIVE')
    await queryRunner.dropIndex('sessions', 'IDX_SESSIONS_USER_ACTIVE')

    // Drop columns
    await queryRunner.dropColumns('sessions', [
      'fingerprint',
      'securityLevel',
      'sessionType',
      'isActive',
      'metadata',
      'deviceInfo',
      'deletedAt',
      'createdBy',
      'updatedBy',
      'deletedBy',
      'version'
    ])
  }
}
