/**
 * Baseline schema (October 2026).
 *
 * Replaces the 32 incremental migrations written before Kuybi had any deployed data;
 * those had drifted from the entities (503 differences, including timestamp vs
 * timestamptz). Generated from the entities with `typeorm migration:generate` against an
 * empty database. Historical migrations remain in git history.
 */
import { MigrationInterface, QueryRunner } from 'typeorm'

export class Baseline1792316054496 implements MigrationInterface {
  name = 'Baseline1792316054496'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // uuid_generate_v4() is used as the default for uuid primary keys
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
    await queryRunner.query(
      `CREATE TABLE "attachments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "path" character varying(1024) NOT NULL, "mimeType" character varying(150) NOT NULL, "size" integer NOT NULL, "originalName" character varying(255) NOT NULL, "category" character varying(50), "isPublic" boolean NOT NULL DEFAULT false, "isEncrypted" boolean NOT NULL DEFAULT false, "encryptionKey" character varying, "securityStatus" character varying(20) NOT NULL DEFAULT 'pending', "checksum" character varying(128), "downloadCount" integer NOT NULL DEFAULT '0', "lastAccessedAt" TIMESTAMP WITH TIME ZONE, "folder" character varying(100), "description" text, "tags" jsonb, "metadata" jsonb, "scanResults" jsonb, "containsPII" boolean NOT NULL DEFAULT false, "retentionPeriod" character varying(20), "expiresAt" TIMESTAMP WITH TIME ZONE, "deletionScheduledAt" TIMESTAMP WITH TIME ZONE, "thumbnailPath" character varying(1024), "version" integer NOT NULL DEFAULT '1', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_5e1f050bcff31e3084a1d662412" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(50) NOT NULL, "email" character varying(50) NOT NULL, "mobileNumber" character varying(50) NOT NULL, "passwordHash" text NOT NULL, "primary_role_id" integer NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "isVerified" boolean NOT NULL DEFAULT false, "isEmailVerified" boolean NOT NULL DEFAULT false, "emailVerifiedAt" TIMESTAMP WITH TIME ZONE, "forcePasswordChange" boolean NOT NULL DEFAULT false, "failedLoginAttempts" integer NOT NULL DEFAULT '0', "isLocked" boolean NOT NULL DEFAULT false, "lockedAt" TIMESTAMP WITH TIME ZONE, "lockedUntil" TIMESTAMP WITH TIME ZONE, "lockReason" character varying(100), "profileImageId" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "UQ_61dc14c8c49c187f5d08047c985" UNIQUE ("mobileNumber"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")); COMMENT ON COLUMN "users"."failedLoginAttempts" IS 'Number of consecutive failed login attempts'; COMMENT ON COLUMN "users"."isLocked" IS 'Whether the account is currently locked'; COMMENT ON COLUMN "users"."lockedAt" IS 'Timestamp when the account was locked'; COMMENT ON COLUMN "users"."lockedUntil" IS 'Timestamp when the account will be automatically unlocked'; COMMENT ON COLUMN "users"."lockReason" IS 'Reason for account lock: FAILED_ATTEMPTS, ADMIN_LOCK, SECURITY_VIOLATION'`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_077ccba40313d98bb3084eb42d" ON "users" ("primary_role_id") `
    )
    await queryRunner.query(
      `CREATE TABLE "user_roles" ("id" SERIAL NOT NULL, "userId" uuid NOT NULL, "roleId" integer NOT NULL, "assignedBy" uuid, "assignedAt" TIMESTAMP WITH TIME ZONE, "expiresAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8acd5cf26ebd158416f477de799" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE TABLE "roles" ("id" SERIAL NOT NULL, "name" character varying(50) NOT NULL, "description" text, "isSystem" boolean NOT NULL DEFAULT false, "isActive" boolean NOT NULL DEFAULT true, "priority" integer NOT NULL DEFAULT '50', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_648e3f5447f725579d7d4ffdfb7" UNIQUE ("name"), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE TABLE "role_permissions" ("id" SERIAL NOT NULL, "roleId" integer NOT NULL, "permissionId" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_84059017c90bfcb701b8fa42297" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE TYPE "public"."permissions_action_enum" AS ENUM('manage', 'create', 'read', 'update', 'delete', 'restore', 'export', 'import', 'publish', 'archive', 'moderate', 'assign')`
    )
    await queryRunner.query(
      `CREATE TYPE "public"."permissions_subject_enum" AS ENUM('all', 'User', 'Story', 'StoryVersion', 'Attachment', 'Category', 'Tag', 'Session', 'Role', 'Permission', 'Country', 'Setting', 'AuditLog', 'PostType', 'FieldDefinition', 'Content')`
    )
    await queryRunner.query(
      `CREATE TABLE "permissions" ("id" SERIAL NOT NULL, "action" "public"."permissions_action_enum" NOT NULL, "subject" "public"."permissions_subject_enum" NOT NULL, "conditions" jsonb, "fields" text, "inverted" boolean NOT NULL DEFAULT false, "reason" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_action_enum" AS ENUM('login', 'logout', 'logout_all', 'refresh_token', 'change_password', 'reset_password', 'force_password_change', 'user_create', 'user_update', 'user_delete', 'user_restore', 'create', 'read', 'update', 'delete', 'restore', 'hard_delete', 'role_assign', 'role_revoke', 'permission_grant', 'permission_revoke', 'file_upload', 'file_download', 'file_delete', 'bulk_create', 'bulk_update', 'bulk_delete', 'export', 'import', 'admin_access', 'system_config_change', 'unauthorized_access', 'suspicious_activity', 'security_violation')`
    )
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_status_enum" AS ENUM('success', 'failure', 'pending')`
    )
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_severity_enum" AS ENUM('low', 'medium', 'high', 'critical')`
    )
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid, "username" character varying(255), "email" character varying(255), "action" "public"."audit_logs_action_enum" NOT NULL, "entityType" character varying(100), "entityId" character varying(255), "previousValues" jsonb, "newValues" jsonb, "changes" jsonb, "ipAddress" character varying(45), "userAgent" character varying(500), "method" character varying(20), "endpoint" character varying(500), "requestId" character varying(100), "status" "public"."audit_logs_status_enum" NOT NULL DEFAULT 'success', "statusCode" integer, "errorMessage" text, "errorStack" text, "severity" "public"."audit_logs_severity_enum" NOT NULL DEFAULT 'low', "tags" jsonb, "metadata" jsonb, "description" text, "retentionDays" integer NOT NULL DEFAULT '0', "isArchived" boolean NOT NULL DEFAULT false, "archivedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_2961862b2704794af56359ff0a" ON "audit_logs" ("status") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_5fed71356a22964650a661558f" ON "audit_logs" ("severity", "createdAt") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_8ddc86298ac7fadad468b28d83" ON "audit_logs" ("ipAddress") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_13c69424c440a0e765053feb4b" ON "audit_logs" ("entityType", "entityId") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_0ec936941eb8556fcd7a1f0eae" ON "audit_logs" ("action", "createdAt") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_99e589da8f9e9326ee0d01a028" ON "audit_logs" ("userId", "createdAt") `
    )
    await queryRunner.query(
      `CREATE TABLE "password_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "passwordHash" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "ipAddress" character varying(45), "userAgent" character varying(255), CONSTRAINT "PK_da65ed4600e5e6bc9315754a8b2" PRIMARY KEY ("id")); COMMENT ON COLUMN "password_history"."passwordHash" IS 'Bcrypt hashed password'; COMMENT ON COLUMN "password_history"."createdAt" IS 'When this password was set'; COMMENT ON COLUMN "password_history"."ipAddress" IS 'IP address from which password was changed'; COMMENT ON COLUMN "password_history"."userAgent" IS 'User agent string'`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_ddea018826c35b58c992688c1f" ON "password_history" ("userId", "createdAt") `
    )
    await queryRunner.query(
      `CREATE TABLE "password_resets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "email" character varying(255) NOT NULL, "token" uuid NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "used" boolean NOT NULL DEFAULT false, "usedAt" TIMESTAMP, "requestIpAddress" character varying(45), "resetIpAddress" character varying(45), "userAgent" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_9b34edd5264effbbc875c266a9e" UNIQUE ("token"), CONSTRAINT "PK_4816377aa98211c1de34469e742" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_e7a6043ff92629b85b5da2e543" ON "password_resets" ("expiresAt") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_be7aa8c6ca651d91d29ac03dad" ON "password_resets" ("userId", "used") `
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_9b34edd5264effbbc875c266a9" ON "password_resets" ("token") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_7e57f540b334d522f9cf5b16ca" ON "password_resets" ("email") `
    )
    await queryRunner.query(
      `CREATE TABLE "sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "refreshTokenHash" text NOT NULL, "fingerprint" character varying(200), "deviceType" character varying(120), "userAgent" text, "ipAddress" character varying(45), "securityLevel" character varying(20) NOT NULL DEFAULT 'low', "sessionType" character varying(30) NOT NULL DEFAULT 'standard', "isActive" boolean NOT NULL DEFAULT true, "lastActivityAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "deletedAt" TIMESTAMP WITH TIME ZONE, "metadata" jsonb NOT NULL DEFAULT '{}', "deviceInfo" jsonb, "createdBy" uuid, "updatedBy" uuid, "deletedBy" uuid, "version" integer NOT NULL DEFAULT '1', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id")); COMMENT ON COLUMN "sessions"."securityLevel" IS 'Security risk level: low, medium, high, critical'; COMMENT ON COLUMN "sessions"."sessionType" IS 'Session type: standard, persistent, mobile, api, admin, suspicious, guest'`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_7613d71def6bf211503844d573" ON "sessions" ("sessionType") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_d9647ba95d20a945419c3348a5" ON "sessions" ("securityLevel") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_f6949743fe709ee028ea6face1" ON "sessions" ("expiresAt", "isActive") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_07bd9c0d345c7e1110981e3431" ON "sessions" ("userId", "isActive") `
    )
    await queryRunner.query(
      `CREATE TABLE "countries" ("id" SERIAL NOT NULL, "iso" character(2) NOT NULL, "name" character varying(80) NOT NULL, "nicename" character varying(80) NOT NULL, "iso3" character(3), "numcode" integer, "phonecode" integer, "isActive" boolean NOT NULL DEFAULT true, "currencyCode" character varying(3), "currencyName" character varying(50), "currencySymbol" character varying(5), "timezone" character varying(50), "continent" character varying(30), "region" character varying(50), "capital" character varying(80), "latitude" numeric(10,8), "longitude" numeric(11,8), "population" bigint, "area" numeric(12,2), "languages" text, "metadata" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_a1c0d005a87cc318b4ddda4d925" UNIQUE ("iso"), CONSTRAINT "PK_b2d7006793e8697ab3ae2deff18" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE TABLE "tags" ("id" SERIAL NOT NULL, "name" character varying(200) NOT NULL, "createdBy" uuid NOT NULL, "updatedBy" uuid, "deletedBy" uuid, "deletedAt" TIMESTAMP WITH TIME ZONE, "metadata" jsonb, "color" character varying(7), "sortOrder" integer NOT NULL DEFAULT '0', "isSystem" boolean NOT NULL DEFAULT false, "version" integer NOT NULL DEFAULT '1', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_d90243459a697eadb8ad56e9092" UNIQUE ("name"), CONSTRAINT "PK_e7dc17249a1148a1970748eda99" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE TYPE "public"."stories_type_enum" AS ENUM('TIP_OFF', 'STORY', 'REPORT')`
    )
    await queryRunner.query(
      `CREATE TYPE "public"."stories_status_enum" AS ENUM('DRAFT', 'PENDING_REVIEW', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED', 'DELETED', 'SUSPENDED', 'FLAGGED', 'UNDER_INVESTIGATION')`
    )
    await queryRunner.query(
      `CREATE TYPE "public"."stories_priority_enum" AS ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT')`
    )
    await queryRunner.query(
      `CREATE TABLE "stories" ("id" SERIAL NOT NULL, "title" character varying(200) NOT NULL, "details" text, "type" "public"."stories_type_enum" NOT NULL DEFAULT 'STORY', "userId" uuid, "status" "public"."stories_status_enum" NOT NULL DEFAULT 'DRAFT', "fromTime" TIMESTAMP WITH TIME ZONE, "toTime" TIMESTAMP WITH TIME ZONE, "priority" "public"."stories_priority_enum" NOT NULL DEFAULT 'NORMAL', "isInEditMode" boolean NOT NULL DEFAULT false, "parentId" integer, "metadata" jsonb NOT NULL DEFAULT '{}', "internalNotes" text, "createdBy" uuid, "updatedBy" uuid, "deletedBy" uuid, "deletedAt" TIMESTAMP WITH TIME ZONE, "lastModifiedBy" uuid, "version" integer NOT NULL DEFAULT '1', "latitude" numeric(10,8), "longitude" numeric(11,8), "address" character varying(255), "city" character varying(100), "region" character varying(100), "countryId" integer, "mainImageId" uuid, "deletionReason" character varying(255), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_bb6f880b260ed96c452b32a39f0" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(`CREATE INDEX "IDX_6a991a216142aa148f79b0602e" ON "stories" ("type") `)
    await queryRunner.query(
      `CREATE INDEX "IDX_655cd324a6949f46e1b397f621" ON "stories" ("userId") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_f4db74cea8a693da5be9926e64" ON "stories" ("status") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_6ebc2abeaa21a1231c367e43ea" ON "stories" ("priority") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_e74984822f6cdd83247da65054" ON "stories" ("countryId") `
    )
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(120) NOT NULL, "slug" character varying(140) NOT NULL, "description" character varying(500), "isActive" boolean NOT NULL DEFAULT true, "metadata" jsonb NOT NULL DEFAULT '{}', "createdBy" character varying, "updatedBy" character varying, "deletedBy" character varying, "deletedAt" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_420d9f679d41281f282f5bc7d09" UNIQUE ("slug"), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE TABLE "post_types" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "slug" character varying(120) NOT NULL, "singularLabel" character varying(100) NOT NULL, "pluralLabel" character varying(100) NOT NULL, "description" text, "icon" character varying(50), "menuIcon" character varying(50), "menuPosition" integer, "isHierarchical" boolean NOT NULL DEFAULT false, "supportsComments" boolean NOT NULL DEFAULT true, "supportsRevisions" boolean NOT NULL DEFAULT true, "showInRest" boolean NOT NULL DEFAULT true, "restBase" character varying(100), "capabilityType" character varying(50), "isActive" boolean NOT NULL DEFAULT true, "isSystem" boolean NOT NULL DEFAULT false, "settings" jsonb NOT NULL DEFAULT '{}', "createdBy" uuid, "updatedBy" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', CONSTRAINT "UQ_1c3d8778f5e1dc7d2cd095b7cba" UNIQUE ("name"), CONSTRAINT "UQ_75d63e7c66f9f41eebbd2c91418" UNIQUE ("slug"), CONSTRAINT "PK_93eda27dd73e57b018196c6475b" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_1c3d8778f5e1dc7d2cd095b7cb" ON "post_types" ("name") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_75d63e7c66f9f41eebbd2c9141" ON "post_types" ("slug") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_9cc5bb721511e6a048eb3ef0ed" ON "post_types" ("isActive") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_31981c5f2d14b6e8cb82622d92" ON "post_types" ("isSystem") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_7bda11923fd2a01796be308561" ON "post_types" ("deletedAt") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_POST_TYPES_DELETED_AT" ON "post_types" ("deletedAt") `
    )
    await queryRunner.query(`CREATE INDEX "IDX_POST_TYPES_SYSTEM" ON "post_types" ("isSystem") `)
    await queryRunner.query(`CREATE INDEX "IDX_POST_TYPES_ACTIVE" ON "post_types" ("isActive") `)
    await queryRunner.query(`CREATE INDEX "IDX_POST_TYPES_NAME" ON "post_types" ("name") `)
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_POST_TYPES_SLUG" ON "post_types" ("slug") `)
    await queryRunner.query(
      `CREATE TYPE "public"."field_definitions_fieldtype_enum" AS ENUM('text', 'textarea', 'wysiwyg', 'email', 'url', 'tel', 'code', 'number', 'currency', 'date', 'datetime', 'time', 'checkbox', 'radio', 'select', 'multiselect', 'toggle', 'file', 'image', 'gallery', 'video', 'relation', 'user', 'taxonomy', 'color', 'json', 'repeater', 'group')`
    )
    await queryRunner.query(
      `CREATE TABLE "field_definitions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "postTypeId" uuid NOT NULL, "name" character varying(100) NOT NULL, "label" character varying(200) NOT NULL, "fieldType" "public"."field_definitions_fieldtype_enum" NOT NULL, "description" text, "defaultValue" text, "placeholder" character varying(200), "isRequired" boolean NOT NULL DEFAULT false, "isUnique" boolean NOT NULL DEFAULT false, "isSearchable" boolean NOT NULL DEFAULT true, "isFilterable" boolean NOT NULL DEFAULT true, "isSortable" boolean NOT NULL DEFAULT true, "displayOrder" integer NOT NULL DEFAULT '0', "fieldGroup" character varying(100), "helpText" text, "validationRules" jsonb NOT NULL DEFAULT '{}', "fieldOptions" jsonb NOT NULL DEFAULT '{}', "conditionalLogic" jsonb, "metadata" jsonb NOT NULL DEFAULT '{}', "createdBy" uuid, "updatedBy" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', CONSTRAINT "PK_a9da2ecc62baef02aea97f3cb7d" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_7b4cc18f5aafdcb7b8945d4a14" ON "field_definitions" ("name") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_fbf508f49eb2ac412d10a50619" ON "field_definitions" ("fieldType") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_984953bbbe4377be966c20b1a3" ON "field_definitions" ("isRequired") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_0510701467ba81c2c005fc1325" ON "field_definitions" ("deletedAt") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_FIELD_DEFINITIONS_DELETED_AT" ON "field_definitions" ("deletedAt") `
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_FIELD_DEFINITIONS_NAME_POST_TYPE_UNIQUE" ON "field_definitions" ("postTypeId", "name") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_FIELD_DEFINITIONS_POST_TYPE_ORDER" ON "field_definitions" ("postTypeId", "displayOrder") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_FIELD_DEFINITIONS_REQUIRED" ON "field_definitions" ("isRequired") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_FIELD_DEFINITIONS_TYPE" ON "field_definitions" ("fieldType") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_FIELD_DEFINITIONS_NAME" ON "field_definitions" ("name") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_FIELD_DEFINITIONS_POST_TYPE" ON "field_definitions" ("postTypeId") `
    )
    await queryRunner.query(
      `CREATE TABLE "post_content_attachments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "postContentId" uuid NOT NULL, "attachmentId" uuid NOT NULL, "displayOrder" integer NOT NULL DEFAULT '0', "caption" text, "isPrimary" boolean NOT NULL DEFAULT false, "metadata" jsonb NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8346d91b5816917a42c4e6df10c" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_POST_CONTENT_ATTACHMENTS_ORDER" ON "post_content_attachments" ("postContentId", "displayOrder") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_POST_CONTENT_ATTACHMENTS_ATTACHMENT" ON "post_content_attachments" ("attachmentId") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_POST_CONTENT_ATTACHMENTS_CONTENT" ON "post_content_attachments" ("postContentId") `
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_POST_CONTENT_ATTACHMENTS_UNIQUE" ON "post_content_attachments" ("postContentId", "attachmentId") `
    )
    await queryRunner.query(
      `CREATE TABLE "post_content_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "postContentId" uuid NOT NULL, "categoryId" uuid NOT NULL, "isPrimary" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c0f47f184ffdc3cff36b982f06f" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_POST_CONTENT_CATEGORIES_PRIMARY" ON "post_content_categories" ("postContentId", "isPrimary") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_POST_CONTENT_CATEGORIES_CATEGORY" ON "post_content_categories" ("categoryId") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_POST_CONTENT_CATEGORIES_CONTENT" ON "post_content_categories" ("postContentId") `
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_POST_CONTENT_CATEGORIES_UNIQUE" ON "post_content_categories" ("postContentId", "categoryId") `
    )
    await queryRunner.query(
      `CREATE TABLE "post_content_tags" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "postContentId" uuid NOT NULL, "tagId" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_61566d45a90441c4314e8288127" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_POST_CONTENT_TAGS_TAG" ON "post_content_tags" ("tagId") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_POST_CONTENT_TAGS_CONTENT" ON "post_content_tags" ("postContentId") `
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_POST_CONTENT_TAGS_UNIQUE" ON "post_content_tags" ("postContentId", "tagId") `
    )
    await queryRunner.query(
      `CREATE TYPE "public"."post_content_status_enum" AS ENUM('draft', 'pending_review', 'published', 'scheduled', 'archived', 'deleted')`
    )
    await queryRunner.query(
      `CREATE TABLE "post_content" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "postTypeId" uuid NOT NULL, "title" character varying(300) NOT NULL, "slug" character varying(320) NOT NULL, "excerpt" text, "fieldData" jsonb NOT NULL DEFAULT '{}', "featuredImageId" uuid, "status" "public"."post_content_status_enum" NOT NULL DEFAULT 'draft', "authorId" uuid NOT NULL, "publishedAt" TIMESTAMP WITH TIME ZONE, "scheduledAt" TIMESTAMP WITH TIME ZONE, "parentId" uuid, "hierarchyLevel" integer NOT NULL DEFAULT '0', "hierarchyPath" character varying(500), "displayOrder" integer NOT NULL DEFAULT '0', "metaTitle" character varying(100), "metaDescription" character varying(300), "metaKeywords" text, "viewCount" integer NOT NULL DEFAULT '0', "likeCount" integer NOT NULL DEFAULT '0', "commentCount" integer NOT NULL DEFAULT '0', "isFeatured" boolean NOT NULL DEFAULT false, "isPinned" boolean NOT NULL DEFAULT false, "allowComments" boolean NOT NULL DEFAULT true, "metadata" jsonb NOT NULL DEFAULT '{}', "createdBy" uuid, "updatedBy" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', CONSTRAINT "PK_de3a5028e4d16abe413abf49ee5" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_7816963aeec9d405f1d19a9fd1" ON "post_content" ("slug") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_310ad55add16c920cb6c4aee37" ON "post_content" ("status") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_7e0bf390a5906494b60f8cc51a" ON "post_content" ("publishedAt") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_f642ef8eb89ccfde9ced9fba09" ON "post_content" ("scheduledAt") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_98e354e640213d7eaa7ce7409b" ON "post_content" ("hierarchyPath") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_4d6ef3e0b48f62c4b76e34b809" ON "post_content" ("isFeatured") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_6db611d752599d9120e78c520f" ON "post_content" ("isPinned") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_309feda1c7f531de4f99a8e8af" ON "post_content" ("deletedAt") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_POST_CONTENT_DELETED_AT" ON "post_content" ("deletedAt") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_POST_CONTENT_PINNED" ON "post_content" ("isPinned") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_POST_CONTENT_FEATURED" ON "post_content" ("isFeatured") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_POST_CONTENT_HIERARCHY_PATH" ON "post_content" ("hierarchyPath") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_POST_CONTENT_PARENT" ON "post_content" ("parentId") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_POST_CONTENT_SCHEDULED_AT" ON "post_content" ("scheduledAt") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_POST_CONTENT_PUBLISHED_AT" ON "post_content" ("publishedAt") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_POST_CONTENT_TYPE_STATUS" ON "post_content" ("postTypeId", "status") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_POST_CONTENT_AUTHOR" ON "post_content" ("authorId") `
    )
    await queryRunner.query(`CREATE INDEX "IDX_POST_CONTENT_STATUS" ON "post_content" ("status") `)
    await queryRunner.query(
      `CREATE INDEX "IDX_POST_CONTENT_POST_TYPE" ON "post_content" ("postTypeId") `
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_POST_CONTENT_SLUG_POST_TYPE_UNIQUE" ON "post_content" ("postTypeId", "slug") `
    )
    await queryRunner.query(
      `CREATE TYPE "public"."story_versions_versiontype_enum" AS ENUM('MANUAL', 'AUTO', 'BRANCH', 'MERGE', 'ROLLBACK')`
    )
    await queryRunner.query(
      `CREATE TYPE "public"."story_versions_status_enum" AS ENUM('ACTIVE', 'ARCHIVED', 'DRAFT', 'DELETED')`
    )
    await queryRunner.query(
      `CREATE TABLE "story_versions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "storyId" integer NOT NULL, "versionNumber" integer NOT NULL, "versionLabel" character varying(100), "versionType" "public"."story_versions_versiontype_enum" NOT NULL DEFAULT 'AUTO', "status" "public"."story_versions_status_enum" NOT NULL DEFAULT 'ARCHIVED', "title" character varying(200) NOT NULL, "details" text, "type" character varying(50) NOT NULL, "storyStatus" character varying(50) NOT NULL, "priority" character varying(50) NOT NULL, "fromTime" TIMESTAMP WITH TIME ZONE, "toTime" TIMESTAMP WITH TIME ZONE, "latitude" numeric(10,8), "longitude" numeric(11,8), "address" character varying(255), "city" character varying(100), "region" character varying(100), "countryId" integer, "metadata" jsonb NOT NULL DEFAULT '{}', "internalNotes" text, "tagIds" jsonb, "categoryIds" jsonb, "attachmentIds" jsonb, "mainImageId" uuid, "parentVersionId" uuid, "branchName" character varying(100) NOT NULL DEFAULT 'main', "tag" character varying(100), "mergedFromVersionId" uuid, "changes" jsonb, "changeSummary" text, "changesCount" integer NOT NULL DEFAULT '0', "contentHash" character varying(64), "createdBy" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "commitMessage" text, "isRollback" boolean NOT NULL DEFAULT false, "rolledBackFromVersionId" uuid, "isPinned" boolean NOT NULL DEFAULT false, "expiresAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_34cd63e5ae6937142a4419d8f98" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_19e16ffad6936c8dc8076863b4" ON "story_versions" ("createdBy") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_475696cfd7d70f52c6c5687a98" ON "story_versions" ("tag") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_9e812f3017d8ae1857cb947fa7" ON "story_versions" ("branchName") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_071c6a48f04d113da38e2c8f30" ON "story_versions" ("storyId", "createdAt") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_4617211fede67416fba44f51e2" ON "story_versions" ("storyId", "versionNumber") `
    )
    await queryRunner.query(
      `CREATE TABLE "email_verifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "email" character varying(255) NOT NULL, "token" uuid NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "verified" boolean NOT NULL DEFAULT false, "verifiedAt" TIMESTAMP, "ipAddress" character varying(45), "userAgent" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_595be4c36e66b21d3fd14c73a24" UNIQUE ("token"), CONSTRAINT "PK_c1ea2921e767f83cd44c0af203f" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_44e5cfea68f87243cad38bb1b1" ON "email_verifications" ("email") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_442ebfa56e39cc1a9bd8467742" ON "email_verifications" ("expiresAt") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_b595bb6b9d8d40089bfd47d05f" ON "email_verifications" ("userId", "verified") `
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_595be4c36e66b21d3fd14c73a2" ON "email_verifications" ("token") `
    )
    await queryRunner.query(
      `CREATE TABLE "story_attachments" ("storyId" integer NOT NULL, "attachmentId" uuid NOT NULL, CONSTRAINT "PK_521b88f81340134ec857d344f57" PRIMARY KEY ("storyId", "attachmentId"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_136a1d46477996a0bae5f53c30" ON "story_attachments" ("storyId") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_0d4b08581736ce20d08d7c64d5" ON "story_attachments" ("attachmentId") `
    )
    await queryRunner.query(
      `CREATE TABLE "story_tags" ("storyId" integer NOT NULL, "tagId" integer NOT NULL, CONSTRAINT "PK_0547a8bbbd3376504d1209d51b3" PRIMARY KEY ("storyId", "tagId"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_fa7e648db91d969a6ec2e93c5c" ON "story_tags" ("storyId") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_db3d6ae34ee29138530d59e5a6" ON "story_tags" ("tagId") `
    )
    await queryRunner.query(
      `CREATE TABLE "story_categories" ("storyId" integer NOT NULL, "categoryId" uuid NOT NULL, CONSTRAINT "PK_9b7718cbf9a3c7296e6154da128" PRIMARY KEY ("storyId", "categoryId"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_14ea1b32476b8f2e4181770eea" ON "story_categories" ("storyId") `
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_e482c279e8b5b79d200ec56776" ON "story_categories" ("categoryId") `
    )
    await queryRunner.query(
      `ALTER TABLE "attachments" ADD CONSTRAINT "FK_35138b11d46d53c48ed932afa47" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_077ccba40313d98bb3084eb42d9" FOREIGN KEY ("primary_role_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_e6f8c136a8e286370ac3b5d73b6" FOREIGN KEY ("profileImageId") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "user_roles" ADD CONSTRAINT "FK_472b25323af01488f1f66a06b67" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "user_roles" ADD CONSTRAINT "FK_86033897c009fcca8b6505d6be2" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_b4599f8b8f548d35850afa2d12c" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_06792d0c62ce6b0203c03643cdd" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_cfa83f61e4d27a87fcae1e025ab" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "password_history" ADD CONSTRAINT "FK_20c510e5ca12f63b0c915c3e2df" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "password_resets" ADD CONSTRAINT "FK_d95569f623f28a0bf034a55099e" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "tags" ADD CONSTRAINT "FK_e968d9e7a21b2d9cd9244e79f48" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "tags" ADD CONSTRAINT "FK_00f2dfb8316772f57ce0c9c15c9" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "tags" ADD CONSTRAINT "FK_cd89071aae6fa8a278f1f00fafc" FOREIGN KEY ("deletedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "stories" ADD CONSTRAINT "FK_655cd324a6949f46e1b397f621e" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "stories" ADD CONSTRAINT "FK_b403b0cc8106c317b30c8498140" FOREIGN KEY ("parentId") REFERENCES "stories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "stories" ADD CONSTRAINT "FK_f3c8344798395c9127a2a1ce730" FOREIGN KEY ("lastModifiedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "stories" ADD CONSTRAINT "FK_e74984822f6cdd83247da650547" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "stories" ADD CONSTRAINT "FK_d7aad83de720aebdbade1d05862" FOREIGN KEY ("mainImageId") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "post_types" ADD CONSTRAINT "FK_7d164d9106c9eb6a82f9cf34046" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "post_types" ADD CONSTRAINT "FK_5540bf075cbf8234cdcf8e45ad5" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "field_definitions" ADD CONSTRAINT "FK_d6832863272b9d4e0a4fac5eb6e" FOREIGN KEY ("postTypeId") REFERENCES "post_types"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "field_definitions" ADD CONSTRAINT "FK_f74376372d5e10a4b0a77d4da40" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "field_definitions" ADD CONSTRAINT "FK_6511cdf11374bb0f26291addc86" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content_attachments" ADD CONSTRAINT "FK_138c66d0c4fb221d7501a54f8bf" FOREIGN KEY ("postContentId") REFERENCES "post_content"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content_attachments" ADD CONSTRAINT "FK_00f6077f35c75f30f8660ebcc30" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content_categories" ADD CONSTRAINT "FK_1d041a1041e7671675a984fdd6d" FOREIGN KEY ("postContentId") REFERENCES "post_content"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content_categories" ADD CONSTRAINT "FK_2fe8d8a66b4f549f666c389d4d5" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content_tags" ADD CONSTRAINT "FK_e6bdf8433891b2f5b79cb56a199" FOREIGN KEY ("postContentId") REFERENCES "post_content"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content_tags" ADD CONSTRAINT "FK_17cdef55f3390594f8ba1f39b02" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content" ADD CONSTRAINT "FK_f9b5ecd607b2c1ef7fa3be22cff" FOREIGN KEY ("postTypeId") REFERENCES "post_types"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content" ADD CONSTRAINT "FK_a1cc08abc65b519870227e4f116" FOREIGN KEY ("featuredImageId") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content" ADD CONSTRAINT "FK_1992c3034cb036fc5e17b84651c" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content" ADD CONSTRAINT "FK_21cdfa14e81a23e88c0446ade68" FOREIGN KEY ("parentId") REFERENCES "post_content"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content" ADD CONSTRAINT "FK_a259ae57fbfb9d743d91d672464" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content" ADD CONSTRAINT "FK_d424b585fe74b3e9474fe63a3ed" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "story_versions" ADD CONSTRAINT "FK_0ec4c9cf4d4d7e206cabcc34500" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "story_versions" ADD CONSTRAINT "FK_afc7a9a09b893cc47f914400566" FOREIGN KEY ("parentVersionId") REFERENCES "story_versions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "story_versions" ADD CONSTRAINT "FK_0dcb5886b13fc27265a85e98492" FOREIGN KEY ("mergedFromVersionId") REFERENCES "story_versions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "story_versions" ADD CONSTRAINT "FK_19e16ffad6936c8dc8076863b43" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "email_verifications" ADD CONSTRAINT "FK_4e63a91e0a684b31496bd50733e" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    )
    await queryRunner.query(
      `ALTER TABLE "story_attachments" ADD CONSTRAINT "FK_136a1d46477996a0bae5f53c302" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE`
    )
    await queryRunner.query(
      `ALTER TABLE "story_attachments" ADD CONSTRAINT "FK_0d4b08581736ce20d08d7c64d50" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE`
    )
    await queryRunner.query(
      `ALTER TABLE "story_tags" ADD CONSTRAINT "FK_fa7e648db91d969a6ec2e93c5c3" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE`
    )
    await queryRunner.query(
      `ALTER TABLE "story_tags" ADD CONSTRAINT "FK_db3d6ae34ee29138530d59e5a6c" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE`
    )
    await queryRunner.query(
      `ALTER TABLE "story_categories" ADD CONSTRAINT "FK_14ea1b32476b8f2e4181770eea2" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE`
    )
    await queryRunner.query(
      `ALTER TABLE "story_categories" ADD CONSTRAINT "FK_e482c279e8b5b79d200ec56776f" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "story_categories" DROP CONSTRAINT "FK_e482c279e8b5b79d200ec56776f"`
    )
    await queryRunner.query(
      `ALTER TABLE "story_categories" DROP CONSTRAINT "FK_14ea1b32476b8f2e4181770eea2"`
    )
    await queryRunner.query(
      `ALTER TABLE "story_tags" DROP CONSTRAINT "FK_db3d6ae34ee29138530d59e5a6c"`
    )
    await queryRunner.query(
      `ALTER TABLE "story_tags" DROP CONSTRAINT "FK_fa7e648db91d969a6ec2e93c5c3"`
    )
    await queryRunner.query(
      `ALTER TABLE "story_attachments" DROP CONSTRAINT "FK_0d4b08581736ce20d08d7c64d50"`
    )
    await queryRunner.query(
      `ALTER TABLE "story_attachments" DROP CONSTRAINT "FK_136a1d46477996a0bae5f53c302"`
    )
    await queryRunner.query(
      `ALTER TABLE "email_verifications" DROP CONSTRAINT "FK_4e63a91e0a684b31496bd50733e"`
    )
    await queryRunner.query(
      `ALTER TABLE "story_versions" DROP CONSTRAINT "FK_19e16ffad6936c8dc8076863b43"`
    )
    await queryRunner.query(
      `ALTER TABLE "story_versions" DROP CONSTRAINT "FK_0dcb5886b13fc27265a85e98492"`
    )
    await queryRunner.query(
      `ALTER TABLE "story_versions" DROP CONSTRAINT "FK_afc7a9a09b893cc47f914400566"`
    )
    await queryRunner.query(
      `ALTER TABLE "story_versions" DROP CONSTRAINT "FK_0ec4c9cf4d4d7e206cabcc34500"`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content" DROP CONSTRAINT "FK_d424b585fe74b3e9474fe63a3ed"`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content" DROP CONSTRAINT "FK_a259ae57fbfb9d743d91d672464"`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content" DROP CONSTRAINT "FK_21cdfa14e81a23e88c0446ade68"`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content" DROP CONSTRAINT "FK_1992c3034cb036fc5e17b84651c"`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content" DROP CONSTRAINT "FK_a1cc08abc65b519870227e4f116"`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content" DROP CONSTRAINT "FK_f9b5ecd607b2c1ef7fa3be22cff"`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content_tags" DROP CONSTRAINT "FK_17cdef55f3390594f8ba1f39b02"`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content_tags" DROP CONSTRAINT "FK_e6bdf8433891b2f5b79cb56a199"`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content_categories" DROP CONSTRAINT "FK_2fe8d8a66b4f549f666c389d4d5"`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content_categories" DROP CONSTRAINT "FK_1d041a1041e7671675a984fdd6d"`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content_attachments" DROP CONSTRAINT "FK_00f6077f35c75f30f8660ebcc30"`
    )
    await queryRunner.query(
      `ALTER TABLE "post_content_attachments" DROP CONSTRAINT "FK_138c66d0c4fb221d7501a54f8bf"`
    )
    await queryRunner.query(
      `ALTER TABLE "field_definitions" DROP CONSTRAINT "FK_6511cdf11374bb0f26291addc86"`
    )
    await queryRunner.query(
      `ALTER TABLE "field_definitions" DROP CONSTRAINT "FK_f74376372d5e10a4b0a77d4da40"`
    )
    await queryRunner.query(
      `ALTER TABLE "field_definitions" DROP CONSTRAINT "FK_d6832863272b9d4e0a4fac5eb6e"`
    )
    await queryRunner.query(
      `ALTER TABLE "post_types" DROP CONSTRAINT "FK_5540bf075cbf8234cdcf8e45ad5"`
    )
    await queryRunner.query(
      `ALTER TABLE "post_types" DROP CONSTRAINT "FK_7d164d9106c9eb6a82f9cf34046"`
    )
    await queryRunner.query(
      `ALTER TABLE "stories" DROP CONSTRAINT "FK_d7aad83de720aebdbade1d05862"`
    )
    await queryRunner.query(
      `ALTER TABLE "stories" DROP CONSTRAINT "FK_e74984822f6cdd83247da650547"`
    )
    await queryRunner.query(
      `ALTER TABLE "stories" DROP CONSTRAINT "FK_f3c8344798395c9127a2a1ce730"`
    )
    await queryRunner.query(
      `ALTER TABLE "stories" DROP CONSTRAINT "FK_b403b0cc8106c317b30c8498140"`
    )
    await queryRunner.query(
      `ALTER TABLE "stories" DROP CONSTRAINT "FK_655cd324a6949f46e1b397f621e"`
    )
    await queryRunner.query(`ALTER TABLE "tags" DROP CONSTRAINT "FK_cd89071aae6fa8a278f1f00fafc"`)
    await queryRunner.query(`ALTER TABLE "tags" DROP CONSTRAINT "FK_00f2dfb8316772f57ce0c9c15c9"`)
    await queryRunner.query(`ALTER TABLE "tags" DROP CONSTRAINT "FK_e968d9e7a21b2d9cd9244e79f48"`)
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6"`
    )
    await queryRunner.query(
      `ALTER TABLE "password_resets" DROP CONSTRAINT "FK_d95569f623f28a0bf034a55099e"`
    )
    await queryRunner.query(
      `ALTER TABLE "password_history" DROP CONSTRAINT "FK_20c510e5ca12f63b0c915c3e2df"`
    )
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_cfa83f61e4d27a87fcae1e025ab"`
    )
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_06792d0c62ce6b0203c03643cdd"`
    )
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_b4599f8b8f548d35850afa2d12c"`
    )
    await queryRunner.query(
      `ALTER TABLE "user_roles" DROP CONSTRAINT "FK_86033897c009fcca8b6505d6be2"`
    )
    await queryRunner.query(
      `ALTER TABLE "user_roles" DROP CONSTRAINT "FK_472b25323af01488f1f66a06b67"`
    )
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_e6f8c136a8e286370ac3b5d73b6"`)
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_077ccba40313d98bb3084eb42d9"`)
    await queryRunner.query(
      `ALTER TABLE "attachments" DROP CONSTRAINT "FK_35138b11d46d53c48ed932afa47"`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_e482c279e8b5b79d200ec56776"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_14ea1b32476b8f2e4181770eea"`)
    await queryRunner.query(`DROP TABLE "story_categories"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_db3d6ae34ee29138530d59e5a6"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_fa7e648db91d969a6ec2e93c5c"`)
    await queryRunner.query(`DROP TABLE "story_tags"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_0d4b08581736ce20d08d7c64d5"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_136a1d46477996a0bae5f53c30"`)
    await queryRunner.query(`DROP TABLE "story_attachments"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_595be4c36e66b21d3fd14c73a2"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_b595bb6b9d8d40089bfd47d05f"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_442ebfa56e39cc1a9bd8467742"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_44e5cfea68f87243cad38bb1b1"`)
    await queryRunner.query(`DROP TABLE "email_verifications"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_4617211fede67416fba44f51e2"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_071c6a48f04d113da38e2c8f30"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_9e812f3017d8ae1857cb947fa7"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_475696cfd7d70f52c6c5687a98"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_19e16ffad6936c8dc8076863b4"`)
    await queryRunner.query(`DROP TABLE "story_versions"`)
    await queryRunner.query(`DROP TYPE "public"."story_versions_status_enum"`)
    await queryRunner.query(`DROP TYPE "public"."story_versions_versiontype_enum"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_SLUG_POST_TYPE_UNIQUE"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_POST_TYPE"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_STATUS"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_AUTHOR"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_TYPE_STATUS"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_PUBLISHED_AT"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_SCHEDULED_AT"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_PARENT"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_HIERARCHY_PATH"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_FEATURED"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_PINNED"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_DELETED_AT"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_309feda1c7f531de4f99a8e8af"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_6db611d752599d9120e78c520f"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_4d6ef3e0b48f62c4b76e34b809"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_98e354e640213d7eaa7ce7409b"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_f642ef8eb89ccfde9ced9fba09"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_7e0bf390a5906494b60f8cc51a"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_310ad55add16c920cb6c4aee37"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_7816963aeec9d405f1d19a9fd1"`)
    await queryRunner.query(`DROP TABLE "post_content"`)
    await queryRunner.query(`DROP TYPE "public"."post_content_status_enum"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_TAGS_UNIQUE"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_TAGS_CONTENT"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_TAGS_TAG"`)
    await queryRunner.query(`DROP TABLE "post_content_tags"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_CATEGORIES_UNIQUE"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_CATEGORIES_CONTENT"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_CATEGORIES_CATEGORY"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_CATEGORIES_PRIMARY"`)
    await queryRunner.query(`DROP TABLE "post_content_categories"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_ATTACHMENTS_UNIQUE"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_ATTACHMENTS_CONTENT"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_ATTACHMENTS_ATTACHMENT"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_ATTACHMENTS_ORDER"`)
    await queryRunner.query(`DROP TABLE "post_content_attachments"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_FIELD_DEFINITIONS_POST_TYPE"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_FIELD_DEFINITIONS_NAME"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_FIELD_DEFINITIONS_TYPE"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_FIELD_DEFINITIONS_REQUIRED"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_FIELD_DEFINITIONS_POST_TYPE_ORDER"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_FIELD_DEFINITIONS_NAME_POST_TYPE_UNIQUE"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_FIELD_DEFINITIONS_DELETED_AT"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_0510701467ba81c2c005fc1325"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_984953bbbe4377be966c20b1a3"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_fbf508f49eb2ac412d10a50619"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_7b4cc18f5aafdcb7b8945d4a14"`)
    await queryRunner.query(`DROP TABLE "field_definitions"`)
    await queryRunner.query(`DROP TYPE "public"."field_definitions_fieldtype_enum"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_TYPES_SLUG"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_TYPES_NAME"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_TYPES_ACTIVE"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_TYPES_SYSTEM"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_TYPES_DELETED_AT"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_7bda11923fd2a01796be308561"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_31981c5f2d14b6e8cb82622d92"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_9cc5bb721511e6a048eb3ef0ed"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_75d63e7c66f9f41eebbd2c9141"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_1c3d8778f5e1dc7d2cd095b7cb"`)
    await queryRunner.query(`DROP TABLE "post_types"`)
    await queryRunner.query(`DROP TABLE "categories"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_e74984822f6cdd83247da65054"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_6ebc2abeaa21a1231c367e43ea"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_f4db74cea8a693da5be9926e64"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_655cd324a6949f46e1b397f621"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_6a991a216142aa148f79b0602e"`)
    await queryRunner.query(`DROP TABLE "stories"`)
    await queryRunner.query(`DROP TYPE "public"."stories_priority_enum"`)
    await queryRunner.query(`DROP TYPE "public"."stories_status_enum"`)
    await queryRunner.query(`DROP TYPE "public"."stories_type_enum"`)
    await queryRunner.query(`DROP TABLE "tags"`)
    await queryRunner.query(`DROP TABLE "countries"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_07bd9c0d345c7e1110981e3431"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_f6949743fe709ee028ea6face1"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_d9647ba95d20a945419c3348a5"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_7613d71def6bf211503844d573"`)
    await queryRunner.query(`DROP TABLE "sessions"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_7e57f540b334d522f9cf5b16ca"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_9b34edd5264effbbc875c266a9"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_be7aa8c6ca651d91d29ac03dad"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_e7a6043ff92629b85b5da2e543"`)
    await queryRunner.query(`DROP TABLE "password_resets"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_ddea018826c35b58c992688c1f"`)
    await queryRunner.query(`DROP TABLE "password_history"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_99e589da8f9e9326ee0d01a028"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_0ec936941eb8556fcd7a1f0eae"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_13c69424c440a0e765053feb4b"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_8ddc86298ac7fadad468b28d83"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_5fed71356a22964650a661558f"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_2961862b2704794af56359ff0a"`)
    await queryRunner.query(`DROP TABLE "audit_logs"`)
    await queryRunner.query(`DROP TYPE "public"."audit_logs_severity_enum"`)
    await queryRunner.query(`DROP TYPE "public"."audit_logs_status_enum"`)
    await queryRunner.query(`DROP TYPE "public"."audit_logs_action_enum"`)
    await queryRunner.query(`DROP TABLE "permissions"`)
    await queryRunner.query(`DROP TYPE "public"."permissions_subject_enum"`)
    await queryRunner.query(`DROP TYPE "public"."permissions_action_enum"`)
    await queryRunner.query(`DROP TABLE "role_permissions"`)
    await queryRunner.query(`DROP TABLE "roles"`)
    await queryRunner.query(`DROP TABLE "user_roles"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_077ccba40313d98bb3084eb42d"`)
    await queryRunner.query(`DROP TABLE "users"`)
    await queryRunner.query(`DROP TABLE "attachments"`)
  }
}
