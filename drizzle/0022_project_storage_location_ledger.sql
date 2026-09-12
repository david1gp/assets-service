CREATE TABLE `project_storage_locations` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `environment` text NOT NULL,
  `bucket` text NOT NULL,
  `prefix` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE cascade,
  CONSTRAINT "project_storage_locations_environment_check" CHECK("project_storage_locations"."environment" IN ('development', 'production'))
);--> statement-breakpoint
CREATE UNIQUE INDEX `project_storage_locations_project_environment_bucket_prefix_unique` ON `project_storage_locations` (`project_id`,`environment`,`bucket`,`prefix`);--> statement-breakpoint
CREATE INDEX `project_storage_locations_project_index` ON `project_storage_locations` (`project_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `project_storage_locations` (`id`, `project_id`, `environment`, `bucket`, `prefix`, `created_at`)
SELECT lower(hex(randomblob(16))), `project_id`, `name`, `r2_bucket`, trim(coalesce(`r2_prefix`, ''), '/'), `created_at`
FROM `environments`;--> statement-breakpoint
INSERT OR IGNORE INTO `project_storage_locations` (`id`, `project_id`, `environment`, `bucket`, `prefix`, `created_at`)
SELECT lower(hex(randomblob(16))), `storage_migrations`.`project_id`, json_extract(`source_binding`, '$.environment'),
  json_extract(`source_binding`, '$.bucket'), trim(coalesce(json_extract(`source_binding`, '$.prefix'), ''), '/'),
  `storage_migrations`.`created_at`
FROM `storage_migrations`
WHERE json_valid(`source_binding`)
  AND json_extract(`source_binding`, '$.environment') IN ('development', 'production')
  AND json_extract(`source_binding`, '$.bucket') IS NOT NULL
UNION ALL
SELECT lower(hex(randomblob(16))), `storage_migrations`.`project_id`, json_extract(`target_binding`, '$.environment'),
  json_extract(`target_binding`, '$.bucket'), trim(coalesce(json_extract(`target_binding`, '$.prefix'), ''), '/'),
  `storage_migrations`.`created_at`
FROM `storage_migrations`
WHERE json_valid(`target_binding`)
  AND json_extract(`target_binding`, '$.environment') IN ('development', 'production')
  AND json_extract(`target_binding`, '$.bucket') IS NOT NULL;
