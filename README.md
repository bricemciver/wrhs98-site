# Washburn Rural High School · Class of 1998

Private class site for the 30-year reunion: news, a members-only photo/video album, a class directory, Help Us Find, and In Memoriam.

Working on the code (or with an AI agent)? Read [`AGENTS.md`](AGENTS.md) first for the privacy rules, conventions, and production safety rules.

**Stack:** React Router v8 (framework mode, SSR) on Cloudflare Workers · D1 (SQLite) · R2 (media) · Tailwind CSS v4.
Sign-in with Google, Microsoft, or an emailed magic link. No passwords are stored.

## How access works

1. Anyone can sign in, but only **members** see anything beyond the landing page and announcements marked public.
2. A sign-in whose **verified** email matches a roster entry's *last known email* becomes a member automatically and is linked to that classmate.
3. Everyone else lands on `/pending`, tells us who they are, and waits in **Admin → Access requests**.
4. Emails in the `ADMIN_EMAILS` secret are **site owners**: always admins, and the only ones who can make someone else an admin or remove admin.
5. Members can delete their own account from My Profile. Owners and denied accounts can't.

Microsoft work/school accounts don't count as verified emails, because tenant admins can set arbitrary addresses; those users go through the approval queue. Personal Microsoft accounts and Google accounts are verified.

**Privacy model:** admin-entered "last known" contact info, "found online" social links, and notes are visible only to admins. Members choose whether to share their own social links. Members control whether their own city, email, and phone are shown. Media is served only to members, with `private` caching, and every page except `/` sends `X-Robots-Tag: noindex`.

## Local development

Tools are pinned in `mise.toml` (Node 24, pnpm 12).

```sh
mise install
pnpm install
cp .dev.vars.example .dev.vars       # OAuth keys optional locally
mise run db:migrate:local            # or: pnpm wrangler d1 migrations apply wrhs98 --local
pnpm dev
pnpm test                            # unit tests (Vitest)
pnpm typecheck
```

Without `RESEND_API_KEY`, magic-link emails are printed to the dev server console. Paste the link into your browser.
Add your own email to `ADMIN_EMAILS` in `.dev.vars` to become an admin locally.

## First deploy

```sh
pnpm wrangler login
pnpm wrangler d1 create wrhs98          # wrangler.jsonc finds it by name; no ID to paste
pnpm wrangler r2 bucket create wrhs98-media
mise run db:migrate:remote
pnpm wrangler secret put GOOGLE_CLIENT_ID
pnpm wrangler secret put GOOGLE_CLIENT_SECRET
pnpm wrangler secret put MICROSOFT_CLIENT_ID
pnpm wrangler secret put MICROSOFT_CLIENT_SECRET
pnpm wrangler secret put RESEND_API_KEY
pnpm wrangler secret put SITE_URL                  # https://your-domain
pnpm wrangler secret put EMAIL_FROM                # e.g. Our Class of 1998 <reunion@updates.your-domain>
pnpm wrangler secret put EMAIL_REPLY_TO            # a real inbox for replies
pnpm wrangler secret put ADMIN_EMAILS              # your email (comma-separated for several owners)
pnpm wrangler secret put SITE_CONTACT_NAME         # your name, for email footers (optional)
pnpm wrangler secret put CLASS_FACEBOOK_GROUP_URL  # optional
pnpm run deploy
```

`.dev.vars.example` explains each setting. Your domain, email addresses, and owner details are secrets rather than part of `wrangler.jsonc`, so your copy of the repo holds nothing specific to your site.

Then in the Cloudflare dashboard, go to **Workers & Pages → wrhs98 → Settings → Domains & Routes** and add your custom domain. Cloudflare creates the DNS record and certificate, and deploys leave it alone. To move to a new domain later, add it there, update the `SITE_URL` secret, and add the new OAuth redirect URIs.

**Continuous deploys from GitHub:** under **Settings → Build**, connect the repo (Workers Builds). Set the build command to `pnpm install && pnpm run build` and the deploy command to `pnpm wrangler deploy`. Secrets stay in Cloudflare, not GitHub. Run new migrations with `mise run db:migrate:remote` before deploying code that needs them.

### OAuth apps

| Provider | Where | Redirect URI |
|---|---|---|
| Google | Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web). Publish the consent screen; only basic scopes are used, so no verification review. | `https://<host>/auth/google/callback` |
| Microsoft | entra.microsoft.com → App registrations → *Accounts in any organizational directory and personal Microsoft accounts* → Web platform. Create a client secret (it expires; set a reminder). | `https://<host>/auth/microsoft/callback` |

Add `http://localhost:5198/auth/<provider>/callback` too if you want to test OAuth locally. A provider's button only appears when both its ID and secret are set.

### Email (magic links)

Create a [Resend](https://resend.com) account (free tier: 3,000 emails/month), verify a sending domain (a subdomain such as `updates.your-domain` works well), and set the `EMAIL_FROM` secret to an address on exactly that domain. If your main domain has a strict DMARC policy, the From domain must match the Resend-verified domain exactly.

The sending domain can't receive mail, so replies go to `EMAIL_REPLY_TO`. Every email's footer names `SITE_CONTACT_NAME` as the person who runs the site and says why the reader got the email. Both are secrets.

## Admin tools

- **Access requests**, **Suggestions** (classmates members think are missing), and **Tips** (leads on classmates we can't reach). A daily email at 14:00 UTC reminds owners about anything that has waited more than 24 hours.
- **Roster**: add, edit, and CSV import (see below).
- **Members**: roles, links between accounts and roster entries, and how each person signs in (Google, Microsoft, or email link).
- **Activity**: a permanent log of what admins changed and of members who deleted their accounts. It names people and says which fields changed, never contact info.
- **Preview as a member**: see the site as a regular member does, for troubleshooting.

## Media

- Browsers make a 2048px display copy and a 600px thumbnail of each photo **before upload**, so the Worker never processes images. Videos get a poster frame.
- Uploads stream straight into R2 through the Worker, three requests per item (create → PUT variants → complete). Limits: photos 30 MB, videos 95 MB, under Workers' 100 MB request body cap.
- HEIC photos work from Safari/iOS, which can decode them. Chrome users are asked to convert to JPEG.
- A daily cron removes abandoned uploads, expired sessions, and old sign-in links.
- R2's free tier covers 10 GB of storage with no egress fees. Admin → Overview shows current usage.

## Use this for your own class

This code isn't tied to Washburn Rural. Any class can fork it and run their own private site on Cloudflare's free tier. Here's what to change:

1. **Your school and class:** edit `app/lib/school.ts`. It holds the school's name, short name, town, mascot, class year, reunion year, and the state titles won while you were in school. The site name ("Washburn Rural Class of 1998"), the short name in browser tabs ("WRHS '98"), the email footer, and every "since 1998" label are built from these values.
2. **School colors:** set `--primary` and `--accent` in `app/app.css` (both the light and dark blocks), and the matching hex values in `COLORS` in `app/lib/school.ts`, which emails and the browser's theme color use.
3. **Timezone for dates:** `SITE_TIMEZONE` in `app/lib/format.ts` (`America/Chicago` here).
4. **Your settings:** follow [First deploy](#first-deploy). Your domain, email addresses, owner emails, and Facebook group are secrets that you set yourself (see `.dev.vars.example`). None of them are in the code.
5. **Starter albums:** the first migrations create a few albums, including "Junior Blues Sports." Rename or remove them under Admin → Albums after your first sign-in. Don't edit the migration files themselves.
6. **Names (optional):** the Worker, database, and media bucket are all called `wrhs98` (`wrangler.jsonc`, plus the `db:migrate` scripts in `package.json`). You can keep those names or change them before your first deploy.

Then import your class roster (below), sign in with an email listed in `ADMIN_EMAILS`, and invite your classmates.

## Roster import

Admin → Roster → Import CSV. Columns: `first_name,last_name,maiden_name,current_last_name,nickname,email,phone,city,state,notes,links,deceased`. `links` holds admin-only social profile URLs (separate several with spaces or semicolons). Only `first_name` and `last_name` are required.

Names can be given either way:
- `last_name` = 1998 surname, plus `current_last_name` if it changed, **or**
- `last_name` = today's surname, plus `maiden_name` = 1998 surname.

Names display reunion-style, e.g. *Jennifer "Jen" Jones (Smith)*, and both surnames are searchable. Rows matching an existing first name + 1998 surname are skipped. Members can update their own current last name from their profile.

## Testing and agent tooling

- `pnpm test` runs Vitest unit tests for the pure helpers in `app/lib` (name parsing, CSV, links, formatting, redirects, owner checks). They run in plain Node, with `test/cloudflare-workers.ts` standing in for the Workers runtime.
- `.claude/skills/local-test` explains how to smoke-test against the local dev server. Its scripts sign in as any local user, use the real magic-link login without sending email, and check page layout in headless Chromium.
- `.claude/skills/ship` is the commit → migrate → deploy → check checklist. It runs only when asked.
- `.claude/skills/react-router` is a link to the React Router skill in `.agents/skills`.
- `.claude/settings.json` lets agents run typecheck, tests, and local database commands freely, and asks first before deploying, running remote migrations, changing secrets, or pushing.

## Ideas for later

- A reunion page with the date, venue, and "Are you coming?" responses (later, tickets)
- Optional email to members when news is posted (opt-in, with unsubscribe)
- A map of where classmates live now
- Date and venue polls, comments on photos, scanned yearbook pages

## License

MIT. See [`LICENSE`](LICENSE). You're welcome to use and change this code for your own class.
