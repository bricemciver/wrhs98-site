-- Members suggest people missing from the roster (graduated early/late,
-- finished elsewhere, …). Admins review and add them or dismiss.
CREATE TABLE classmate_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submitted_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,          -- last name in school
  current_last_name TEXT,
  connection TEXT NOT NULL,         -- early | late | elsewhere | other
  details TEXT,                     -- years attended, how the submitter knew them
  contact TEXT,                     -- how to reach them (admins only)
  status TEXT NOT NULL DEFAULT 'open', -- open | added | dismissed
  classmate_id INTEGER REFERENCES classmates (id) ON DELETE SET NULL,
  resolved_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX classmate_suggestions_status ON classmate_suggestions (status, created_at);
CREATE INDEX classmate_suggestions_submitter ON classmate_suggestions (submitted_by, created_at);
