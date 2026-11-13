-- Family name from the sign-in provider (Google, sometimes Microsoft), used to
-- fill in a classmate's current last name when their account is linked.
ALTER TABLE users ADD COLUMN family_name TEXT;
