/**
 * PM2 Ecosystem Configuration for Kuybi NestJS Application
 * 
 * This configuration manages:
 * - API servers (cluster mode for load balancing)
 * - Bull Board dashboard (monitoring)
 * - Background workers (future: session cleanup, logs, email, etc.)
 * 
 * Environment variables are loaded from .env file
 * 
 * Usage:
 *   pm2 start ecosystem.config.js                    # Start all processes
 *   pm2 start ecosystem.config.js --only api         # Start only API servers
 *   pm2 start ecosystem.config.js --only dashboard   # Start only dashboard
 *   pm2 restart all                                  # Restart all processes
 *   pm2 stop all                                     # Stop all processes
 *   pm2 delete all                                   # Delete all processes
 *   pm2 logs                                         # View logs
 *   pm2 monit                                        # Monitor processes
 */

require('dotenv').config()

module.exports = {
  apps: [
    /**
     * API Server (Main Application)
     * Runs in cluster mode with 4 instances for load balancing
     * Handles all HTTP requests (REST API)
     * No background jobs - pure request/response
     */
    {
      name: 'kuybi-api',
      script: './dist/main.js',
      instances: 4, // Number of instances (can be set to 'max' for CPU cores)
      exec_mode: 'cluster', // Enable load balancing
      
      // Additional environment overrides (optional)
      env: {
        APP_MODE: 'api',
        APP_PORT: process.env.APP_PORT || 4040,
      },
      
      // Development environment overrides
      env_development: {
        NODE_ENV: 'development',
      },
      
      // Staging environment overrides
      env_staging: {
        NODE_ENV: 'staging',
      },
      
      // Auto-restart configuration
      watch: false, // Set to true in development if needed
      ignore_watch: ['node_modules', 'logs', 'dist'],
      max_memory_restart: '500M', // Restart if memory exceeds 500MB
      
      // Restart strategy
      min_uptime: '10s', // Min uptime before considering app crashed
      max_restarts: 10, // Max restarts within 1 minute
      autorestart: true,
      
      // Logs
      error_file: './logs/pm2/api-error.log',
      out_file: './logs/pm2/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Advanced PM2 features
      listen_timeout: 10000, // Wait 10s for app to listen
      kill_timeout: 5000, // Wait 5s before force killing
      wait_ready: true, // Wait for process.send('ready')
      
      // Post-deployment
      post_update: ['npm install', 'npm run build'],
    },

    /**
     * Queue Worker
     * Processes background BullMQ jobs (session cleanup, etc.)
     */
    {
      name: 'kuybi-worker',
      script: './dist/worker.js',
      instances: 1,
      exec_mode: 'fork',
      
      // Environment overrides
      env: {
        APP_MODE: 'worker',
      },
      
      env_development: {
        NODE_ENV: 'development',
      },
      
      watch: false,
      max_memory_restart: '256M',
      autorestart: true,
      error_file: './logs/pm2/worker-error.log',
      out_file: './logs/pm2/worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    /**
     * Bull Board Dashboard
     * Single instance for queue monitoring
     * Web UI for viewing and managing background jobs
     */
    {
      name: 'kuybi-dashboard',
      script: './dist/dashboard.js',
      instances: 1,
      exec_mode: 'fork',
      
      // No environment overrides needed - reads from .env
      env: {
        BULL_BOARD_PORT: process.env.BULL_BOARD_PORT || 4050,
        BULL_BOARD_USERNAME: process.env.BULL_BOARD_USERNAME || 'admin',
        BULL_BOARD_PASSWORD: process.env.BULL_BOARD_PASSWORD || 'admin123',
      },
      
      env_development: {
        NODE_ENV: 'development',
      },
      
      watch: false,
      max_memory_restart: '200M',
      autorestart: true,
      
      error_file: './logs/pm2/dashboard-error.log',
      out_file: './logs/pm2/dashboard-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    /**
     * Session Cleanup Worker (Phase 2)
     * Processes session cleanup jobs from the queue
     * Handles expired sessions, inactive sessions, etc.
     * 
     * UNCOMMENT WHEN IMPLEMENTING PHASE 2
     */
    // {
    //   name: 'kuybi-worker-sessions',
    //   script: './dist/worker.js',
    //   instances: 1,
    //   exec_mode: 'fork',
    //   
    //   env: {
    //     APP_MODE: 'worker',
    //     WORKER_TYPE: 'session-cleanup',
    //   },
    //   
    //   watch: false,
    //   max_memory_restart: '300M',
    //   autorestart: true,
    //   
    //   error_file: './logs/pm2/worker-sessions-error.log',
    //   out_file: './logs/pm2/worker-sessions-out.log',
    //   log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // },

    /**
     * Log Maintenance Worker (Phase 3)
     * Processes log rotation and cleanup jobs
     * 
     * UNCOMMENT WHEN IMPLEMENTING PHASE 3
     */
    // {
    //   name: 'kuybi-worker-logs',
    //   script: './dist/worker.js',
    //   instances: 1,
    //   exec_mode: 'fork',
    //   
    //   env: {
    //     APP_MODE: 'worker',
    //     WORKER_TYPE: 'log-maintenance',
    //   },
    //   
    //   watch: false,
    //   max_memory_restart: '200M',
    //   autorestart: true,
    //   
    //   error_file: './logs/pm2/worker-logs-error.log',
    //   out_file: './logs/pm2/worker-logs-out.log',
    //   log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // },

    /**
     * Email Worker (Phase 5)
     * Processes email sending jobs
     * 
     * UNCOMMENT WHEN IMPLEMENTING PHASE 5
     */
    // {
    //   name: 'kuybi-worker-email',
    //   script: './dist/worker.js',
    //   instances: 2, // Can handle multiple email jobs in parallel
    //   exec_mode: 'fork',
    //   
    //   env: {
    //     APP_MODE: 'worker',
    //     WORKER_TYPE: 'email',
    //   },
    //   
    //   watch: false,
    //   max_memory_restart: '300M',
    //   autorestart: true,
    //   
    //   error_file: './logs/pm2/worker-email-error.log',
    //   out_file: './logs/pm2/worker-email-out.log',
    //   log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // },

    /**
     * Attachment Processing Worker (Phase 5)
     * Processes image optimization, thumbnail generation, etc.
     * CPU-intensive tasks - fewer instances
     * 
     * UNCOMMENT WHEN IMPLEMENTING PHASE 5
     */
    // {
    //   name: 'kuybi-worker-attachments',
    //   script: './dist/worker.js',
    //   instances: 1, // CPU intensive - keep low
    //   exec_mode: 'fork',
    //   
    //   env: {
    //     APP_MODE: 'worker',
    //     WORKER_TYPE: 'attachment-processing',
    //   },
    //   
    //   watch: false,
    //   max_memory_restart: '500M', // Image processing can be memory intensive
    //   autorestart: true,
    //   
    //   error_file: './logs/pm2/worker-attachments-error.log',
    //   out_file: './logs/pm2/worker-attachments-out.log',
    //   log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // },
  ],

  /**
   * Deployment Configuration (Optional)
   * Configure for automated deployments via PM2 deploy
   */
  deploy: {
    // Production environment
    production: {
      user: 'deploy',
      host: ['production-server.example.com'],
      ref: 'origin/main',
      repo: 'git@github.com:moayyadfaris/kuybi.git',
      path: '/var/www/kuybi',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production'
      }
    },

    // Staging environment
    staging: {
      user: 'deploy',
      host: ['staging-server.example.com'],
      ref: 'origin/develop',
      repo: 'git@github.com:moayyadfaris/kuybi.git',
      path: '/var/www/kuybi-staging',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env staging',
      env: {
        NODE_ENV: 'staging'
      }
    }
  }
}
