CREATE TABLE `__output_versions_project_ownership_guard` (
	`guard` integer NOT NULL,
	CONSTRAINT "output_versions_project_ownership_guard_no_orphans" CHECK(`guard` = 0)
);--> statement-breakpoint
INSERT INTO `__output_versions_project_ownership_guard` (`guard`)
SELECT 1
WHERE EXISTS (
	SELECT 1
	FROM `output_versions`
	LEFT JOIN `assets` ON `assets`.`id` = `output_versions`.`asset_id`
	WHERE `assets`.`id` IS NULL
);--> statement-breakpoint
DROP TABLE `__output_versions_project_ownership_guard`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP INDEX `blobs_storage_object_key_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `blobs_project_storage_object_key_unique` ON `blobs` (`project_id`,`storage`,`object_key`);--> statement-breakpoint
CREATE TABLE `__new_output_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`output_definition_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`source_revision_id` text,
	`version` integer NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`media_type` text NOT NULL,
	`extension` text NOT NULL,
	`object_key` text NOT NULL,
	`toolchain_version` text NOT NULL,
	`width` integer,
	`height` integer,
	`current` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`output_definition_id`) REFERENCES `output_definitions`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`source_revision_id`) REFERENCES `source_revisions`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "output_versions_version_check" CHECK("__new_output_versions"."version" > 0),
	CONSTRAINT "output_versions_byte_size_check" CHECK("__new_output_versions"."byte_size" >= 0),
	CONSTRAINT "output_versions_dimensions_check" CHECK(("__new_output_versions"."width" IS NULL AND "__new_output_versions"."height" IS NULL) OR ("__new_output_versions"."width" > 0 AND "__new_output_versions"."height" > 0)),
	CONSTRAINT "output_versions_document_media_type_check" CHECK("__new_output_versions"."media_type" NOT IN ('application/pdf', 'application/json', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel.sheet.macroenabled.12', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.oasis.opendocument.presentation', 'application/rtf', 'text/csv', 'text/plain') OR ("__new_output_versions"."media_type" = 'application/pdf' AND "__new_output_versions"."extension" = 'pdf') OR ("__new_output_versions"."media_type" = 'application/json' AND "__new_output_versions"."extension" = 'json') OR ("__new_output_versions"."media_type" = 'application/msword' AND "__new_output_versions"."extension" = 'doc') OR ("__new_output_versions"."media_type" = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' AND "__new_output_versions"."extension" = 'docx') OR ("__new_output_versions"."media_type" = 'application/vnd.ms-excel' AND "__new_output_versions"."extension" = 'xls') OR ("__new_output_versions"."media_type" = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' AND "__new_output_versions"."extension" = 'xlsx') OR ("__new_output_versions"."media_type" = 'application/vnd.ms-excel.sheet.macroenabled.12' AND "__new_output_versions"."extension" = 'xlsm') OR ("__new_output_versions"."media_type" = 'application/vnd.ms-powerpoint' AND "__new_output_versions"."extension" = 'ppt') OR ("__new_output_versions"."media_type" = 'application/vnd.openxmlformats-officedocument.presentationml.presentation' AND "__new_output_versions"."extension" = 'pptx') OR ("__new_output_versions"."media_type" = 'application/vnd.oasis.opendocument.text' AND "__new_output_versions"."extension" = 'odt') OR ("__new_output_versions"."media_type" = 'application/vnd.oasis.opendocument.spreadsheet' AND "__new_output_versions"."extension" = 'ods') OR ("__new_output_versions"."media_type" = 'application/vnd.oasis.opendocument.presentation' AND "__new_output_versions"."extension" = 'odp') OR ("__new_output_versions"."media_type" = 'application/rtf' AND "__new_output_versions"."extension" = 'rtf') OR ("__new_output_versions"."media_type" = 'text/csv' AND "__new_output_versions"."extension" = 'csv') OR ("__new_output_versions"."media_type" = 'text/plain' AND "__new_output_versions"."extension" = 'txt'))
);--> statement-breakpoint
INSERT INTO `__new_output_versions` (`id`, `project_id`, `output_definition_id`, `asset_id`, `source_revision_id`, `version`, `byte_size`, `sha256`, `media_type`, `extension`, `object_key`, `toolchain_version`, `width`, `height`, `current`, `created_at`)
SELECT `output_versions`.`id`, `assets`.`project_id`, `output_versions`.`output_definition_id`, `output_versions`.`asset_id`, `output_versions`.`source_revision_id`, `output_versions`.`version`, `output_versions`.`byte_size`, `output_versions`.`sha256`, `output_versions`.`media_type`, `output_versions`.`extension`, `output_versions`.`object_key`, `output_versions`.`toolchain_version`, `output_versions`.`width`, `output_versions`.`height`, `output_versions`.`current`, `output_versions`.`created_at`
FROM `output_versions`
INNER JOIN `assets` ON `assets`.`id` = `output_versions`.`asset_id`;--> statement-breakpoint
DROP TABLE `output_versions`;--> statement-breakpoint
ALTER TABLE `__new_output_versions` RENAME TO `output_versions`;--> statement-breakpoint
CREATE TRIGGER `output_versions_legacy_insert_project_ownership`
AFTER INSERT ON `output_versions`
WHEN NEW.`project_id` IS NULL
BEGIN
	UPDATE `output_versions`
	SET `project_id` = (SELECT `assets`.`project_id` FROM `assets` WHERE `assets`.`id` = NEW.`asset_id`)
	WHERE `id` = NEW.`id`
		AND EXISTS (SELECT 1 FROM `assets` WHERE `assets`.`id` = NEW.`asset_id`);
	SELECT RAISE(ABORT, 'output_versions project ownership could not be derived from asset')
	WHERE NOT EXISTS (SELECT 1 FROM `assets` WHERE `assets`.`id` = NEW.`asset_id`);
END;--> statement-breakpoint
CREATE TRIGGER `output_versions_project_ownership_check`
BEFORE INSERT ON `output_versions`
WHEN NEW.`project_id` IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM `assets`
		WHERE `assets`.`id` = NEW.`asset_id`
			AND `assets`.`project_id` = NEW.`project_id`
	)
BEGIN
	SELECT RAISE(ABORT, 'output_versions project ownership does not match asset');
END;--> statement-breakpoint
CREATE TRIGGER `output_versions_project_ownership_update_check`
BEFORE UPDATE OF `project_id`, `asset_id` ON `output_versions`
WHEN NEW.`project_id` IS NULL
	OR NOT EXISTS (
		SELECT 1
		FROM `assets`
		WHERE `assets`.`id` = NEW.`asset_id`
			AND `assets`.`project_id` = NEW.`project_id`
	)
BEGIN
	SELECT RAISE(ABORT, 'output_versions project ownership does not match asset');
END;--> statement-breakpoint
CREATE UNIQUE INDEX `output_versions_definition_version_unique` ON `output_versions` (`output_definition_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `output_versions_current_unique` ON `output_versions` (`output_definition_id`) WHERE `current` = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `output_versions_project_object_key_unique` ON `output_versions` (`project_id`,`object_key`);--> statement-breakpoint
CREATE INDEX `output_versions_project_index` ON `output_versions` (`project_id`);--> statement-breakpoint
CREATE INDEX `output_versions_asset_index` ON `output_versions` (`asset_id`);--> statement-breakpoint
CREATE INDEX `output_versions_source_revision_index` ON `output_versions` (`source_revision_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
