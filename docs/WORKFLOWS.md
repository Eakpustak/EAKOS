# Department Workflows
## EAK PUSTAK Workspace

This document defines the operational behavior that must be consistent across departments.

## 1. Shared task lifecycle

Suggested states:
- `open`
- `in_progress`
- `blocked`
- `in_review`
- `completed`
- `cancelled`

Required concepts:
- One accountable owner.
- Creator and creation timestamp.
- Status and activity history.
- Due date when the work has a deadline.
- Optional collaborators/watchers.
- Clear reason when blocked or cancelled.

Assignment is not acknowledgement. If explicit acceptance is required for a particular work type, model it as a separate event/state rather than assuming task assignment means the person accepted it.

## 2. Cross-department handover lifecycle

### Creation
Sender chooses:
- source department
- receiving department
- named receiving owner
- title and context
- expected deliverable
- due date
- linked lead/project/task/client record, where applicable

### Acknowledgement
Receiver can:
- accept ownership
- request clarification with a reason
- reject with a reason, where policy permits

### Completion
After acceptance:
- work is tracked through linked task/project.
- status changes are visible to authorized sender and receiver.
- completion includes a summary or linked evidence where appropriate.
- activity history is retained.

### Guardrails
- A message or notification is not acknowledgement.
- A meeting invitation is not acknowledgement.
- Sender cannot accept on receiver's behalf.
- Reassignment must preserve history and notify affected people.
- Escalation timing must be configurable.
- Do not automatically mark a handover completed merely because a linked task is completed unless the business rule is explicitly approved.

## 3. Sales lead to website delivery

1. Lead is created with organization/contact details and source.
2. A sales owner is assigned.
3. Owner receives a notification and acknowledges follow-up according to company policy.
4. Interactions, calls, meetings and outcomes are logged.
5. Lead stage moves according to defined pipeline rules.
6. When a website is requested, Sales creates a delivery handover.
7. Technology lead accepts or requests clarification.
8. A project and delivery tasks are created/linked.
9. Technology updates progress and blockers.
10. Sales retains customer communication ownership unless reassigned.
11. Delivery is confirmed and handover is closed with a summary.

Important: Sales and Technology have different responsibilities. The portal must preserve both the customer relationship owner and the technical delivery owner.

## 4. Meeting and follow-up workflow

Purpose: prevent missed meetings and ambiguous ownership.

- Every meeting/follow-up record has an organizer/owner, participants, date/time and purpose.
- If a person must take action, create an assigned task or acknowledgement request.
- Show pending acknowledgement and overdue follow-up clearly.
- Reminder channels and timing are configurable.
- Record outcome: completed, rescheduled, cancelled or missed.
- Do not infer that a recipient saw a message or attended a meeting.

Calendar integration may be added later; V1 can begin with task/meeting records and in-app notifications if that meets actual needs.

## 5. Technology workflow

- Create a project with owner, members, scope and target date.
- Create tasks/bugs/features linked to the project.
- Link GitHub repository, issue and pull request URLs.
- Keep code, commits, branches and reviews in GitHub.
- Record release/deployment metadata only if useful to the team.
- Record incidents with severity, owner, timeline, impact and resolution.
- Restrict infrastructure details and sensitive operational data.

## 6. HR workflows

### Leave request
1. Employee submits dates, leave type and reason.
2. System validates dates and policy constraints.
3. Authorized approver reviews.
4. Approver approves or rejects with reason.
5. Employee receives outcome.
6. Record is retained according to policy.

Approval chain, leave balance and leave types must be confirmed before implementation.

### Onboarding
- Create onboarding case after account/person record is authorized.
- Assign checklist items to HR, manager, Technology or Operations.
- Restrict identity and document fields.
- Record completion and responsible person.
- Do not expose confidential HR attachments through generic employee directory APIs.

### Offboarding
- Authorized HR initiates case.
- Assign equipment, access revocation and knowledge-transfer checklist items.
- Record completion and approvals.
- Disable accounts according to approved timing.
- Preserve required business records and audit history.

## 7. Operations workflow

- Employee submits internal request with category, context and urgency.
- Operations assigns owner and target date.
- Requester sees status and updates.
- Purchase requests require an explicit approval path and budget authority.
- Vendor and asset records are visible only to authorized roles.
- Completion includes a resolution note.

## 8. Finance administration workflow

- Employee submits expense with amount, currency, category, date and evidence.
- Authorized approver reviews and approves/rejects with reason.
- Finance updates payment status.
- Audit history records submission and decisions.
- Store amounts in minor units and currency.
- This is an administrative tracking workflow, not full accounting or tax filing.

## 9. Company Hub publishing workflow

1. Authorized editor creates draft.
2. Editor selects audience.
3. Authorized publisher reviews and publishes.
4. Content becomes visible only to its intended audience.
5. Updates create a new version or revision history.
6. Content can be archived/unpublished without destroying history.
7. Notifications are sent only to authorized audience members.

## 10. Management overview

Management dashboard may show:
- open/overdue/unassigned work by department
- pending handovers and acknowledgement age
- project status and blockers
- sales pipeline aggregates
- pending approvals
- onboarding progress aggregates

It must not expose private HR documents, sensitive employee fields, private notes or restricted finance records merely because a user has a management role.

## 11. Workflow acceptance test scenarios

- Sales intern assigns a follow-up; sales head sees and acknowledges it.
- Sales creates a handover; Technology receiver accepts it.
- Sender attempts to mark handover accepted; server rejects.
- Receiver requests clarification; sender sees the reason and can respond.
- Employee attempts to read another employee's restricted HR document; access is denied.
- Management user opens company overview; only permitted aggregates appear.
- User changes a record ID in a URL/API request; unauthorized access is denied.
- A notification fails to deliver; the underlying task/handover remains intact.
- A policy draft is not visible to employees until published to their audience.
