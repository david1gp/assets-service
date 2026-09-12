ALTER TABLE `projects` ADD COLUMN `archive_state` text NOT NULL DEFAULT 'active' CHECK(`archive_state` IN ('active', 'archiving', 'archived', 'unarchiving'));--> statement-breakpoint
CREATE INDEX `projects_organization_archive_state_index` ON `projects` (`organization_id`,`archive_state`);
