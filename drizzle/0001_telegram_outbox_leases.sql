PRAGMA foreign_keys = OFF;
--> statement-breakpoint
ALTER TABLE `uploads` ADD COLUMN `uploader_id` text;
--> statement-breakpoint
ALTER TABLE `uploads` ADD COLUMN `notification_eligible` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE `outbox_events_new` (
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
	`lease_owner` text,
	`lease_expires_at` text,
	CONSTRAINT "outbox_events_kind_check" CHECK("outbox_events_new"."kind" IN ('customer_asset_uploaded', 'audit_event')),
	CONSTRAINT "outbox_events_status_check" CHECK("outbox_events_new"."status" IN ('pending', 'processing', 'sent', 'dead', 'delivered', 'failed')),
	CONSTRAINT "outbox_events_attempts_check" CHECK("outbox_events_new"."attempts" >= 0)
);
--> statement-breakpoint
INSERT INTO `outbox_events_new` (`id`, `event_id`, `kind`, `payload`, `status`, `attempts`, `available_at`, `delivered_at`, `last_error`, `created_at`, `lease_owner`, `lease_expires_at`)
SELECT `id`, `event_id`, `kind`, `payload`, `status`, `attempts`, `available_at`, `delivered_at`, `last_error`, `created_at`, NULL, NULL
FROM `outbox_events`;
--> statement-breakpoint
DROP TABLE `outbox_events`;
--> statement-breakpoint
ALTER TABLE `outbox_events_new` RENAME TO `outbox_events`;
--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_events_event_id_unique` ON `outbox_events` (`event_id`);
--> statement-breakpoint
CREATE INDEX `outbox_events_delivery_index` ON `outbox_events` (`status`, `available_at`);
--> statement-breakpoint
PRAGMA foreign_keys = ON;
