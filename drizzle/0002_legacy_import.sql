CREATE TABLE `legacy_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`root` text NOT NULL,
	`environment` text NOT NULL,
	`atomicity` text NOT NULL,
	`status` text NOT NULL,
	`imported_count` integer NOT NULL,
	`conflicts` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "legacy_imports_imported_count_check" CHECK("legacy_imports"."imported_count" >= 0),
	CONSTRAINT "legacy_imports_status_check" CHECK("legacy_imports"."status" IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "legacy_imports_atomicity_check" CHECK("legacy_imports"."atomicity" IN ('all_or_nothing', 'best_effort'))
);
--> statement-breakpoint
CREATE INDEX `legacy_imports_project_created_index` ON `legacy_imports` (`project_id`,`created_at`);
