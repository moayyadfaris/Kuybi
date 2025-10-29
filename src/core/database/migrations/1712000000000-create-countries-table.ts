import { MigrationInterface, QueryRunner, Table } from 'typeorm'

export class CreateCountriesTable1712000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'countries',
        columns: [
          {
            name: 'id',
            type: 'serial',
            isPrimary: true
          },
          {
            name: 'iso',
            type: 'char',
            length: '2',
            isUnique: true,
            isNullable: false
          },
          {
            name: 'name',
            type: 'varchar',
            length: '80',
            isNullable: false
          },
          {
            name: 'nicename',
            type: 'varchar',
            length: '80',
            isNullable: false
          },
          {
            name: 'iso3',
            type: 'char',
            length: '3',
            isNullable: true
          },
          {
            name: 'numcode',
            type: 'integer',
            isNullable: true
          },
          {
            name: 'phonecode',
            type: 'integer',
            isNullable: true
          },
          {
            name: 'currencyCode',
            type: 'varchar',
            length: '3',
            isNullable: true
          },
          {
            name: 'currencyName',
            type: 'varchar',
            length: '50',
            isNullable: true
          },
          {
            name: 'currencySymbol',
            type: 'varchar',
            length: '5',
            isNullable: true
          },
          {
            name: 'timezone',
            type: 'varchar',
            length: '50',
            isNullable: true
          },
          {
            name: 'continent',
            type: 'varchar',
            length: '30',
            isNullable: true
          },
          {
            name: 'region',
            type: 'varchar',
            length: '50',
            isNullable: true
          },
          {
            name: 'capital',
            type: 'varchar',
            length: '80',
            isNullable: true
          },
          {
            name: 'latitude',
            type: 'decimal',
            precision: 10,
            scale: 8,
            isNullable: true
          },
          {
            name: 'longitude',
            type: 'decimal',
            precision: 11,
            scale: 8,
            isNullable: true
          },
          {
            name: 'population',
            type: 'bigint',
            isNullable: true
          },
          {
            name: 'area',
            type: 'decimal',
            precision: 12,
            scale: 2,
            isNullable: true
          },
          {
            name: 'languages',
            type: 'text',
            isNullable: true
          },
          {
            name: 'metadata',
            type: 'text',
            isNullable: true
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP'
          },
          {
            name: 'updatedAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP'
          }
        ]
      })
    )

    await queryRunner.query('CREATE INDEX idx_countries_currency ON countries ("currencyCode")')
    await queryRunner.query('CREATE INDEX idx_countries_continent ON countries (continent)')
    await queryRunner.query('CREATE INDEX idx_countries_region ON countries (region)')
    await queryRunner.query('CREATE INDEX idx_countries_active ON countries ("isActive")')
    await queryRunner.query(
      'CREATE INDEX idx_countries_coordinates ON countries (latitude, longitude)'
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_countries_coordinates')
    await queryRunner.query('DROP INDEX IF EXISTS idx_countries_active')
    await queryRunner.query('DROP INDEX IF EXISTS idx_countries_region')
    await queryRunner.query('DROP INDEX IF EXISTS idx_countries_continent')
    await queryRunner.query('DROP INDEX IF EXISTS idx_countries_currency')
    await queryRunner.dropTable('countries')
  }
}
