#!/bin/bash

# PM2 Quick Start Script for Kuybi NestJS
# This script helps quickly start/stop/manage PM2 processes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored message
print_message() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Print header
print_header() {
    echo ""
    print_message "$BLUE" "=========================================="
    print_message "$BLUE" "  Kuybi NestJS - PM2 Manager"
    print_message "$BLUE" "=========================================="
    echo ""
}

# Check if PM2 is installed
check_pm2() {
    if ! command -v pm2 &> /dev/null; then
        print_message "$RED" "❌ PM2 is not installed globally"
        print_message "$YELLOW" "Installing PM2 globally..."
        npm install -g pm2
    fi
}

# Check if application is built
check_build() {
    if [ ! -d "dist" ] || [ ! -f "dist/main.js" ]; then
        print_message "$YELLOW" "⚠️  Application not built. Building now..."
        npm run build
    else
        print_message "$GREEN" "✅ Application is built"
    fi
}

# Create required directories
create_directories() {
    print_message "$YELLOW" "📁 Creating required directories..."
    mkdir -p logs/pm2
    mkdir -p logs/archive
    print_message "$GREEN" "✅ Directories created"
}

# Start PM2 processes
start_pm2() {
    local env=${1:-development}
    
    print_header
    print_message "$BLUE" "Starting PM2 processes in $env mode..."
    echo ""
    
    check_pm2
    check_build
    create_directories
    
    print_message "$YELLOW" "🚀 Starting processes..."
    pm2 start ecosystem.config.js --env $env
    
    echo ""
    print_message "$GREEN" "✅ PM2 processes started successfully!"
    echo ""
    
    # Show status
    pm2 list
    
    echo ""
    print_message "$BLUE" "📊 Access Points:"
    print_message "$GREEN" "   API Server:  http://localhost:4040/api"
    print_message "$GREEN" "   API Docs:    http://localhost:4040/api/docs"
    print_message "$GREEN" "   Dashboard:   http://localhost:4050/admin/queues"
    print_message "$GREEN" "   Health:      http://localhost:4040/api/health"
    echo ""
    print_message "$YELLOW" "💡 Useful commands:"
    print_message "$NC" "   pm2 logs             - View logs"
    print_message "$NC" "   pm2 monit            - Monitor processes"
    print_message "$NC" "   pm2 status           - Show process list"
    print_message "$NC" "   pm2 reload all       - Zero-downtime reload"
    print_message "$NC" "   pm2 stop all         - Stop all processes"
    echo ""
}

# Stop PM2 processes
stop_pm2() {
    print_header
    print_message "$YELLOW" "🛑 Stopping PM2 processes..."
    pm2 stop ecosystem.config.js
    print_message "$GREEN" "✅ PM2 processes stopped"
    echo ""
    pm2 list
    echo ""
}

# Restart PM2 processes
restart_pm2() {
    print_header
    print_message "$YELLOW" "🔄 Restarting PM2 processes..."
    pm2 restart ecosystem.config.js
    print_message "$GREEN" "✅ PM2 processes restarted"
    echo ""
    pm2 list
    echo ""
}

# Reload PM2 processes (zero-downtime)
reload_pm2() {
    print_header
    print_message "$YELLOW" "🔄 Reloading PM2 processes (zero-downtime)..."
    pm2 reload ecosystem.config.js
    print_message "$GREEN" "✅ PM2 processes reloaded"
    echo ""
    pm2 list
    echo ""
}

# Delete PM2 processes
delete_pm2() {
    print_header
    print_message "$YELLOW" "🗑️  Deleting PM2 processes..."
    pm2 delete ecosystem.config.js
    print_message "$GREEN" "✅ PM2 processes deleted"
    echo ""
}

# Show PM2 status
status_pm2() {
    print_header
    print_message "$BLUE" "📊 PM2 Process Status:"
    echo ""
    pm2 list
    echo ""
}

# Show PM2 logs
logs_pm2() {
    local process=$1
    print_header
    if [ -z "$process" ]; then
        print_message "$BLUE" "📜 Showing logs for all processes..."
        pm2 logs
    else
        print_message "$BLUE" "📜 Showing logs for $process..."
        pm2 logs $process
    fi
}

# Monitor PM2 processes
monitor_pm2() {
    print_header
    print_message "$BLUE" "📊 Monitoring PM2 processes..."
    print_message "$YELLOW" "Press Ctrl+C to exit monitoring"
    echo ""
    sleep 1
    pm2 monit
}

# Save PM2 configuration
save_pm2() {
    print_header
    print_message "$YELLOW" "💾 Saving PM2 configuration..."
    pm2 save
    print_message "$GREEN" "✅ PM2 configuration saved"
    echo ""
}

# Setup PM2 startup
setup_startup() {
    print_header
    print_message "$YELLOW" "🚀 Setting up PM2 auto-startup..."
    pm2 startup
    echo ""
    print_message "$BLUE" "Follow the instructions above to enable auto-startup"
    print_message "$YELLOW" "After running the command shown, execute: pm2 save"
    echo ""
}

# Show help
show_help() {
    print_header
    print_message "$BLUE" "Usage: ./pm2.sh [command] [options]"
    echo ""
    print_message "$GREEN" "Commands:"
    print_message "$NC" "  start [env]    Start PM2 processes (env: development|production)"
    print_message "$NC" "  stop           Stop all PM2 processes"
    print_message "$NC" "  restart        Restart all PM2 processes"
    print_message "$NC" "  reload         Reload processes (zero-downtime)"
    print_message "$NC" "  delete         Delete all PM2 processes"
    print_message "$NC" "  status         Show PM2 process status"
    print_message "$NC" "  logs [app]     Show logs (optional: specific app name)"
    print_message "$NC" "  monitor        Monitor processes in real-time"
    print_message "$NC" "  save           Save current PM2 configuration"
    print_message "$NC" "  startup        Setup PM2 auto-startup on boot"
    print_message "$NC" "  help           Show this help message"
    echo ""
    print_message "$YELLOW" "Examples:"
    print_message "$NC" "  ./pm2.sh start development    Start in dev mode"
    print_message "$NC" "  ./pm2.sh start production     Start in prod mode"
    print_message "$NC" "  ./pm2.sh logs kuybi-api     Show API logs"
    print_message "$NC" "  ./pm2.sh monitor              Monitor all processes"
    echo ""
}

# Main script logic
main() {
    local command=${1:-help}
    
    case $command in
        start)
            start_pm2 ${2:-development}
            ;;
        stop)
            stop_pm2
            ;;
        restart)
            restart_pm2
            ;;
        reload)
            reload_pm2
            ;;
        delete)
            delete_pm2
            ;;
        status)
            status_pm2
            ;;
        logs)
            logs_pm2 $2
            ;;
        monitor)
            monitor_pm2
            ;;
        save)
            save_pm2
            ;;
        startup)
            setup_startup
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_message "$RED" "❌ Unknown command: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
