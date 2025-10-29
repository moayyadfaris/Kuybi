import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { promises as fsPromises, createReadStream } from 'fs'
import * as path from 'path'

interface LoggingConfig {
  directories: { active: string; archive: string }
  rotation: { enabled: boolean; maxBytes: number; checkIntervalMinutes: number }
  retentionDays: number
  shipper: { enabled: boolean; endpoint?: string; apiKey?: string; flushOnRotateOnly?: boolean }
}

@Injectable()
export class LogMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly loggingConfig: LoggingConfig
  private intervalRef?: NodeJS.Timeout
  private readonly isTestEnv: boolean

  constructor(
    private readonly configService: ConfigService,
    @InjectPinoLogger(LogMaintenanceService.name)
    private readonly logger: PinoLogger
  ) {
    this.loggingConfig = this.configService.get<LoggingConfig>('logging', {
      directories: { active: './logs', archive: './logs/archive' },
      rotation: { enabled: true, maxBytes: 10 * 1024 * 1024, checkIntervalMinutes: 15 },
      retentionDays: 7,
      shipper: { enabled: false, flushOnRotateOnly: true }
    })
    this.isTestEnv = this.configService.get<string>('app.env', 'development') === 'test'
  }

  onModuleInit() {
    if (
      this.isTestEnv ||
      !this.loggingConfig.rotation.enabled ||
      this.loggingConfig.rotation.checkIntervalMinutes <= 0
    ) {
      return
    }

    const intervalMs = this.loggingConfig.rotation.checkIntervalMinutes * 60 * 1000
    this.intervalRef = setInterval(() => {
      this.rotateLargeFiles(false).catch(error =>
        this.logger.error({ error: error.message }, 'Failed to run scheduled log rotation')
      )
    }, intervalMs)
  }

  onModuleDestroy() {
    if (this.intervalRef) {
      clearInterval(this.intervalRef)
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async nightlyRotationAndCleanup() {
    if (this.isTestEnv || !this.loggingConfig.rotation.enabled) {
      return
    }

    await this.rotateLargeFiles(true)
    await this.cleanupArchives()
  }

  private async rotateLargeFiles(force: boolean) {
    const files = ['server.log', 'error.log']
    await fsPromises.mkdir(this.loggingConfig.directories.active, { recursive: true })
    await fsPromises.mkdir(this.loggingConfig.directories.archive, { recursive: true })

    for (const file of files) {
      const filePath = path.join(this.loggingConfig.directories.active, file)
      const stats = await this.safeStat(filePath)
      if (!stats) continue

      if (!force && stats.size < this.loggingConfig.rotation.maxBytes) {
        continue
      }

      const archiveName = `${path.parse(file).name}_${new Date().toISOString().replace(/[:.]/g, '-')}.log`
      const archivePath = path.join(this.loggingConfig.directories.archive, archiveName)

      await fsPromises.copyFile(filePath, archivePath)
      await fsPromises.truncate(filePath, 0)
      this.logger.info(
        { source: filePath, destination: archivePath, sizeBytes: stats.size },
        'Rotated log file'
      )

      if (this.loggingConfig.shipper.enabled && !this.loggingConfig.shipper.flushOnRotateOnly) {
        await this.shipArchive(archivePath)
      }
    }

    if (this.loggingConfig.shipper.enabled && this.loggingConfig.shipper.flushOnRotateOnly) {
      const recentArchives = await this.listArchives()
      const newest = recentArchives.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
      if (newest) {
        await this.shipArchive(newest.path)
      }
    }
  }

  private async cleanupArchives() {
    const cutoff = Date.now() - this.loggingConfig.retentionDays * 24 * 60 * 60 * 1000
    const archives = await this.listArchives()
    for (const archive of archives) {
      if (archive.mtimeMs < cutoff) {
        await fsPromises.unlink(archive.path)
        this.logger.debug({ archive: archive.path }, 'Deleted expired archive')
      }
    }
  }

  private async listArchives() {
    try {
      const entries = await fsPromises.readdir(this.loggingConfig.directories.archive)
      const result = []
      for (const entry of entries) {
        if (!entry.endsWith('.log')) continue
        const filePath = path.join(this.loggingConfig.directories.archive, entry)
        const stats = await this.safeStat(filePath)
        if (!stats) continue
        result.push({ path: filePath, mtimeMs: stats.mtimeMs })
      }
      return result
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(
          { error: (error as Error).message },
          'Failed to read log archive directory'
        )
      }
      return []
    }
  }

  private async shipArchive(filePath: string) {
    const { endpoint, apiKey } = this.loggingConfig.shipper
    if (!endpoint) {
      this.logger.warn('Log shipper is enabled but no endpoint is configured')
      return
    }

    try {
      const fetchFn = (globalThis as any).fetch
      if (typeof fetchFn !== 'function') {
        this.logger.warn(
          { endpoint },
          'Log shipper is enabled but fetch is unavailable in this runtime'
        )
        return
      }

      const stream = createReadStream(filePath)
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Log-Filename': path.basename(filePath),
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: stream as any
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Remote log shipper responded with ${response.status}: ${text}`)
      }

      this.logger.info({ filePath, endpoint }, 'Shipped log archive to remote sink')
    } catch (error) {
      this.logger.error({ filePath, error: (error as Error).message }, 'Failed to ship log archive')
    }
  }

  private async safeStat(filePath: string) {
    try {
      return await fsPromises.stat(filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(
          { filePath, error: (error as Error).message },
          'Failed to read log file stats'
        )
      }
      return null
    }
  }
}
