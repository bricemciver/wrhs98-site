---
name: local-test
description: Smoke-test a change to the WRHS '98 site against the local dev server — sign in as any local user without email, call routes with curl, sign in through the real magic-link path, and check page layout in headless Chromium at several widths. Use after changing routes, loaders, actions, or UI, before asking to ship.
---

# Local smoke testing

Everything here touches only the **local** D1 database (`.wrangler/state`) and `http://localhost:5198`. Never point these scripts at production, and never read production data to build test cases.

## 1. Prepare

```sh
pnpm -s db:migrate:local      # apply any new migration locally first
pnpm -s typecheck && pnpm -s test
```

Start the dev server in the background (`pnpm dev`, port 5198) and wait until `curl -s -o /dev/null -w '%{http_code}' http://localhost:5198/` returns 200.

## 2. Get a signed-in session

Scripts live in `.claude/skills/local-test/scripts/` and run from any directory in the repo.

| Need | Command | Notes |
|---|---|---|
| Act as an existing local user | `scripts/seed-session.sh <user-id or email>` | Prints a cookie token valid for 24 hours. Fast, skips the login code. |
| Test the login itself (roster matching, roles, sign-in method, owner rules) | `scripts/magic-link.sh <email>` | Redeems a one-time link through `completeLogin`. Creates the user if new. Prints the redirect and session token. |

List local users with:
`pnpm -s wrangler d1 execute wrhs98 --local --command "SELECT id, email, role, classmate_id FROM users"`

The site owner (in `ADMIN_EMAILS` in `.dev.vars`) is the usual admin. For a non-owner admin, set `role = 'admin'` on another local user. The magic-link request form has a rate limit, which is why these scripts insert links directly.

## 3. Call routes

```sh
B=http://localhost:5198
curl -s -o /dev/null -w '%{http_code}\n' -b "wrhs98_session=$TOKEN" $B/admin/members
# Actions need the Origin header (CSRF check in root middleware):
curl -s -b "wrhs98_session=$TOKEN" -H "Origin: $B" -X POST $B/admin/members -d "userId=8&role=member"
```

Things that look like failures but aren't:
- **202 from a POST** is React Router's single-fetch redirect payload. Check the database to see whether the change happened.
- **React's `<!-- -->` markers** split text in server-rendered HTML. Strip them before grepping: `sed -e 's/<!-- -->//g' -e 's/<[^>]*>/\n/g'`.

Check results with `wrangler d1 execute wrhs98 --local --json --command "..."`. For admin actions, also confirm a row was added to `audit_log`.

Cover the permission edges, not just the happy path:
- member vs admin vs owner
- someone previewing as a member
- pending or denied accounts
- signed-out visitors, who should get a 302 to /login

## 4. Check layout in a real browser

```sh
node .claude/skills/local-test/scripts/browser-check.mjs "$TOKEN" /admin/members 1440,1280,1024,390 "$SCRATCHPAD"
```

Prints one JSON line per width:
- `pageOverflow`: true means the page scrolls sideways, which is a bug.
- `containers`: elements that scroll sideways inside themselves. That's fine for wide tables on phones.

It also saves a screenshot per width; look at them with the Read tool. Write screenshots to the session scratchpad, not the repo.

## 5. Clean up

Stop the dev server. Test rows can stay in the local database, but mention anything you changed that the user might notice in local data.
