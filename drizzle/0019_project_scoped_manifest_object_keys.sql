DROP INDEX `manifests_object_key_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `manifests_project_object_key_unique` ON `manifests` (`project_id`,`object_key`);
