# Peperouny Deployer

A modular deployment control plane for deploying supported projects to Cloudflare.

## Supported project adapters

- **ZEUS** — project-specific deployment adapter
- **Nexus (cfnew)** — Worker/core deployment adapter
- **Nova Proxy** — Worker deployment adapter

## Architecture

- `apps/web` — dashboard UI
- `apps/api` — backend API and deployment orchestration
- `packages/core` — shared deployment contracts and types
- `packages/cloudflare` — Cloudflare API integration
- `packages/adapters` — one adapter per supported project

The deployment engine owns orchestration. Each adapter declares its own target compatibility, resource requirements, validation, and deployment behavior.

## Development

Requirements: Node.js 20+ and pnpm 9+.

```bash
pnpm install
pnpm dev
```

The dashboard runs on port 5173 and the API on port 3001. The Vite development server proxies `/api` requests to the API.

## Cloudflare connection

The dashboard currently supports verifying a Cloudflare API Token and listing accounts available to that token. Create a token with permission to read account details.

The token is sent directly to the backend verification endpoint and is not persisted. Do not expose API tokens to the browser beyond the connection form or write them to logs.

## Status

Early development. Cloudflare token verification and account selection are implemented. Project-specific provisioning and deployment adapters are still in progress.
