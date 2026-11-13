---
name: ship
description: Commit, push, migrate production, and deploy the WRHS '98 site, then smoke-check it. Only when the user explicitly asks to ship, deploy, or "run it".
disable-model-invocation: true
---

# Ship to production

This publishes to the live site, which real classmates use. Its address is the `SITE_URL` secret and isn't in the repo; ask the owner if you don't know it. Run it only on the user's explicit request for **this** change. Approval for an earlier deploy doesn't carry over.

## 1. Check before committing

```sh
git status --short
pnpm -s typecheck
pnpm -s test
```

Stop and report if either check fails. Make sure no secrets are staged: `.dev.vars` is gitignored and must stay that way. If the change touches UI or routes and hasn't been smoke-tested, use the `local-test` skill first.

## 2. Commit and push

Commit to `main` with a short imperative subject that says what changed for users, plus a body if it helps. Then `git push origin main`.

## 3. Migrate production (only if `migrations/` changed)

Migrate **before** deploying, because new code expects the new schema.

```sh
pnpm -s db:migrate:remote
pnpm -s db:migrate:remote   # run again until it prints "No migrations to apply!"
```

Remote applies sometimes print nothing, or fail once with an authorization error (code 7403), and then succeed on the next run. Don't consider it done until a run prints **"No migrations to apply!"**. If it keeps failing, stop and tell the user. They may need to run `pnpm wrangler login`.

## 4. Deploy

```sh
pnpm run deploy 2>&1 | grep -E "Version ID|error|✘"
```

## 5. Smoke-check production

```sh
SITE=https://<live site address>
for p in / /login /directory /admin; do curl -s -o /dev/null -w "$p %{http_code}\n" $SITE$p; done
```

Expect `/` and `/login` to return 200 and member pages to return 302 (a redirect to sign-in). Add the paths this change touched. Don't sign in to production, don't read production D1 data, and don't print magic-link tokens from production logs.

## 6. Report

Tell the user:
- the commit hash and Version ID
- whether a migration ran
- the smoke-check results
- what to look at on the live site

Be specific about anything that failed or was skipped.
