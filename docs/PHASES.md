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
