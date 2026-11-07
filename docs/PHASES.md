# Implementation Roadmap
## EAK PUSTAK Workspace

This roadmap prioritizes a reliable coordination foundation before building every department feature. Each phase must be reviewed against the actual repository and available team capacity.

## Phase 0 — Discovery and technical baseline

**Purpose:** remove dangerous assumptions before implementation.

Deliverables:
- Inspect repository, framework, package manager and deployment.
- Identify existing authentication, database and migrations.
- Document current architecture and conventions.
- Confirm initial departments, roles and user count.
- Confirm hosting, backups, email and file storage constraints.
- Validate this PRD with stakeholders.
- Record technical decisions in `MEMORY.md`.

Exit criteria:
- Existing system is understood.
- Stack is selected based on evidence, not preference.
- P0 requirements and access matrix are approved.
- Deployment and rollback approach is known.

## Phase 1 — Identity and organization (P0)

Deliverables:
- Sign-in, sign-out and account activation.
- User profile and account status.
- Department management and membership.
- Role/permission model and scoped authorization.
- Shared application shell and permission-aware navigation.
- Basic employee directory.
- Audit events for account and permission changes.

Acceptance:
- Admin can invite and deactivate users.
- User can belong to multiple departments/projects.
- Unauthorized API requests are denied.
- HR-sensitive fields are not exposed to ordinary users or generic administrators.
- Authorization tests cover cross-department and cross-user access.

> Status 2026-11-15: account settings added (change own password and name; temporary passwords must be replaced; admin password reset; password change ends all sign-ins). See `MEMORY.md` section 21.

## Phase 2 — Tasks and personal workspace (P0)

Deliverables:
- My Work dashboard.
- Task create, assign, reassign and update.
- Task comments and activity.
- Due dates, priority, filters and overdue views.
- In-app notifications for assignment and mentions.

Acceptance:
- Task owner and history are persisted.
- Assignee can find assigned work.
- Unauthorized users cannot read or modify tasks.
- Failed writes do not show false success.
- Empty, loading, error and mobile states are verified.

## Phase 3 — Handover and coordination (P0)

> Status 2026-11-08: implemented; state machine and access rules unit-tested, migration applied to PostgreSQL 16, build passes. Server actions not yet run against a live Prisma engine. Reassignment and automatic escalation are not done. See `MEMORY.md` section 14.

Deliverables:
- Handover create/detail screens.
- Sender, receiver, departments, context, due date and linked source record.
- Accept, reject and clarification actions.
- Event history and notification.
- Pending acknowledgement views.
- Management summary of unacknowledged and overdue handovers.

Acceptance:
- Receiver action is required for acknowledgement.
- Sender cannot forge acceptance.
- Invalid state transitions are rejected server-side.
- Every transition is recorded.
- Duplicate submissions/retries do not create inconsistent state.

## Phase 4 — Company Hub and CMS (P1)

> Status 2026-11-09: written (announcements, policies/SOPs, resource links; draft/publish/unpublish/archive; department audiences; version history; search). Rules unit-tested (25 tests). NOT built or run against a database. Rich text, scheduled publishing and a separate approval step are not done. See `MEMORY.md` section 15.

Deliverables:
- Announcements and resources.
- Policy/SOP content.
- Draft, publish, unpublish/archive lifecycle.
- Audience restrictions.
- Basic version history.
- CMS management screens.

Acceptance:
- Only authorized publishers can publish.
- Audience restrictions apply to pages, search and notifications.
- Draft content is not visible to unauthorized audiences.
- Rich text is safely rendered.

## Phase 5 — Sales CRM and projects (P1)

> Status 2026-11-10: slice 1 written (leads, ownership, pipeline, timeline, follow-ups; 19 rule tests). Projects, milestones and the lead-linked Sales to Technology handover are NOT done. Nothing built or run against a database. See `MEMORY.md` section 16.

> Status 2026-11-15: COMPLETE as written. The last deliverable, permission-aware management summaries, is `/pipeline` (counts only; Sales head and Management head; MEMORY 21). Everything in this phase is built and unit-tested but has never run against a live Prisma engine or database.

> Status 2026-11-12: slice 2 (lead-linked delivery handover, MEMORY 17) and slice 3 (projects, members, milestones, project tasks, project from an accepted handover, MEMORY 18) are written, built and unit-tested. Not yet run against a live Prisma engine. Management pipeline summaries are NOT done.

Deliverables:
- Lead database and ownership.
- Lead interaction timeline.
- Follow-up dates and tasks.
- Sales pipeline.
- Project creation, membership and milestones.
- Handover from Sales to Technology/Operations.
- Permission-aware management summaries.

Acceptance:
- Leads have clear ownership and stage.
- Follow-up tasks are actionable.
- Cross-department delivery handover retains source context.
- Sales data is not exposed to users without permission.

## Phase 6 — HR essentials (P1)

> Status 2026-11-18: COMPLETE as written. Slice 5 is the restricted document register (MEMORY 24): private volume, authorized and audited downloads. Everything in this phase is written and unit-tested but has never been built or run against a database. Retention, version history and malware scanning are NOT done.

> Status 2026-11-17: slice 4 written: checklist counts on the HR overview (MEMORY 23). Only the restricted document register is NOT done. Nothing built or run against a database.

> Status 2026-11-16: slice 3 written: onboarding/offboarding checklists (MEMORY 22). The restricted document register and an HR-dashboard checklist widget are NOT done. Templates and default owners are unconfirmed.

> Status 2026-11-14: slice 2 written: company holiday calendar and a read-only HR overview (MEMORY 20), on top of slice 1 leave requests (MEMORY 19). Leave types, balances and the approval chain are UNCONFIRMED assumptions. Onboarding/offboarding checklists and the restricted document register are NOT done.

Deliverables:
- Leave request and approval flow.
- Onboarding/offboarding checklists.
- Restricted employee document register.
- Company holiday calendar.
- HR-specific dashboard.

Acceptance:
- Leave transitions and approver permissions are enforced.
- Employee documents use private storage and authorized downloads.
- Managers see only permitted fields.
- Audit events exist for sensitive access and changes where appropriate.

## Phase 7 — Operations and finance administration (P2)

> Status 2026-11-22: slice 4 written: internal service requests (MEMORY 28). Remaining: invoice/quotation register, renewal reminders. Nothing built or run against a database.

> Status 2026-11-28: Phase 8 COMPLETE as written. Technical SOPs reuse the Company Hub (MEMORY 34). Nothing built or run against a database.

> Status 2026-11-27: Phase 8 slice 3 written: deployment/release records (MEMORY 33). Only technical SOPs remain in Phase 8.

> Status 2026-11-26: Phase 8 slice 2 written: incident records (MEMORY 32). Releases and SOPs not done.

> Status 2026-11-25: Phase 8 slice 1 written: technical asset inventory (MEMORY 31). Releases, incidents and SOPs not done.

> Status 2026-11-24: slice 6 written: renewals (MEMORY 30). All Phase 7 deliverables are now written; none built against the Prisma client.

> Status 2026-11-23: slice 5 written: invoice/quotation register (MEMORY 29). Remaining: renewal reminders. Nothing built against the Prisma client; migrations 1-16 applied to a real PostgreSQL.

> Status 2026-11-21: slice 3 written: purchase requests and approvals (MEMORY 27), referencing the vendor register. Remaining: service requests, invoice/quotation register, renewal reminders. Nothing built or run against a database.

> Status 2026-11-20: slice 2 written: vendor register (MEMORY 26). Remaining: service requests, purchase requests, invoice/quotation register, renewal reminders. Nothing built or run against a database.

> Status 2026-11-19: slice 1 written: expense submission, approval and payment status (MEMORY 25). Service requests, purchase requests, vendor register, invoice/quotation register and renewal reminders are NOT done. Nothing built or run against a database.

Deliverables:
- Internal service requests.
- Purchase requests and approvals.
- Vendor register.
- Expense submissions and approval.
- Invoice/quotation and payment-status register.
- Subscription/domain/hosting renewal reminders.

Acceptance:
- Approval chain is explicit and auditable.
- Amounts use integer minor units and currency.
- No claim of full accounting or GST compliance.
- Access to financial records is scoped.

## Phase 8 — Technology operations (P2)

Deliverables:
- Technical asset inventory.
- Deployment/release records.
- Incident records.
- Technical SOPs.
- GitHub links/integration where justified.

Acceptance:
- GitHub remains source of truth for code and PRs.
- Secrets are never stored in plain text in asset records.
- Technical asset access is restricted.
- Incident history is traceable.

## Phase 9 — Hardening and rollout

Deliverables:
- Security review and access-control test suite.
- Backup and restore exercise.
- Monitoring and error reporting.
- Performance and accessibility review.
- User acceptance testing with representatives from each department.
- Admin/user documentation.
- Production rollout and rollback plan.

Acceptance:
- P0 acceptance criteria pass.
- Critical authorization defects are resolved.
- Restore procedure has been tested.
- Stakeholders sign off on workflows and data visibility.
- Known limitations are documented.

## Delivery discipline

- Ship one usable vertical slice at a time.
- Do not start all department modules in parallel.
- Every phase has a demo, tests and acceptance review.
- Do not mark a phase complete based only on frontend screens.
- Reprioritize based on real usage and operational pain, not feature count.
