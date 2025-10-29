import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiOkResponse, ApiBearerAuth } from '@nestjs/swagger'
import { SessionCleanupService } from '../services'
import { JwtAuthGuard } from '../guards/jwt-auth.guard'

@ApiTags('admin/cleanup')
@Controller('v1/admin/cleanup')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CleanupStatsController {
  constructor(private readonly cleanupService: SessionCleanupService) {}

  /**
   * Get cleanup service statistics
   */
  @Get('stats')
  @ApiOperation({ summary: 'Get session cleanup statistics' })
  @ApiOkResponse({
    description: 'Returns cleanup job statistics',
    schema: {
      type: 'object',
      properties: {
        lastCleanupTime: { type: 'string', format: 'date-time', nullable: true },
        totalCleaned: { type: 'number' },
        isHealthy: { type: 'boolean' },
        nextScheduledRun: { type: 'string' },
        uptime: { type: 'string' }
      }
    }
  })
  getCleanupStats() {
    const stats = this.cleanupService.getCleanupStats()

    // Calculate next scheduled run (every hour at :00)
    const now = new Date()
    const nextRun = new Date(now)
    nextRun.setHours(now.getHours() + 1, 0, 0, 0)

    return {
      ...stats,
      nextScheduledRun: nextRun.toISOString(),
      uptime: stats.lastCleanupTime
        ? `${Math.round((Date.now() - stats.lastCleanupTime.getTime()) / 60000)} minutes ago`
        : 'Never run',
      schedule: {
        cleanup: 'Every hour at :00',
        monitoring: 'Every 30 minutes'
      }
    }
  }

  /**
   * Trigger manual cleanup
   */
  @Post('trigger')
  @ApiOperation({ summary: 'Manually trigger cleanup job' })
  @ApiOkResponse({
    description: 'Cleanup job triggered successfully',
    schema: {
      type: 'object',
      properties: {
        deleted: { type: 'number' },
        duration: { type: 'number' },
        timestamp: { type: 'string' }
      }
    }
  })
  async triggerCleanup(@Body() body?: { olderThanDays?: number }) {
    const result = await this.cleanupService.manualCleanup(body?.olderThanDays || 30)
    return {
      ...result,
      message: `Cleaned up ${result.deleted} sessions in ${result.duration}ms`
    }
  }
}
