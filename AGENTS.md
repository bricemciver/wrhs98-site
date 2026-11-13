# AGENTS.md

Private site for Washburn Rural High School's Class of 1998, ahead of the 30-year reunion (2028). Real classmates use the live site. Its address is the `SITE_URL` secret and isn't in the repo; ask the owner if you need it. `README.md` covers setup, OAuth, email, and how access works; this file covers the rules for changing the code.

## Stack

- **Framework:** React Router v8 in framework mode (SSR), running on Cloudflare Workers through `@cloudflare/vite-plugin`. Tooling is pinned in `mise.toml` (Node 24, pnpm).
- **Data:** D1 (SQLite) using raw SQL, with no ORM. R2 holds media. Tailwind v4, with UI primitives in `app/components/ui.tsx`.
- **Bindings:** read them with `import { env } from "cloudflare:workers"`, not from the loader context.
- **Routes:** listed explicitly in `app/routes.ts`, not by file name.
  - Members-only routes sit under `routes/members-layout.tsx`.
  - Admin routes sit under `routes/admin/layout.tsx`, whose middleware rejects non-admins.
- **Middleware:** the root middleware (`app/root.tsx`) loads the session into `userContext` and checks the `Origin` header on every POST, which is the CSRF protection.
- **Sessions:** the `wrhs98_session` cookie holds a random token. D1 stores only its SHA-256.

## Privacy rules (most important)

- **Admin-only classmate fields:** `classmates.last_known_*`, `found_links`, and `admin_notes`. Never show them on a member page or put them in a member-facing loader's return value.
- **Members' sharing choices:** `profiles.share_*` decides what other members see of someone's profile. Admins can see everything.
- **Media:** served only to members, with `private` caching. Every page except `/` is `noindex`.
- **Classmate data:** don't add features that collect it from outside sources, such as scraping Facebook or guessing email addresses. The owner has already declined those.

## Roles and permissions

- **Roles:** `pending`, `member`, `admin`, `denied`. **Owners** are the emails in the `ADMIN_EMAILS` secret. They're always admin, and only they can grant or remove admin (`isOwnerEmail`).
- **Where to read the role:** always from `context.get(memberContext)` / `userContext`, never from the database. An admin using "Preview as a member" is downgraded in the root middleware (`app/lib/preview.server.ts`), and every check has to see that.
- **Denied accounts:** a denied user must stay denied. For example, they can't delete their account and come back as pending.

## Conventions

- **Activity log:** every admin action adds `activityStmt(me, "<area>.<verb>", summary, target)` (`app/lib/audit.server.ts`) to the same `env.DB.batch` as the change itself.
  - Summaries name people and say which fields changed, never the values, contact info, or notes.
  - New areas go in `app/lib/activity.ts`.
- **School-specific text:** the school's name, class year, mascot, reunion year, and colors come from `app/lib/school.ts` (`SCHOOL`, `SITE_NAME`, `pageTitle()`, `COLORS`). Don't write "Washburn Rural" or "1998" into pages or emails, so another class can reuse the code by editing that one file.
- **Server-only code:** pages can't import `*.server.ts`. Constants that both server and page code need go in a plain module (examples: `activity.ts`, `signin.ts`, `suggestions.ts`).
- **Lookup guards:** check values from forms and URLs with `Object.hasOwn`, not `in`, so `constructor` and `__proto__` don't pass.
- **Foreign keys:** D1 enforces them. Before deleting users, check the `REFERENCES users` columns; `access_requests.reviewed_by` has no ON DELETE rule.
- **Dates:**
  - Store unix seconds (`unixepoch()`).
  - Display with the helpers in `app/lib/format.ts`, which use `SITE_TIMEZONE` (America/Chicago) so server and browser rendering match.
- **Names:** `classmates.last_name` is the 1998 name and `current_last_name` is today's. Display names with `classmateName()`, which gives `Jennifer "Jen" Jones (Smith)`.
- **Form errors:** actions return `data({ error }, { status })`, and pages show them with `<Alert tone="error">`. Use fetchers for actions within a page.
- **Writing style:** UI text and docs use plain, friendly language for classmates in their late 40s. Avoid jargon.

## Database migrations

- **Naming:** add `migrations/NNNN_description.sql` with the next number. Never edit a migration that's already been applied, and comment what each column means.
- **Order:** `pnpm -s db:migrate:local` while developing. Production is migrated before deploying (see the `ship` skill).
- **Remote applies are flaky:** they sometimes print nothing or fail once with code 7403. Re-run until one prints "No migrations to apply!".

## Checking your work

- `pnpm -s typecheck`: generates Wrangler and route types, then runs `tsc`. It must pass.
- `pnpm -s test`: Vitest unit tests for pure helpers (`app/lib/*.test.ts`).
  - `cloudflare:workers` is replaced with `test/cloudflare-workers.ts`, so test code that uses DB or R2 with a local smoke test instead.
  - Add tests when you change helpers like names, CSV, links, formatting, or redirects.
- **Local smoke test:** use the `local-test` skill. It covers signing in as any local user, testing the real magic-link login, curl recipes, and headless-browser layout checks.
- There's no linter. Match the formatting of nearby code: two spaces, double quotes, about 140 characters per line.

## Production safety

- **Deploys:** deploying and production migrations need the owner's explicit OK for each change. Use the `ship` skill, which only runs when the owner asks.
- **Production data:** never query it (`wrangler d1 execute --remote`) or read it from logs. Build test cases from local data.
- **Secrets:** the owner sets them in their own terminal with `pnpm wrangler secret put NAME`. Never ask for them in chat, print them, or commit `.dev.vars`.
- **Email:**
  - Sent through Resend. `EMAIL_FROM` must stay on the exact domain verified in Resend, because the owner's domain has a strict DMARC policy.
  - The site's domain and email addresses are secrets (`SITE_URL`, `EMAIL_FROM`, `EMAIL_REPLY_TO`). Don't write them into the code, docs, or tests; use `reunion.example.org` in examples.
  - Always send with `sendEmail(to, { subject, preview, text, html, reason })`. It wraps every message in the shared layout (`app/lib/email-layout.ts`): a full HTML document, a matching plain-text part, and a footer saying who runs the site and why the reader got the email.
  - Replies go to `EMAIL_REPLY_TO`.
  - Keep emails personal and specific. A bare link from an unexplained sender is what lands in spam.
