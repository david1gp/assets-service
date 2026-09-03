CREATE TABLE IF NOT EXISTS `authentication_session_policy` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	CONSTRAINT "authentication_session_policy_id_check" CHECK("id" = 1),
	CONSTRAINT "authentication_session_policy_version_check" CHECK("version" > 0)
);--> statement-breakpoint
INSERT OR IGNORE INTO `authentication_session_policy` (`id`, `version`) VALUES (1, 2);--> statement-breakpoint
UPDATE `authentication_session_policy` SET `version` = 2 WHERE `id` = 1 AND `version` < 2;
