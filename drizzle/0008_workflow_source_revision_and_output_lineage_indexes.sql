ALTER TABLE `workflows` ADD `source_revision_id` text REFERENCES source_revisions(id) ON UPDATE cascade ON DELETE set null;--> statement-breakpoint
CREATE INDEX `workflows_source_revision_index` ON `workflows` (`source_revision_id`);--> statement-breakpoint
CREATE INDEX `output_versions_source_revision_index` ON `output_versions` (`source_revision_id`);
