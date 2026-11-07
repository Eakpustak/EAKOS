# EAK PUSTAK Workspace

> One company portal. Department-specific workspaces. Clear ownership. Reliable handovers.

## Product overview

EAK PUSTAK Workspace is an internal company operations portal for coordinating people, work, departments, projects, leads, internal knowledge and approvals from one application.

It is a **modular company workspace**, not a replacement for specialist tools. GitHub remains the source of truth for source code and pull requests; accounting, payroll and statutory filing remain outside the initial release.

## Documentation map

| Document | Responsibility |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Product goals, personas, scope, requirements and screen inventory |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Application architecture, data model, APIs, security and integrations |
| [`docs/RULES.md`](docs/RULES.md) | Non-negotiable product, engineering, security and workflow rules |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Visual language, design tokens, components and frontend standards |
| [`docs/PHASES.md`](docs/PHASES.md) | Delivery sequence, milestones and acceptance criteria |
| [`docs/MEMORY.md`](docs/MEMORY.md) | Current project state, decisions, open questions and next actions |
| [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md) | Department workflows and cross-team handovers |

## Instructions for coding agents

Before making changes:

1. Read this file and all documents in `docs/`.
2. Inspect the existing repository, package manager, framework, conventions, tests and deployment setup.
3. Do not assume a framework or rewrite an existing application without evidence and explicit approval.
4. Update `MEMORY.md` when a material decision, completed milestone, blocker or next step changes.
5. Update the relevant specification when implementation reveals a requirement change. Do not silently contradict the docs.
6. Implement one phase or coherent vertical slice at a time.
7. Run relevant tests, type checks, lint and production build. Report commands and actual outcomes.
8. Never claim a feature is complete merely because its UI exists. Verify persistence, authorization, validation and failure states.

## Product principles

- One login and one application, with department-aware workspaces.
- Least-privilege access; sensitive records are separately protected.
- Every important work item has an owner and a visible status.
- Cross-department handovers require explicit acknowledgement.
- Activity history makes important actions traceable.
- Build a modular monolith first; do not introduce microservices prematurely.
- Prefer integration or linking over rebuilding mature specialist tools.
- Useful, calm, accessible interfaces beat decorative dashboards.

## Current status

Phase 1 foundation (Next.js + Prisma + PostgreSQL) with Docker deployment, Phase 2 tasks, Phase 3 cross-department handovers (`/handovers`), Phase 4 Company Hub (`/hub`) and Phase 5 slice 1 Sales leads (`/leads`); phases 4 to 7 are written but not yet built (Phase 7 so far: expenses at `/expenses`, vendors at `/vendors`) (Phase 6 includes the restricted document register at `/documents`). Run `npm test` for the business-rule tests. See [`DEPLOY.md`](DEPLOY.md) to install and update on a VM, and `docs/MEMORY.md` for decisions and verification status.
