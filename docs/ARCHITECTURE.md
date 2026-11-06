# Architecture
## EAK PUSTAK Workspace

- Status: Proposed logical architecture; validate against the existing repository before implementation.
- Default approach: modular monolith backed by PostgreSQL.

## 1. Architecture principles

1. Start with one deployable application and one relational database.
2. Separate modules by business capability and ownership boundaries.
3. Enforce authorization in the backend, never only in the UI.
4. Keep business rules in application/domain services, not scattered across components.
5. Use transactions for multi-record operations such as handover creation and acceptance.
6. Make important state changes auditable.
7. Integrate with specialist tools rather than cloning them.
8. Avoid premature microservices, message brokers and distributed complexity.

## 2. Logical system

```text
Browser / Mobile Web
        |
        v
Frontend application
  - shared shell and navigation
  - workspace-specific screens
  - typed API client
        |
        v
Backend application / API
  - authentication
  - authorization policy
  - domain services
  - validation
  - audit events
  - notification orchestration
        |
        +---------- PostgreSQL
        |
        +---------- File/object storage
        |
        +---------- Email provider
        |
        +---------- External links/integrations
                     - GitHub
                     - Calendar (future)
                     - other approved providers
```

The diagram is logical, not a mandate to create separate services or deployables.

## 3. Technology selection policy

Inspect the current repository first. Preserve a working stack unless there is a documented reason to change it.

If starting from an empty repository, a reasonable candidate stack is:
- TypeScript frontend using a maintained React framework.
- Tailwind CSS and accessible component primitives (for example shadcn/ui).
- Backend API in the existing team's strongest supported framework.
- PostgreSQL.
- Schema migrations managed by the backend's migration tool.
- Object storage for attachments; never store uploaded binary files directly in ordinary relational rows unless justified.
- Automated tests in CI.

Do not choose a specific framework, ORM, authentication vendor or hosting provider until the repository, team capability and deployment constraints are known.

## 4. Suggested module boundaries

- Identity: users, sessions, invitations and account status.
- Organization: departments, memberships and reporting relationships.
- Authorization: roles, permissions, scopes and policy evaluation.
- Work: tasks, comments, labels, attachments and activity.
- Handover: cross-team transfer, acknowledgement and escalation.
- Notifications: in-app delivery, preferences and read state.
- Company Hub: announcements, policies, resources and publishing.
- CRM: leads, contacts, interactions and pipeline.
- Projects: projects, memberships, milestones and linked tasks.
- HR: leave, onboarding, offboarding and restricted documents.
- Operations: service requests, vendors and assets.
- Finance Admin: expenses, approvals, invoices and renewals.
- Audit: append-oriented record of important actions.
- Reporting: permission-aware aggregates and dashboards.

Modules may live in one codebase and share infrastructure, but should not reach into each other's internals without an explicit service/API boundary.

## 5. Data model — conceptual entities

### Identity and organization
- User(id, email, display_name, status, created_at, updated_at)
- Department(id, name, slug, status)
- DepartmentMembership(id, user_id, department_id, membership_type, is_primary)
- Role(id, name, description)
- Permission(id, key, description)
- RolePermission(role_id, permission_id)
- UserRole(id, user_id, role_id, scope_type, scope_id)
- ProjectMembership(id, project_id, user_id, project_role)

### Work and coordination
- Task(id, title, description, status, priority, owner_user_id, creator_user_id, department_id, due_at)
- TaskWatcher(task_id, user_id)
- TaskComment(id, task_id, author_user_id, body, created_at)
- TaskActivity(id, task_id, actor_user_id, action, metadata, created_at)
- Handover(id, title, context, from_department_id, to_department_id, sender_user_id, receiver_user_id, source_type, source_id, due_at, status)
- HandoverEvent(id, handover_id, actor_user_id, event_type, reason, created_at)
- Notification(id, user_id, type, resource_type, resource_id, read_at, created_at)

### Company Hub
- ContentItem(id, type, title, body, status, author_user_id, publisher_user_id, published_at, version)
- ContentAudience(id, content_item_id, audience_type, audience_id)
- ResourceLink(id, title, url, category, audience_scope)

### Sales and projects
- Lead(id, organization_name, contact_name, contact_email, contact_phone, source, owner_user_id, stage, next_follow_up_at)
- LeadInteraction(id, lead_id, actor_user_id, interaction_type, summary, occurred_at)
- Project(id, name, description, status, owner_user_id, department_id, start_at, due_at)
- ProjectMilestone(id, project_id, title, status, due_at)

### HR and administrative modules (later phases)
- LeaveRequest(id, user_id, leave_type, start_date, end_date, reason, status, approver_user_id)
- OnboardingCase(id, user_id, start_date, status)
- ChecklistItem(id, case_type, case_id, title, owner_user_id, status, due_at)
- RestrictedDocument(id, employee_user_id, storage_key, document_type, access_policy)
- Expense(id, submitted_by_user_id, amount_minor, currency, category, status, approver_user_id)
- ApprovalEvent(id, resource_type, resource_id, actor_user_id, decision, comment, created_at)

### Platform and audit
- AuditEvent(id, actor_user_id, action, resource_type, resource_id, outcome, metadata, created_at)
- Attachment(id, resource_type, resource_id, storage_key, file_name, mime_type, size_bytes, uploaded_by_user_id)
- IntegrationConnection(id, provider, status, secret_reference, created_at)

This is a conceptual model, not a final migration script. Normalize and constrain the actual schema during implementation. Add foreign keys, indexes, unique constraints and deletion policies deliberately.

## 6. Authorization model

Use RBAC with scoped permissions and resource-level policy checks.

Permission examples:
- `users.read_directory`
- `users.invite`
- `departments.manage`
- `tasks.create`
- `tasks.read`
- `tasks.assign`
- `tasks.update`
- `handovers.create`
- `handovers.acknowledge`
- `crm.leads.read`
- `crm.leads.manage`
- `hr.documents.read`
- `hr.leave.approve`
- `content.publish`
- `audit.read`

Scope examples:
- own record
- assigned record
- project membership
- department
- company-wide

Rules:
- A role name is not a security check. Check permission + scope + resource relationship.
- A platform administrator is not automatically entitled to private HR documents.
- Management dashboards use aggregate queries that do not leak restricted fields.
- Check authorization on reads, writes, exports, downloads and background jobs.
- Avoid trusting department IDs, owner IDs or role claims supplied by the browser.
- Permission changes should take effect predictably; document session/cache behavior.

## 7. Handover state machine

Suggested states:
- `draft`
- `pending_acknowledgement`
- `accepted`
- `clarification_requested`
- `rejected`
- `cancelled`
- `completed`

Allowed transitions must be explicit:
- Sender creates draft.
- Sender submits -> pending acknowledgement.
- Assigned receiver accepts -> accepted.
- Assigned receiver requests clarification -> clarification requested.
- Assigned receiver rejects with reason -> rejected.
- Sender may cancel while policy allows.
- Authorized owner closes/completes after delivery.

Never allow the sender to forge receiver acknowledgement. Persist each transition as an event in the same transaction as the state update.

## 8. API conventions

Use the existing API conventions if present. Otherwise:
- Version externally exposed APIs where compatibility matters.
- Validate request bodies and path parameters.
- Return consistent error structures with stable error codes.
- Paginate list endpoints.
- Support filtering and sorting only through allowlisted fields.
- Use idempotency protection for operations where retries could duplicate important actions.
- Avoid returning fields the caller cannot view.
- Do not expose internal stack traces, secrets or database errors.

Example resource families:
- `/api/users`
- `/api/departments`
- `/api/tasks`
- `/api/handovers`
- `/api/notifications`
- `/api/content`
- `/api/leads`
- `/api/projects`

These are examples, not a final route contract.

## 9. Security baseline

- Use a maintained authentication solution; never implement password cryptography yourself.
- Secure cookies/session handling and CSRF protections appropriate to the auth model.
- Rate-limit authentication and sensitive actions.
- Validate and normalize all input server-side.
- Prevent IDOR/BOLA with object-level authorization.
- Apply safe file upload controls: allowlisted types, size limits, generated storage keys, malware scanning where available, private storage and authorized download.
- Escape output and sanitize rich text according to context.
- Use parameterized database access.
- Keep secrets in environment/secret management, never source control.
- Encrypt transport; protect backups and storage.
- Record security-relevant events without logging passwords, tokens, private document contents or unnecessary personal data.
- Define retention and deletion policies.
- Test access denial, not only successful access.

## 10. Reliability and operations

- Database migrations are versioned and reviewed.
- Backups are automated; restore is tested, not assumed.
- Health/readiness checks do not expose secrets.
- Centralized structured logs with correlation/request IDs.
- Monitor application errors, database health, disk and backup status.
- Background notification jobs must retry safely and avoid duplicate effects.
- Provide a rollback plan for releases and migrations.
- Document environment setup and deployment steps.

## 11. Testing strategy

- Unit tests: domain rules and state transitions.
- Integration tests: database transactions, authorization and API behavior.
- End-to-end tests: sign-in, task assignment, handover acknowledgement, content publishing.
- Security tests: cross-department access, IDOR/BOLA, privilege escalation, file access, CSRF and input validation.
- Regression tests: every fixed defect receives a test where practical.
- Accessibility checks: keyboard navigation, labels, focus, contrast and semantic structure.

## 12. Architecture decisions to record

Maintain an ADR or a dated decision entry in `MEMORY.md` for:
- framework and runtime
- authentication/session model
- database/ORM
- file storage
- deployment topology
- notification delivery
- authorization policy implementation
- audit retention
- integration boundaries
