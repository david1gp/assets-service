DROP INDEX `storage_migrations_environment_idempotency_unique`;--> statement-breakpoint
ALTER TABLE `storage_migrations` ADD `attempt` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `storage_migrations_environment_idempotency_attempt_unique` ON `storage_migrations` (`environment_id`,`idempotency_key`,`attempt`);