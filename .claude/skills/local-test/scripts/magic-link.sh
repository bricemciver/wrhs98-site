#!/usr/bin/env bash
# Signs in through the real login path (completeLogin) without sending email:
# inserts a one-time magic link for <email> into the LOCAL database and redeems it.
# Prints the redirect target and the new session token. Creates the user if needed.
# Usage: magic-link.sh <email> [base-url]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
source "$(dirname "$0")/_sha256.sh"
email="$(tr '[:upper:]' '[:lower:]' <<<"${1:?usage: magic-link.sh <email> [base-url]}")"
base="${2:-http://localhost:5198}"
token="$(openssl rand -hex 24)"
hash="$(printf %s "$token" | sha256_hex)"
pnpm -s wrangler d1 execute wrhs98 --local --command \
  "INSERT INTO magic_links (token_hash, email, expires_at) VALUES ('$hash', '${email//\'/\'\'}', unixepoch() + 600)" >/dev/null 2>&1
headers="$(curl -s -D - -o /dev/null -H "Origin: $base" -X POST "$base/auth/verify" --data-urlencode "token=$token")"
echo "redirect: $(grep -i '^location:' <<<"$headers" | tr -d '\r' | cut -d' ' -f2-)"
echo "session:  $(grep -io 'wrhs98_session=[^;]*' <<<"$headers" | head -1 | cut -d= -f2)"
