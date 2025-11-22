import { Controller, Get, HttpCode, HttpStatus, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'

import { SuperAdminGuard } from '@modules/acl/guards/super-admin.guard'
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard'

import {
  DetectSuspiciousActivityDto,
  GetByActionDto,
  GetByIpAddressDto,
  GetEntityHistoryDto,
  GetStatisticsDto,
  GetUserActivityDto,
  SearchAuditLogsDto
} from '../dto/audit-query.dto'
import { AuditAction } from '../entities/audit-log.entity'
import { AuditQueryService } from '../services/audit-query.service'

@ApiTags('Audit Logs')
@Controller('audit')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly auditQueryService: AuditQueryService) {}

  @Get('search')
  @ApiOperation({
    summary: 'Search audit logs',
    description: 'Advanced search with multiple filters and pagination. Admin only.'
  })
  @ApiResponse({ status: 200, description: 'Audit logs search results' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  @HttpCode(HttpStatus.OK)
  async searchLogs(@Query() dto: SearchAuditLogsDto) {
    const filters = {
      userId: dto.userId,
      action: dto.action,
      entityType: dto.entityType,
      entityId: dto.entityId,
      ipAddress: dto.ipAddress,
      severity: dto.severity,
      status: dto.status,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      isArchived: dto.isArchived
    }

    const pagination = {
      page: dto.page || 1,
      limit: dto.limit || 50
    }

    return this.auditQueryService.searchAuditLogs(filters, pagination)
  }

  @Get('statistics')
  @ApiOperation({
    summary: 'Get audit log statistics',
    description:
      'Aggregate statistics including action counts, severity breakdown, and success rates'
  })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  @HttpCode(HttpStatus.OK)
  async getStatistics(@Query() dto: GetStatisticsDto) {
    return this.auditQueryService.getStatistics(
      dto.startDate ? new Date(dto.startDate) : undefined,
      dto.endDate ? new Date(dto.endDate) : undefined
    )
  }

  @Get('critical-events')
  @ApiOperation({
    summary: 'Get critical security events',
    description: 'Retrieve high and critical severity events for security monitoring'
  })
  @ApiResponse({ status: 200, description: 'Critical events retrieved' })
  @HttpCode(HttpStatus.OK)
  async getCriticalEvents(@Query() dto: GetStatisticsDto) {
    return this.auditQueryService.getCriticalEvents(
      dto.startDate ? new Date(dto.startDate) : undefined,
      dto.endDate ? new Date(dto.endDate) : undefined
    )
  }

  @Get('failed-operations')
  @ApiOperation({
    summary: 'Get failed operations',
    description: 'Retrieve all failed operations for troubleshooting'
  })
  @ApiResponse({ status: 200, description: 'Failed operations retrieved' })
  @HttpCode(HttpStatus.OK)
  async getFailedOperations(@Query() dto: GetUserActivityDto) {
    return this.auditQueryService.getFailedOperations(
      dto.startDate ? new Date(dto.startDate) : undefined,
      dto.endDate ? new Date(dto.endDate) : undefined,
      dto.limit
    )
  }

  @Get('user/:userId/activity')
  @ApiOperation({
    summary: 'Get user activity summary',
    description: 'Comprehensive activity summary for a specific user including statistics'
  })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User activity retrieved' })
  @HttpCode(HttpStatus.OK)
  async getUserActivity(@Param('userId') userId: string, @Query() dto: GetUserActivityDto) {
    return this.auditQueryService.getUserActivity(
      userId,
      dto.startDate ? new Date(dto.startDate) : undefined,
      dto.endDate ? new Date(dto.endDate) : undefined,
      dto.limit
    )
  }

  @Get('user/:userId/suspicious-activity')
  @ApiOperation({
    summary: 'Detect suspicious user activity',
    description: 'Analyze user behavior patterns to detect potential security threats'
  })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Suspicious activity analysis complete' })
  @HttpCode(HttpStatus.OK)
  async detectSuspiciousActivity(
    @Param('userId') userId: string,
    @Query() dto: DetectSuspiciousActivityDto
  ) {
    return this.auditQueryService.detectSuspiciousActivity(userId, dto.timeWindowMinutes)
  }

  @Get('entity/:entityType/:entityId/history')
  @ApiOperation({
    summary: 'Get entity history',
    description: 'Complete audit trail for a specific entity showing all changes'
  })
  @ApiParam({ name: 'entityType', description: 'Entity type (e.g., Story, User)' })
  @ApiParam({ name: 'entityId', description: 'Entity ID' })
  @ApiResponse({ status: 200, description: 'Entity history retrieved' })
  @HttpCode(HttpStatus.OK)
  async getEntityHistory(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query() dto: GetEntityHistoryDto
  ) {
    return this.auditQueryService.getEntityHistory(entityType, entityId, dto.limit)
  }

  @Get('action/:action')
  @ApiOperation({
    summary: 'Get logs by action type',
    description: 'Retrieve all logs for a specific action type'
  })
  @ApiParam({ name: 'action', enum: AuditAction, description: 'Action type' })
  @ApiResponse({ status: 200, description: 'Logs by action retrieved' })
  @HttpCode(HttpStatus.OK)
  async getByAction(@Param('action') action: AuditAction, @Query() dto: GetByActionDto) {
    return this.auditQueryService.getByAction(action, dto.limit)
  }

  @Get('ip/:ipAddress')
  @ApiOperation({
    summary: 'Get logs by IP address',
    description: 'Security analysis: all actions from a specific IP address'
  })
  @ApiParam({ name: 'ipAddress', description: 'IP address (IPv4 or IPv6)' })
  @ApiResponse({ status: 200, description: 'Logs by IP retrieved' })
  @HttpCode(HttpStatus.OK)
  async getByIpAddress(@Param('ipAddress') ipAddress: string, @Query() dto: GetByIpAddressDto) {
    return this.auditQueryService.getByIpAddress(
      ipAddress,
      dto.startDate ? new Date(dto.startDate) : undefined,
      dto.endDate ? new Date(dto.endDate) : undefined
    )
  }

  @Get('request/:requestId')
  @ApiOperation({
    summary: 'Get logs by request ID',
    description: 'Distributed tracing: all logs for a specific request'
  })
  @ApiParam({ name: 'requestId', description: 'Request/Correlation ID' })
  @ApiResponse({ status: 200, description: 'Logs by request ID retrieved' })
  @HttpCode(HttpStatus.OK)
  async getByRequestId(@Param('requestId') requestId: string) {
    return this.auditQueryService.getByRequestId(requestId)
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get audit log by ID',
    description: 'Retrieve a single audit log entry with full details'
  })
  @ApiParam({ name: 'id', description: 'Audit log ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Audit log retrieved' })
  @ApiResponse({ status: 404, description: 'Audit log not found' })
  @HttpCode(HttpStatus.OK)
  async getById(@Param('id') id: string) {
    const log = await this.auditQueryService.getById(id)

    if (!log) {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Audit log not found'
      }
    }

    return log
  }
}
