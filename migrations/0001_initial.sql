-- WRHS '98 initial schema

-- The class roster, maintained by admins. One row per classmate, whether or
-- not they have joined the site. last_known_* and admin_notes are admin-only.
CREATE TABLE classmates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,          -- name in 1998
  nickname TEXT,
  last_known_email TEXT,            -- lowercase; used for automatic roster matching
  last_known_phone TEXT,
  last_known_city TEXT,
  last_known_state TEXT,
  admin_notes TEXT,
  is_deceased INTEGER NOT NULL DEFAULT 0,
  deceased_on TEXT,                 -- free text, e.g. "2019" or "March 2021"
  memoriam_text TEXT,
  memoriam_photo_key TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX classmates_name ON classmates (last_name, first_name);
CREATE INDEX classmates_email ON classmates (last_known_email);

-- Site accounts. role: pending | member | admin | denied
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,       -- lowercase
  email_verified INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'pending' CHECK (role IN ('pending', 'member', 'admin', 'denied')),
  classmate_id INTEGER UNIQUE REFERENCES classmates (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login_at INTEGER
);

CREATE TABLE oauth_accounts (
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (provider, provider_user_id)
);

-- id is the SHA-256 (hex) of the cookie token; the raw token is never stored.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE magic_links (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX magic_links_email ON magic_links (email, created_at);

-- Member-controlled profile. share_* flags control what other members see.
CREATE TABLE profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  current_last_name TEXT,
  city TEXT,
  state TEXT,
  contact_email TEXT,
  phone TEXT,
  website TEXT,
  bio TEXT,
  photo_key TEXT,
  share_email INTEGER NOT NULL DEFAULT 1,
  share_phone INTEGER NOT NULL DEFAULT 0,
  share_location INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Requests from signed-in people who did not match the roster automatically.
CREATE TABLE access_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  name_in_school TEXT NOT NULL,
  current_name TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'denied')),
  reviewed_by INTEGER REFERENCES users (id),
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- "Help Us Find" tips submitted by members.
CREATE TABLE leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  classmate_id INTEGER NOT NULL REFERENCES classmates (id) ON DELETE CASCADE,
  submitted_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  info TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 0,   -- also shown on the signed-out landing page
  is_pinned INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 1,
  author_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  published_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX posts_published ON posts (is_published, published_at DESC);

CREATE TABLE albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- R2 keys are media/<id>/<variant>; variants: original, display (photos), thumb.
CREATE TABLE media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id INTEGER NOT NULL REFERENCES albums (id) ON DELETE CASCADE,
  uploader_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'video')),
  content_type TEXT NOT NULL,
  original_name TEXT,
  caption TEXT,
  width INTEGER,
  height INTEGER,
  size_bytes INTEGER,
  has_display INTEGER NOT NULL DEFAULT 0,
  has_thumb INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'ready', 'hidden')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX media_album ON media (album_id, status, created_at DESC);
CREATE INDEX media_recent ON media (status, created_at DESC);

INSERT INTO albums (slug, title, description, sort_order) VALUES
  ('senior-year', 'Senior Year', 'Photos from 1997–98.', 1),
  ('then-and-now', 'Then & Now', 'Share a photo from high school next to one from today.', 2),
  ('past-reunions', 'Past Reunions', 'The 10- and 20-year reunions, and any get-togethers since.', 3);
