# Peperouny Deployer — Development Handoff

Last updated: 2026-11-11

## Product direction
Independent Cloudflare deployment control plane. End users connect a Cloudflare token once, select a project, and deploy without connecting GitHub. GitHub is only source control for Peperouny.

## Repository
https://github.com/devyousef230-bot/peperouny-deployer (main)

## Cloudflare-hosted mode added
- `apps/api/src/worker.ts`: native Workers fetch handler; no Node filesystem or Fastify runtime dependency.
- Token vault moved to D1 in Workers mode; token encrypted with AES-GCM using Worker secret `PEPEROUNY_MASTER_KEY`.
- `wrangler.jsonc`: Worker entry, static assets from `apps/web/dist`, D1 binding.
- `migrations/0001_credentials.sql`: credential table.
- Root scripts: `cf:d1:create`, `cf:d1:migrate`, `build:cloudflare`, `cf:dev`, `cf:deploy`.
- Existing Fastify API remains for local development; production Wrangler entry is worker.ts.

## Cloudflare setup
1. pnpm install
2. pnpm cf:d1:create
3. Put returned database UUID into wrangler.jsonc
4. pnpm cf:d1:migrate
5. pnpm exec wrangler secret put PEPEROUNY_MASTER_KEY
6. pnpm cf:deploy

## Current adapters
ZEUS initial adapter in apps/api/src/deploy/zeus.ts, pinned upstream Source.js commit 1f01a440608abac9650c54149b6fbd1aebf34dfb; creates/reuses D1 and uploads Worker with DB binding. Nexus and Nova not yet implemented; Nova is Workers-only.

## Important outstanding work
- Install dependencies and run typecheck/build in Node 20+/pnpm 9 environment; not run for this change.
- Validate Worker runtime compatibility of the pinned ZEUS source (notably cloudflare:sockets import), multipart upload API, D1 API, and workers.dev URL against a test account.
- Add dashboard/API authentication before exposing publicly.
- Add durable deployment job progress/logs.
- Review least-privilege Cloudflare token scopes.
- Do not claim a real Cloudflare deployment until actually tested.


## workers.dev provisioning update (2026-11-12)
- Cloudflare token link is preconfigured in `apps/web/src/main.tsx` with Account Settings Read, D1 Edit, and Workers Scripts Edit.
- ZEUS adapter now checks the account-level workers.dev subdomain, creates a deterministic `peperouny-<first-16-account-id-chars>` subdomain if missing, and enables the deployed script's workers.dev route.
- Account-level create endpoint: `PUT /accounts/{account_id}/workers/subdomain`; script route endpoint: `POST /accounts/{account_id}/workers/scripts/{script_name}/subdomain`.
- Both operations require Workers Scripts Write (provided by Workers Scripts Edit token scope).
- Local typecheck/build and live Cloudflare validation are still required for this change.


## 2026-11-12: Hello World-first deployment flow

The initial user journey has been changed to a minimal, legitimate Cloudflare Worker deployment:
- New `apps/api/src/deploy/hello-world.ts` deploys a static Hello World Worker named `peperouny-hello-world` using the saved Cloudflare API token.
- It ensures the account workers.dev subdomain, uploads the Worker, enables its workers.dev route, retries the live endpoint check, and verifies the JSON response.
- `apps/api/src/worker.ts` exposes `POST /api/deploy/hello-world`.
- `apps/web/src/main.tsx` now presents Cloudflare connection and a single **Create Hello World Worker** button instead of advertising ZEUS/Nexus/Nova as available.
- README documents the limited scope and warns that the control plane must remain private until administrator authentication is added.

Commits:
- `33d2cb7` add Hello World deployment adapter
- `9570209` add API endpoint
- `2b6979a` replace project catalog with Hello World-first UI
- `9392cb9` retry live health verification
- `13ad450` document the starter deployment

No Cloudflare resources were deleted and no new Cloudflare deployment was run as part of these source changes. Typecheck/build have not yet been run against this new commit set. Before a public production release, add administrator authentication and protections to all credential/deployment endpoints.
