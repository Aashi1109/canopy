# SmartTools

SmartTools is a single Next.js application managed with pnpm.

## Application

- `/` — SmartTools discovery and product catalog.
- `/paperwork/*` — invoices, receipts, expenses, mileage, tax, W-9, and 1099 tools.
- `/devtools/*` — browser-based developer utilities.
- `/media/*` — private in-browser image and PDF tools.
- `/admin/*` — permission-gated tools, templates, flags, users, roles, and audit control plane.
- `/auth/*` — authentication and account management with Better Auth.

All routes are served by the root Next.js application on port 3000. Public tools remain anonymous. Authentication reads sessions in-process through `@/lib/auth/index.ts`; Admin additionally requires `admin.enter` and the exact permission for each page or mutation.

## Code layout

- `app/` owns routes; `tools/` owns individual tools.
- `lib/` owns authentication, authorization, cache, configuration, admin logic, and tool/template capabilities.
- `db/` owns database clients, schemas, migration folders, and database scripts.
- `components/ui/` owns the shared design system.
- `package.json` declares all dependencies; `pnpm-workspace.yaml` retains pnpm install policies only.

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

## Configuration

Application and CLI configuration is read through
`lib/config/config.ts` (`import config from "@/lib/config/config.ts"`), grouped by
service like `config.cloudinary` and `config.auth`. Getters preserve runtime reads
and CLI dotenv loading order; required-value validation stays with each operation.
Browser/shared client modules use `@/lib/config/public.ts`, which contains only
public values. Add new environment reads there or in the server config, rather
than directly in consumers. Next.js loads app environment files; CLI scripts keep
their existing dotenv setup. Test harnesses still set and forward process environments.

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
2. Run the fresh-database migration sequence through `0007-generic-assistant` documented under [Generic Assistant migration](#generic-assistant-migration), using `pnpm db:migrate <folder>` for each folder. The baseline preserves anonymous Paperwork tables and adds Auth/control-plane tables and system roles.
3. Run `NODE_ENV=production pnpm db:seed` to seed current tool slugs, tool content, invoice templates for an empty catalog, and missing tool icons.
4. Deploy the repository root application.
5. Create and verify the first account, then run `pnpm admin:promote <verified-email>` once.

On Vercel, set `DATABASE_URL` to the **Transaction pooler** connection string from
Supabase's **Connect** dialog (port `6543`), then redeploy. Each Node instance uses
one pooled connection using `pg`, which queues queries on that connection instead
of pipelining them through the transaction pooler. Queries use unnamed statements.
Run migrations using a
direct or session-pooler connection in your local migration environment.

Sentry collects application errors and traces directly from the SDK, without Vercel
Drains. Set `NEXT_PUBLIC_SENTRY_DSN` to your Sentry project's public DSN in Vercel and
redeploy (it is also embedded in the browser build). Leave it empty to disable Sentry.
For readable production stack traces, also set the build variables `SENTRY_ORG`,
`SENTRY_PROJECT`, and the secret `SENTRY_AUTH_TOKEN` with source-map upload permissions.
Uploaded source maps are removed from the build output.

The configuration and server-action helper live in `lib/observability/sentry.ts`;
Next.js loads them through `instrumentation.ts` and `instrumentation-client.ts`.
Errors are captured independently of trace sampling. Traces sample 10% of production
requests (100% in development); adjust `tracesSampleRate` in that module when needed.
In Sentry, use **Issues** for failures and **Traces** for request waterfalls. Server
actions have names such as `serverAction/admin.updateRoleAction`; blog dispatches
include the validated `app.operation`. API routes use the SDK's automatic tracing.
`db.query` and `redis.GET`/`SET`/`DEL`/`EVAL` appear as child spans, including failures.
Database timings exclude pool checkout; Redis includes connection setup and timeouts.
Caught unexpected action/API errors are reported before the existing error responses.
Request bodies, headers, cookies, query parameters, user information, database query
data, and console breadcrumbs are excluded. Session replay and profiling are not enabled.
Verify after deploying by exercising a server action and API request, then checking
their traces and child spans. Sampling means not every successful request appears.

Google OAuth needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; verification, recovery, and deletion emails need `RESEND_API_KEY` and `ACCOUNTS_EMAIL`.

Set `ACCOUNTS_EMAIL=accounts@smarttools.lol` for account-related emails sent through Resend and `SUPPORT_EMAIL=support@smarttools.lol` for contact links and the contact form. Apply these values to the deployed environment as well. The contact form opens the visitor's email app; support messages and replies are handled in Zoho.

## Shared Assistant and content

The shared Assistant lifecycle and contracts live in `lib/assistant`, with reusable
panel, composer, reports, and changeset views in `components/assistant`. Register
server integrations statically in `app/api/assistant/integrations.ts`; the core
receives an `AssistantIntegration` and does not import feature implementations.
Blog supplies its permissions, prompts, validation, display projections, and
document application handlers. Paperwork is not integrated yet.

This is a full cutover. Assistant callers use only `/api/assistant/[integrationKey]`
and the shared request/result contracts. The old Blog Assistant routes, wire
adapters, historical payload decoders, and browser-cache migration are removed.
Existing Blog publishing and content APIs remain feature-owned.

`AssistantIntegrationUI` configures agents, labels, select settings, request context,
and application handlers without custom result renderer slots. Canonical artifacts
remain separate from their display projections. The non-Blog fixtures in
`tests/assistant-backend-integration.test.mjs` and
`tests/e2e/assistant-generic.spec.ts` demonstrate integration without a Blog post.

For standalone, read-only Markdown anywhere:

```tsx
import { MarkdownPreview } from "@/components/content/MarkdownPreview";

<MarkdownPreview markdown={content} />
```

It uses standard Markdown headings and paragraph breaks, validates image URLs,
and escapes raw HTML. Blog opts into its own heading/newline settings and retains
its clipboard image validation. The Markdown tool keeps its generated HTML,
sandbox, settings, exports, and synchronized scrolling.

## Database migrations

Run `pnpm db:migrate <folder>` with a folder name under `db/migration/`.
Only that folder's immediate `.sql` files run, in filename order. A folder is required;
there is no default or automatic run of every folder. Prefix SQL filenames with numbers
to control execution order.

The `0001-baseline` folder contains the existing `0001`–`0008` migrations.
Put each new migration batch in its own folder and pass that name to the command.
Migrations run only their SQL; run `pnpm db:seed` separately for catalog seeding.
Applied migrations are not tracked; explicitly rerunning a folder runs its SQL again.

On Node deployments, public tool listings, ecosystem navigation, and global search share a
resolved in-memory catalog with a 24-hour TTL. Admin tool edits clear it in the current
process; restart other Node instances after edits that must appear immediately.
Cloudflare Workers bypass this process-local snapshot so edits cannot stay stale in another
isolate. React still deduplicates catalog reads within a page render. User and authorization
caches continue to use Redis.

### Generic Assistant migration

Run `pnpm db:migrate 0007-generic-assistant` before deploying the generic Assistant
application. It creates empty `assistant_threads`, `assistant_runs`,
`assistant_messages`, and `assistant_attachments` tables with integration and
optional resource scope. There is no backfill: it drops `blog_threads`,
`blog_runs`, `blog_messages`, and `blog_attachments`, including their old
conversations, plus the obsolete `protect_blog_run_provider()` function.
Blog content and publishing tables are unchanged. The drops do not use `CASCADE`;
an unexpected dependency causes the transaction to roll back.

The migration runs in one transaction and is safe to rerun without erasing new
Assistant records. Rerun `0007` if the fresh Assistant tables were already created
before legacy-table removal was added. It requires the authentication tables but
does not depend on the old Blog Assistant tables. Their obsolete migrations
`0003` through `0006` have been removed from the repository.

For a **fresh empty database**, execute `0001-baseline`, `0002-tool-icon-url`,
then `0007-generic-assistant`. Run `pnpm db:seed` separately. Existing deployments
run `0007` directly; do not recreate the removed legacy migrations.

For deployment, pause new Assistant writes and maintenance, allow active requests
to settle, take a database snapshot, run `0007`, deploy schema-compatible code,
and resume requests and maintenance. Keep `assistant_*` tables intact during a
rollback and use schema-compatible application code. An older application that
requires the removed Blog Assistant tables needs the pre-migration snapshot;
restoring that snapshot must account for writes made after it was taken.

Run the fresh-schema, legacy-removal, replay, scope-isolation, and deletion-order checks against
a disposable PostgreSQL database with
`ASSISTANT_TEST_DATABASE_URL=postgresql://... node --test tests/assistant-migration.test.mjs`.
These tests create and remove temporary schemas and deliberately never fall back
to `DATABASE_URL`.

Assistant retention and provider-resource cleanup runs independently of Blog
publication on the existing 30-minute Worker schedule. Set
`ASSISTANT_SCHEDULER_SECRET` to the same random bearer secret in the application
and scheduler environment. Leave `ASSISTANT_MAINTENANCE_URL` empty to use the
Worker's self binding, or set it to an HTTPS Docker endpoint ending exactly in
`/api/internal/assistant/maintenance`. This uses a separate secret from
`BLOG_SCHEDULER_SECRET`; both scheduled operations run even if the other fails.
Assistant cleanup is invoked only through its independent maintenance endpoint;
Blog publishing no longer invokes conversation cleanup.

For existing databases, run `pnpm db:migrate 0002-tool-icon-url` before deploying the
updated app. It adds `managed_tools.icon_url`, preserves existing URLs, backfills
legacy Cloudinary icons, and drops `tool_icons` in one transaction. Set
`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` (or `CLOUDINARY_CLOUD_NAME`) to the existing
icons' cloud; it is required only when legacy icons need backfilling. A failure
rolls back the schema and data changes. The folder is safe to rerun. Fresh setups
continue through the Assistant migration sequence above before running `db:seed`.

`db:seed` seeds tools and templates, uploads SVG icons to Cloudinary, then assigns
missing icons by tool slug. Existing database icon assignments and Cloudinary assets
are preserved. Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and
`CLOUDINARY_API_SECRET`. If `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` is set, use the
same cloud. Complete delivery URLs are stored on each tool. Set `NODE_ENV` to
`development`, `test`, or `production`.

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

## Admin subdomain on Vercel

The public site and admin use the same Vercel project and deployment. The admin
origin is derived automatically from `APP_URL`: `https://example.com` and
`https://www.example.com` both use `https://admin.example.com`, with paths such
as `/users` and `/tools`. There is no separate admin URL setting.

1. Add `admin.example.com` to the project's **Settings → Domains**, assigned to
   Production. Add the exact CNAME record Vercel displays at your DNS provider
   and wait for domain verification and HTTPS.
2. Set the public site's URL for the production build:

   ```dotenv
   APP_URL=https://example.com
   ```

   Use an HTTPS origin without a path. The derived admin URL preserves the
   protocol and port, removes a leading `www.`, and prefixes the hostname with
   `admin.`. Keep `BETTER_AUTH_SECRET` unchanged.
3. If using Google login, register both callbacks with the OAuth provider:
   `https://example.com/api/auth/callback/google` and
   `https://admin.example.com/api/auth/callback/google`.
4. Redeploy. `APP_URL` must be available at build time so server and browser
   navigation agree; changing it requires a new deployment. IP addresses and
   `*.vercel.app` values retain `/admin` routes instead of deriving a subdomain.
   Bare `localhost` derives `admin.localhost` for development.

The app internally rewrites admin pages to `app/admin`; browser URLs have no
`/admin` prefix. Old `/admin/...` page URLs redirect to the corresponding clean
admin URL, preserving queries. APIs, authentication, and assets retain their
existing paths. Mutations to legacy paths on the public host return 404 instead
of forwarding their request bodies to the admin host.

On real domains, login is shared with cookies scoped to the common parent
hostname. All subdomains within that cookie scope must be trusted. Authentication
and the request proxy use `config.auth.cookiePrefix`, configured through
`AUTH_COOKIE_PREFIX` (default:
`smarttools`). Keep the same value on both hosts. Login and logout apply to both
hosts. Existing server-side admin permissions remain required.
Admin responses are marked `noindex`, and its `robots.txt` disallows crawling.

Before switching an existing deployment to shared-domain cookies, clear existing
cookies for both the public and admin hosts, then sign in again. Existing
host-only cookies do not migrate to the shared domain; keep the `smarttools`
cookie prefix unchanged.

After deploying, verify login from both hosts, navigation to `/users` and `/tools`,
an admin save, logout on both hosts, and a public-page link from admin.

### Local development

Keep `APP_URL=http://localhost:3000` in `.env.local`, then start or restart
`pnpm dev`. The public site runs at `http://localhost:3000` and admin at
`http://admin.localhost:3000`, with clean paths such as `/users` and `/tools`.

For Google login, register this local OAuth callback:
`http://localhost:3000/api/auth/callback/google`. Google sign-in starts and
returns on `localhost`, including when initiated from `admin.localhost`.
Local development uses a session handoff to establish host-only cookies on both
hosts because browsers do not reliably share `Domain=localhost` cookies. The
cookies refer to the same backend session, so logout invalidates access on both
hosts. Production domains continue to use shared-domain cookies and callbacks
on the host where Google sign-in began.

To check the flow, sign in at `http://localhost:3000` with a verified account that
has admin access. If needed, grant that existing account access with
`pnpm admin:promote you@example.com`. Open the account menu's admin link and
confirm it reaches `http://admin.localhost:3000` without another login. Check
`/users`, return to the public site, and confirm that logging out signs out both
hosts. Opening `http://localhost:3000/admin/users` should redirect to
`http://admin.localhost:3000/users`. Also verify the deployed flow on the real
HTTPS domain.

### Register another subdomain

`lib/config/subdomains.ts` is the registry for subdomains served by this app.
Only `admin` is currently registered. To add another scope, add one entry to
`SUBDOMAINS`; for example, a future billing scope could use:

```ts
billing: { routePrefix: "/billing", indexable: false },
```

Create its pages beneath that route prefix, such as
`app/billing/invoices/page.tsx`. The registered name determines the hostname:
`billing.example.com/invoices` serves the internal `/billing/invoices` route.
Use `appHref("/billing/invoices")` or `subdomainHref("billing", "/invoices")`
from `lib/routing/subdomains.ts` for links and redirects. For section pages, these
helpers retain the internal route prefix when `APP_URL` uses a host without
subdomain support.
Use `getSubdomainOrigin`, `getSubdomainOrigins`, and `internalSubdomainPath`
from the same module when resolving origins or internal route identities.

Shared authentication automatically trusts the configured public origin and
registered subdomain origins. Each route scope still owns its server-side
permission checks. `/api`, `/auth`, `/account`, `/_next`, `/assets`, `/tool-icons`,
`/media/vendor`, and `/media/licenses`, plus shared logo and favicon files, are
reserved shared paths and are not rewritten into a subdomain's route prefix.

With `indexable: false`, responses receive `noindex`, `robots.txt` disallows
crawling, and `sitemap.xml` returns 404. With `indexable: true`, the scope must
provide its own robots and sitemap routes beneath its route prefix; the public
site's root robots or sitemap are never used as a fallback.

For production, add the new hostname and DNS record at the hosting provider,
and register its OAuth callback if using Google login. These steps remain manual.
Restart development or rebuild and redeploy after changing the registry or
`APP_URL`.

## Docker

The web image is `aashishpal09/canopy:latest`, targeting `linux/amd64`.
Build and push it to Docker Hub from the repository root:

```bash
docker login
APP_URL=https://example.com pnpm build:docker
```

To build locally with Compose instead:

```bash
docker compose --env-file .env.local build web
```

Set `APP_URL` in `.env.local` before the Compose build; Compose passes it as a
build argument and also provides it at runtime. For a direct `docker buildx build`,
pass `--build-arg APP_URL=https://example.com`. Use the same public origin during
the build and at runtime. Changing it requires rebuilding the image because
Next.js embeds it in browser navigation and the derived admin URLs.

Configure runtime environment variables on the deployment platform. The image
does not include `.env.local`; PostgreSQL and database migrations are managed
separately from the web service.

## Cloudflare Workers

`pnpm run deploy` publishes the production `smarttools` Worker at
**https://smarttools.lol** and **https://admin.smarttools.lol**.
`pnpm run deploy:preview` publishes the separate `smarttools-dev` Worker at
**https://smarttools-dev.aashishpal50.workers.dev**. Both commands deploy to Cloudflare.
Cloudflare Access is not required; the application
enforces its own login and admin permissions.
Deployment uses OpenNext and Wrangler.
The target is **Workers Paid**, with an explicit 30,000 ms CPU limit per HTTP request.
Earlier Free-plan deployments exceeded the CPU allowance under concurrent requests.
Paid increases the allowance; verify CPU, memory, and request errors under representative
traffic before cutover. The installed OpenNext adapter implements the app's Node.js
authentication proxy experimentally, so auth and admin flows require a real Workers smoke
test after Next.js or adapter upgrades. The existing webpack build and browser media assets
are preserved.

The pnpm patch for OpenNext 1.20.6 enables the `workerd` package condition in its
Node middleware bundle so PostgreSQL uses its Cloudflare socket adapter. Keep the
patch until an adapter upgrade passes `tests/cloudflare-middleware-postgres.test.mjs`.

The production `HYPERDRIVE` binding pools connections to the existing PostgreSQL database.
Keep Hyperdrive query caching disabled so authentication and permission reads remain fresh.
The binding alone configures database access during Worker requests; a duplicate
`DATABASE_URL` secret is not required when Hyperdrive is present. Local migration commands
still need a direct database connection. The dev Worker has no Hyperdrive binding
and connects directly using `DATABASE_URL` from `.env`.

### Configure once

1. Enable Workers Paid and configure the `smarttools.lol` Cloudflare DNS zone for
   production's `smarttools.lol` and `admin.smarttools.lol` custom domains.
   The dev Worker uses workers.dev and needs no custom-domain setup.
2. Run `pnpm exec wrangler login`.
3. Prepare `.env.prod` in the repository root with production
   build settings and runtime secrets. This file is ignored by Git. Include the
   applicable values below; `pnpm run deploy` uploads runtime secrets with the Worker:
   - `DATABASE_URL` — only needed for Worker runtime when not using Hyperdrive.
   - `BETTER_AUTH_SECRET` — a persistent, random authentication secret.
   - `RESEND_API_KEY` and `ACCOUNTS_EMAIL` — a verified account-email sender.
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` if enabling Google login.
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`
     if enabling admin icon uploads.
   - `BLOG_SCHEDULER_SECRET` and `ASSISTANT_SCHEDULER_SECRET` — separate random bearer
     secrets for the two internal jobs. The single 30-minute cron invokes both jobs
     through the Worker's self binding; leave the optional external target URLs unset.
   - Any other integrations used from `.env.example`.
4. If using Google login, register the callback URLs for the environments being tested:
   `https://smarttools.lol/api/auth/callback/google`,
   `https://admin.smarttools.lol/api/auth/callback/google`, and
   `https://smarttools-dev.aashishpal50.workers.dev/api/auth/callback/google`.
5. Point your local migration environment at the intended deployment database,
   then follow the [fresh-database migration sequence](#generic-assistant-migration)
   through `0007-generic-assistant` for first setup, or run `pnpm db:migrate <folder>`
   for a later migration batch after checking its prerequisites.
   Run `pnpm db:seed` separately for first setup.
   Migrations are a separate, explicit step and are
   never run by the Worker build or deploy command.

When run locally, `pnpm run build:cloudflare` and `pnpm run deploy` use `.env.prod` for application
settings; `pnpm run deploy:preview` and `pnpm run preview` use `.env`.
Each command stops if its selected file
is missing. Workers Builds uses the CI behavior described below instead. Values from `.env.local` and other dotenv files do not fill missing
settings. The commands do not create or edit either environment file.

`APP_URL` comes from the selected configuration in `wrangler.jsonc`:
`https://smarttools.lol` for production and
`https://smarttools-dev.aashishpal50.workers.dev` for dev. It takes precedence over
`APP_URL` in the selected environment file.
If using Cloudinary icons, put `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` in the
selected file for the build; runtime secrets cannot change values already compiled
into browser JavaScript.

Deployment reads runtime settings from the selected file (`.env.prod` for production,
`.env` for dev) after the build succeeds. Known basic settings such as `CACHE_ENABLED`,
`AI_ENABLED`, `AI_PROVIDER`, and `OPENAI_MODEL` become plain-text variables visible in
Cloudflare's dashboard. The allowlist is `PLAIN_VARIABLES` in `scripts/cloudflare.mjs`;
credentials and unknown settings remain secrets, passed through a temporary secrets file.
Redeploy the relevant Worker to apply the split to existing bindings.
Configured Wrangler variables and bindings,
public/build-only values, and deployment credentials are excluded from that upload.
Existing secrets on the selected Worker that are omitted from the file are preserved; removing a line does
not delete the remote secret. See [uploading secrets alongside code](https://developers.cloudflare.com/workers/configuration/secrets/#upload-secrets-alongside-code).

### Verify and deploy

```bash
pnpm exec vitest run tests/cloudflare-build.test.mjs tests/database-request.test.mjs tests/catalog-cache.test.mjs tests/redis-cache.test.mjs tests/rate-limit.test.mjs tests/blog-cron.test.mjs tests/assistant-cron.test.mjs tests/account-access.test.mjs tests/subdomain-routing.test.mjs
pnpm lint
# Optional local check, without uploading:
pnpm run preview
# Deploy the dev Worker:
pnpm run deploy:preview
# After checking the deployed dev Worker:
pnpm run deploy
```

`pnpm run preview` builds and runs the app locally at `http://localhost:8787`
using `.env`, without uploading a Worker. Both the browser build and local Worker
use that localhost origin.

`pnpm run deploy:preview` builds and deploys with Wrangler's `dev` environment.
Put dev application settings and a remotely reachable `DATABASE_URL` in `.env`;
the dev Worker connects directly, without Hyperdrive pooling. Dev has no scheduled
cron triggers, and its self binding points to `smarttools-dev`.
The build removes OpenNext's embedded dotenv fallbacks. Check login,
account recovery, admin reads/writes,
Paperwork export, and Media image/PDF processing before publishing. Also verify advanced
template publication (which generates a PDF on the server) and AI streaming.
Verify both scheduled jobs on production, where the 30-minute cron remains enabled.
Dev admin stays on the same Worker host at `/admin`; production admin uses
`https://admin.smarttools.lol`.
Before production cutover, retain the previous Worker version for rollback and snapshot
the database before any migration. A Worker rollback does not reverse database changes.

`worker.ts` gives each request its own PostgreSQL connections, retains them while
the response streams or background tasks run, and closes them afterward. Ordinary
`pnpm dev` / `pnpm start` keep Node connection pooling. Public media processing
stays in the browser; `public/_headers` preserves isolation headers on static
Worker assets. The initial setup uses no R2 cache; add an OpenNext cache binding
if introducing persistent ISR or server data caching.

For Git deployments, connect the production branch to the `smarttools` Worker in
Workers Builds and use the repository root. Under **Settings > Build**, configure:

- Build variables: `NODE_VERSION=24.18.0` and `PNPM_VERSION=11.14.0`.
- Build command: leave empty; deployment performs the build.
- Deploy command: `pnpm run deploy`.

The script detects Cloudflare's `WORKERS_CI` flag and deploys code with
`--keep-vars`, preserving runtime variables and secrets already set by your local
production deployment. No `.env.prod` file or `PROD_ENV_FILE` build secret is
required in CI. Local deployments continue to read `.env.prod` and upload its
runtime settings.

Only values needed during compilation, such as `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`
and `NEXT_PUBLIC_SENTRY_DSN` when used, belong in Build Variables. Sentry upload
settings also belong in build settings if enabled. Cloudflare does not expose
the Worker's runtime secrets to its build runner. Better Auth receives a disposable
key for route collection only; it is excluded from deployment and bundled env
fallbacks are cleared before upload. The deployed Worker keeps its existing auth key.

Commit the deployment scripts, `next.config.ts`, `pnpm-workspace.yaml`,
`pnpm-lock.yaml`, and `patches/@opennextjs__cloudflare@1.20.6.patch` together so
clean CI installs apply the PostgreSQL middleware fix. Keep populated env files out
of Git. The wrapper preserves Cloudflare's CI target checks and deployment output
settings. The deployment command rebuilds for the configured production origin,
including after a dev build.
Production uses the top-level Wrangler configuration; preview selects `env.dev`.
The package scripts reject extra arguments or an inherited `CLOUDFLARE_ENV`;
a flag such as `--dry-run` cannot silently become a live deploy.
Use `pnpm run build:cloudflare` followed by
`pnpm exec wrangler deploy --config wrangler.jsonc --env-file .env.prod --dry-run`
for a local bundle check without uploading. Use explicit `pnpm run deploy`, since
pnpm also has a built-in command named `deploy`.

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
