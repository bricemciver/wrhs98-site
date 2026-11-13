#!/usr/bin/env bash
# Creates a 24-hour session in the LOCAL D1 database and prints the cookie token.
# Usage: seed-session.sh <user-id | email>
# Use the token as: curl -b "wrhs98_session=<token>" http://localhost:5198/...
# Local only: this never touches the remote database.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
source "$(dirname "$0")/_sha256.sh"
who="${1:?usage: seed-session.sh <user-id|email>}"
if [[ "$who" =~ ^[0-9]+$ ]]; then where="id = $who"; else where="email = lower('${who//\'/\'\'}')"; fi
token="$(openssl rand -hex 24)"
hash="$(printf %s "$token" | sha256_hex)"
out="$(pnpm -s wrangler d1 execute wrhs98 --local --json --command \
  "INSERT INTO sessions (id, user_id, expires_at) SELECT '$hash', id, unixepoch() + 86400 FROM users WHERE $where RETURNING user_id" 2>/dev/null)"
if ! grep -q '"user_id"' <<<"$out"; then echo "No local user matches '$who'. Sign in once locally, or pick an id from: SELECT id, email, role FROM users" >&2; exit 1; fi
echo "$token"
