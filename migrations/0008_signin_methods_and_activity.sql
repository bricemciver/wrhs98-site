-- How each account first joined and how it last signed in:
-- 'google' | 'microsoft' | 'email' (magic link).
ALTER TABLE users ADD COLUMN signup_method TEXT;
ALTER TABLE users ADD COLUMN last_login_method TEXT;

-- Existing accounts: a provider link made when the account was created means
-- they joined with that provider; otherwise they joined with an email link.
-- Their last-used method isn't known yet and fills in on their next sign-in.
UPDATE users SET signup_method = COALESCE(
  (SELECT o.provider FROM oauth_accounts o
    WHERE o.user_id = users.id AND o.created_at <= users.created_at + 60
    ORDER BY o.created_at LIMIT 1),
  'email');

-- What admins (and members deleting their own accounts) did, newest first.
-- actor_label is a snapshot of the name so entries stay readable after an
-- account is removed. summary never holds contact info, only names and
-- which fields changed.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL,
  action TEXT NOT NULL,             -- e.g. member.role, roster.update
  target_type TEXT,                 -- user | classmate | post | album | media | lead | suggestion | request
  target_id INTEGER,
  summary TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX audit_log_created ON audit_log (created_at DESC);
CREATE INDEX audit_log_actor ON audit_log (actor_id, created_at DESC);
