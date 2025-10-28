# PM2 Process Management Guide

This guide explains how to use PM2 to manage the Susanoo NestJS application in production.

## Prerequisites

```bash
# Install PM2 globally
npm install -g pm2

# Verify installation
pm2 --version
```

## Environment Configuration

All environment variables are loaded from the `.env` file. Make sure you have:

1. Created `.env` from `.env.example`:
   ```bash
   cp .env.example .env
   ```

2. Updated `.env` with your production values (secrets, database credentials, etc.)

3. **Never commit `.env` to version control!**

## Application Components

The ecosystem manages 3 main processes:

1. **susanoo-api** - Main API server (cluster mode, 4 instances)
2. **susanoo-worker** - Background job processor (1 instance)
3. **susanoo-dashboard** - Bull Board queue monitoring dashboard (1 instance)

## Quick Start

```bash
# Build the application
npm run build

# Start all processes
pm2 start ecosystem.config.js

# Start specific processes
pm2 start ecosystem.config.js --only api
pm2 start ecosystem.config.js --only worker
pm2 start ecosystem.config.js --only dashboard
```

## Common Commands

### Process Management

```bash
# View all processes
pm2 list
pm2 ls

# Monitor processes in real-time
pm2 monit

# View logs
pm2 logs                    # All processes
pm2 logs susanoo-api        # Specific process
pm2 logs --lines 100        # Last 100 lines

# Restart processes
pm2 restart all
pm2 restart susanoo-api
pm2 restart susanoo-worker

# Stop processes
pm2 stop all
pm2 stop susanoo-api

# Delete processes
pm2 delete all
pm2 delete susanoo-api
```

### Process Information

```bash
# Show process details
pm2 show susanoo-api

# Show process metrics
pm2 describe susanoo-api

# View environment variables
pm2 env 0  # Where 0 is the process ID
```

### Logs Management

```bash
# View logs
pm2 logs

# Flush logs
pm2 flush

# Reload logs
pm2 reloadLogs

# Log files location:
# - API: ./logs/pm2/api-error.log, ./logs/pm2/api-out.log
# - Worker: ./logs/pm2/worker-error.log, ./logs/pm2/worker-out.log
# - Dashboard: ./logs/pm2/dashboard-error.log, ./logs/pm2/dashboard-out.log
```

## Environment-Specific Deployment

```bash
# Development
pm2 start ecosystem.config.js --env development

# Staging
pm2 start ecosystem.config.js --env staging

# Production (default)
pm2 start ecosystem.config.js --env production
```

## Startup on Boot

```bash
# Generate startup script
pm2 startup

# Save current process list
pm2 save

# To remove startup script
pm2 unstartup
```

## Updating the Application

```bash
# Method 1: Graceful reload (zero downtime)
git pull
npm install
npm run build
pm2 reload all

# Method 2: Restart (brief downtime)
git pull
npm install
npm run build
pm2 restart all
```

## Scaling

```bash
# Scale API instances
pm2 scale susanoo-api 8  # Scale to 8 instances

# Scale to max CPU cores
pm2 scale susanoo-api max
```

## Health Checks

```bash
# API health
curl http://localhost:4040/api/health

# Dashboard health
curl http://localhost:4050/health

# Check if processes are running
pm2 list | grep online
```

## Troubleshooting

### Process Keeps Restarting

```bash
# Check error logs
pm2 logs susanoo-api --err --lines 50

# Check process details
pm2 describe susanoo-api

# Common issues:
# - Port already in use
# - Missing environment variables
# - Database connection failed
```

### High Memory Usage

```bash
# Check memory usage
pm2 monit

# The ecosystem.config.js has max_memory_restart configured:
# - API: 500MB per instance
# - Worker: 256MB
# - Dashboard: 200MB

# Adjust in ecosystem.config.js if needed
```

### Environment Variables Not Loading

```bash
# Verify .env file exists
ls -la .env

# Test dotenv loading
node -e "require('dotenv').config(); console.log(process.env.APP_PORT)"

# Check PM2 environment
pm2 env 0  # Replace 0 with your process ID
```

## Advanced Configuration

### Custom Log Rotation

Edit `ecosystem.config.js` to customize log rotation:

```javascript
{
  log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  merge_logs: true,
  max_memory_restart: '500M',
}
```

### Cluster Mode Configuration

The API runs in cluster mode for load balancing:

```javascript
{
  instances: 4,        // Number of instances
  exec_mode: 'cluster', // Enable load balancing
}
```

## Monitoring & Metrics

```bash
# Enable PM2 Plus (optional monitoring service)
pm2 register

# Web-based monitoring
pm2 web

# Generate process report
pm2 report
```

## Access Points

- **API Server**: http://localhost:4040/api
- **API Documentation**: http://localhost:4040/api/docs
- **Bull Board Dashboard**: http://localhost:4050/admin/queues
  - Username: admin
  - Password: (from BULL_BOARD_PASSWORD in .env)

## Best Practices

1. **Always build before starting**: `npm run build`
2. **Use reload for zero-downtime**: `pm2 reload` instead of `pm2 restart`
3. **Monitor logs regularly**: `pm2 logs`
4. **Save process list**: `pm2 save` after making changes
5. **Keep PM2 updated**: `npm install -g pm2@latest`
6. **Use environment-specific configs**: `--env production`
7. **Set up startup script**: `pm2 startup` on production servers

## Security Notes

- Never commit `.env` file
- Use strong passwords for BULL_BOARD_PASSWORD
- Change JWT_SECRET and JWT_REFRESH_SECRET in production
- Restrict Bull Board access (consider adding nginx proxy with auth)
- Use HTTPS in production
- Keep secrets in secure vault (AWS Secrets Manager, HashiCorp Vault, etc.)

## Support

For issues or questions:
- Check logs: `pm2 logs`
- View process details: `pm2 describe <app-name>`
- Consult PM2 documentation: https://pm2.keymetrics.io/docs/
