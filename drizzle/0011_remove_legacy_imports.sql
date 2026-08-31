UPDATE `jobs`
SET
	`status` = 'cancelled',
	`lease_owner` = NULL,
	`lease_expires_at` = NULL,
	`heartbeat_at` = NULL,
	`updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `status` IN ('queued', 'running', 'retryable')
	AND CASE WHEN json_valid(`payload`) THEN json_type(`payload`, '$.legacyImportId') ELSE NULL END IS NOT NULL;--> statement-breakpoint
UPDATE `workflows`
SET
	`status` = 'cancelled',
	`updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `status` IN ('queued', 'running')
	AND EXISTS (
		SELECT 1
		FROM `jobs`
		WHERE `jobs`.`workflow_id` = `workflows`.`id`
			AND CASE WHEN json_valid(`jobs`.`payload`) THEN json_type(`jobs`.`payload`, '$.legacyImportId') ELSE NULL END IS NOT NULL
	)
	AND NOT EXISTS (
		SELECT 1
		FROM `jobs`
		WHERE `jobs`.`workflow_id` = `workflows`.`id`
			AND `jobs`.`status` IN ('queued', 'running', 'retryable')
			AND CASE WHEN json_valid(`jobs`.`payload`) THEN json_type(`jobs`.`payload`, '$.legacyImportId') ELSE NULL END IS NULL
	);--> statement-breakpoint
UPDATE `jobs`
SET `payload` = json_remove(`payload`, '$.legacyImportId')
WHERE CASE WHEN json_valid(`payload`) THEN json_type(`payload`, '$.legacyImportId') ELSE NULL END IS NOT NULL;--> statement-breakpoint
DROP TABLE `legacy_imports`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_project_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "project_grants_role_check" CHECK("__new_project_grants"."role" IN ('contributor', 'admin'))
);
--> statement-breakpoint
INSERT INTO `__new_project_grants`("id", "project_id", "organization_id", "subject_id", "role", "created_at", "updated_at") SELECT "id", "project_id", "organization_id", "subject_id", CASE "role" WHEN 'assets.uploader' THEN 'contributor' WHEN 'assets.admin' THEN 'admin' ELSE "role" END, "created_at", "updated_at" FROM `project_grants`;--> statement-breakpoint
DROP TABLE `project_grants`;--> statement-breakpoint
ALTER TABLE `__new_project_grants` RENAME TO `project_grants`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `project_grants_subject_role_unique` ON `project_grants` (`project_id`,`subject_id`,`role`);--> statement-breakpoint
CREATE INDEX `project_grants_organization_index` ON `project_grants` (`organization_id`);--> statement-breakpoint
CREATE INDEX `project_grants_subject_index` ON `project_grants` (`subject_id`);
