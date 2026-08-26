CREATE TABLE `backup_remote_path_migration_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`status` text NOT NULL,
	`completed_receipt_ids` text NOT NULL,
	`skipped_items` text NOT NULL,
	`collision_items` text NOT NULL,
	`last_error` text,
	`updated_at` text NOT NULL,
	`completed_at` text,
	CONSTRAINT "backup_remote_path_migration_runs_status_check" CHECK("backup_remote_path_migration_runs"."status" IN ('running', 'blocked', 'succeeded')),
	CONSTRAINT "backup_remote_path_migration_runs_completed_receipt_ids_check" CHECK(json_valid("backup_remote_path_migration_runs"."completed_receipt_ids")),
	CONSTRAINT "backup_remote_path_migration_runs_skipped_items_check" CHECK(json_valid("backup_remote_path_migration_runs"."skipped_items")),
	CONSTRAINT "backup_remote_path_migration_runs_collision_items_check" CHECK(json_valid("backup_remote_path_migration_runs"."collision_items"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backup_remote_path_migration_runs_fingerprint_unique` ON `backup_remote_path_migration_runs` (`fingerprint`);
--> statement-breakpoint
CREATE INDEX `backup_remote_path_migration_runs_status_index` ON `backup_remote_path_migration_runs` (`status`, `updated_at`);
