CREATE TABLE `project_storage_domains` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `bucket` text NOT NULL,
  `custom_domain` text NOT NULL,
  `zone_id` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `project_storage_domains_project_bucket_custom_domain_unique` ON `project_storage_domains` (`project_id`,`bucket`,`custom_domain`);--> statement-breakpoint
CREATE INDEX `project_storage_domains_project_index` ON `project_storage_domains` (`project_id`);--> statement-breakpoint
CREATE INDEX `project_storage_domains_bucket_index` ON `project_storage_domains` (`bucket`);--> statement-breakpoint
CREATE TABLE `r2_bucket_credentials` (
  `bucket` text PRIMARY KEY NOT NULL,
  `access_key_id_ciphertext` text NOT NULL,
  `secret_access_key_ciphertext` text NOT NULL,
  `revocation_id` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `r2_bucket_credentials_revocation_unique` ON `r2_bucket_credentials` (`revocation_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `project_storage_domains` (`id`, `project_id`, `bucket`, `custom_domain`, `zone_id`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), `project_id`, json_extract(`source_binding`, '$.bucket'),
  json_extract(`source_binding`, '$.customDomain'), json_extract(`source_binding`, '$.zoneId'),
  `created_at`, `created_at`
FROM `storage_migrations`
WHERE json_valid(`source_binding`)
  AND json_extract(`source_binding`, '$.projectId') = `storage_migrations`.`project_id`
  AND json_extract(`source_binding`, '$.bucket') IS NOT NULL
  AND json_extract(`source_binding`, '$.customDomain') IS NOT NULL
  AND json_extract(`source_binding`, '$.zoneId') IS NOT NULL
UNION ALL
SELECT lower(hex(randomblob(16))), `project_id`, json_extract(`target_binding`, '$.bucket'),
  json_extract(`target_binding`, '$.customDomain'), json_extract(`target_binding`, '$.zoneId'),
  `created_at`, `created_at`
FROM `storage_migrations`
WHERE json_valid(`target_binding`)
  AND json_extract(`target_binding`, '$.projectId') = `storage_migrations`.`project_id`
  AND json_extract(`target_binding`, '$.bucket') IS NOT NULL
  AND json_extract(`target_binding`, '$.customDomain') IS NOT NULL
  AND json_extract(`target_binding`, '$.zoneId') IS NOT NULL;
