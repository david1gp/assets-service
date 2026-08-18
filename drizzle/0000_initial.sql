CREATE TABLE `asset_metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`source_revision_id` text NOT NULL,
	`metadata` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`source_revision_id`) REFERENCES `source_revisions`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_metadata_asset_unique` ON `asset_metadata` (`asset_id`);--> statement-breakpoint
CREATE INDEX `asset_metadata_source_revision_index` ON `asset_metadata` (`source_revision_id`);--> statement-breakpoint
CREATE TABLE `assets` (
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
	CONSTRAINT "assets_class_check" CHECK("assets"."class" IN ('image', 'video', 'font')),
	CONSTRAINT "assets_contiguous_folders_check" CHECK(("assets"."folder_2" IS NULL OR "assets"."folder_1" IS NOT NULL) AND ("assets"."folder_3" IS NULL OR "assets"."folder_2" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_project_path_unique` ON `assets` (`project_id`, `class`, coalesce(`folder_1`, ''), coalesce(`folder_2`, ''), coalesce(`folder_3`, ''), `basename`);--> statement-breakpoint
CREATE INDEX `assets_project_class_index` ON `assets` (`project_id`,`class`);--> statement-breakpoint
CREATE INDEX `assets_current_source_revision_index` ON `assets` (`current_source_revision_id`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`details` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "audit_events_action_length_check" CHECK(length("audit_events"."action") BETWEEN 1 AND 128),
	CONSTRAINT "audit_events_resource_type_length_check" CHECK(length("audit_events"."resource_type") BETWEEN 1 AND 128)
);
--> statement-breakpoint
CREATE INDEX `audit_events_organization_created_index` ON `audit_events` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_project_created_index` ON `audit_events` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_resource_index` ON `audit_events` (`resource_type`,`resource_id`);--> statement-breakpoint
CREATE TABLE `backup_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_revision_id` text NOT NULL,
	`job_id` text NOT NULL,
	`remote_path` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`check_result` text NOT NULL,
	`completed_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`source_revision_id`) REFERENCES `source_revisions`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "backup_receipts_check_result_check" CHECK("backup_receipts"."check_result" IN ('verified', 'failed')),
	CONSTRAINT "backup_receipts_byte_size_check" CHECK("backup_receipts"."byte_size" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backup_receipts_verified_source_unique` ON `backup_receipts` (`source_revision_id`) WHERE "backup_receipts"."check_result" = 'verified';--> statement-breakpoint
CREATE INDEX `backup_receipts_project_index` ON `backup_receipts` (`project_id`);--> statement-breakpoint
CREATE INDEX `backup_receipts_source_revision_index` ON `backup_receipts` (`source_revision_id`);--> statement-breakpoint
CREATE TABLE `blobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`asset_id` text,
	`source_revision_id` text,
	`output_version_id` text,
	`storage` text NOT NULL,
	`environment` text,
	`kind` text NOT NULL,
	`object_key` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`media_type` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`source_revision_id`) REFERENCES `source_revisions`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`output_version_id`) REFERENCES `output_versions`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "blobs_storage_check" CHECK("blobs"."storage" IN ('private', 'public')),
	CONSTRAINT "blobs_kind_check" CHECK("blobs"."kind" IN ('staging', 'source', 'output', 'manifest')),
	CONSTRAINT "blobs_byte_size_check" CHECK("blobs"."byte_size" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blobs_storage_object_key_unique` ON `blobs` (`storage`,`object_key`);--> statement-breakpoint
CREATE INDEX `blobs_project_index` ON `blobs` (`project_id`);--> statement-breakpoint
CREATE INDEX `blobs_asset_index` ON `blobs` (`asset_id`);--> statement-breakpoint
CREATE INDEX `blobs_source_revision_index` ON `blobs` (`source_revision_id`);--> statement-breakpoint
CREATE INDEX `blobs_output_version_index` ON `blobs` (`output_version_id`);--> statement-breakpoint
CREATE TABLE `catalog_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`environment` text NOT NULL,
	`digest` text NOT NULL,
	`manifest_object_key` text NOT NULL,
	`renderer_version` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "catalog_generations_environment_check" CHECK("catalog_generations"."environment" IN ('development', 'production'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_generations_project_environment_digest_unique` ON `catalog_generations` (`project_id`,`environment`,`digest`);--> statement-breakpoint
CREATE INDEX `catalog_generations_project_environment_index` ON `catalog_generations` (`project_id`,`environment`,`created_at`);--> statement-breakpoint
CREATE TABLE `catalog_outputs` (
	`generation_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`output_version_id` text NOT NULL,
	`class` text NOT NULL,
	`key` text NOT NULL,
	`property` text NOT NULL,
	`path` text NOT NULL,
	`metadata` text NOT NULL,
	PRIMARY KEY(`generation_id`, `output_version_id`),
	FOREIGN KEY (`generation_id`) REFERENCES `catalog_generations`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`output_version_id`) REFERENCES `output_versions`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "catalog_outputs_class_check" CHECK("catalog_outputs"."class" IN ('image', 'video', 'font'))
);
--> statement-breakpoint
CREATE INDEX `catalog_outputs_generation_index` ON `catalog_outputs` (`generation_id`);--> statement-breakpoint
CREATE INDEX `catalog_outputs_asset_index` ON `catalog_outputs` (`asset_id`);--> statement-breakpoint
CREATE TABLE `catalogs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`environment` text NOT NULL,
	`generation_id` text NOT NULL,
	`schema` text NOT NULL,
	`digest` text NOT NULL,
	`renderer_version` text NOT NULL,
	`generated_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`generation_id`) REFERENCES `catalog_generations`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "catalogs_environment_check" CHECK("catalogs"."environment" IN ('development', 'production'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalogs_project_environment_unique` ON `catalogs` (`project_id`,`environment`);--> statement-breakpoint
CREATE UNIQUE INDEX `catalogs_generation_unique` ON `catalogs` (`generation_id`);--> statement-breakpoint
CREATE INDEX `catalogs_project_index` ON `catalogs` (`project_id`);--> statement-breakpoint
CREATE TABLE `deletion_states` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`status` text NOT NULL,
	`completed_steps` text NOT NULL,
	`pending_remote_objects` text NOT NULL,
	`error` text,
	`requested_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "deletion_states_status_check" CHECK("deletion_states"."status" IN ('requested', 'in_progress', 'succeeded', 'retryable', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deletion_states_asset_unique` ON `deletion_states` (`asset_id`);--> statement-breakpoint
CREATE INDEX `deletion_states_status_index` ON `deletion_states` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `environments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`r2_bucket` text NOT NULL,
	`r2_prefix` text NOT NULL,
	`public_base_url` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "environments_name_check" CHECK("environments"."name" IN ('development', 'production'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `environments_project_name_unique` ON `environments` (`project_id`,`name`);--> statement-breakpoint
CREATE INDEX `environments_project_index` ON `environments` (`project_id`);--> statement-breakpoint
CREATE TABLE `job_dependencies` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`depends_on_job_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`depends_on_job_id`) REFERENCES `jobs`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "job_dependencies_not_self_check" CHECK("job_dependencies"."job_id" <> "job_dependencies"."depends_on_job_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_dependencies_pair_unique` ON `job_dependencies` (`job_id`,`depends_on_job_id`);--> statement-breakpoint
CREATE INDEX `job_dependencies_dependency_index` ON `job_dependencies` (`depends_on_job_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`available_at` text NOT NULL,
	`priority` integer NOT NULL,
	`attempts` integer NOT NULL,
	`retry_limit` integer NOT NULL,
	`lease_owner` text,
	`lease_expires_at` text,
	`heartbeat_at` text,
	`idempotency_key` text NOT NULL,
	`payload_schema_version` integer NOT NULL,
	`payload` text NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "jobs_kind_check" CHECK("jobs"."kind" IN ('verify_original', 'backup_original', 'plan_outputs', 'process_image_output', 'copy_video_output', 'process_font_output', 'publish_asset', 'notify_customer_upload', 'cleanup_local_files')),
	CONSTRAINT "jobs_status_check" CHECK("jobs"."status" IN ('queued', 'running', 'succeeded', 'retryable', 'dead', 'cancelled')),
	CONSTRAINT "jobs_attempts_check" CHECK("jobs"."attempts" >= 0 AND "jobs"."retry_limit" >= 0),
	CONSTRAINT "jobs_payload_schema_version_check" CHECK("jobs"."payload_schema_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_idempotency_key_unique` ON `jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `jobs_claim_index` ON `jobs` (`status`,`available_at`,`priority`);--> statement-breakpoint
CREATE INDEX `jobs_workflow_index` ON `jobs` (`workflow_id`);--> statement-breakpoint
CREATE TABLE `manifests` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`asset_id` text,
	`catalog_generation_id` text,
	`kind` text NOT NULL,
	`schema` text NOT NULL,
	`object_key` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`catalog_generation_id`) REFERENCES `catalog_generations`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "manifests_kind_check" CHECK("manifests"."kind" IN ('asset', 'catalog', 'deletion')),
	CONSTRAINT "manifests_byte_size_check" CHECK("manifests"."byte_size" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `manifests_object_key_unique` ON `manifests` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `manifests_sha256_unique` ON `manifests` (`sha256`);--> statement-breakpoint
CREATE INDEX `manifests_project_index` ON `manifests` (`project_id`);--> statement-breakpoint
CREATE INDEX `manifests_asset_index` ON `manifests` (`asset_id`);--> statement-breakpoint
CREATE INDEX `manifests_catalog_generation_index` ON `manifests` (`catalog_generation_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `outbox_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer NOT NULL,
	`available_at` text NOT NULL,
	`delivered_at` text,
	`last_error` text,
	`created_at` text NOT NULL,
	CONSTRAINT "outbox_events_kind_check" CHECK("outbox_events"."kind" IN ('customer_asset_uploaded', 'audit_event')),
	CONSTRAINT "outbox_events_status_check" CHECK("outbox_events"."status" IN ('pending', 'delivered', 'failed')),
	CONSTRAINT "outbox_events_attempts_check" CHECK("outbox_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_events_event_id_unique` ON `outbox_events` (`event_id`);--> statement-breakpoint
CREATE INDEX `outbox_events_delivery_index` ON `outbox_events` (`status`,`available_at`);--> statement-breakpoint
CREATE TABLE `output_definitions` (
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
	CONSTRAINT "output_definitions_kind_check" CHECK("output_definitions"."kind" IN ('image', 'video', 'font')),
	CONSTRAINT "output_definitions_dimensions_check" CHECK(("output_definitions"."kind" = 'image' AND "output_definitions"."width" > 0 AND "output_definitions"."height" > 0 AND "output_definitions"."format" IN ('jpg', 'png', 'webp', 'avif') AND ("output_definitions"."quality" IS NULL OR ("output_definitions"."quality" BETWEEN 1 AND 100))) OR ("output_definitions"."kind" = 'video' AND "output_definitions"."width" IS NULL AND "output_definitions"."height" IS NULL AND "output_definitions"."format" IS NULL AND "output_definitions"."quality" IS NULL) OR ("output_definitions"."kind" = 'font' AND "output_definitions"."width" IS NULL AND "output_definitions"."height" IS NULL AND "output_definitions"."format" IS NOT NULL AND "output_definitions"."quality" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `output_definitions_asset_key_unique` ON `output_definitions` (`asset_id`,`key`);--> statement-breakpoint
CREATE INDEX `output_definitions_asset_index` ON `output_definitions` (`asset_id`);--> statement-breakpoint
CREATE TABLE `output_versions` (
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
	CONSTRAINT "output_versions_version_check" CHECK("output_versions"."version" > 0),
	CONSTRAINT "output_versions_byte_size_check" CHECK("output_versions"."byte_size" >= 0),
	CONSTRAINT "output_versions_dimensions_check" CHECK(("output_versions"."width" IS NULL AND "output_versions"."height" IS NULL) OR ("output_versions"."width" > 0 AND "output_versions"."height" > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `output_versions_definition_version_unique` ON `output_versions` (`output_definition_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `output_versions_current_unique` ON `output_versions` (`output_definition_id`) WHERE "output_versions"."current" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `output_versions_object_key_unique` ON `output_versions` (`object_key`);--> statement-breakpoint
CREATE INDEX `output_versions_asset_index` ON `output_versions` (`asset_id`);--> statement-breakpoint
CREATE TABLE `project_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`zitadel_project_id` text NOT NULL,
	`service_project_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_bindings_project_unique` ON `project_bindings` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_bindings_zitadel_project_unique` ON `project_bindings` (`zitadel_project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_bindings_service_project_unique` ON `project_bindings` (`service_project_id`);--> statement-breakpoint
CREATE INDEX `project_bindings_organization_index` ON `project_bindings` (`organization_id`);--> statement-breakpoint
CREATE TABLE `project_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "project_grants_role_check" CHECK("project_grants"."role" IN ('assets.uploader', 'assets.admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_grants_subject_role_unique` ON `project_grants` (`project_id`,`subject_id`,`role`);--> statement-breakpoint
CREATE INDEX `project_grants_organization_index` ON `project_grants` (`organization_id`);--> statement-breakpoint
CREATE INDEX `project_grants_subject_index` ON `project_grants` (`subject_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`default_environment` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "projects_default_environment_check" CHECK("projects"."default_environment" IN ('development', 'production'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_organization_slug_unique` ON `projects` (`organization_id`,`slug`);--> statement-breakpoint
CREATE INDEX `projects_organization_index` ON `projects` (`organization_id`);--> statement-breakpoint
CREATE TABLE `source_revisions` (
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
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE cascade ON DELETE cascade DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "source_revisions_revision_check" CHECK("source_revisions"."revision" > 0),
	CONSTRAINT "source_revisions_class_check" CHECK("source_revisions"."class" IN ('image', 'video', 'font')),
	CONSTRAINT "source_revisions_byte_size_check" CHECK("source_revisions"."byte_size" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_revisions_asset_revision_unique` ON `source_revisions` (`asset_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `source_revisions_object_key_unique` ON `source_revisions` (`object_key`);--> statement-breakpoint
CREATE INDEX `source_revisions_asset_index` ON `source_revisions` (`asset_id`);--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`environment_id` text NOT NULL,
	`asset_id` text,
	`source_revision_id` text,
	`original_filename` text NOT NULL,
	`folder_1` text,
	`folder_2` text,
	`folder_3` text,
	`integration_note` text NOT NULL,
	`staging_object_key` text,
	`byte_size` integer NOT NULL,
	`media_type` text,
	`sha256` text,
	`status` text NOT NULL,
	`failure_reason` text,
	`verified_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`source_revision_id`) REFERENCES `source_revisions`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "uploads_contiguous_folders_check" CHECK(("uploads"."folder_2" IS NULL OR "uploads"."folder_1" IS NOT NULL) AND ("uploads"."folder_3" IS NULL OR "uploads"."folder_2" IS NOT NULL)),
	CONSTRAINT "uploads_status_check" CHECK("uploads"."status" IN ('pending', 'verified', 'accepted', 'failed', 'cancelled')),
	CONSTRAINT "uploads_byte_size_check" CHECK("uploads"."byte_size" >= 0)
);
--> statement-breakpoint
CREATE INDEX `uploads_project_status_index` ON `uploads` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `uploads_asset_index` ON `uploads` (`asset_id`);--> statement-breakpoint
CREATE INDEX `uploads_source_revision_index` ON `uploads` (`source_revision_id`);--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`asset_id` text,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "workflows_kind_check" CHECK("workflows"."kind" IN ('asset_processing', 'catalog_generation', 'deletion', 'cleanup')),
	CONSTRAINT "workflows_status_check" CHECK("workflows"."status" IN ('queued', 'running', 'succeeded', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `workflows_project_status_index` ON `workflows` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `workflows_asset_index` ON `workflows` (`asset_id`);
