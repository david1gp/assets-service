CREATE TABLE `reconciliation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`status` text NOT NULL,
	`completed_item_ids` text NOT NULL,
	`deleted_object_keys` text NOT NULL,
	`skipped_items` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	CONSTRAINT "reconciliation_runs_status_check" CHECK("reconciliation_runs"."status" IN ('running', 'succeeded')),
	CONSTRAINT "reconciliation_runs_completed_item_ids_check" CHECK(json_valid("reconciliation_runs"."completed_item_ids")),
	CONSTRAINT "reconciliation_runs_deleted_object_keys_check" CHECK(json_valid("reconciliation_runs"."deleted_object_keys")),
	CONSTRAINT "reconciliation_runs_skipped_items_check" CHECK(json_valid("reconciliation_runs"."skipped_items"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reconciliation_runs_plan_unique` ON `reconciliation_runs` (`plan_id`);
--> statement-breakpoint
CREATE INDEX `reconciliation_runs_status_index` ON `reconciliation_runs` (`status`, `updated_at`);
