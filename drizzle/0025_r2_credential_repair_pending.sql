CREATE TABLE `r2_bucket_credential_repair_pending` (
  `bucket` text PRIMARY KEY NOT NULL,
  `previous_access_key_id_ciphertext` text NOT NULL,
  `previous_secret_access_key_ciphertext` text NOT NULL,
  `previous_revocation_id` text,
  `previous_created_at` text NOT NULL,
  `previous_updated_at` text NOT NULL,
  `replacement_revocation_id` text NOT NULL
 );--> statement-breakpoint

CREATE TABLE `r2_bucket_credential_repair_locks` (
  `bucket` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `expires_at` integer NOT NULL
);
