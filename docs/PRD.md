# Product Requirements Document (PRD)
## EAK PUSTAK Workspace

- Status: Draft for validation
- Product: EAK PUSTAK Workspace
- Release target: V1 internal company portal
- Primary audience: employees, department heads and company management

## 1. Product vision

Provide one reliable place for employees to understand their work, coordinate with other departments, find company information and complete routine internal processes.

The portal should reduce missed meetings, forgotten follow-ups, unclear ownership, unacknowledged handovers and information scattered across chats and spreadsheets.

## 2. Problem statement

The company needs a shared operating layer across Management, Technology, HR, Sales & Marketing, Operations, and Finance & Administration. A generic employee dashboard is insufficient: departments need different tools and permissions, while cross-department work must remain connected.

The product must make the following questions easy to answer:

- Who owns this task, lead, request or project?
- What is its current status and deadline?
- Has the receiving person acknowledged a handover?
- What is waiting on me or my department?
- Where is the latest approved company policy or announcement?
- Who can access this record, and why?

## 3. Goals and measurable outcomes

### Goals

1. Centralize company coordination without forcing every department into the same workflow.
2. Establish accountable task ownership and handover acknowledgement.
3. Give employees a clear personal workspace.
4. Give department heads actionable workload visibility.
5. Give management a cross-company operational overview without unrestricted access to sensitive HR data.
6. Establish a foundation that supports new departments and modules.

### Suggested success measures

Baseline these before launch; do not invent current performance.

- Percentage of active tasks with an owner and due date.
- Percentage of handovers acknowledged within the expected time.
- Number of overdue and unassigned work items.
- Percentage of employees who can find current policies and announcements.
- Time from lead creation to first assigned follow-up.
- Weekly active employee usage.
- Number of missed or duplicated internal requests.

## 4. Non-goals for V1

- Replacing GitHub, GitLab or source-code review tools.
- Full accounting, GST filing, payroll or statutory compliance.
- Building a complete HRIS or enterprise recruitment suite.
- Full attendance hardware/biometric integrations.
- Replacing email, chat, video meetings or calendar providers.
- Public customer-facing CRM portal.
- Microservices, event streaming infrastructure or complex workflow builders.
- AI features that make decisions about employees or approvals.

## 5. Users and roles

Roles are authorization concepts, not hard-coded department names. A user may have a primary department and additional project memberships.

| Role | Typical access |
|---|---|
| Owner | Company-level operational oversight and explicitly granted sensitive access |
| Department Head | Manage permitted work and members within own department |
| HR Manager | HR administration and restricted employee records |
| Sales Head | Sales leads, assignments, pipeline and sales reporting |
| Tech Lead | Technical projects, tasks, assets and technical operations |
| Employee | Own work and resources explicitly shared with them |
| Intern | Assigned tasks and limited resources |
| System Administrator | Configure accounts and platform settings; sensitive business-data access is not automatic |

A person may hold more than one role. Access is the union of explicitly granted permissions, constrained by scope and sensitivity. Deny-by-default applies.

## 6. Product information architecture

### Global navigation

- Dashboard
- My Work
- People
- Departments
- CRM & Leads
- Projects
- Company Hub
- Notifications

### Administration

- Users & Permissions
- Portal Settings
- Audit Activity (authorized roles only)

### Department workspaces

**Management**
- Company overview
- Department workload
- Overdue and unassigned work
- Pending approvals
- Active projects and pipeline summaries
- Cross-team handovers

**Technology**
- Development projects and ownership
- Tasks, bugs and feature requests
- GitHub repository / issue / pull request links
- Deployment and release records
- Technical documentation and SOPs
- Infrastructure inventory
- Technical incident records

**Human Resources**
- Employee directory and profiles
- Onboarding and offboarding checklists
- Restricted employee documents
- Leave requests and approvals
- Company holidays
- Recruitment pipeline (later release)
- Policies and employee handbook

**Sales & Marketing**
- Lead database and ownership
- Customer interaction timeline
- Follow-up tasks and reminders
- Sales pipeline
- Meeting and call outcomes
- Proposal tracking
- Won/lost status
- Project handover to delivery teams

**Operations**
- Internal service requests
- Task coordination
- Purchase requests and approvals
- Vendor records
- Company asset inventory
- Client delivery tracking

**Finance & Administration**
- Expense submissions and approvals
- Invoice and quotation records
- Payment status tracking
- Subscription and renewal register
- Domain and hosting renewal reminders

Finance V1 is a lightweight administrative register, not an accounting ledger.

## 7. Functional requirements

Priority definitions:
- P0: required for a usable and safe initial release.
- P1: important next capabilities.
- P2: later capability; do not block V1.

### P0 — Foundation and coordination

**Identity and access**
- Secure sign-in and sign-out.
- User account lifecycle: invite, activate, suspend and deactivate.
- Department membership and primary department.
- Role and permission management.
- Server-side authorization on every protected operation.
- User profile and basic employee directory fields.

**Dashboard and personal work**
- Personal summary of assigned tasks, due dates, pending acknowledgements and notifications.
- Department-aware dashboard widgets.
- Useful empty, loading, error and permission-denied states.
- Filters for status, owner, department and due date where applicable.

**Tasks**
- Create, assign, reassign and update tasks.
- Required title, status and owner; due date where relevant.
- Priority, description, labels, comments and attachments subject to policy.
- Task activity history.
- Overdue and unassigned views.
- Users can see only tasks they are authorized to access.

**Handover**
- Create a handover from one department/person to another.
- Include context, deliverables, source record, requested owner and due date.
- Receiver must explicitly acknowledge, reject with reason, or request clarification.
- Track sender, receiver, timestamps, status and history.
- Sender cannot mark a handover as acknowledged on behalf of receiver.
- Escalation and reminders must be configurable, not silently assumed.

**Notifications**
- In-app notifications for assignments, mentions, handovers, approvals and due dates.
- Read/unread state and notification preferences.
- Notification delivery failure must not lose the underlying work item.

**Company Hub**
- Announcements.
- Policies and SOPs with publication status and version.
- Shared links and resources.
- Author, publisher, audience and publication dates.

**Auditability**
- Record important security and business events.
- Restrict audit-log access.
- Do not expose secrets or sensitive document contents in logs.

### P1 — Department operations

- Sales CRM: lead records, ownership, pipeline stages, interactions and follow-ups.
- Projects: project records, members, milestones and linked tasks.
- HR: leave requests, approvals, onboarding and offboarding checklists.
- CMS administration for announcements, policies and resources.
- Basic reporting for department heads and management.

### P2 — Extended operations

- Technology asset inventory, deployment history and incident logs.
- Expense submission and approval.
- Vendor register and purchase requests.
- Subscription, domain and hosting renewal tracking.
- Recruitment pipeline.
- External integrations and advanced reporting.

## 8. Core workflows

See [`WORKFLOWS.md`](WORKFLOWS.md) for state transitions and detailed flows.

Critical example:
1. Sales creates a school lead.
2. A named sales owner receives the follow-up.
3. Owner acknowledges the assignment.
4. Customer requests a website.
5. Sales creates a delivery handover to Technology.
6. Tech lead explicitly accepts or requests clarification.
7. Technology creates and completes delivery tasks.
8. Sales tracks client communication and delivery.
9. Management sees status and blockers, subject to permissions.

## 9. Screen inventory

### Shared
- Sign-in
- Forgot/reset password
- First-time account activation
- Dashboard
- My Work / task list
- Task detail
- Notifications
- Employee directory
- Employee profile (field-level restrictions)
- Department directory and department overview
- Company Hub
- Announcement detail
- Policy/resource detail
- Search (permission-aware)

### Administration
- User management
- Invite/edit user
- Role and permission management
- Department management
- Audit activity
- Portal settings

### Sales
- Lead list
- Lead detail and interaction timeline
- Pipeline board/list
- Follow-up task creation
- Handover creation and detail

### Technology
- Project list and detail
- Task/bug/feature list and detail
- Repository link management
- Release/deployment record
- Infrastructure asset list/detail
- Incident list/detail
- Technical documentation

### HR
- Employee administration
- Leave request list/detail
- Onboarding checklist
- Offboarding checklist
- Restricted document register

### Operations and Finance
- Internal request list/detail
- Purchase request and approval
- Expense list/submission/detail
- Invoice/quotation register
- Subscription and renewal register

A screen is not complete until its loading, empty, error, unauthorized and responsive states are considered.

## 10. Data ownership and privacy

- HR owns HR processes and restricted employee records.
- Sales owns lead and customer relationship records.
- Technology owns technical work and technical asset records.
- Operations owns internal service requests and operational asset processes.
- Finance owns expense and payment administration records.
- Management gets summary visibility by default, not unrestricted access to private records.
- The application must enforce record-level and field-level permissions server-side.

## 11. V1 acceptance criteria

V1 is ready for controlled internal use when:

1. An authorized administrator can invite users and assign departments/roles.
2. Users see only permitted workspaces and records.
3. A user can create and assign a task; the assignee sees it and its history.
4. A handover cannot become accepted without receiver action.
5. A handover's owner, due date, status and history are visible to authorized participants.
6. Notifications link to the relevant authorized record.
7. Company Hub content can be drafted, published and restricted to an audience.
8. Management summaries do not reveal restricted HR fields or documents.
9. Authorization tests cover both allowed and denied access paths.
10. Backup/restore, error handling, audit events and deployment checks are documented and tested.

## 12. Open product decisions

Do not silently guess these. Confirm before the relevant implementation:

- Existing application repository and framework.
- Authentication provider and email delivery.
- Initial employee count and exact department structure.
- Whether attendance is required at all.
- Leave types, leave balances and approval chain.
- Whether tasks may have multiple assignees or exactly one accountable owner.
- File storage provider, retention and allowed document types.
- Notification channels: in-app only, email, or both.
- Who can create departments and grant sensitive permissions.
- Data retention, privacy notice and applicable legal requirements.
