import { ApiProperty } from '@nestjs/swagger'

/**
 * Branch information
 */
export class BranchInfoDto {
  @ApiProperty({ description: 'Branch name' })
  name: string

  @ApiProperty({ description: 'Number of versions in this branch' })
  versionCount: number

  @ApiProperty({ description: 'Latest version number on this branch' })
  latestVersion: number

  @ApiProperty({ description: 'Latest version creation timestamp' })
  lastUpdated: Date

  @ApiProperty({ description: 'Whether this is the main branch' })
  isMain: boolean
}
