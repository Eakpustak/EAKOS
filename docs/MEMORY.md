# Project Memory
## EAK PUSTAK Workspace

> This file is the compact handoff note for future development sessions. Keep it factual, current and concise.

- Last updated: 2026-11-10
- Status: Phase 3 (handovers) written and partially verified (see section 14); Phase 1 scaffolded, Phase 2 (tasks) written, UI redesigned per DESIGN.md, Phase 2 known gaps closed (admin silent failures, form-input preservation, creator-only edit); NOTHING build-verified against a real toolchain/database yet (see sections 10, 12, 13).
- Current milestone: Phase 5 slice 1 — Sales leads (code written, rules unit-tested, NOT built or run; see section 16). Phase 4 (hub) is section 15, Phase 3 section 14. Phases 4 and 5 are both unbuilt: build and verify them before adding more.

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

## 11. Phase 2 — tasks (written 2026-11-07, UNVERIFIED)

Added: models Task/TaskComment/TaskEvent/Notification + migration `20261107000000_tasks` (hand-written; verify with `prisma migrate diff`).
Pages: `/` (My work), `/tasks` (filters, pagination), `/tasks/new`, `/tasks/[id]`, `/notifications`. Logic: `lib/tasks.ts` (access policy, date helpers), `app/tasks/actions.ts`.

Decisions:
- Task access = creator, assignee, or head of the task's department. Admin role and plain membership grant nothing (RULES 2.3/2.7).
- Create is retry-safe via unique `clientToken`; status/reassign use an optimistic guard (`updateMany` on the previously-read value) and report STALE instead of overwriting.
- Errors/success are server-side redirects with `?error=` / `?ok=` (no optimistic UI). Form input is NOT preserved on validation error yet.
- Due dates are date-only (midnight UTC), "today" computed in `APP_TZ` (default Asia/Kolkata).
- Notifications are generic text (no task title) per RULES 3; opening a task marks its notifications read.

Not done / known gaps: @mentions, authorization tests (none exist for any phase), preserving form input on error, creator-only edit of title/description/due date, admin user-actions still fail silently, Next 14.2.15 needs a security bump (CVE-2025-29927), no package-lock.json.
Next action: install deps, run `npm run lint`, `npm run build`, `prisma migrate diff`, fix errors; then add tests for task access (cross-user and cross-department ID tampering).

## 12. UI redesign per DESIGN.md (2026-11-07)

- Design tokens (light + dark via `prefers-color-scheme`) and components live in `app/globals.css`; brand accent stays the original teal `#0f5c5c`. No Tailwind/shadcn added (RULES 1.11); only `lucide-react@0.460.0` for icons.
- New shell: persistent sidebar (workspace/department chip, nav with active state, unread badge, separate Administration group, user + sign out), mobile drawer, skip link. `lib/shell.tsx` (server) + `lib/shell-client.tsx` (client).
- Shared primitives in `lib/ui.tsx` (PageHeader+breadcrumbs, Avatar/Person, Status/Priority badges with shape cues, Field, Alert, EmptyState); `lib/confirm.tsx` is a dialog confirm used for "Deactivate".
- BUG FIXED: `app/page.tsx` ("My work") was a copy of the Directory page. It is now a real dashboard: open / overdue / due in 7 days / blocked / unread, each a real count linking to filtered `/tasks` (new `due=week` filter).
- Task list: scope segmented control, filter bar, "Showing x–y of z" pager. Task detail: two-column with details panel, comments, activity timeline. Tables stack into cards under 640px.
- Verified: `tsc --noEmit` clean, `next build` compiles, light/dark/mobile screenshots checked on a mock-data harness. NOT verified against a real database (Prisma engines could not be downloaded in the sandbox).
- Still open (addressed below): Next security bump, auth tests.

## 13. Phase 2 gap closure (2026-11-07, UNVERIFIED — no npm registry access in this sandbox)

Closed, on top of the Section 12 redesign:
- **Admin actions no longer fail silently.** `app/admin/users/actions.ts` now redirects with `?error=`/`?ok=` (same `back()` pattern as task actions) for `createUser` and `setUserStatus`: bad input, duplicate email, missing department, self-deactivation attempt, and a vanished target user are all reported; `admin/users/page.tsx` renders the `Flash`/`Alert` and preserves `displayName`/`email`/`departmentId` (never the temporary password) on a validation error.
- **Create-task form no longer loses input on error.** `createTask`'s `back()` now carries the submitted field values as query params; `tasks/new/page.tsx` reads them back into `defaultValue`. The `clientToken` is preserved too, so retrying a fixed submission still only ever creates one task.
- **Creator-only edit of title/description/due date.** New `editTask` server action (`app/tasks/actions.ts`): only `task.creatorId === user.id` may call it (same "redirect to /tasks, don't reveal why" pattern as other task actions for a non-creator or inaccessible task); validates with the same rules as create; no-op update short-circuits to an "ok" message instead of writing/eventing; logs a `TaskEvent` (`type: "edited"`), notifies the assignee (unless they are the editor), and writes an `AuditEvent` (`task.edit`). Rendered as a new "Edit" card in `tasks/[id]/page.tsx`'s right-hand column, visible only to the creator, directly above "Update".
- A redirect-inside-try/catch bug was avoided in both new admin-action paths (existing-user lookups happen before the `try`, so Next's `redirect()` throw is never swallowed by a `catch` block) — same discipline the original `tasks/actions.ts` already documented.

Deliberately not done this slice (see Still open below): Next.js version bump, automated authorization tests.

**Next.js security bump (CVE-2025-29927) NOT applied.** The repo now has a committed `package-lock.json` and the `Dockerfile` runs `npm ci`, which fails on any mismatch between `package.json` and the lock file. Bumping `"next"` in `package.json` without regenerating the matching lock entries (which needs real npm registry access, unavailable in this sandbox) would break the Docker build. **Action needed on a machine with network access:** `npm install next@14.2.25` (or later current 14.x patch), commit the updated `package.json` + `package-lock.json` together, then re-run the verification below.

**Verification status: NOT EXECUTABLE in this sandbox** (no `node_modules`, no network to install). None of `npm run lint` (tsc), `npm run build`, or `prisma migrate diff` were run against this slice's changes.
**Next action:** on a machine with npm registry + Postgres access: `npm install`, `npm run lint`, `npm run build`, exercise create/edit-task and create-user/deactivate-user error paths in the browser, then do the Next.js bump above; after that, add authorization tests for task access (cross-user and cross-department ID tampering) and for `editTask` (non-creator must be rejected).

## 14. Phase 3 — handovers (2026-11-08)

**Added**
- Models `Handover`, `HandoverEvent`, enum `HandoverStatus`, `Notification.handoverId`; migration `20261108000000_handovers` (hand-written). The migration also adds two DB `CHECK`s Prisma cannot express: `fromDepartmentId <> toDepartmentId` and `senderId <> receiverId`.
- `lib/handovers.ts`: pure state machine (`RULES`, `decide()`, `availableActions()`), access policy (`canAccessHandover`, `visibleHandoverWhere`), ack-window helpers. `app/handovers/actions.ts`: `createHandover`, `actOnHandover` (single entry point for accept / request_clarification / reject / respond / complete / cancel).
- Pages: `/handovers` (4 summary counts, scope + status filters, pagination), `/handovers/new`, `/handovers/[id]` (context, deliverable, reasons, timeline, role-specific action forms). Nav item with "awaiting your response" badge; notifications link to handovers; task detail has a "Hand over to another department" shortcut (`/handovers/new?taskId=`).
- **`app/page.tsx` was still a byte-for-byte copy of the Directory page in the uploaded snapshot** (section 12 said it had been replaced). Rebuilt as the real "My work" dashboard (tasks + handovers counts, each linking to its filtered list).
- Tests: `npm test` (node:test via `tsx`, `tests/handovers.test.ts`, 25 tests).

**Rules implemented**
- State machine: PENDING -> ACCEPTED | CLARIFICATION_REQUESTED | REJECTED (receiver) or CANCELLED (sender); CLARIFICATION_REQUESTED -> PENDING (sender answers; resets the ack clock) or CANCELLED; ACCEPTED -> COMPLETED (receiver, summary required). Terminal: REJECTED, COMPLETED, CANCELLED. Completion of a linked task does NOT complete a handover.
- Role is derived only from stored `senderId`/`receiverId`; a sender (or anyone else) cannot accept/reject/clarify. Reasons are required for reject, clarification, the sender's answer and completion.
- Create is retry-safe (`clientToken`, unique). Transitions use a status-guarded `updateMany`; a repeated submit is reported as "already X" and writes nothing.
- Receiver must be an active member of the chosen receiving department and the sender must belong to the from-department (verified server-side, never trusted from the form). Linked task must be accessible to the sender.
- Access: sender, receiver, and heads of the sending or receiving department (read-only). Admin role and plain membership grant nothing. Missing and forbidden IDs get the same redirect.
- Notifications use generic titles only (no handover title or reason in previews). Opening a handover marks its notifications read; this is not acknowledgement.
- "Not acknowledged" = PENDING for longer than `HANDOVER_ACK_HOURS` (default 24, passed through `docker-compose.yml`). It is computed at read time and shown in lists, the dashboard and the detail page. There is no background job, so nobody is pushed a reminder or escalated automatically yet.

**Verification (actual results)**
- Sandbox now has npm access (previous sessions did not). `npm ci`, `tsc --noEmit`: clean. `next build`: compiled, all routes built incl. `/handovers`, `/handovers/[id]`, `/handovers/new`.
- `npm test`: 25/25 pass. Three deliberate mutations (sender may accept; reject without reason; any head may read) each made tests fail, so the tests do guard those rules. This also found and fixed a real bug: an action like `toString` from a sender threw instead of being rejected (prototype lookup in `RULES`); regression test added.
- All three migrations applied in order to a real PostgreSQL 16 with `psql`; Prisma model columns vs. real table columns (names + nullability) matched exactly. Verified on real Postgres: both CHECKs reject bad rows, duplicate `clientToken` rejected, bad enum value rejected, deleting a user/department that a handover references is blocked, events/notifications cascade.
- UI: `HandoverTable` + status badges rendered from sample rows and checked in light, dark and 390px mobile (found and fixed a clipped "Not acknowledged" note on mobile and a colour-specificity bug).

**NOT verified**
- `binaries.prisma.sh` is blocked by the sandbox proxy, so the Prisma query engine and `prisma migrate diff` could not run. Types were generated with `prisma generate --no-engine` (types only). Therefore the **server actions and pages have never run against a database**: `createHandover`, `actOnHandover`, list queries and the dashboard are type-checked and built but not executed. Migration/schema equivalence was checked by the column comparison above, not by `migrate diff`.
- No end-to-end browser run of the new pages (no session/DB).

**Not done / known gaps**
- Handover reassignment to a different receiver (WORKFLOWS 2 "Reassignment must preserve history") and sender edit of a pending handover.
- Automatic escalation/reminders (needs a scheduler) and notifying department heads of unacknowledged handovers.
- Management summary is the per-user "Everything I can see" scope (heads see their departments); there is no separate management-role view yet.
- DB-backed authorization tests (access rules are unit-tested as pure functions only). Next.js CVE-2025-29927 bump still pending (see section 13); the sandbox can now reach npm, so this is a single `npm install -E next@14.2.25` plus re-verification.

**Next action:** on a machine that can fetch Prisma engines: `npm ci && npx prisma migrate deploy && npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <url> --exit-code`, then click through: create handover as user A to user B (different department), accept as B, try the action as A (must be refused), request clarification -> answer -> accept -> complete.

## 15. Phase 4 — Company Hub / CMS (2026-11-09, WRITTEN, NOT BUILT)

**Added**
- Models `ContentItem`, `ContentAudience`, `ContentVersion`, enums `ContentType` (ANNOUNCEMENT/POLICY/RESOURCE), `ContentStatus` (DRAFT/PUBLISHED/ARCHIVED), `AudienceScope` (ALL/DEPARTMENTS), `Notification.contentId`; migration `20261109000000_company_hub` (hand-written). DB CHECKs: a RESOURCE needs a URL; a PUBLISHED row needs publisher + publishedAt.
- `lib/hub.ts` (pure rules: roles, audience, read/edit/publish policy, `visibleContentWhere`, lifecycle `decideContentAction`, `safeHttpUrl`, `parseAudience`), `app/hub/actions.ts` (`saveContent`, `actOnContent`), `lib/hub-form.tsx` (client editor), `lib/hub-ui.tsx`.
- Pages: `/hub` (type + status filters, search, pagination), `/hub/new`, `/hub/[id]` (content, publishing actions, details, version history for managers), `/hub/[id]/edit`; "Company hub" nav item; notifications link to hub items.
- Tests: `tests/hub.test.ts`, 25 tests (`npm test` total 50).

**Decisions (not yet confirmed by stakeholders; open questions 4 and 5 still apply)**
- Authors: department heads, ADMIN, head of the `management` department (slug). Plain members only read.
- Company-wide (audience ALL): ADMIN or management head. Department-restricted: only the head(s) of EVERY audience department. ADMIN alone grants nothing over department-restricted content (RULES 2.7). Authors can only choose audiences they could publish to.
- Lifecycle: publish (DRAFT->PUBLISHED), unpublish (PUBLISHED->DRAFT), archive (DRAFT/PUBLISHED->ARCHIVED), restore (ARCHIVED->DRAFT). No hard delete. An author can self-publish if they hold publish rights (no separate reviewer yet).
- Editing live content publishes a new version immediately (old version kept). Version bumps only when title/body/link changes, not on audience-only changes. Concurrent edits are refused via a posted `version` guard.
- Body is PLAIN TEXT, rendered escaped as paragraphs (no HTML/markdown), so there is no XSS surface; rich text is deliberately deferred. Resource links must be http(s) without credentials, re-validated at render, opened with `rel="noopener noreferrer nofollow"`.
- Reads, list and search all use the same audience rule (`visibleContentWhere` mirrors `canReadItem`); missing/forbidden/draft IDs get the same redirect. Notifications on publish go only to active audience members (not the publisher) with generic titles.
- Editor is a client form that receives `{error}` from the server action so long bodies are not lost (bodies can exceed URL limits). Success is always a server redirect.

**Verification (actual results)**
- `tsx --test tests/*.test.ts`: 50/50 pass (25 handover + 25 hub). Hub module and tests type-check with `tsc --strict` against a stubbed `@prisma/client`.
- Syntax-only parse of every new/changed `.ts`/`.tsx` file: no syntax errors.
- NOT run: `npm ci`, `prisma generate`, `tsc --noEmit` (whole project), `next build`, `prisma migrate diff`/`deploy`, any browser/DB run. This session had no npm registry access. Treat the pages, actions, migration and the client form as unbuilt and unexecuted.

**Known risks to check first when a toolchain is available**
- Calling a server action from `onSubmit` and relying on its `redirect()` (hub-form.tsx catch block may show a false error if Next rejects the promise on redirect).
- Prisma `orderBy publishedAt {sort, nulls}` and the `audiences: { some: {}, every: {...} }` filter shape in `visibleContentWhere` (unit-tested as a plain object only, never executed).
- Migration SQL vs schema (`prisma migrate diff`).

**Not done / gaps**
- Rich text, attachments, scheduled publish, separate reviewer/approval step, audience by individual user or role, view of an old version's diff, DB-backed authorization tests, hub widget on the My work dashboard.

**Next action:** on a machine with npm + Postgres: `npm ci && npm run lint && npm run build && npx prisma migrate deploy`, then click through: head of Sales drafts a Sales-only announcement; a Tech member must not see or open it (list, search, direct URL); publish; Sales intern sees it and gets a notification; edit creates v2 and history; unpublish hides it again; try a `javascript:` resource link (must be rejected).

## 16. Phase 5 slice 1 — Sales leads (2026-11-10, WRITTEN, NOT BUILT)

Scope: leads, ownership, pipeline, interaction timeline, follow-ups. NOT in this slice: projects and milestones, the Sales -> Technology delivery handover linked to a lead, management pipeline summaries.

**Added**
- Models `Lead`, `LeadInteraction`, enums `LeadStage`, `InteractionType`; `Task.leadId`, `Notification.leadId`; migration `20261110000000_leads` (hand-written). DB CHECKs: LOST needs a non-empty reason; `closedAt` is set exactly when stage is WON or LOST.
- `lib/leads.ts` (pure rules), `app/leads/actions.ts` (`createLead`, `logInteraction`, `changeStage`, `setFollowUp`, `createFollowUpTask`, `reassignLead`), `lib/lead-ui.tsx`, pages `/leads`, `/leads/new`, `/leads/[id]`, "Leads" nav item (Sales members only), notification links.
- Tests: `tests/leads.test.ts`, 19 tests (`npm test` total 69). A test found and fixed a prototype-key lookup in the stage label helper.

**Decisions (not confirmed by stakeholders)**
- Leads belong to department slug `sales-and-marketing`. Any Sales member creates leads; owner must be an active Sales member.
- Visible to owner, creator and Sales head(s) only. Plain Sales membership and ADMIN grant nothing (RULES 1.3, 2.7). Leaving Sales removes access at once. Only owner or Sales head may change a lead; a creator who is no longer owner is read-only.
- Pipeline: NEW -> CONTACTED -> QUALIFIED -> PROPOSAL -> WON; PROPOSAL may fall back to QUALIFIED; any open stage -> LOST with a required reason. WON is final. Only the Sales head can reopen LOST (to NEW). Stages cannot be skipped. Closing clears the follow-up date.
- Email or phone is required; both validated. Source is one of a fixed list.
- Follow-up: a date on the lead plus optional assigned task (`Task.leadId`, department = Sales, assignee must be an active Sales member). Creating a task moves the lead's date to the soonest. The list flags "overdue" and "no follow-up planned".
- Every interaction, stage change, owner change and follow-up task is a timeline entry. Notifications are generic ("A lead was assigned to you").
- Lead tasks follow normal task access (creator, assignee, Sales head); the lead page lists only tasks the viewer can already see.

**Verification (actual results)**
- `tsx --test tests/*.test.ts`: 69/69 pass (25 handover, 25 hub, 19 leads). `lib/leads.ts` and its tests type-check under `tsc --strict` against a stubbed `@prisma/client`. Syntax parse of all new files: clean.
- NOT run: `npm ci`, `prisma generate`, project `tsc`, `next build`, `prisma migrate diff/deploy`, browser or database. No npm access this session.

**Risks to check first with a toolchain**
- `orderBy nextFollowUpAt {sort, nulls}`; `visibleLeadWhere` returning `{}` for the Sales head and `{ id: { in: [] } }` for non-Sales; migration vs schema (`migrate diff`); action behaviour when `back()` is reached inside `loadManageable`.

**Not done / gaps**
- Projects, milestones, Sales -> Technology handover from a lead (handover has no lead link yet), pipeline aggregates for management, lead import/export, duplicate-organisation detection, automatic reminders for overdue follow-ups (no scheduler), reassigning a lead's open follow-up tasks, DB-backed access tests.

**Next action:** build and run phases 3-5 on a machine with npm + Postgres (`npm ci && npm run lint && npm run build && npx prisma migrate deploy`). Click through: Sales intern creates a lead; another intern must not see it (list, search, direct URL); Sales head sees it; Tech head must not; move through stages; LOST without reason must be refused; create a follow-up task; reassign; check timeline and notifications.


## 17. Phase 5 slice 2 — Lead-linked delivery handover (2026-11-11, WRITTEN, BUILT, NOT RUN AGAINST A DB)

Scope: WORKFLOWS 3 step 6 ("Sales creates a delivery handover") and step 10 (Sales sees the outcome). NOT in this slice: projects, milestones, auto-creating a project/tasks when Technology accepts (step 8), management pipeline summaries.

**Added**
- `Handover.leadId` (nullable, FK to `Lead`, ON DELETE SET NULL, indexed); migration `20261111000000_lead_handovers` (additive, hand-written).
- `lib/leads.ts`: `HANDOVER_STAGES`, `canHandOverLead`, `buildLeadHandoverContext`, `handoverTimelineNote`, `handoverSentNote`, `HANDOVER_TIMELINE_EVENTS`.
- `createHandover`: optional `leadId`. Server checks the lead is accessible and hand-over-able by the sender, the from-department is Sales (by slug), then writes the handover plus a lead timeline note in one transaction. `actOnHandover`: accepted / clarification / rejected / completed / cancelled are copied to the lead timeline in the same transaction.
- UI: "Delivery handover" card on `/leads/[id]` (button + the handovers the viewer may already see); `/handovers/new?leadId=` prefills title and an editable context snapshot; handover page shows "Source lead" (link only if the viewer can open the lead).
- Tests: `tests/lead-handovers.test.ts` (7). `npm test` total 76. Three mutations (any Sales member may hand over; all stages allowed; prototype-key lookup) each fail a test.

**Decisions (not confirmed by stakeholders)**
- Only the lead owner or Sales head can hand over, from QUALIFIED, PROPOSAL or WON. Multiple handovers per lead are allowed (no duplicate guard yet).
- The receiver normally cannot open the lead (RULES 2.7), so lead facts are COPIED into the handover context (editable by the sender before sending). The lead link is shown only to people who may open the lead. A Tech receiver's reject reason / completion summary is copied into the Sales timeline by design.
- Handover access rules are unchanged (sender, receiver, heads of both departments).

**Verification (actual results)**
- `npm ci`; `prisma generate --no-engine` (needs `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true PRISMA_QUERY_ENGINE_LIBRARY=/bin/true` in this sandbox); `tsc --noEmit` clean; `next build` succeeds; `npm test` 76/76.
- All six migrations applied in order to a real PostgreSQL 16; `Handover.leadId` nullable, FK is SET NULL.

**NOT verified**
- Server actions and pages have still never run against a Prisma query engine / database (engine download is blocked here). No browser run. `migrate diff` not run.

**Not done / gaps**
- Projects, milestones, project/task creation on accept, duplicate-handover warning, lead timeline entry for handover reassignment (reassignment itself is still not built), DB-backed authorization tests.

**Next action:** on a machine with Prisma engines: `npx prisma migrate deploy`, then click through: Sales owner opens a WON lead -> Hand over for delivery -> Tech receiver accepts; confirm the lead timeline shows sent and accepted, a Tech member cannot open `/leads/<id>`, another Sales intern cannot hand the lead over, and a NEW lead redirects with an error.
