import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Min } from 'class-validator'

/**
 * Optimistic locking for updates: the `version` the client last read. The update applies
 * only if the record still has it (409 VERSION_CONFLICT otherwise: someone else changed
 * it, reload). Without it, the version the server reads is used, so two concurrent
 * updates still cannot silently overwrite each other.
 */
export class ExpectedVersionDto {
  @ApiPropertyOptional({
    description: 'The version last read (409 if it changed since)',
    example: 3
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number
}
