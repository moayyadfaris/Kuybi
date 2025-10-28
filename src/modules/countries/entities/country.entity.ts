import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity({ name: 'countries' })
export class Country {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ type: 'char', length: 2, unique: true })
  iso: string

  @Column({ length: 80 })
  name: string

  @Column({ length: 80 })
  nicename: string

  @Column({ type: 'char', length: 3, nullable: true })
  iso3?: string

  @Column({ type: 'integer', nullable: true })
  numcode?: number

  @Column({ type: 'integer', nullable: true })
  phonecode?: number

  @Column({ default: true })
  isActive: boolean

  @Column({ length: 3, nullable: true })
  currencyCode?: string

  @Column({ length: 50, nullable: true })
  currencyName?: string

  @Column({ length: 5, nullable: true })
  currencySymbol?: string

  @Column({ length: 50, nullable: true })
  timezone?: string

  @Column({ length: 30, nullable: true })
  continent?: string

  @Column({ length: 50, nullable: true })
  region?: string

  @Column({ length: 80, nullable: true })
  capital?: string

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude?: number

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude?: number

  @Column({ type: 'bigint', nullable: true })
  population?: string

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  area?: number

  @Column({ type: 'text', nullable: true })
  languages?: string

  @Column({ type: 'text', nullable: true })
  metadata?: string

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date
}
