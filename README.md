# Peperouny Deployer

A Cloudflare-hosted deployment control plane. End users connect a Cloudflare API Token once, choose a supported project, and deploy from the Peperouny dashboard. No GitHub connection is required for end users.

## Deploy Peperouny to Cloudflare

Requirements: Node.js 20+, pnpm 9+, and a Cloudflare account.

1. Clone this repository and install dependencies:
   ```bash
   git clone https://github.com/devyousef230-bot/peperouny-deployer.git
   cd peperouny-deployer
   pnpm install
   ```
2. Create the D1 database:
   ```bash
   pnpm cf:d1:create
   ```
   Copy the returned database UUID into `wrangler.jsonc`, replacing `REPLACE_WITH_D1_DATABASE_ID`.
3. Apply the D1 schema:
   ```bash
   pnpm cf:d1:migrate
   ```
4. Set the encryption key as a Worker secret (use a newly generated random value of at least 32 characters):
   ```bash
   pnpm exec wrangler secret put PEPEROUNY_MASTER_KEY
   ```
5. Build the dashboard and deploy the Worker:
   ```bash
   pnpm cf:deploy
   ```
6. Open the workers.dev URL printed by Wrangler.

For local development against a local D1 database, run `pnpm cf:dev`. Use `pnpm build:cloudflare` to rebuild the static dashboard.

## Cloudflare token permissions for deploying ZEUS

The token entered into Peperouny is used by the deployed Worker to manage the selected account. Grant these scopes: Account Settings Read, D1 Edit, and Workers Scripts Edit. Workers Scripts Edit includes the Workers Scripts Write permission required to create the account-level workers.dev subdomain and enable the Worker route. Peperouny creates a deterministic account subdomain (peperouny-<account-id-prefix>) when one does not exist, then enables the deployed Worker on it. The token is encrypted using AES-GCM before it is stored in D1. The encryption key is a Worker secret and must never be committed to this repository.

## Architecture

- `apps/web` — React/Vite dashboard, served as Worker static assets.
- `apps/api/src/worker.ts` — Cloudflare Workers-native API using Web APIs.
- `apps/api/src/index.ts` — legacy Fastify local-development API.
- `apps/api/src/deploy` — project deployment adapters.
- `migrations` — D1 schema.
- `wrangler.jsonc` — Worker, static assets, and D1 configuration.

## Current project adapters

- ZEUS — initial Worker + D1 adapter; requires real-account validation and upstream runtime configuration review.
- Nexus/cfnew — not implemented yet.
- Nova Proxy — not implemented yet; target is Workers, not Pages.

## Security and status

This is an early single-operator MVP. The dashboard/API does not yet have user authentication. Do not expose it as a public multi-user service. Anyone who can access the dashboard could potentially trigger deployments using the saved Cloudflare credential. Add authentication and request protections before sharing the URL. Keep the D1 database and `PEPEROUNY_MASTER_KEY` persistent; losing the key makes the saved token unreadable.

No real Cloudflare deployment or end-to-end test has been performed by this repository change. Verify in a test account before using production resources.


## First deployment: Hello World Worker

The first supported deployment is intentionally a minimal Cloudflare Worker. After connecting a Cloudflare API Token with **Workers Scripts: Edit** permission and selecting an account, click **Create Hello World Worker**.

Peperouny then:
1. Verifies the saved API token.
2. Ensures the account has a `workers.dev` subdomain.
3. Uploads the `peperouny-hello-world` Worker.
4. Enables its `workers.dev` route.
5. Retries a live HTTP health check and confirms the JSON response contains `Hello, world!`.

This is a starter deployment only. It does not deploy ZEUS, Nexus, Nova Proxy, proxy functionality, or any third-party application.

**Important for self-hosting:** keep the Peperouny control plane private until administrator authentication and request protections are configured. Never expose an unauthenticated deployment dashboard containing a saved Cloudflare token to the public internet. Do not commit API tokens, master keys, or real account credentials.
