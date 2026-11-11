# Peperouny Deployer

A self-hosted Cloudflare deployment control plane. End users connect Cloudflare once, choose a supported project, and deploy from this dashboard. End users do not need GitHub integration.

## Architecture

- `apps/web` — deployment dashboard
- `apps/api` — backend API and orchestration
- `packages/core` — shared deployment contracts
- `packages/cloudflare` — Cloudflare API client
- `packages/adapters` — project-specific deployment adapters

## Run locally

Requirements: Node.js 20+ and pnpm 9+.

Set a persistent encryption secret before starting the API:

```bash
export PEPEROUNY_MASTER_KEY="replace-with-a-long-random-secret-at-least-32-characters"
export PEPEROUNY_VAULT_PATH="./data/cloudflare-token.enc"
pnpm install
pnpm dev
```

The dashboard runs on port 5173 and the API on port 3001. The Vite development server proxies API requests to the backend.

Keep `PEPEROUNY_MASTER_KEY` private and stable across restarts, and persist the vault directory. Losing the key makes the saved token unreadable.

## Cloudflare connection

The user enters a Cloudflare API Token once. The backend verifies it, lists accessible accounts, and stores the token encrypted at rest using AES-256-GCM. The selected account is saved alongside it. The raw token is never returned to the browser and is not written to logs. The user can explicitly remove the saved credential from the dashboard.

The API is intended to run as a private, single-operator self-hosted service in this MVP. Do not expose it publicly until dashboard authentication and request protection are configured.

## Project targets

- ZEUS — target and required resources must follow the upstream deployment flow.
- Nexus/cfnew — Worker core; panel integration and KV bindings depend on the selected setup.
- Nova Proxy — Cloudflare Workers deployment with its documented KV and D1 requirements.

An initial ZEUS deployment adapter is now wired into the API. It fetches the pinned upstream Worker entry file, provisions/reuses a D1 database, uploads the Worker with the required `DB` binding, and reports the resulting deployment details. This path has been committed but still requires a real Cloudflare account test before it can be called production-ready. Nexus and Nova adapters remain in progress.
