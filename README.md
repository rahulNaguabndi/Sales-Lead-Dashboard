# EuroDrive Lead Desk

A lightweight Sales Lead Management Tool for a European car dealership group: lead inbox, lead detail with activity timeline, activity logging, role-based dashboards (Rep → Manager → VP), live lead intake from a showroom site, scoring and auto-assignment, offers, and AI assist.

**Status:** specification complete, implementation driven by GitHub Spec Kit.

## Start Here

- [Product overview](docs/00-overview.md)
- [Personas](docs/01-personas.md)
- [User flows](docs/02-user-flows.md)
- [Domain model](docs/03-domain-model.md)
- [Architecture](docs/04-architecture.md)
- [Feature index & build waves](docs/features/README.md)
- [Spec Kit constitution](docs/speckit/constitution.md) · [Workflow](docs/speckit/WORKFLOW.md)

## Quick Start (once implemented)

```bash
docker compose up -d redis
npm install
npm run db:reset      # migrate + deterministic seed
npm run dev           # web :3000, showroom :3001
npm run simulate      # optional: stream demo leads
```

Demo users: `isabelle.laurent@eurodrive.test` (VP), `lukas.becker@eurodrive.test` (Manager), `sofia.rossi@eurodrive.test` (Rep). Password: `demo1234`.
