# Modern Physique Systems

A private coaching web app for MPS clients and coach (React + Vite + Supabase).

- Product behavior: [docs/modern-physique-systems-prd.md](docs/modern-physique-systems-prd.md)
- Sequencing: [docs/modern-physique-systems-implementation-roadmap.md](docs/modern-physique-systems-implementation-roadmap.md)
- Current status and next milestone: [docs/status.md](docs/status.md)
- Local setup, environment and verification: [docs/setup.md](docs/setup.md)
- Decisions: [docs/decisions/](docs/decisions/) · Import spike: [docs/import-spike-report.md](docs/import-spike-report.md)

```sh
pnpm install && pnpm db:start && pnpm db:reset
pnpm dev          # after creating .env.local (see docs/setup.md)
pnpm verify       # typecheck + unit tests + build
```
