# PM2 Setup - Complete Summary

## ✅ What's Been Configured

### 1. PM2 Ecosystem Configuration
**File:** `ecosystem.config.js`

Configured processes:
- ✅ **API Server** (susanoo-api)
  - 4 instances in cluster mode
  - Load balanced
  - Port: 4040
  - Memory limit: 500MB per instance
  
- ✅ **Bull Board Dashboard** (susanoo-dashboard)
  - 1 instance
  - Port: 4050
  - Memory limit: 200MB
  - Basic auth protected

- 🔄 **Background Workers** (commented, ready for Phase 2+)
  - Session cleanup worker
  - Log maintenance worker
  - Email worker
  - Attachment processing worker

### 2. NPM Scripts Added
**File:** `package.json`

```bash
npm run pm2:start         # Start all processes
npm run pm2:start:dev     # Start in development mode
npm run pm2:start:prod    # Start in production mode
npm run pm2:stop          # Stop all processes
npm run pm2:restart       # Restart all processes
npm run pm2:reload        # Zero-downtime reload
npm run pm2:delete        # Delete all processes
npm run pm2:logs          # View logs
npm run pm2:monit         # Monitor processes
npm run pm2:status        # Show status
npm run pm2:flush         # Clear logs
```

### 3. Helper Script
**File:** `pm2.sh`

Interactive script for managing PM2:
```bash
./pm2.sh start development    # Start in dev mode
./pm2.sh start production     # Start in prod mode
./pm2.sh stop                # Stop all processes
./pm2.sh restart             # Restart all
./pm2.sh reload              # Zero-downtime reload
./pm2.sh status              # Show status
./pm2.sh logs                # View all logs
./pm2.sh logs susanoo-api    # View API logs
./pm2.sh monitor             # Real-time monitoring
./pm2.sh save                # Save configuration
./pm2.sh startup             # Setup auto-startup
./pm2.sh help                # Show help
```

### 4. Documentation
**File:** `docs/deployment/PM2_GUIDE.md`

Comprehensive guide covering:
- Quick start
- All PM2 commands
- Process configuration
- Environment variables
- Production deployment
- Monitoring & logging
- Troubleshooting
- Best practices

### 5. Directory Structure
```
logs/
├── pm2/                    # PM2 process logs
│   ├── api-error.log
│   ├── api-out.log
│   ├── dashboard-error.log
│   └── dashboard-out.log
├── archive/                # Archived application logs
├── server.log             # Application logs
└── error.log              # Application errors
```

## 🚀 Quick Start Guide

### For Development

```bash
# 1. Build the application
npm run build

# 2. Start with PM2 (development mode)
npm run pm2:start:dev

# Or using the helper script
./pm2.sh start development

# 3. Check status
npm run pm2:status

# 4. View logs
npm run pm2:logs
```

### For Production

```bash
# 1. Build the application
npm run build

# 2. Update environment variables in ecosystem.config.js
# - JWT_SECRET
# - BULL_BOARD_PASSWORD
# - Database credentials
# - Redis credentials

# 3. Start with PM2 (production mode)
npm run pm2:start:prod

# Or using the helper script
./pm2.sh start production

# 4. Save PM2 configuration
pm2 save

# 5. Setup auto-startup (run once per server)
pm2 startup
# Follow the instructions printed
pm2 save

# 6. Verify everything is running
./pm2.sh status
```

## 📊 Access Points

Once PM2 is running, you can access:

| Service | URL | Credentials |
|---------|-----|-------------|
| API Server | http://localhost:4040/api | - |
| API Documentation | http://localhost:4040/api/docs | - |
| API Health | http://localhost:4040/api/health | - |
| Bull Board Dashboard | http://localhost:4050/admin/queues | admin / admin123 |
| Dashboard Health | http://localhost:4050/health | - |

## 🔧 Common Tasks

### Start/Stop Processes

```bash
# Start all processes
./pm2.sh start production

# Stop all processes
./pm2.sh stop

# Restart all processes (with downtime)
./pm2.sh restart

# Reload all processes (zero-downtime)
./pm2.sh reload
```

### Monitor Processes

```bash
# Real-time monitoring
./pm2.sh monitor

# Show status
./pm2.sh status

# View logs (all processes)
./pm2.sh logs

# View API logs only
./pm2.sh logs susanoo-api

# View dashboard logs only
./pm2.sh logs susanoo-dashboard
```

### Update Application

```bash
# 1. Pull latest code
git pull origin main

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Reload (zero-downtime)
./pm2.sh reload

# 5. Check status
./pm2.sh status
```

### Scale API Servers

```bash
# Scale to 8 instances
pm2 scale susanoo-api 8

# Scale to max CPU cores
pm2 scale susanoo-api max

# Scale down to 2 instances
pm2 scale susanoo-api 2
```

## ⚙️ Environment Configuration

### Critical Settings to Change in Production

Edit `ecosystem.config.js`:

```javascript
env: {
  // Security - CHANGE THESE!
  JWT_SECRET: 'your-secure-random-secret-here',
  BULL_BOARD_PASSWORD: 'your-secure-dashboard-password',
  
  // Database
  DB_HOST: 'your-database-host',
  DB_USER: 'your-database-user',
  DB_PASSWORD: 'your-database-password',
  DB_NAME: 'your-database-name',
  
  // Redis
  REDIS_HOST: 'your-redis-host',
  REDIS_PASSWORD: 'your-redis-password',
  
  // S3
  S3_BUCKET: 'your-production-bucket',
  S3_REGION: 'your-aws-region',
  
  // CORS
  CORS_ORIGIN: 'https://your-domain.com',
}
```

## 📈 Performance Tuning

### Cluster Mode (Already Configured)

The API server runs in cluster mode with 4 instances by default:

```javascript
{
  name: 'susanoo-api',
  instances: 4,      // Can be 'max' for all CPU cores
  exec_mode: 'cluster',
}
```

### Memory Management (Already Configured)

Automatic restart if memory exceeds limits:

```javascript
{
  max_memory_restart: '500M',  // API servers
  max_memory_restart: '200M',  // Dashboard
}
```

### Auto-Restart (Already Configured)

```javascript
{
  autorestart: true,
  max_restarts: 10,
  min_uptime: '10s',
}
```

## 🔍 Troubleshooting

### Check if PM2 is Running

```bash
./pm2.sh status
# or
pm2 list
```

### View Recent Logs

```bash
# Last 100 lines
pm2 logs --lines 100

# Follow in real-time
pm2 logs --raw
```

### Restart a Crashed Process

```bash
# Restart all
pm2 restart all

# Restart specific process
pm2 restart susanoo-api
```

### Check Port Availability

```bash
# Check if ports are available
lsof -i :4040  # API port
lsof -i :4050  # Dashboard port

# If ports are in use, kill the process or change ports
```

### Database Connection Issues

```bash
# Test PostgreSQL
psql -h localhost -U postgres -d susanoo

# Test Redis
redis-cli ping

# If services aren't running:
brew services start postgresql@14
brew services start redis
```

## 🎯 Next Steps

### Phase 2: Session Cleanup Worker

When ready to implement background workers:

1. Uncomment worker configuration in `ecosystem.config.js`
2. Create `src/worker.ts` entry point
3. Implement worker processors
4. Test with Bull Board dashboard
5. Deploy with PM2

### Phase 3: Additional Workers

- Log maintenance worker
- Email worker
- Attachment processing worker

### Production Checklist

- [ ] Change JWT_SECRET
- [ ] Change BULL_BOARD_PASSWORD
- [ ] Configure database credentials
- [ ] Configure Redis credentials
- [ ] Set proper CORS_ORIGIN
- [ ] Enable PM2 auto-startup
- [ ] Configure log rotation
- [ ] Set up monitoring/alerting
- [ ] Configure firewall rules
- [ ] Enable HTTPS/SSL

## 📚 Additional Resources

- [PM2 Guide](docs/deployment/PM2_GUIDE.md) - Comprehensive PM2 documentation
- [Bull Queue Architecture](docs/architecture/BULL_QUEUE_ARCHITECTURE.md) - Queue architecture
- [Queue README](src/queues/README.md) - Technical queue implementation
- [PM2 Official Docs](https://pm2.keymetrics.io/docs/usage/quick-start/)

## 🆘 Getting Help

If you encounter issues:

1. Check `./pm2.sh status` for process status
2. View logs with `./pm2.sh logs`
3. Review `docs/deployment/PM2_GUIDE.md`
4. Check PM2 official documentation
5. Contact team lead

---

**Configuration Version:** 1.0.0  
**Last Updated:** October 26, 2025  
**Status:** Ready for Development & Production ✅
