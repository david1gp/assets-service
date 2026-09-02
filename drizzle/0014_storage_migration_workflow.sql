CREATE TABLE `__new_workflows` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `asset_id` text,
  `kind` text NOT NULL,
  `status` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `source_revision_id` text,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE cascade,
  FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE cascade ON DELETE set null,
  FOREIGN KEY (`source_revision_id`) REFERENCES `source_revisions`(`id`) ON UPDATE cascade ON DELETE set null,
  CONSTRAINT "workflows_kind_check" CHECK("__new_workflows"."kind" IN ('asset_processing', 'catalog_generation', 'deletion', 'cleanup', 'storage_migration')),
  CONSTRAINT "workflows_status_check" CHECK("__new_workflows"."status" IN ('queued', 'running', 'succeeded', 'failed', 'cancelled'))
);
--> statement-breakpoint
INSERT INTO `__new_workflows`("id", "project_id", "asset_id", "kind", "status", "created_at", "updated_at", "source_revision_id") SELECT "id", "project_id", "asset_id", "kind", "status", "created_at", "updated_at", "source_revision_id" FROM `workflows`;
--> statement-breakpoint
CREATE TABLE `__new_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `workflow_id` text NOT NULL,
  `kind` text NOT NULL,
  `status` text NOT NULL,
  `available_at` text NOT NULL,
  `priority` integer NOT NULL,
  `attempts` integer NOT NULL,
  `retry_limit` integer NOT NULL,
  `lease_owner` text,
  `lease_expires_at` text,
  `heartbeat_at` text,
  `idempotency_key` text NOT NULL,
  `payload_schema_version` integer NOT NULL,
  `payload` text NOT NULL,
  `error` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`workflow_id`) REFERENCES `__new_workflows`(`id`) ON UPDATE cascade ON DELETE cascade,
  CONSTRAINT "jobs_kind_check" CHECK("__new_jobs"."kind" IN ('verify_original', 'backup_original', 'plan_outputs', 'process_image_output', 'copy_video_output', 'process_font_output', 'process_document_output', 'publish_asset', 'notify_customer_upload', 'cleanup_local_files', 'delete_asset', 'migrate_storage')),
  CONSTRAINT "jobs_status_check" CHECK("__new_jobs"."status" IN ('queued', 'running', 'succeeded', 'retryable', 'dead', 'cancelled')),
  CONSTRAINT "jobs_attempts_check" CHECK("__new_jobs"."attempts" >= 0 AND "__new_jobs"."retry_limit" >= 0),
  CONSTRAINT "jobs_payload_schema_version_check" CHECK("__new_jobs"."payload_schema_version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_jobs`("id", "workflow_id", "kind", "status", "available_at", "priority", "attempts", "retry_limit", "lease_owner", "lease_expires_at", "heartbeat_at", "idempotency_key", "payload_schema_version", "payload", "error", "created_at", "updated_at") SELECT "id", "workflow_id", "kind", "status", "available_at", "priority", "attempts", "retry_limit", "lease_owner", "lease_expires_at", "heartbeat_at", "idempotency_key", "payload_schema_version", "payload", "error", "created_at", "updated_at" FROM `jobs`;
--> statement-breakpoint
CREATE TABLE `__new_job_dependencies` (
  `id` text PRIMARY KEY NOT NULL,
  `job_id` text NOT NULL,
  `depends_on_job_id` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`job_id`) REFERENCES `__new_jobs`(`id`) ON UPDATE cascade ON DELETE cascade,
  FOREIGN KEY (`depends_on_job_id`) REFERENCES `__new_jobs`(`id`) ON UPDATE cascade ON DELETE cascade,
  CONSTRAINT "job_dependencies_not_self_check" CHECK("__new_job_dependencies"."job_id" <> "__new_job_dependencies"."depends_on_job_id")
);
--> statement-breakpoint
INSERT INTO `__new_job_dependencies`("id", "job_id", "depends_on_job_id", "created_at") SELECT "id", "job_id", "depends_on_job_id", "created_at" FROM `job_dependencies`;
--> statement-breakpoint
CREATE TABLE `__new_backup_receipts` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `source_revision_id` text NOT NULL,
  `job_id` text NOT NULL,
  `remote_path` text NOT NULL,
  `byte_size` integer NOT NULL,
  `sha256` text NOT NULL,
  `check_result` text NOT NULL,
  `completed_at` text NOT NULL,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE cascade,
  FOREIGN KEY (`source_revision_id`) REFERENCES `source_revisions`(`id`) ON UPDATE cascade ON DELETE cascade,
  FOREIGN KEY (`job_id`) REFERENCES `__new_jobs`(`id`) ON UPDATE cascade ON DELETE restrict,
  CONSTRAINT "backup_receipts_check_result_check" CHECK("__new_backup_receipts"."check_result" IN ('verified', 'failed')),
  CONSTRAINT "backup_receipts_byte_size_check" CHECK("__new_backup_receipts"."byte_size" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_backup_receipts`("id", "project_id", "source_revision_id", "job_id", "remote_path", "byte_size", "sha256", "check_result", "completed_at") SELECT "id", "project_id", "source_revision_id", "job_id", "remote_path", "byte_size", "sha256", "check_result", "completed_at" FROM `backup_receipts`;
--> statement-breakpoint
DROP TABLE `backup_receipts`;
--> statement-breakpoint
DROP TABLE `job_dependencies`;
--> statement-breakpoint
DROP TABLE `jobs`;
--> statement-breakpoint
DROP TABLE `workflows`;
--> statement-breakpoint
ALTER TABLE `__new_workflows` RENAME TO `workflows`;
--> statement-breakpoint
ALTER TABLE `__new_jobs` RENAME TO `jobs`;
--> statement-breakpoint
ALTER TABLE `__new_job_dependencies` RENAME TO `job_dependencies`;
--> statement-breakpoint
ALTER TABLE `__new_backup_receipts` RENAME TO `backup_receipts`;
--> statement-breakpoint
CREATE INDEX `workflows_project_status_index` ON `workflows` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `workflows_asset_index` ON `workflows` (`asset_id`);--> statement-breakpoint
CREATE INDEX `workflows_source_revision_index` ON `workflows` (`source_revision_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_idempotency_key_unique` ON `jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `jobs_claim_index` ON `jobs` (`status`,`available_at`,`priority`);--> statement-breakpoint
CREATE INDEX `jobs_workflow_index` ON `jobs` (`workflow_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `job_dependencies_pair_unique` ON `job_dependencies` (`job_id`,`depends_on_job_id`);--> statement-breakpoint
CREATE INDEX `job_dependencies_dependency_index` ON `job_dependencies` (`depends_on_job_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `backup_receipts_verified_source_unique` ON `backup_receipts` (`source_revision_id`) WHERE "backup_receipts"."check_result" = 'verified';--> statement-breakpoint
CREATE INDEX `backup_receipts_project_index` ON `backup_receipts` (`project_id`);--> statement-breakpoint
CREATE INDEX `backup_receipts_source_revision_index` ON `backup_receipts` (`source_revision_id`);
