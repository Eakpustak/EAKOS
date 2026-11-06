# Product, Engineering and Security Rules
## EAK PUSTAK Workspace

These rules are mandatory unless a documented decision explicitly changes them.

## 1. Product rules

1. One application and one identity system; department workspaces are views and capabilities within that application.
2. A user can have one primary department and additional department/project memberships.
3. Department membership does not automatically grant access to every record in that department.
4. Every task must have one accountable owner. Additional collaborators/watchers may exist.
5. Important work must have a visible status and activity history.
6. Cross-department handovers require an identified sender, receiver, context and explicit acknowledgement.
7. A sender cannot acknowledge a handover for its receiver.
8. Rejection and clarification requests require a reason.
9. Management overview is not equivalent to unrestricted record access.
10. Specialist tools remain the source of truth for their domain where appropriate. Do not recreate GitHub.
11. V1 must remain small enough to deploy, operate and maintain with the available team.
12. Do not add features merely because a dashboard template contains them.

## 2. Authorization rules

1. Deny by default.
2. Enforce authorization on the server for every request.
3. Check action permission, scope and resource relationship.
4. Never rely on hidden navigation or disabled buttons as security.
5. Never trust role, department, owner or user IDs supplied by the client without server verification.
6. HR documents, compensation and sensitive employee fields require explicit restricted permissions.
7. Platform administration does not silently grant access to sensitive business content.
8. Exports, attachments, search results, notifications and background jobs must follow the same access policy.
9. Test negative cases: users must not access another department's restricted data by changing an ID.
10. Log permission changes and privileged actions.

## 3. Data rules

- Use stable primary keys and foreign keys.
- Store timestamps in UTC; render in the user's configured/local timezone.
- Store money in integer minor units with an explicit currency.
- Validate email, phone, dates, enum values and relationships server-side.
- Use explicit status enums/state machines for workflows.
- Do not hard-delete records that are required for audit or business history; define archive/retention behavior.
- Do not store passwords, API keys or session tokens in ordinary application tables or logs.
- Do not put sensitive personal information into URLs, analytics or notification previews.
- Use database constraints to protect invariants, not only frontend validation.

## 4. Frontend rules

- Build reusable components from a consistent design system.
- Use semantic HTML and accessible labels.
- All interactive controls must work with keyboard.
- Provide visible focus states.
- Every data screen must handle loading, empty, error, success and unauthorized states.
- Use responsive layouts; tables need deliberate mobile behavior.
- Avoid excessive gradients, glassmorphism, giant rounded cards and decorative charts.
- Do not use emoji as the primary interface icon system.
- Use consistent date, time, currency and status formatting.
- Do not fabricate demo metrics in production screens.
- Confirm destructive actions and explain their consequences.
- Keep forms clear, validated and forgiving; preserve user input after recoverable errors.
- Avoid optimistic UI when a failed write would create misleading ownership or approval state.

## 5. Backend rules

- Keep business logic out of controllers and UI components.
- Validate all input at the boundary.
- Use transactions for coupled state changes.
- Use parameterized queries/ORM-safe operations.
- Return only fields the caller is allowed to read.
- Paginate large collections.
- Use explicit error codes and safe messages.
- Make retries safe for important commands.
- Do not swallow exceptions or report false success.
- Add tests for every business rule and security boundary.

## 6. Workflow rules

- Task assignment and handover acknowledgement are separate actions.
- A task being created does not mean the assignee has accepted it.
- A notification being sent does not mean it was read.
- A meeting being scheduled does not mean attendance or acknowledgement.
- Keep a record of assignment, reassignment, acceptance, rejection and completion.
- Due dates and escalation windows must be explicit and configurable.
- Avoid silently auto-closing work because a related record changed.
- Preserve context when work moves between departments.

## 7. Content/CMS rules

- Draft content is not public/internal-wide until published.
- Publishing requires an authorized publisher.
- Content audience is enforced on read, search and notification preview.
- Preserve version history for policies and important documents.
- Show author, publisher and publication/update dates.
- Sanitize rich text and restrict unsafe embeds.
- Unpublish/archive rather than silently destroying policy history.

## 8. Development workflow

Before coding:
1. Inspect repository and current state.
2. Read project docs and existing agent instructions.
3. Identify affected module, data model, permission checks and tests.
4. State assumptions where requirements are unclear.

During coding:
1. Make focused changes.
2. Follow existing conventions.
3. Avoid unrelated refactors.
4. Add or update tests.
5. Update docs and `MEMORY.md` for material changes.

Before declaring complete:
1. Run tests, lint, type check and build where available.
2. Test both authorized and unauthorized paths.
3. Inspect responsive and empty/error states for UI changes.
4. Report exact verification results and known limitations.
5. Never claim checks passed if they were not run.

## 9. Prohibited shortcuts

- Frontend-only authorization.
- Shared generic admin account for employees.
- Exposing all employee data to all managers.
- Storing uploaded private documents in public buckets.
- Hard-coded secrets or production credentials in the repository.
- Fake activity, fake metrics or fake success messages.
- Replacing a working stack without a migration plan.
- Building all departments' full feature sets before core coordination works.
- Introducing microservices before there is a measured need.
