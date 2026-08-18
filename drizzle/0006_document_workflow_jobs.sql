PRAGMA foreign_keys=OFF;
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
  FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE cascade ON DELETE cascade,
  CONSTRAINT "jobs_kind_check" CHECK("__new_jobs"."kind" IN ('verify_original', 'backup_original', 'plan_outputs', 'process_image_output', 'copy_video_output', 'process_font_output', 'process_document_output', 'publish_asset', 'notify_customer_upload', 'cleanup_local_files', 'delete_asset')),
  CONSTRAINT "jobs_status_check" CHECK("__new_jobs"."status" IN ('queued', 'running', 'succeeded', 'retryable', 'dead', 'cancelled')),
  CONSTRAINT "jobs_attempts_check" CHECK("__new_jobs"."attempts" >= 0 AND "__new_jobs"."retry_limit" >= 0),
  CONSTRAINT "jobs_payload_schema_version_check" CHECK("__new_jobs"."payload_schema_version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_jobs`("id", "workflow_id", "kind", "status", "available_at", "priority", "attempts", "retry_limit", "lease_owner", "lease_expires_at", "heartbeat_at", "idempotency_key", "payload_schema_version", "payload", "error", "created_at", "updated_at") SELECT "id", "workflow_id", "kind", "status", "available_at", "priority", "attempts", "retry_limit", "lease_owner", "lease_expires_at", "heartbeat_at", "idempotency_key", "payload_schema_version", "payload", "error", "created_at", "updated_at" FROM `jobs`;
--> statement-breakpoint
DROP TABLE `jobs`;
--> statement-breakpoint
ALTER TABLE `__new_jobs` RENAME TO `jobs`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_idempotency_key_unique` ON `jobs` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `jobs_claim_index` ON `jobs` (`status`,`available_at`,`priority`);
--> statement-breakpoint
CREATE INDEX `jobs_workflow_index` ON `jobs` (`workflow_id`);
