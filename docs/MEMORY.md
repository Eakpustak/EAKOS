# Project Memory
## EAK PUSTAK Workspace

> This file is the compact handoff note for future development sessions. Keep it factual, current and concise.

- Last updated: 2026-11-06
- Status: Phase 0 decisions made; Phase 1 foundation scaffolded (UNVERIFIED build, see below).
- Current milestone: Phase 1 — identity and organization.

## 1. Product identity

- Product name: EAK PUSTAK Workspace.
- Purpose: internal company portal for department workspaces, employee operations, task coordination, cross-team handovers and a lightweight company CMS.
- Product model: one login, one application, multiple department-specific workspaces.
- Architecture direction: modular monolith, one PostgreSQL database where appropriate; validate against existing stack before committing.
- Initial departments: Management, Technology, Human Resources, Sales & Marketing, Operations, Finance & Administration.

## 2. Confirmed product direction from planning

- Departments need different tools and permissions, not merely different dashboard widgets.
- Employees may have a primary department and participate in cross-department projects.
- GitHub should be linked/integrated rather than recreated.
- HR documents and sensitive personal data must have restricted access.
- Management receives company-level operational visibility, not automatic access to all private HR records.
- Handover acknowledgement is a critical workflow: named receiver, deadline, explicit acceptance/clarification/rejection and activity history.
- V1 should prioritize identity, departments, dashboard, employee directory, tasks, handovers, notifications and company hub.
- CRM/projects and HR essentials follow; finance and advanced technical operations are later.
- Full accounting and GST filing are out of V1.

## 3. Key incident the product should prevent

A meeting was missed because an intern messaged the sales head instead of calling/ensuring acknowledgement. The product should make ownership, assignment, acknowledgement and escalation visible. Do not assume that sending a message equals acknowledgement or that a meeting invite was seen.

## 4. Current specification files

- `README.md`
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/RULES.md`
- `docs/DESIGN.md`
- `docs/PHASES.md`
- `docs/WORKFLOWS.md`

## 5. Assumptions — not yet verified

- PostgreSQL is the intended database, but existing infrastructure may dictate otherwise.
- The frontend may use React/TypeScript, but the repository must be inspected first.
- Authentication, email provider, object storage and deployment are undecided.
- Exact role names, department membership and approval chains need stakeholder confirmation.
- Attendance is optional and should not be added without a clear requirement.
- V1 notifications may begin in-app; email delivery needs confirmation.

## 6. Open questions

1. What is the actual application repository and current stack?
2. Is this a new application or an existing app to extend?
3. How many employees and interns will use the first release?
4. Who is the company owner and who can administer users/permissions?
5. Which users are department heads for the initial launch?
6. Does the company require leave management in the first release?
7. Should notifications be in-app only or in-app plus email?
8. What file types and storage provider are required for HR documents?
9. Which workflows need formal approval versus simple acknowledgement?
10. What are the hosting, backup and deployment constraints?

## 7. Current next action

Inspect the actual repository before writing application code. Record:
- framework/runtime and package manager
- directory structure and coding conventions
- existing auth and authorization implementation
- database schema and migration approach
- current UI component system and styling
- tests, lint, typecheck and build commands
- deployment configuration and environment variables (never copy secret values into this file)

Then update the architecture proposal and begin Phase 1 only after Phase 0 decisions are validated.

## 8. Session handoff template

When ending a development session, update:

### Completed
- List verified changes, not intentions.

### Verification
- Commands run and actual pass/fail results.

### Current state
- Branch/commit if known, relevant files and migration status.

### Blockers
- Exact issue, error and what has been tried.

### Decisions
- New decisions and their rationale.

### Next action
- One concrete next implementation step.

## 9. Decisions (2026-11-06)

- Stack: Next.js 14 (App Router) + TypeScript + Prisma 5 + PostgreSQL 16, one app container.
- Auth: NextAuth v4 credentials + JWT; user status re-checked from DB on every request (`requireUser`). Bcrypt via `bcryptjs`.
- Authorization (Phase 1 minimal): `systemRole` ADMIN/MEMBER only. Full scoped RBAC from ARCHITECTURE.md still to do.
- Deployment: Docker Compose on OCI Ampere A1 (arm64) VM; Caddy auto-HTTPS; nightly pg_dump; `install.sh` / `update.sh` / `restore.sh`.
- Migrations run on container start via `prisma migrate deploy`. Initial migration was hand-written to match `schema.prisma`; verify with `prisma migrate diff`.

## 10. Verification status

- NOT yet run: `docker compose build`, `tsc --noEmit`, `next build`. The authoring sandbox had no network access.
- Next action: run `./install.sh` on the VM (or locally), fix any build errors, then confirm login, directory, and admin user creation work.
