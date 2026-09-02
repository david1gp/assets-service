CREATE TABLE `storage_migrations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`environment_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`source_binding` text NOT NULL,
	`target_binding` text NOT NULL,
	`status` text NOT NULL,
	`progress` text NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`started_at` text,
	`completed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "storage_migrations_status_check" CHECK("storage_migrations"."status" IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "storage_migrations_source_binding_check" CHECK(json_valid("storage_migrations"."source_binding")),
	CONSTRAINT "storage_migrations_target_binding_check" CHECK(json_valid("storage_migrations"."target_binding")),
	CONSTRAINT "storage_migrations_progress_check" CHECK(json_valid("storage_migrations"."progress"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storage_migrations_environment_idempotency_unique` ON `storage_migrations` (`environment_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `storage_migrations_environment_active_unique` ON `storage_migrations` (`environment_id`) WHERE "storage_migrations"."status" IN ('queued', 'running');--> statement-breakpoint
CREATE INDEX `storage_migrations_project_status_index` ON `storage_migrations` (`project_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `storage_migrations_environment_index` ON `storage_migrations` (`environment_id`,`updated_at`);