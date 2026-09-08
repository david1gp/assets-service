CREATE TEMP TABLE `structure_backfill_projects` AS
SELECT `projects`.`id` AS `project_id`
FROM `projects`
WHERE NOT EXISTS (
  SELECT 1
  FROM `structure_folders`
  WHERE `structure_folders`.`project_id` = `projects`.`id`
)
AND NOT EXISTS (
  SELECT 1
  FROM `asset_structure_folder_memberships` AS memberships
  INNER JOIN `assets` ON `assets`.`id` = memberships.`asset_id`
  WHERE `assets`.`project_id` = `projects`.`id`
);--> statement-breakpoint
INSERT OR IGNORE INTO `structure_folders` (`id`, `project_id`, `parent_id`, `name`, `depth`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), paths.`project_id`, NULL, paths.`folder_1`, 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM (
  SELECT DISTINCT `project_id`, `folder_1`
  FROM `assets`
  WHERE `folder_1` IS NOT NULL
) AS paths
INNER JOIN `structure_backfill_projects` AS projects
  ON projects.`project_id` = paths.`project_id`;--> statement-breakpoint
INSERT OR IGNORE INTO `structure_folders` (`id`, `project_id`, `parent_id`, `name`, `depth`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), paths.`project_id`, parents.`id`, paths.`folder_2`, 2,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM (
  SELECT DISTINCT `project_id`, `folder_1`, `folder_2`
  FROM `assets`
  WHERE `folder_2` IS NOT NULL
) AS paths
INNER JOIN `structure_backfill_projects` AS projects
  ON projects.`project_id` = paths.`project_id`
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
INNER JOIN `structure_backfill_projects` AS projects
  ON projects.`project_id` = paths.`project_id`
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
INNER JOIN `structure_backfill_projects` AS projects
  ON projects.`project_id` = `assets`.`project_id`
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
INNER JOIN `structure_backfill_projects` AS projects
  ON projects.`project_id` = `assets`.`project_id`
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
INNER JOIN `structure_backfill_projects` AS projects
  ON projects.`project_id` = `assets`.`project_id`
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
WHERE `assets`.`folder_3` IS NOT NULL;--> statement-breakpoint
DROP TABLE `structure_backfill_projects`;
