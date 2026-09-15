# SmartTools

SmartTools is a pnpm monorepo with one Next.js application and shared capability packages.

## Application

- `/` — SmartTools discovery and product catalog.
- `/paperwork/*` — invoices, receipts, expenses, mileage, tax, W-9, and 1099 tools.
- `/devtools/*` — browser-based developer utilities.
- `/media/*` — private in-browser image and PDF tools.
- `/admin/*` — permission-gated tools, templates, flags, users, roles, and audit control plane.
- `/auth/*` — authentication and account management with Better Auth.

All routes are served by the root Next.js application on port 3000. Public tools remain anonymous. Authentication reads sessions in-process through `@smarttools/auth`; Admin additionally requires `admin.enter` and the exact permission for each page or mutation.

## Commands

```bash
pnpm dev
pnpm db:migrate
pnpm admin:promote verified-admin@example.com
pnpm build
pnpm lint
pnpm test
pnpm test:media
```

## First deployment

1. Copy `.env.example` to `.env.local`, then configure `APP_URL`, one strong `BETTER_AUTH_SECRET`, the database, and any optional integrations you use.
2. Run `pnpm db:migrate`. This preserves anonymous Paperwork tables, adds Auth/control-plane tables, and seeds system roles, current tool slugs, and invoice templates for an empty catalog.
3. Deploy the repository root application.
4. Create and verify the first account, then run `pnpm admin:promote <verified-email>` once.

Google OAuth needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; verification, recovery, and deletion emails need `RESEND_API_KEY` and `AUTH_EMAIL_FROM`.

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
   - `RESEND_API_KEY` and `AUTH_EMAIL_FROM` — a verified email sender.
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` if enabling Google login.
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`
     if enabling admin icon uploads.
   - Any other integrations used from `.env.example`.
4. Set the Google OAuth redirect URL to
   `https://smarttools.lol/api/auth/callback/google` when using Google login.
5. Point your local migration environment at the intended deployment database,
   then run `pnpm db:migrate`. Migrations are a separate, explicit step and are
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
