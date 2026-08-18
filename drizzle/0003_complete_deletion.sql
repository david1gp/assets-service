PRAGMA foreign_keys = OFF;
--> statement-breakpoint
CREATE TABLE `jobs_new` (
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
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "jobs_kind_check" CHECK("jobs_new"."kind" IN ('verify_original', 'backup_original', 'plan_outputs', 'process_image_output', 'copy_video_output', 'process_font_output', 'publish_asset', 'notify_customer_upload', 'cleanup_local_files', 'delete_asset')),
	CONSTRAINT "jobs_status_check" CHECK("jobs_new"."status" IN ('queued', 'running', 'retryable', 'dead', 'cancelled', 'succeeded')),
	CONSTRAINT "jobs_attempts_check" CHECK("jobs_new"."attempts" >= 0 AND "jobs_new"."retry_limit" >= 0),
	CONSTRAINT "jobs_payload_schema_version_check" CHECK("jobs_new"."payload_schema_version" > 0)
);
--> statement-breakpoint
INSERT INTO `jobs_new` (`id`, `workflow_id`, `kind`, `status`, `available_at`, `priority`, `attempts`, `retry_limit`, `lease_owner`, `lease_expires_at`, `heartbeat_at`, `idempotency_key`, `payload_schema_version`, `payload`, `error`, `created_at`, `updated_at`)
SELECT `id`, `workflow_id`, `kind`, `status`, `available_at`, `priority`, `attempts`, `retry_limit`, `lease_owner`, `lease_expires_at`, `heartbeat_at`, `idempotency_key`, `payload_schema_version`, `payload`, `error`, `created_at`, `updated_at`
FROM `jobs`;
--> statement-breakpoint
DROP TABLE `jobs`;
--> statement-breakpoint
ALTER TABLE `jobs_new` RENAME TO `jobs`;
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_idempotency_key_unique` ON `jobs` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `jobs_claim_index` ON `jobs` (`status`, `available_at`, `priority`);
--> statement-breakpoint
CREATE INDEX `jobs_workflow_index` ON `jobs` (`workflow_id`);
--> statement-breakpoint
CREATE TABLE `deletion_states_new` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`status` text NOT NULL,
	`completed_steps` text NOT NULL,
	`pending_remote_objects` text NOT NULL,
	`error` text,
	`requested_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	CONSTRAINT "deletion_states_status_check" CHECK("deletion_states_new"."status" IN ('requested', 'in_progress', 'succeeded', 'retryable', 'failed'))
);
--> statement-breakpoint
INSERT INTO `deletion_states_new` (`id`, `asset_id`, `status`, `completed_steps`, `pending_remote_objects`, `error`, `requested_at`, `updated_at`, `completed_at`)
SELECT `id`, `asset_id`, `status`, `completed_steps`, `pending_remote_objects`, `error`, `requested_at`, `updated_at`, `completed_at`
FROM `deletion_states`;
--> statement-breakpoint
DROP TABLE `deletion_states`;
--> statement-breakpoint
ALTER TABLE `deletion_states_new` RENAME TO `deletion_states`;
--> statement-breakpoint
CREATE UNIQUE INDEX `deletion_states_asset_unique` ON `deletion_states` (`asset_id`);
--> statement-breakpoint
CREATE INDEX `deletion_states_status_index` ON `deletion_states` (`status`, `updated_at`);
--> statement-breakpoint
PRAGMA foreign_keys = ON;
