# Project Memory
## EAK PUSTAK Workspace

> This file is the compact handoff note for future development sessions. Keep it factual, current and concise.

- Last updated: 2026-11-16
- Status: Phase 3 (handovers) written and partially verified (see section 14); Phase 1 scaffolded, Phase 2 (tasks) written, UI redesigned per DESIGN.md, Phase 2 known gaps closed (admin silent failures, form-input preservation, creator-only edit); NOTHING build-verified against a real toolchain/database yet (see sections 10, 12, 13).
- Current milestone: Phase 6 slice 3 (onboarding/offboarding checklists, section 22) written on top of Phase 5 (complete as written, section 21), account settings (section 21) and Phase 6 slices 1-2 (sections 19-20). NOTHING has run against a live Prisma engine or database; build, apply migrations and click through before adding more.

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


## 18. Phase 5 slice 3 — Projects, members, milestones (2026-11-12, WRITTEN, BUILT, NOT RUN AGAINST A DB)

Scope: WORKFLOWS 3 steps 8-11 (project and delivery tasks, progress, confirmed completion) plus PHASES 5 "project creation, membership and milestones".

**Added**
- Models `Project`, `ProjectMember`, `Milestone`; enums `ProjectStatus`, `MilestoneStatus`; `Task.projectId`, `Notification.projectId`; migration `20261112000000_projects`. DB: unique `handoverId` (one project per handover), unique `clientToken`, unique (project, user), CHECK completed status <=> `completedAt`, CHECK milestone DONE <=> `doneAt`.
- `lib/projects.ts` (pure rules), `lib/project-ui.tsx`, `app/projects/actions.ts` (`createProject`, `addMilestone`, `setMilestone` done/reopen/remove, `changeProjectStatus`, `addMember`, `removeMember`, `createProjectTask`), pages `/projects`, `/projects/new`, `/projects/[id]`, "Projects" nav item, notification links, handover page "Create project" card and "Delivery project" detail row.
- Tests: `tests/projects.test.ts` (9). `npm test` total 85. Five mutations (anyone may start from a handover; any handover status; complete with open milestones; creator can manage; completed reopenable) each fail a test.

**Decisions (not confirmed by stakeholders)**
- One delivery owner, one delivering department. Visible to owner, creator, listed members and the department head(s); plain department membership and ADMIN grant nothing. Managed by owner and department head only.
- A project from a handover can only be created by the named RECEIVER, once the handover is ACCEPTED, once per handover. The sender is notified; if the handover came from a lead, a note is added to the lead timeline (Sales keeps customer ownership, sees delivery start).
- Status: ACTIVE -> ON_HOLD/COMPLETED/CANCELLED; ON_HOLD -> ACTIVE/CANCELLED; COMPLETED and CANCELLED are final. Completing requires every milestone done. Closed projects are read-only (milestones, members, tasks).
- Completing a project does NOT auto-complete the handover (WORKFLOWS 2: no auto-completion without an approved rule). The receiver still closes it with a summary.
- Tasks created from a project belong to the project's department and may be assigned only to the owner or a listed member; normal task access still applies, so the project page lists only tasks the viewer can already see.
- Milestones are capped at 50 per project. Removing a milestone is a hard delete (audit event kept).

**Verification (actual results)**
- `tsc --noEmit` clean; `next build` succeeds incl. `/projects`, `/projects/[id]`, `/projects/new`; `npm test` 85/85.
- All seven migrations applied in order to real PostgreSQL 16; both CHECKs rejected bad rows, the duplicate-member unique rejected, deleting a project cascaded its milestones.

**NOT verified**
- Server actions and pages have still never run against a Prisma query engine or database; no browser run; `prisma migrate diff` not run.

**Not done / gaps**
- Reassigning a project owner, editing name/description/dates, milestone ordering/editing, project comments/activity feed (only audit events), project dashboard on My work, management summaries, DB-backed authorization tests, notifications when milestones become overdue (no scheduler).

**Next action:** with Prisma engines available: `npx prisma migrate deploy`, then click through: Tech receiver accepts a Sales handover -> Create project -> add milestone, add member, create task -> a non-member Tech colleague gets redirected from `/projects/<id>`; Sales owner sees "Delivery project ... started" on the lead timeline; completing is refused with an open milestone.


## 19. Security bump + Phase 6 slice 1 — Leave requests (2026-11-13, WRITTEN, BUILT, NOT RUN AGAINST A DB)

**Security**: `next` 14.2.15 -> 14.2.35 (exact pin). Closes the pending CVE-2025-29927 item from section 13. `tsc`, `next build` and all tests pass on it. Every page and action still re-checks the session itself (`requireUser`), so authorization never depended on middleware alone.

**Scope**: leave request, approve/reject with reason, requester cancel. NOT in this slice: leave balances, onboarding/offboarding checklists, restricted document register, holiday calendar, HR dashboard.

**Added**
- Model `LeaveRequest`, enum `LeaveStatus`, `Notification.leaveId`; migration `20261113000000_leave`. DB CHECKs: end >= start; approver never the requester; APPROVED/REJECTED carry decidedAt+decidedById (CANCELLED may keep an earlier decision); REJECTED needs a non-empty note.
- `lib/leave.ts` (pure rules), `lib/leave-ui.tsx`, `app/leave/actions.ts` (`submitLeave`, `actOnLeave`), pages `/leave`, `/leave/new`, `/leave/[id]`, "Leave" nav item, notification links.
- Tests: `tests/leave.test.ts` (8). `npm test` total 93. Five mutations (head approves own leave; reject without reason; reject then approve; cancel started leave; colleagues can view) each fail a test.

**ASSUMPTIONS THAT NEED STAKEHOLDER CONFIRMATION (WORKFLOWS 6 says these must be confirmed first)**
- Leave types are placeholders: Casual, Sick, Earned, Unpaid, Other. They are a string list in `lib/leave.ts`, so changing them needs no migration.
- NO balances: nothing is deducted or limited. Days are calendar days, inclusive (no weekends/holidays logic).
- Approver: a head of one of the requester's departments (never the requester). If the requester is a head or has no other head, the Management head decides; if nobody qualifies the submit is refused. The approver department is fixed at submit.
- Visibility: requester, heads of the approver department, and the HR head (read-only). The reason is shown only to those people. Notifications are generic and never carry type or reason.
- A decision is final. Requester can cancel while pending, or after approval only before the first day. Overlapping pending/approved requests by the same person are refused. A request may start at most 14 days in the past and last at most 60 days.

**Verification (actual results)**
- `tsc --noEmit` clean; `next build` succeeds (Next 14.2.35) incl. `/leave`, `/leave/[id]`, `/leave/new`; `npm test` 93/93.
- All eight migrations applied in order to real PostgreSQL 16; each of the four CHECKs rejected a bad row on real data.

**NOT verified**
- Server actions and pages have still never run against a Prisma query engine or database; no browser run; `prisma migrate diff` not run.

**Not done / gaps**
- Balances/accrual, weekend and holiday awareness, half days, team leave calendar, delegation when an approver is away, reminders for undecided requests (no scheduler), HR-specific dashboard, DB-backed authorization tests.

**Next action:** answer the open questions above, then with Prisma engines run `npx prisma migrate deploy` and click through: employee requests leave -> own department head sees it under "To decide" and approves; a Tech colleague cannot open `/leave/<id>`; a head cannot decide their own request (Management head does); cancelling approved leave that already started is refused.


## 20. Phase 6 slice 2 — Holiday calendar and HR overview (2026-11-14, WRITTEN, BUILT, NOT RUN AGAINST A DB)

**Added**
- Model `Holiday` (unique date); migration `20261114000000_holidays`. DB CHECKs: non-empty name; date is exactly midnight.
- `lib/holidays.ts` (pure), `app/holidays/actions.ts` (`addHoliday`, `removeHoliday`), pages `/holidays` (everyone reads; year switch) and `/hr` (HR head only), "Holidays" nav for all, "HR overview" nav for the HR head. Leave form and leave detail now mention company holidays inside the dates.
- HR overview: pending leave count, who is out today, approved leave starting in the next 14 days, next holiday. Read-only; links to the leave list.
- Tests: `tests/holidays.test.ts` (5). `npm test` total 98. Four mutations (any head manages; today excluded; range end exclusive; no year limit) each fail a test.

**Decisions (not confirmed by stakeholders)**
- Only the HR head edits the calendar (Admin role and HR members grant nothing). Everyone signed in can read it.
- Holidays are INFORMATIONAL: they do not change leave day counts, because weekend/holiday counting is unconfirmed (section 19).
- Removing a holiday is a hard delete (reference data); an audit event keeps the date and name.
- The HR overview shows names, dates and leave type only, no reasons. The HR head already has read access to leave (section 19).

**Verification (actual results)**
- `tsc --noEmit` clean; `next build` succeeds incl. `/holidays` and `/hr`; `npm test` 98/98.
- All nine migrations applied in order to real PostgreSQL 16; duplicate date, blank name and non-midnight date each rejected by the database.

**NOT verified**: server actions/pages never run against a Prisma query engine or database; no browser run (same as sections 14-19).

**Not done / gaps**: weekend/holiday-aware day counts, bulk import of a holiday list, optional/restricted holidays, team leave calendar view, onboarding/offboarding checklists, restricted document register (needs private file storage).

**Next action:** after `prisma migrate deploy`, click through: HR head adds a holiday and a duplicate date is refused; an ordinary employee sees the calendar but no add/remove forms and `/hr` redirects them; the HR overview lists someone with approved leave today.


## 21. Phase 5 completion (management pipeline summary) + account settings (2026-11-15, WRITTEN, NOT BUILT, NOT RUN AGAINST A DB)

**Phase 5 last deliverable: permission-aware management summary.** `/pipeline`, nav item "Pipeline summary".
- `lib/pipeline.ts` (pure): `canViewPipelineSummary` (a Sales head or the Management head only; ADMIN, plain members and other heads grant nothing), `stageBreakdown`, `openLeadTotal`, `winRatePercent` (null, not 0%, when nothing closed), `sharePercent`.
- COUNTS ONLY (RULES 1.9, 2.7): open leads, follow-ups overdue, no follow-up planned, won/lost last 30 days, leads by stage, delivery handovers from leads by status (+ unacknowledged past `HANDOVER_ACK_HOURS`), delivery projects by status. No organisation, contact, owner, title or reason is selected. Only the Sales head also gets a link to `/leads`; the Management head cannot open leads and gets none.
- Decisions to confirm: who counts as "management" (here: Management head + Sales head); no deal values exist in the schema so there is no revenue figure; the last-30-days window is a constant.

**Account settings.** `/settings`, nav item "Account settings" for everyone.
- `User.passwordChangedAt`, `User.mustChangePassword` (migration `20261115000000_account_settings`, additive; existing rows default to false, so nobody is forced retroactively).
- Change own name (`updateProfile`) and own password (`changePassword`). Password change requires the current password, matching confirmation and a different new one; strength rules in `lib/account.ts` (min 10 chars, max 72 BYTES because bcrypt ignores the rest, no single repeated character, small common list, not your email name or your name). Wrong current password is audited as `denied`; 5 denials in 15 minutes lock the form for that account. The write is guarded on the hash that was read (`updateMany`), so a change made elsewhere is reported, not overwritten. Passwords never go in a URL or audit row.
- Changing a password ends every sign-in, including the current one: the session carries `authAt` (stamped at sign-in) and `requireUser` rejects any session older than `passwordChangedAt`; a session with no stamp is treated as stale once a change exists (fail closed). After the change the person is sent to `/login?notice=password-changed` (the notice text comes from a fixed list, never from the URL).
- Temporary passwords: `createUser`, the new admin `resetUserPassword`, and the bootstrap admin all set `mustChangePassword`. `requireUser()` sends such a user to `/settings?required=1`; only the settings page/actions pass `allowPasswordChange`, so a temporary password opens nothing else. `Shell` takes `allowPasswordChange` for the same reason (otherwise settings would redirect to itself).
- Admin reset (`/admin/users` > "Reset password"): there is no email, so this is the forgot-password path. It sets a temporary password, ends the person's sign-ins, forces a change, audits `user.password_reset`. An admin changes their own password in settings, not here. An admin who resets a password knows a working password until the person changes it; this is inherent in admin-set passwords and is why the reset is audited.
- `createUser` and reset now also apply the strength rules (before, a 200-character temporary password was accepted and silently truncated by bcrypt at 72 bytes).
- Tests: `tests/account.test.ts` (7), `tests/pipeline.test.ts` (7). `npm test` total 112. Mutations that each fail a test: unstamped session treated as fresh, byte limit measured as characters, any Sales member sees the summary, no lockout.

**Verification (actual results)**
- All 112 unit tests pass (run with Node's native TypeScript stripping on a copy, because this sandbox has no `node_modules` and no registry access; `tsx` itself was not run).
- Parse check (Node's TS parser, strip-only) clean for every changed `.ts` file. The `.tsx` files (`app/settings/page.tsx`, `app/pipeline/page.tsx`, `app/login/page.tsx`, `app/admin/users/page.tsx`, `lib/shell.tsx`, `lib/shell-client.tsx`) could NOT be parsed or type-checked here.
- NOT run: `npm ci`, `prisma generate`, `tsc --noEmit`, `next build`, `prisma migrate diff/deploy`, any browser or database.

**Risks to check first with a toolchain**
- `db.project.groupBy` with `where: { handover: { is: { leadId: { not: null } } } }` and the other `groupBy` result types on `/pipeline`.
- The `<details>` "Reset password" markup on `/admin/users` has no dedicated CSS; check it on mobile cards.
- `/login` reads `?notice=` in `useEffect` (no Suspense needed); confirm it shows after a password change.
- The stale-session redirect lands on `/login` with the old cookie still present; confirm signing in again replaces it and nothing loops.

**Not done / gaps**
- Login throttling (the throttle exists only on the password-change form; a login lockout needs a decision on lock-out denial of service), "forgot password" by email (no email provider), two-factor sign-in, a list of active sessions, notification preferences, timezone preference, avatar. Pipeline: trends over time, per-owner breakdown (would name people, needs a decision), export.

**Next action:** on a machine with npm + Postgres: `npm ci && npm run lint && npm run build && npx prisma migrate deploy && npm test`, then click through: new person signs in with a temporary password and is held on `/settings` until they change it; after the change they must sign in again; an old tab from before the change is bounced to login; five wrong current passwords lock the form; the Management head sees `/pipeline` but gets redirected from `/leads/<id>`; a Tech head and an intern are redirected from `/pipeline`.


## 22. Phase 6 slice 3 — Onboarding / offboarding checklists (2026-11-16, WRITTEN, NOT BUILT, NOT RUN AGAINST A DB)

Scope: PHASES 6 "Onboarding/offboarding checklists" and WORKFLOWS 6 (assign items to HR, manager, Technology or Operations; record completion and the responsible person). NOT in this slice: the restricted document register (needs private file storage), an HR dashboard widget for checklists, reminders for overdue steps (no scheduler), checklist templates editable in the UI.

**Added**
- Models `PeopleCase`, `CaseItem`; enums `CaseType`, `CaseStatus`, `CaseItemStatus`; `Notification.caseId`; migration `20261115010000_checklists`. DB CHECKs: creator <> subject; closed states carry closedAt+closedById; `openKey` set exactly while OPEN (a unique index on it gives one open case per person and type); CANCELLED carries a note; item DONE carries doneAt+doneById; non-empty title.
- `lib/checklists.ts` (pure rules + templates), `app/checklists/actions.ts` (`createCase`, `markItem`, `reassignItem`, `addItem`, `closeCase`), pages `/checklists`, `/checklists/new`, `/checklists/[id]`, nav item "Checklists" (HR head, or anyone with an open step; badge = steps assigned to you), notification links.
- Tests: `tests/checklists.test.ts` (11). `npm test` total 123. Five mutations (subject may view; owner may reopen; complete ignores open steps; any HR member manages; owner sees every step) each fail a test.

**Decisions (NOT confirmed by stakeholders)**
- Only the HR head (head of `human-resources`) opens, reassigns, adds steps, reopens, completes or cancels. Admin role and plain HR membership grant nothing (RULES 2.3, 2.7).
- Template steps are placeholders in `lib/checklists.ts` (6 onboarding, 7 offboarding). Default owner per step: HR -> the HR head who opened it; MANAGER -> head of one of the person's own departments; TECHNOLOGY / OPERATIONS -> the head of those departments (slugs `technology`, `operations`). If nobody qualifies, the HR head owns it, so no step is ever unowned. Owners come from stored memberships, never the form.
- Visibility: HR head sees everything. A step owner can open the case but sees ONLY their own steps. The person the case is about never owns a step and cannot open their own case (an offboarding is confidential until HR says otherwise). Missing and forbidden IDs get the same redirect.
- A step is marked done by its owner or the HR head; reopened by the HR head only. A case is completed only by the HR head and only when every step is done; cancelling needs a reason and can happen with open steps. Closed cases are frozen. Nothing completes automatically.
- The Workspace account is NEVER deactivated by a checklist. The last offboarding step only asks an administrator to do it (Admin has no checklist power, so this is a manual hand-off; a notification to administrators is not built).
- Date: start date (onboarding) or last working day (offboarding), from 30 days back to one year ahead; every template step is due on that date. Notifications are generic ("A checklist item was assigned to you"): no name, type or step title. Every create, step change and close is an audit event.
- One open case per person and type; the person must be active and not the HR head opening it.

**Verification (actual results)**
- All 123 unit tests pass (run with Node native TypeScript stripping on a copy; `tsx` itself not run). `lib/checklists.ts`, `app/checklists/actions.ts` and the test file parse cleanly with Node's TypeScript parser.
- NOT run: `npm ci`, `prisma generate`, `tsc --noEmit`, `next build`, `prisma migrate diff/deploy`, any browser or database. This sandbox had no PostgreSQL, so the new migration SQL has not even been applied to a scratch database. The `.tsx` pages could not be parsed or type-checked.

**Risks to check first with a toolchain**
- Migration SQL syntax and the four CHECKs (apply all ten migrations in order to a scratch PostgreSQL 16; then `prisma migrate diff`).
- `visibleCaseWhere` / the `items: { some }` filter and the `createCase` heads query with `OR` of a relation filter and `departmentId in`.
- Cancel form: `ConfirmSubmit`'s dialog button submits a form whose textarea is `required`; check the browser's validation message is reachable while the dialog is open (the server validates anyway).
- Typing of `fail()` arrow helpers (copied from leave actions) with the `!` assertions I added in `createCase`.

**Not done / gaps**
- Restricted employee document register, overdue reminders, editing templates in the UI, a checklist widget on `/hr`, step due-date edits, step removal, notifying administrators when the "deactivate account" step is reached, DB-backed authorization tests.

**Next action:** build and apply migrations, then click through: HR head opens an onboarding checklist for a Sales intern; the Technology head sees only the two Technology steps; the intern cannot open `/checklists/<id>`; a second open onboarding for the same person is refused; completing with an open step is refused; cancel without a reason is refused; a completed case cannot be changed.
