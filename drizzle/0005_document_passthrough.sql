PRAGMA foreign_keys = OFF;
--> statement-breakpoint
CREATE TABLE `assets_new` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`class` text NOT NULL,
	`folder_1` text,
	`folder_2` text,
	`folder_3` text,
	`filename` text NOT NULL,
	`basename` text NOT NULL,
	`current_source_revision_id` text NOT NULL,
	`integration_note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`current_source_revision_id`) REFERENCES `source_revisions`(`id`) ON UPDATE cascade ON DELETE restrict DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "assets_class_check" CHECK("assets_new"."class" IN ('image', 'video', 'font', 'document')),
	CONSTRAINT "assets_contiguous_folders_check" CHECK(("assets_new"."folder_2" IS NULL OR "assets_new"."folder_1" IS NOT NULL) AND ("assets_new"."folder_3" IS NULL OR "assets_new"."folder_2" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `assets_new` (`id`, `project_id`, `class`, `folder_1`, `folder_2`, `folder_3`, `filename`, `basename`, `current_source_revision_id`, `integration_note`, `created_at`, `updated_at`)
SELECT `id`, `project_id`, `class`, `folder_1`, `folder_2`, `folder_3`, `filename`, `basename`, `current_source_revision_id`, `integration_note`, `created_at`, `updated_at`
FROM `assets`;
--> statement-breakpoint
DROP TABLE `assets`;
--> statement-breakpoint
ALTER TABLE `assets_new` RENAME TO `assets`;
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_project_path_unique` ON `assets` (`project_id`, `class`, coalesce(`folder_1`, ''), coalesce(`folder_2`, ''), coalesce(`folder_3`, ''), `basename`);
--> statement-breakpoint
CREATE INDEX `assets_project_class_index` ON `assets` (`project_id`, `class`);
--> statement-breakpoint
CREATE INDEX `assets_current_source_revision_index` ON `assets` (`current_source_revision_id`);
--> statement-breakpoint
CREATE TABLE `output_definitions_new` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`width` integer,
	`height` integer,
	`format` text,
	`quality` integer,
	`show_ai_label` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "output_definitions_kind_check" CHECK("output_definitions_new"."kind" IN ('image', 'video', 'font', 'document')),
	CONSTRAINT "output_definitions_dimensions_check" CHECK(("output_definitions_new"."kind" = 'image' AND "output_definitions_new"."width" > 0 AND "output_definitions_new"."height" > 0 AND "output_definitions_new"."format" IN ('jpg', 'png', 'webp', 'avif') AND ("output_definitions_new"."quality" IS NULL OR ("output_definitions_new"."quality" BETWEEN 1 AND 100))) OR ("output_definitions_new"."kind" = 'video' AND "output_definitions_new"."width" IS NULL AND "output_definitions_new"."height" IS NULL AND "output_definitions_new"."format" IS NULL AND "output_definitions_new"."quality" IS NULL) OR ("output_definitions_new"."kind" = 'font' AND "output_definitions_new"."width" IS NULL AND "output_definitions_new"."height" IS NULL AND "output_definitions_new"."format" IS NOT NULL AND "output_definitions_new"."quality" IS NULL) OR ("output_definitions_new"."kind" = 'document' AND "output_definitions_new"."key" = 'default' AND "output_definitions_new"."width" IS NULL AND "output_definitions_new"."height" IS NULL AND "output_definitions_new"."format" IS NULL AND "output_definitions_new"."quality" IS NULL AND "output_definitions_new"."show_ai_label" IS NULL))
);
--> statement-breakpoint
INSERT INTO `output_definitions_new` (`id`, `asset_id`, `kind`, `key`, `width`, `height`, `format`, `quality`, `show_ai_label`, `created_at`, `updated_at`)
SELECT `id`, `asset_id`, `kind`, `key`, `width`, `height`, `format`, `quality`, `show_ai_label`, `created_at`, `updated_at`
FROM `output_definitions`;
--> statement-breakpoint
DROP TABLE `output_definitions`;
--> statement-breakpoint
ALTER TABLE `output_definitions_new` RENAME TO `output_definitions`;
--> statement-breakpoint
CREATE UNIQUE INDEX `output_definitions_asset_key_unique` ON `output_definitions` (`asset_id`, `key`);
--> statement-breakpoint
CREATE INDEX `output_definitions_asset_index` ON `output_definitions` (`asset_id`);
--> statement-breakpoint
CREATE TABLE `source_revisions_new` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`revision` integer NOT NULL,
	`class` text NOT NULL,
	`original_filename` text NOT NULL,
	`media_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "source_revisions_revision_check" CHECK("source_revisions_new"."revision" > 0),
	CONSTRAINT "source_revisions_class_check" CHECK("source_revisions_new"."class" IN ('image', 'video', 'font', 'document')),
	CONSTRAINT "source_revisions_document_media_type_check" CHECK("source_revisions_new"."class" <> 'document' OR ("source_revisions_new"."media_type" = 'application/pdf' AND lower("source_revisions_new"."original_filename") LIKE '%.pdf') OR ("source_revisions_new"."media_type" = 'application/json' AND lower("source_revisions_new"."original_filename") LIKE '%.json') OR ("source_revisions_new"."media_type" = 'application/msword' AND lower("source_revisions_new"."original_filename") LIKE '%.doc') OR ("source_revisions_new"."media_type" = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' AND lower("source_revisions_new"."original_filename") LIKE '%.docx') OR ("source_revisions_new"."media_type" = 'application/vnd.ms-excel' AND lower("source_revisions_new"."original_filename") LIKE '%.xls') OR ("source_revisions_new"."media_type" = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' AND lower("source_revisions_new"."original_filename") LIKE '%.xlsx') OR ("source_revisions_new"."media_type" = 'application/vnd.ms-excel.sheet.macroenabled.12' AND lower("source_revisions_new"."original_filename") LIKE '%.xlsm') OR ("source_revisions_new"."media_type" = 'application/vnd.ms-powerpoint' AND lower("source_revisions_new"."original_filename") LIKE '%.ppt') OR ("source_revisions_new"."media_type" = 'application/vnd.openxmlformats-officedocument.presentationml.presentation' AND lower("source_revisions_new"."original_filename") LIKE '%.pptx') OR ("source_revisions_new"."media_type" = 'application/vnd.oasis.opendocument.text' AND lower("source_revisions_new"."original_filename") LIKE '%.odt') OR ("source_revisions_new"."media_type" = 'application/vnd.oasis.opendocument.spreadsheet' AND lower("source_revisions_new"."original_filename") LIKE '%.ods') OR ("source_revisions_new"."media_type" = 'application/vnd.oasis.opendocument.presentation' AND lower("source_revisions_new"."original_filename") LIKE '%.odp') OR ("source_revisions_new"."media_type" = 'application/rtf' AND lower("source_revisions_new"."original_filename") LIKE '%.rtf') OR ("source_revisions_new"."media_type" = 'text/csv' AND lower("source_revisions_new"."original_filename") LIKE '%.csv') OR ("source_revisions_new"."media_type" = 'text/plain' AND lower("source_revisions_new"."original_filename") LIKE '%.txt')),
	CONSTRAINT "source_revisions_byte_size_check" CHECK("source_revisions_new"."byte_size" >= 0)
);
--> statement-breakpoint
INSERT INTO `source_revisions_new` (`id`, `asset_id`, `revision`, `class`, `original_filename`, `media_type`, `byte_size`, `sha256`, `object_key`, `created_at`)
SELECT `id`, `asset_id`, `revision`, `class`, `original_filename`, `media_type`, `byte_size`, `sha256`, `object_key`, `created_at`
FROM `source_revisions`;
--> statement-breakpoint
DROP TABLE `source_revisions`;
--> statement-breakpoint
ALTER TABLE `source_revisions_new` RENAME TO `source_revisions`;
--> statement-breakpoint
CREATE UNIQUE INDEX `source_revisions_asset_revision_unique` ON `source_revisions` (`asset_id`, `revision`);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_revisions_object_key_unique` ON `source_revisions` (`object_key`);
--> statement-breakpoint
CREATE INDEX `source_revisions_asset_index` ON `source_revisions` (`asset_id`);
--> statement-breakpoint
CREATE TABLE `output_versions_new` (
	`id` text PRIMARY KEY NOT NULL,
	`output_definition_id` text NOT NULL,
	`asset_id` text NOT NULL,
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
	FOREIGN KEY (`output_definition_id`) REFERENCES `output_definitions`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "output_versions_version_check" CHECK("output_versions_new"."version" > 0),
	CONSTRAINT "output_versions_byte_size_check" CHECK("output_versions_new"."byte_size" >= 0),
	CONSTRAINT "output_versions_dimensions_check" CHECK(("output_versions_new"."width" IS NULL AND "output_versions_new"."height" IS NULL) OR ("output_versions_new"."width" > 0 AND "output_versions_new"."height" > 0)),
	CONSTRAINT "output_versions_document_media_type_check" CHECK("output_versions_new"."media_type" NOT IN ('application/pdf', 'application/json', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel.sheet.macroenabled.12', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.oasis.opendocument.presentation', 'application/rtf', 'text/csv', 'text/plain') OR ("output_versions_new"."media_type" = 'application/pdf' AND "output_versions_new"."extension" = 'pdf') OR ("output_versions_new"."media_type" = 'application/json' AND "output_versions_new"."extension" = 'json') OR ("output_versions_new"."media_type" = 'application/msword' AND "output_versions_new"."extension" = 'doc') OR ("output_versions_new"."media_type" = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' AND "output_versions_new"."extension" = 'docx') OR ("output_versions_new"."media_type" = 'application/vnd.ms-excel' AND "output_versions_new"."extension" = 'xls') OR ("output_versions_new"."media_type" = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' AND "output_versions_new"."extension" = 'xlsx') OR ("output_versions_new"."media_type" = 'application/vnd.ms-excel.sheet.macroenabled.12' AND "output_versions_new"."extension" = 'xlsm') OR ("output_versions_new"."media_type" = 'application/vnd.ms-powerpoint' AND "output_versions_new"."extension" = 'ppt') OR ("output_versions_new"."media_type" = 'application/vnd.openxmlformats-officedocument.presentationml.presentation' AND "output_versions_new"."extension" = 'pptx') OR ("output_versions_new"."media_type" = 'application/vnd.oasis.opendocument.text' AND "output_versions_new"."extension" = 'odt') OR ("output_versions_new"."media_type" = 'application/vnd.oasis.opendocument.spreadsheet' AND "output_versions_new"."extension" = 'ods') OR ("output_versions_new"."media_type" = 'application/vnd.oasis.opendocument.presentation' AND "output_versions_new"."extension" = 'odp') OR ("output_versions_new"."media_type" = 'application/rtf' AND "output_versions_new"."extension" = 'rtf') OR ("output_versions_new"."media_type" = 'text/csv' AND "output_versions_new"."extension" = 'csv') OR ("output_versions_new"."media_type" = 'text/plain' AND "output_versions_new"."extension" = 'txt'))
);
--> statement-breakpoint
INSERT INTO `output_versions_new` (`id`, `output_definition_id`, `asset_id`, `version`, `byte_size`, `sha256`, `media_type`, `extension`, `object_key`, `toolchain_version`, `width`, `height`, `current`, `created_at`)
SELECT `id`, `output_definition_id`, `asset_id`, `version`, `byte_size`, `sha256`, `media_type`, `extension`, `object_key`, `toolchain_version`, `width`, `height`, `current`, `created_at`
FROM `output_versions`;
--> statement-breakpoint
DROP TABLE `output_versions`;
--> statement-breakpoint
ALTER TABLE `output_versions_new` RENAME TO `output_versions`;
--> statement-breakpoint
CREATE UNIQUE INDEX `output_versions_definition_version_unique` ON `output_versions` (`output_definition_id`, `version`);
--> statement-breakpoint
CREATE UNIQUE INDEX `output_versions_current_unique` ON `output_versions` (`output_definition_id`) WHERE `current` = 1;
--> statement-breakpoint
CREATE UNIQUE INDEX `output_versions_object_key_unique` ON `output_versions` (`object_key`);
--> statement-breakpoint
CREATE INDEX `output_versions_asset_index` ON `output_versions` (`asset_id`);
--> statement-breakpoint
CREATE TABLE `catalog_outputs_new` (
	`generation_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`output_version_id` text NOT NULL,
	`class` text NOT NULL,
	`key` text NOT NULL,
	`property` text NOT NULL,
	`path` text NOT NULL,
	`metadata` text NOT NULL,
	PRIMARY KEY (`generation_id`, `output_version_id`),
	FOREIGN KEY (`generation_id`) REFERENCES `catalog_generations`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`output_version_id`) REFERENCES `output_versions`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "catalog_outputs_class_check" CHECK("catalog_outputs_new"."class" IN ('image', 'video', 'font', 'document'))
);
--> statement-breakpoint
INSERT INTO `catalog_outputs_new` (`generation_id`, `asset_id`, `output_version_id`, `class`, `key`, `property`, `path`, `metadata`)
SELECT `generation_id`, `asset_id`, `output_version_id`, `class`, `key`, `property`, `path`, `metadata`
FROM `catalog_outputs`;
--> statement-breakpoint
DROP TABLE `catalog_outputs`;
--> statement-breakpoint
ALTER TABLE `catalog_outputs_new` RENAME TO `catalog_outputs`;
--> statement-breakpoint
CREATE INDEX `catalog_outputs_generation_index` ON `catalog_outputs` (`generation_id`);
--> statement-breakpoint
CREATE INDEX `catalog_outputs_asset_index` ON `catalog_outputs` (`asset_id`);
--> statement-breakpoint
PRAGMA foreign_keys = ON;
