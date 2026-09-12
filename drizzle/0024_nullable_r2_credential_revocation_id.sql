DROP INDEX `r2_bucket_credentials_revocation_unique`;--> statement-breakpoint
ALTER TABLE `r2_bucket_credentials` RENAME TO `r2_bucket_credentials_old`;--> statement-breakpoint
CREATE TABLE `r2_bucket_credentials` (
  `bucket` text PRIMARY KEY NOT NULL,
  `access_key_id_ciphertext` text NOT NULL,
  `secret_access_key_ciphertext` text NOT NULL,
  `revocation_id` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);--> statement-breakpoint
INSERT INTO `r2_bucket_credentials` (`bucket`, `access_key_id_ciphertext`, `secret_access_key_ciphertext`, `revocation_id`, `created_at`, `updated_at`)
SELECT `bucket`, `access_key_id_ciphertext`, `secret_access_key_ciphertext`, `revocation_id`, `created_at`, `updated_at`
FROM `r2_bucket_credentials_old`;--> statement-breakpoint
DROP TABLE `r2_bucket_credentials_old`;--> statement-breakpoint
CREATE UNIQUE INDEX `r2_bucket_credentials_revocation_unique` ON `r2_bucket_credentials` (`revocation_id`);
