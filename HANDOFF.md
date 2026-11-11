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
