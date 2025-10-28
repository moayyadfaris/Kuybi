# PM2 Process Management Guide

## Overview

PM2 (Process Manager 2) is used to manage all Susanoo application processes including:
- **API Servers** - Multiple instances in cluster mode for load balancing
- **Bull Board Dashboard** - Queue monitoring UI
- **Background Workers** - Session cleanup, logs, email, attachments (future phases)

## Quick Start

### 1. Build the Application
```bash
npm run build
```

### 2. Create PM2 Log Directories
```bash
mkdir -p logs/pm2
```

### 3. Start All Processes
```bash
# Development environment
npm run pm2:start:dev

# Production environment
npm run pm2:start:prod

# Or using PM2 directly
pm2 start ecosystem.config.js --env production
```

### 4. Check Status
```bash
pm2 status
# or
npm run pm2:status
```

## PM2 Commands

### Process Management

```bash
# Start all processes
pm2 start ecosystem.config.js
npm run pm2:start

# Start with specific environment
pm2 start ecosystem.config.js --env development
pm2 start ecosystem.config.js --env production
npm run pm2:start:dev
npm run pm2:start:prod

# Start specific app only
pm2 start ecosystem.config.js --only susanoo-api
pm2 start ecosystem.config.js --only susanoo-dashboard

# Stop all processes
pm2 stop ecosystem.config.js
npm run pm2:stop

# Restart all processes (kills and restarts)
pm2 restart ecosystem.config.js
npm run pm2:restart

# Reload all processes (zero-downtime restart)
pm2 reload ecosystem.config.js
npm run pm2:reload

# Delete all processes
pm2 delete ecosystem.config.js
npm run pm2:delete

# Delete specific app
pm2 delete susanoo-api
pm2 delete susanoo-dashboard
```

### Monitoring

```bash
# View real-time process status
pm2 monit
npm run pm2:monit

# View process list
pm2 list
pm2 status
npm run pm2:status

# View logs (all processes)
pm2 logs
npm run pm2:logs

# View logs for specific process
pm2 logs susanoo-api
pm2 logs susanoo-dashboard

# Clear log files
pm2 flush
npm run pm2:flush

# Show process details
pm2 show susanoo-api
pm2 show susanoo-dashboard
```

### Scaling

```bash
# Scale API servers to 8 instances
pm2 scale susanoo-api 8

# Scale down to 2 instances
pm2 scale susanoo-api 2

# Scale to max CPU cores
pm2 scale susanoo-api max
```

### Auto-startup

```bash
# Generate startup script (run once per server)
pm2 startup

# Save current process list
pm2 save

# Resurrect previously saved processes
pm2 resurrect
```

## Process Configuration

### API Server (`susanoo-api`)

- **Instances**: 4 (configurable in ecosystem.config.js)
- **Mode**: Cluster (load balanced)
- **Port**: 4040
- **Memory Limit**: 500MB per instance
- **Auto-restart**: Yes
- **Logs**: `logs/pm2/api-error.log`, `logs/pm2/api-out.log`

**Environment Variables:**
- `APP_MODE=api` - Runs in API mode (no workers)
- See `ecosystem.config.js` for full list

### Dashboard (`susanoo-dashboard`)

- **Instances**: 1
- **Mode**: Fork
- **Port**: 4050
- **Memory Limit**: 200MB
- **Auto-restart**: Yes
- **Logs**: `logs/pm2/dashboard-error.log`, `logs/pm2/dashboard-out.log`

**Access:**
- URL: http://localhost:4050/admin/queues
- Username: `admin` (configure via `BULL_BOARD_USERNAME`)
- Password: `admin123` (configure via `BULL_BOARD_PASSWORD`)

### Queue Worker

- **Process Name:** `susanoo-worker`
- **Script:** `dist/worker.js`
- **Mode:** Fork (1 instance)
- **Purpose:** Runs BullMQ processors (SessionCleanupProcessor, etc.)
- **Logs:** `logs/pm2/worker-out.log`, `logs/pm2/worker-error.log`

Enable/disable the worker via `pm2 start ecosystem.config.js --only susanoo-worker`.

Future specialized workers (email, attachments, etc.) can be cloned from this base configuration when new processors land.

## Environment Variables

### Setting Environment Variables

**Option 1: Modify ecosystem.config.js**
```javascript
env: {
  NODE_ENV: 'production',
  APP_PORT: 4040,
  DB_HOST: 'your-db-host',
  // ... more variables
}
```

**Option 2: Use .env file** (create in project root)
```bash
# .env
NODE_ENV=production
APP_PORT=4040
DB_HOST=localhost
DB_PORT=5432
# ... more variables
```

**Option 3: PM2 environment file**
```bash
# Create .env.production
pm2 start ecosystem.config.js --env production --env-file .env.production
```

### Key Environment Variables

**Application:**
- `NODE_ENV` - Environment (development/staging/production)
- `APP_PORT` - API server port (default: 4040)
- `APP_MODE` - Application mode (api/worker)

**Database:**
- `DB_HOST` - PostgreSQL host
- `DB_PORT` - PostgreSQL port (default: 5432)
- `DB_USER` - Database username
- `DB_PASSWORD` - Database password
- `DB_NAME` - Database name

**Redis:**
- `REDIS_HOST` - Redis host (default: localhost)
- `REDIS_PORT` - Redis port (default: 6379)
- `REDIS_DB` - Cache database (default: 0)
- `REDIS_QUEUE_DB` - Queue database (default: 1)

**Authentication:**
- `JWT_SECRET` - JWT signing secret (CHANGE IN PRODUCTION!)
- `JWT_ACCESS_EXPIRES_IN` - Access token TTL (default: 1h)
- `JWT_REFRESH_EXPIRES_IN` - Refresh token TTL (default: 7d)

**Bull Board:**
- `BULL_BOARD_USERNAME` - Dashboard username (default: admin)
- `BULL_BOARD_PASSWORD` - Dashboard password (default: admin123)
- `BULL_BOARD_PORT` - Dashboard port (default: 4050)

**Logging:**
- `LOG_LEVEL` - Log level (debug/info/warn/error)
- `LOG_DIR` - Log directory (default: ./logs)
- `LOG_RETENTION_DAYS` - Days to keep logs (default: 30)

## Production Deployment

### Prerequisites

1. **Build the application:**
   ```bash
   npm install
   npm run build
   ```

2. **Create required directories:**
   ```bash
   mkdir -p logs/pm2
   mkdir -p logs/archive
   ```

3. **Configure environment variables:**
   Edit `ecosystem.config.js` or create `.env.production`

4. **Update security settings:**
   ```javascript
   // In ecosystem.config.js
   env: {
     JWT_SECRET: 'your-secure-random-secret-here',
     BULL_BOARD_PASSWORD: 'your-secure-dashboard-password',
   }
   ```

### Deployment Steps

1. **Start PM2 processes:**
   ```bash
   pm2 start ecosystem.config.js --env production
   ```

2. **Save PM2 process list:**
   ```bash
   pm2 save
   ```

3. **Configure auto-startup:**
   ```bash
   pm2 startup
   # Follow the instructions printed
   ```

4. **Verify processes:**
   ```bash
   pm2 status
   pm2 logs --lines 50
   ```

5. **Access services:**
   - API: http://your-domain:4040/api
   - API Docs: http://your-domain:4040/api/docs
   - Dashboard: http://your-domain:4050/admin/queues

### Zero-Downtime Deployments

```bash
# Pull latest code
git pull origin main

# Install dependencies
npm install

# Build application
npm run build

# Reload processes (zero-downtime)
pm2 reload ecosystem.config.js --env production

# Or use graceful reload
pm2 gracefulReload ecosystem.config.js
```

## Monitoring & Logging

### Real-time Monitoring

```bash
# Terminal-based monitoring
pm2 monit

# Show process metrics
pm2 show susanoo-api

# Web-based monitoring (install pm2-web)
npm install -g pm2-web
pm2-web
```

### Log Management

**View Logs:**
```bash
# All processes
pm2 logs

# Specific process
pm2 logs susanoo-api

# Last 100 lines
pm2 logs --lines 100

# Follow in real-time
pm2 logs --raw
```

**Log Files:**
- API: `logs/pm2/api-error.log`, `logs/pm2/api-out.log`
- Dashboard: `logs/pm2/dashboard-error.log`, `logs/pm2/dashboard-out.log`
- Application: `logs/server.log`, `logs/error.log`

**Clear Logs:**
```bash
pm2 flush  # Clear PM2 logs
```

### Health Checks

```bash
# API health
curl http://localhost:4040/api/health

# Dashboard health
curl http://localhost:4050/health

# Check all processes
pm2 list
```

### Performance Metrics

```bash
# CPU and memory usage
pm2 list

# Detailed metrics
pm2 show susanoo-api

# Reset restart counter
pm2 reset susanoo-api
```

## Troubleshooting

### Application Won't Start

**Issue:** Process crashes immediately

**Solutions:**
1. Check build output:
   ```bash
   npm run build
   ```

2. Verify environment variables:
   ```bash
   pm2 show susanoo-api
   ```

3. Check logs:
   ```bash
   pm2 logs susanoo-api --lines 50
   ```

4. Test application directly:
   ```bash
   node dist/main.js
   ```

### Memory Issues

**Issue:** Process memory exceeds limit

**Solutions:**
1. Check current memory:
   ```bash
   pm2 list
   ```

2. Increase memory limit in `ecosystem.config.js`:
   ```javascript
   max_memory_restart: '1G'
   ```

3. Check for memory leaks:
   ```bash
   pm2 monit
   ```

### Port Already in Use

**Issue:** `EADDRINUSE` error

**Solutions:**
1. Find process using port:
   ```bash
   lsof -i :4040
   ```

2. Kill the process:
   ```bash
   kill -9 <PID>
   ```

3. Or change port in ecosystem.config.js

### Cluster Mode Issues

**Issue:** Requests not load balanced

**Solutions:**
1. Verify cluster mode:
   ```bash
   pm2 show susanoo-api
   ```

2. Check instance count:
   ```bash
   pm2 list
   ```

3. Scale manually:
   ```bash
   pm2 scale susanoo-api 4
   ```

### Database Connection Errors

**Issue:** Can't connect to PostgreSQL/Redis

**Solutions:**
1. Verify services are running:
   ```bash
   # PostgreSQL
   brew services list | grep postgresql
   
   # Redis
   brew services list | grep redis
   ```

2. Check credentials in ecosystem.config.js

3. Test connection:
   ```bash
   psql -h localhost -U postgres -d susanoo
   redis-cli ping
   ```

## Best Practices

### Security

1. **Change default passwords:**
   - JWT_SECRET
   - BULL_BOARD_PASSWORD
   - Database passwords

2. **Use environment-specific configs:**
   ```bash
   pm2 start ecosystem.config.js --env production
   ```

3. **Restrict dashboard access:**
   - Use strong passwords
   - Enable firewall rules
   - Consider VPN/SSH tunnel

### Performance

1. **Scale based on CPU cores:**
   ```bash
   pm2 scale susanoo-api max
   ```

2. **Monitor memory usage:**
   ```bash
   pm2 monit
   ```

3. **Use reload instead of restart:**
   ```bash
   pm2 reload ecosystem.config.js  # Zero-downtime
   ```

4. **Enable cluster mode for API:**
   Already configured in ecosystem.config.js

### Reliability

1. **Enable auto-restart:**
   Already configured with `autorestart: true`

2. **Set memory limits:**
   Already configured with `max_memory_restart`

3. **Save process list:**
   ```bash
   pm2 save
   ```

4. **Configure startup script:**
   ```bash
   pm2 startup
   ```

### Logging

1. **Rotate logs regularly:**
   ```bash
   pm2 install pm2-logrotate
   pm2 set pm2-logrotate:max_size 10M
   pm2 set pm2-logrotate:retain 7
   ```

2. **Separate error logs:**
   Already configured per process

3. **Monitor log size:**
   ```bash
   du -sh logs/pm2/*
   ```

## PM2 Ecosystem

### Useful PM2 Modules

```bash
# Log rotation
pm2 install pm2-logrotate

# Server monitoring
pm2 install pm2-server-monit

# Auto-pull from Git
pm2 install pm2-auto-pull
```

### PM2 Plus (Optional)

For advanced monitoring and management:

1. Create account at https://pm2.io
2. Link PM2:
   ```bash
   pm2 link <secret> <public>
   ```

## Quick Reference

### Common Commands

| Command | Description |
|---------|-------------|
| `npm run pm2:start` | Start all processes |
| `npm run pm2:stop` | Stop all processes |
| `npm run pm2:restart` | Restart all processes |
| `npm run pm2:reload` | Zero-downtime reload |
| `npm run pm2:logs` | View logs |
| `npm run pm2:monit` | Monitor processes |
| `npm run pm2:status` | Show process list |
| `pm2 save` | Save process list |
| `pm2 resurrect` | Restore processes |

### Process Status

| Status | Meaning |
|--------|---------|
| `online` | Process running normally |
| `stopping` | Process is stopping |
| `stopped` | Process stopped |
| `errored` | Process crashed |
| `launching` | Process starting |

### Signals

| Signal | Action |
|--------|--------|
| `SIGINT` | Graceful shutdown |
| `SIGTERM` | Graceful shutdown |
| `SIGKILL` | Force kill |

---

**Documentation Version:** 1.0.0  
**Last Updated:** October 26, 2025  
**PM2 Version:** 6.0.13
