CREATE TABLE `structure_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`depth` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `structure_folders`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "structure_folders_depth_check" CHECK("structure_folders"."depth" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `structure_folders_project_parent_name_unique` ON `structure_folders` (`project_id`, coalesce(`parent_id`, ''), `name`);--> statement-breakpoint
CREATE INDEX `structure_folders_project_parent_index` ON `structure_folders` (`project_id`,`parent_id`);
--> statement-breakpoint
CREATE TABLE `asset_structure_folder_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`structure_folder_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`structure_folder_id`) REFERENCES `structure_folders`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_structure_folder_memberships_asset_unique` ON `asset_structure_folder_memberships` (`asset_id`);--> statement-breakpoint
CREATE INDEX `asset_structure_folder_memberships_folder_index` ON `asset_structure_folder_memberships` (`structure_folder_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `structure_folders` (`id`, `project_id`, `parent_id`, `name`, `depth`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), `project_id`, NULL, `folder_1`, 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM (SELECT DISTINCT `project_id`, `folder_1` FROM `assets` WHERE `folder_1` IS NOT NULL);--> statement-breakpoint
INSERT OR IGNORE INTO `structure_folders` (`id`, `project_id`, `parent_id`, `name`, `depth`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), paths.`project_id`, parents.`id`, paths.`folder_2`, 2,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM (
  SELECT DISTINCT `project_id`, `folder_1`, `folder_2`
  FROM `assets`
  WHERE `folder_2` IS NOT NULL
) AS paths
INNER JOIN `structure_folders` AS parents
  ON parents.`project_id` = paths.`project_id`
  AND parents.`parent_id` IS NULL
  AND parents.`name` = paths.`folder_1`;--> statement-breakpoint
INSERT OR IGNORE INTO `structure_folders` (`id`, `project_id`, `parent_id`, `name`, `depth`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), paths.`project_id`, parents.`id`, paths.`folder_3`, 3,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM (
  SELECT DISTINCT `project_id`, `folder_1`, `folder_2`, `folder_3`
  FROM `assets`
  WHERE `folder_3` IS NOT NULL
) AS paths
INNER JOIN `structure_folders` AS parents
  ON parents.`project_id` = paths.`project_id`
  AND parents.`depth` = 2
  AND parents.`name` = paths.`folder_2`
INNER JOIN `structure_folders` AS roots
  ON roots.`id` = parents.`parent_id`
  AND roots.`name` = paths.`folder_1`;--> statement-breakpoint
INSERT OR IGNORE INTO `asset_structure_folder_memberships` (`id`, `asset_id`, `structure_folder_id`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), `assets`.`id`, `folders`.`id`,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `assets`
INNER JOIN `structure_folders` AS folders
  ON folders.`project_id` = `assets`.`project_id`
  AND folders.`depth` = 1
  AND folders.`parent_id` IS NULL
  AND folders.`name` = `assets`.`folder_1`
WHERE `assets`.`folder_1` IS NOT NULL
  AND `assets`.`folder_2` IS NULL
  AND `assets`.`folder_3` IS NULL
UNION ALL
SELECT lower(hex(randomblob(16))), `assets`.`id`, `folders`.`id`,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `assets`
INNER JOIN `structure_folders` AS folders
  ON folders.`project_id` = `assets`.`project_id`
  AND folders.`depth` = 2
  AND folders.`name` = `assets`.`folder_2`
INNER JOIN `structure_folders` AS roots
  ON roots.`id` = folders.`parent_id`
  AND roots.`name` = `assets`.`folder_1`
WHERE `assets`.`folder_2` IS NOT NULL
  AND `assets`.`folder_3` IS NULL
UNION ALL
SELECT lower(hex(randomblob(16))), `assets`.`id`, `folders`.`id`,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `assets`
INNER JOIN `structure_folders` AS folders
  ON folders.`project_id` = `assets`.`project_id`
  AND folders.`depth` = 3
  AND folders.`name` = `assets`.`folder_3`
INNER JOIN `structure_folders` AS parents
  ON parents.`id` = folders.`parent_id`
  AND parents.`name` = `assets`.`folder_2`
INNER JOIN `structure_folders` AS roots
  ON roots.`id` = parents.`parent_id`
  AND roots.`name` = `assets`.`folder_1`
WHERE `assets`.`folder_3` IS NOT NULL;
