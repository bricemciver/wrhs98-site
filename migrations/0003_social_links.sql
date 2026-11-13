-- Social links.
-- profiles.links: JSON array of URLs a member shares about themselves
--   (replaces the single website field), shown to members when share_links = 1.
-- classmates.found_links: JSON array of profile URLs admins found for outreach.
--   Admin-only, like the other last_known_* fields.
ALTER TABLE profiles ADD COLUMN links TEXT;
ALTER TABLE profiles ADD COLUMN share_links INTEGER NOT NULL DEFAULT 1;
UPDATE profiles SET links = json_array(website) WHERE website IS NOT NULL AND website != '';
ALTER TABLE profiles DROP COLUMN website;

ALTER TABLE classmates ADD COLUMN found_links TEXT;
