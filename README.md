# 🦊 Kuybi - Enterprise NestJS Backend

> *"Within you is the power of the Nine-Tails"* - Inspired by Naruto's Kurama (Kuybi)

**Kuybi** is an enterprise-grade NestJS backend application featuring advanced authentication, role-based access control (RBAC), audit logging, caching, and content management. Built with Domain-Driven Design principles, it provides a robust foundation for scalable microservices.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11.1-red.svg)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-red.svg)](https://redis.io/)

---

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Quick Start](#-quick-start)
- [Documentation](#-documentation)
- [Testing](#-testing)
- [Deployment](#-deployment)

---

## ✨ Features

### 🔐 Authentication & Authorization
- **JWT-based authentication** with access & refresh token rotation
- **Multi-session management** with device tracking
- **Role-Based Access Control (RBAC)** using CASL
- **Fine-grained permissions** with field-level access control
- **Time-based role expiration** and activation

### 📊 Audit & Compliance
- **Comprehensive audit logging** for all operations
- **Searchable audit logs** with filtering
- **Retention policies** and archiving
- **GDPR-compliant** data tracking

### ⚡ Performance
- **Redis caching** (25-80x improvements)
- **Repository pattern** with caching
- **Bull Queue** for background jobs
- **PM2 cluster mode** support

### 📧 Communication
- **Email verification** workflow
- **Password reset** with secure tokens
- **Handlebars templates** for emails
- **SMTP integration** ready

---

## 🏗️ Architecture

### Tech Stack
- **Framework**: NestJS 11.1
- **Language**: TypeScript 5.3
- **Database**: PostgreSQL 16
- **Cache**: Redis 7
- **Queue**: Bull
- **Logger**: Pino

### Design Patterns
- Domain-Driven Design (DDD)
- Repository Pattern
- Dependency Injection
- CQRS-ready architecture

---

## 🚀 Quick Start

### Prerequisites
- Node.js >= 20.x
- PostgreSQL >= 14.x
- Redis >= 6.x

### Installation

```bash
# Clone repository
git clone https://github.com/moayyadfaris/kuybi.git
cd kuybi/nest-app

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Setup database
createdb kuybi
npm run migration:run
npm run db:seed:countries
npm run db:seed:acl
npm run db:seed:users

# Start development server
npm run start:dev
```

### Access Points
- **API**: http://localhost:4040/api
- **Docs**: http://localhost:4040/api/docs
- **Health**: http://localhost:4040/api/health

### Default Credentials
```json
{
  "email": "admin@kuybi.dev",
  "password": "Admin@123"
}
```

> ⚠️ Change these in production!

---

## 📚 Documentation

Comprehensive docs in [`docs/`](./docs):

### Getting Started
- [API Reference](./docs/API_REFERENCE.md)
- [Super Admin Guide](./docs/SUPER_ADMIN_ACCESS.md)

### Architecture
- [Architecture Standards](./docs/architecture/ARCHITECTURE_STANDARDIZATION.md)
- [DDD Guide](./docs/architecture/DOMAIN_DRIVEN_DESIGN.md)
- [Repository Pattern](./docs/architecture/REPOSITORY_PATTERN.md)
- [Queue Architecture](./docs/architecture/BULL_QUEUE_ARCHITECTURE.md)

### Features
- **Auth**: [Authentication Module](./docs/features/auth/)
- **ACL**: [Access Control](./docs/features/acl/README.md)
- **Audit**: [Audit Logging](./docs/features/audit/README.md)
- **Cache**: [Caching Strategy](./docs/features/cache/)
- **Logging**: [Structured Logging](./docs/features/logging/)

### Testing & Deployment
- [Integration Tests](./docs/testing/INTEGRATION_TESTING_SETUP.md)
- [PM2 Deployment](./docs/deployment/PM2_GUIDE.md)
- [Test Scripts](./test/scripts/README.md)

---

## 🧪 Testing

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# Coverage
npm run test:cov
```

### Manual Testing
```bash
# ACL tests
./test/scripts/test-acl-guards.sh

# Audit tests
./test/scripts/test-audit-integration.sh
```

**Results**: ✅ 42/42 tests passing (~15s)

---

## 🚀 Deployment

### Build & Deploy
```bash
# Build
npm run build

# Run migrations
npm run migration:run

# Start with PM2
pm2 start ecosystem.config.js
```

### PM2 Management
```bash
./pm2.sh start    # Start all
./pm2.sh stop     # Stop all
./pm2.sh restart  # Restart all
pm2 logs kuybi-api
```

---

## 📞 Support

- **Docs**: [./docs](./docs)
- **Issues**: GitHub Issues
- **Email**: support@kuybi.dev

---

<div align="center">

**Built with ❤️ using NestJS**

*Harness the power of the Nine-Tails* 🦊

</div>
