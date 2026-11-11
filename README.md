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

Cloudflare credentials and deployment operations must remain server-side. Never expose API tokens to the browser or write them to logs.

## Status

Early development. The initial scaffold is being built; production deployment flows are not implemented yet.
