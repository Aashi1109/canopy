# SmartTools

SmartTools is a pnpm monorepo with one Next.js application and shared capability packages.

## Application

- `/` — SmartTools discovery and product catalog.
- `/paperwork/*` — invoices, receipts, expenses, mileage, tax, W-9, and 1099 tools.
- `/devtools/*` — browser-based developer utilities.
- `/media/*` — private in-browser image and PDF tools.
- `/admin/*` — permission-gated tools, templates, flags, users, roles, and audit control plane.
- `/auth/*` — authentication and account management with Better Auth.

All routes are served by the root Next.js application on port 3000. Public tools remain anonymous. Authentication reads sessions in-process through `@canopy/auth`; Admin additionally requires `admin.enter` and the exact permission for each page or mutation.

## Commands

```bash
pnpm dev
pnpm db:migrate <folder>
pnpm db:seed
pnpm admin:promote verified-admin@example.com
pnpm build
pnpm lint
pnpm test
pnpm test:media
```

## Formatting

Run `pnpm format` to format the workspace or `pnpm format:check` to check it without
changing files. To format a single file, run `pnpm exec prettier --write path/to/file`.

Run `pnpm hooks:install` once to enable the pre-commit hook. It runs tests, then
formats only staged files with `lint-staged`, preserving unstaged edits and adding
the formatting to the commit. Test failures are reported but do not block
formatting or the commit; formatting errors do. `pnpm format` remains available
for formatting the whole workspace.

Prettier uses a pinned local version and the root `.prettierrc.json`: two-space
indentation, double quotes, semicolons, trailing commas, LF line endings, and a
100-column print width. Generated files and copied vendor assets are excluded.
Enable the Prettier extension in your editor and format on save using the workspace
version. Formatting is separate from `pnpm lint`, which checks TypeScript.

## First deployment

1. Copy `.env.example` to `.env.local`, then configure `APP_URL`, one strong `BETTER_AUTH_SECRET`, the database, and any optional integrations you use.
2. Run `pnpm db:migrate baseline`. This preserves anonymous Paperwork tables and adds Auth/control-plane tables and system roles.
3. Run `NODE_ENV=production pnpm db:seed` to seed current tool slugs, tool content, invoice templates for an empty catalog, and missing tool icons.
4. Deploy the repository root application.
5. Create and verify the first account, then run `pnpm admin:promote <verified-email>` once.

Google OAuth needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; verification, recovery, and deletion emails need `RESEND_API_KEY` and `ACCOUNTS_EMAIL`.

Set `ACCOUNTS_EMAIL=accounts@smarttools.lol` for account-related emails sent through Resend and `SUPPORT_EMAIL=support@smarttools.lol` for contact links and the contact form. Apply these values to the deployed environment as well. The contact form opens the visitor's email app; support messages and replies are handled in Zoho.

## Database migrations

Run `pnpm db:migrate <folder>` with a folder name under `packages/database/migration/`.
Only that folder's immediate `.sql` files run, in filename order. A folder is required;
there is no default or automatic run of every folder. Prefix SQL filenames with numbers
to control execution order.

The `baseline` folder contains the existing `0001`–`0008` migrations.
Put each new migration batch in its own folder and pass that name to the command.
Migrations run only their SQL; run `pnpm db:seed` separately for catalog seeding.
Applied migrations are not tracked; explicitly rerunning a folder runs its SQL again.

`db:seed` seeds tools and templates, uploads SVG icons to Cloudinary, then assigns
missing icons by tool slug. Existing database icon assignments and Cloudinary assets
are preserved. Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and
`CLOUDINARY_API_SECRET`; set `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` to the same cloud
for public delivery. Set `NODE_ENV` to `development`, `test`, or `production`.

Icons default to `scripts/seed-assets/tool-icons`, included in Git for fresh setups.
They stay outside `public` and are excluded from Next.js output tracing, so they
are not shipped in the production application bundle or final Docker runtime image.
To use another SVG directory, with filenames matching tool slugs:

```bash
NODE_ENV=development pnpm db:seed --icons-dir /path/to/icons
```

A failed step stops seeding. Upload manifests are kept in the system temporary
directory on failure; fix the reported error and rerun the command. Completed
uploads are reused, existing assignments are preserved, and successful runs clean
up their temporary manifest. Database migrations remain a separate command.

## Docker

The web image is `aashishpal09/canopy:latest`, targeting `linux/amd64`.
Build and push it to Docker Hub from the repository root:

```bash
docker login
pnpm docker
```

To build locally with Compose instead:

```bash
docker compose --env-file .env.local build web
```

Configure runtime environment variables on the deployment platform. The image
does not include `.env.local`; PostgreSQL and database migrations are managed
separately from the web service.

## Cloudflare Workers

The `smarttools` Worker runs at **https://smarttools.aashishpal50.workers.dev**.
The checked-in configuration targets **https://smarttools.lol** and keeps the
workers.dev address enabled. Cloudflare Access is not required; the application
enforces its own login and admin permissions.
Deployment uses OpenNext and Wrangler.
Next.js 16.3.3 and OpenNext 1.20.6 support the app's Node.js authentication proxy
while preserving the existing webpack build and browser media assets.
The minified Worker is about 9 MiB. The configuration uses the account's default
CPU limit and deploys on Workers Free, but concurrent live requests have exceeded
that limit and returned 503 errors. Reliable production use needs lower CPU usage
or Workers Paid with a higher CPU limit.

The `HYPERDRIVE` binding pools connections to the existing PostgreSQL database.
Query caching is disabled so authentication and permission reads remain fresh.
Hyperdrive on Free allows 100,000 database statements per day. Live verification
after enabling pooling still observed CPU-limit 503 errors, including on session
and admin routes; pooling alone does not make this Next.js app reliable on Free.

### Configure once

1. Activate `smarttools.lol` in the account's Cloudflare DNS zone.
2. Run `pnpm exec wrangler login`.
3. Set the Worker secrets listed below with `pnpm exec wrangler secret put NAME`
   (each command prompts for the value):
   - `DATABASE_URL` — a reachable PostgreSQL URL with TLS.
   - `BETTER_AUTH_SECRET` — a persistent, random authentication secret.
   - `RESEND_API_KEY` and `ACCOUNTS_EMAIL` — a verified account-email sender.
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` if enabling Google login.
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`
     if enabling admin icon uploads.
   - Any other integrations used from `.env.example`.
4. Set the Google OAuth redirect URL to
   `https://smarttools.lol/api/auth/callback/google` when using Google login.
5. Point your local migration environment at the intended deployment database,
   then run `pnpm db:migrate baseline` for first setup, or `pnpm db:migrate <folder>`
   for a later migration batch. Run `pnpm db:seed` separately for first setup.
   Migrations are a separate, explicit step and are
   never run by the Worker build or deploy command.

`APP_URL` is configured in `wrangler.jsonc`. Supply
`APP_URL=https://smarttools.lol` during production builds too. If using Cloudinary
icons, supply `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` at build time; runtime secrets
cannot change a value already compiled into browser JavaScript. Local credentials
in `.env.local` are **not** uploaded automatically.

### Verify and deploy

```bash
pnpm test
pnpm lint
pnpm preview
# After checking the local Workers preview:
APP_URL=https://smarttools.lol pnpm deploy
```

`pnpm preview` builds and serves the app at `http://localhost:8787` in Cloudflare's
local Workers runtime. Wrangler reads `.env.local` and the command sets the local
authentication origin. Set
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` to your database URL
in `.env.local` for local preview; it connects directly without Hyperdrive pooling.
The build removes OpenNext's embedded `.env` fallbacks;
production credentials must be configured as Worker secrets. Check login,
account recovery, admin reads/writes,
Paperwork export, and Media image/PDF processing before publishing.

`worker.ts` gives each request its own PostgreSQL connections, retains them while
the response streams or background tasks run, and closes them afterward. Ordinary
`pnpm dev` / `pnpm start` keep Node connection pooling. Public media processing
stays in the browser; `public/_headers` preserves isolation headers on static
Worker assets. The initial setup uses no R2 cache; add an OpenNext cache binding
if introducing persistent ISR or server data caching.

For Git deployments, connect this repository to Workers Builds, use the repository
root and `pnpm deploy` as the deploy command, and configure build variables as well
as runtime secrets. Keep `APP_URL` aligned with the domain in `wrangler.jsonc`.

References: [OpenNext setup](https://opennext.js.org/cloudflare/get-started),
[environment variables](https://opennext.js.org/cloudflare/howtos/env-vars), and
[database lifecycle](https://opennext.js.org/cloudflare/howtos/db).

## Optional Google Analytics 4

Set `GA_MEASUREMENT_ID` to your public `G-...` web-stream ID in Vercel's
**Production** environment, then redeploy. Tracking is disabled by default in
development, always in Vercel previews, and without a valid ID. To test locally,
set `GA_ENABLE_IN_DEVELOPMENT=true` in `.env.local` and restart `pnpm dev`.
This enables the consent banner and real GA4 events after opt-in; remove the
override when finished. No new dependency is required.

Before enabling production collection, open GA4 Admin → Data streams → your web
stream and turn **Enhanced measurement off**. Automatic history, form, search,
and download events can bypass the application's filtered event payloads. Keep
Google signals, user-provided data collection, and advertising personalization off.

Visitors must allow analytics before the Google script loads. They can change or
withdraw consent at `/privacy#analytics`; withdrawal stops future collection and
removes host-only analytics cookies, but does not erase data already sent. A
blocked preference store makes the choice temporary until reload. Ad blockers or
failed script loads may prevent collection; reload to retry.

Manual page views exclude private routes, queries, fragments, and arbitrary tool
slugs. Tool pages use `/media/[tool]`, `/devtools/[tool]`, or `/paperwork/[tool]`.
Shared manual tool runs emit `tool_start`, `tool_complete`, and `tool_error`;
shared result controls emit `result_copy` after copying and `result_download`
when a download starts. Live typing and tool-owned custom controls are not
instrumented. Events include the compiled `tool_key` when available; create an
event-scoped GA4 custom dimension for `tool_key` to report per-tool usage.
Files, document content, account details, filenames, and error messages are never
included. External referrers are reduced to their origin; internal referrers use
the previous filtered public address.

Verify the deployed site with GA4 Realtime after opting in. Confirm that decline
loads no Google tag, navigation sends one page view, and withdrawal stops events.
