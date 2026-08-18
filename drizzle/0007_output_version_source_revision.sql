ALTER TABLE `output_versions` ADD `source_revision_id` text REFERENCES source_revisions(id) ON UPDATE cascade ON DELETE set null;
