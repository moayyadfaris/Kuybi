import { Injectable } from '@nestjs/common'

import { Session } from '../entities/session.entity'

import { SessionsService } from './sessions.service'

export interface ListSessionsOptions {
  page: number
  limit: number
  includeExpired: boolean
  sortBy?: 'createdAt' | 'expiresAt' | 'ipAddress'
  sortOrder?: 'asc' | 'desc'
  filterByDevice?: string
  filterByStatus?: 'active' | 'expired' | 'expiring'
  includeRiskAssessment: boolean
  anonymizeData: boolean
}

/** Paginated, filtered view of a user's own sessions (GET /auth/sessions) */
@Injectable()
export class SessionListingService {
  constructor(private readonly sessionsService: SessionsService) {}

  async list(userId: string, options: ListSessionsOptions) {
    // Get sessions using SessionsService
    const allSessions = await this.sessionsService.getActiveSessions(userId, options.includeExpired)
    const normalizedSessions = allSessions.map(session => this.normalizeSessionDates(session))

    // Apply filters
    let filtered = normalizedSessions

    if (options.filterByDevice) {
      filtered = filtered.filter(
        s => s.deviceType?.toLowerCase() === options.filterByDevice?.toLowerCase()
      )
    }

    if (options.filterByStatus) {
      const now = Date.now()
      if (options.filterByStatus === 'active') {
        filtered = filtered.filter(s => s.expiresAt.getTime() > now && s.isActive)
      } else if (options.filterByStatus === 'expired') {
        filtered = filtered.filter(s => s.expiresAt.getTime() <= now || !s.isActive)
      } else if (options.filterByStatus === 'expiring') {
        const threshold = now + 24 * 60 * 60 * 1000
        filtered = filtered.filter(s => {
          const expiresTime = s.expiresAt.getTime()
          return expiresTime > now && expiresTime <= threshold
        })
      }
    }

    // Apply sorting
    if (options.sortBy) {
      const sortField = options.sortBy
      const sortOrder = options.sortOrder === 'asc' ? 1 : -1
      filtered.sort((a, b) => {
        const aVal = a[sortField]
        const bVal = b[sortField]
        if (aVal instanceof Date && bVal instanceof Date) {
          return (aVal.getTime() - bVal.getTime()) * sortOrder
        }
        return String(aVal).localeCompare(String(bVal)) * sortOrder
      })
    } else {
      filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    }

    // Apply pagination
    const total = filtered.length
    const start = options.page * options.limit
    const paginated = filtered.slice(start, start + options.limit)

    // Map to response format
    const now = Date.now()
    const mapped = await Promise.all(
      paginated.map(async session => {
        const isExpired = session.expiresAt.getTime() <= now
        let risk

        if (options.includeRiskAssessment) {
          try {
            const assessment = await this.sessionsService.assessSessionRisk(session.id)
            risk = { level: assessment.riskLevel, reason: assessment.factors.join(', ') }
          } catch {
            risk = this.evaluateSessionRisk(session, isExpired)
          }
        }

        return {
          id: session.id,
          deviceType: session.deviceType,
          userAgent: session.userAgent,
          ipAddress: options.anonymizeData
            ? this.anonymizeIp(session.ipAddress)
            : session.ipAddress,
          lastActivityAt: session.lastActivityAt,
          expiresAt: session.expiresAt,
          createdAt: session.createdAt,
          status: isExpired ? 'expired' : 'active',
          securityLevel: session.securityLevel,
          sessionType: session.sessionType,
          fingerprint: session.fingerprint,
          risk
        }
      })
    )

    return {
      total,
      page: options.page,
      limit: options.limit,
      sessions: mapped
    }
  }

  private normalizeSessionDates(session: Session): Session {
    session.createdAt = this.ensureDate(session.createdAt)
    session.updatedAt = this.ensureDate(session.updatedAt)
    session.lastActivityAt = this.ensureDate(session.lastActivityAt)
    session.expiresAt = this.ensureDate(session.expiresAt)
    session.deletedAt = session.deletedAt ? this.ensureDate(session.deletedAt) : undefined
    return session
  }

  private ensureDate(value?: Date | string | number | null): Date {
    if (value instanceof Date) {
      return value
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value)
      if (!Number.isNaN(parsed.getTime())) {
        return parsed
      }
    }

    return new Date(0)
  }

  private evaluateSessionRisk(session: Session, isExpired: boolean) {
    if (isExpired) {
      return { level: 'low', reason: 'Session already expired' }
    }

    const hoursUntilExpiry = (session.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)
    if (hoursUntilExpiry < 1) {
      return { level: 'high', reason: 'Session expires in under an hour' }
    }

    if (hoursUntilExpiry < 24) {
      return { level: 'medium', reason: 'Session expires within 24 hours' }
    }

    return { level: 'low', reason: 'Session appears healthy' }
  }

  private anonymizeIp(ip?: string | null) {
    if (!ip) return ip
    if (ip.includes(':')) {
      const parts = ip.split(':')
      return `${parts.slice(0, 4).join(':')}::` // basic IPv6 masking
    }
    const segments = ip.split('.')
    if (segments.length !== 4) return ip
    return `${segments[0]}.${segments[1]}.***.***`
  }
}
