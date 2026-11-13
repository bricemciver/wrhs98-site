-- When the owner was emailed that an item had waited 24+ hours. Each item is
-- reminded about once; NULL means not yet.
ALTER TABLE access_requests ADD COLUMN reminded_at INTEGER;
ALTER TABLE leads ADD COLUMN reminded_at INTEGER;
ALTER TABLE classmate_suggestions ADD COLUMN reminded_at INTEGER;
