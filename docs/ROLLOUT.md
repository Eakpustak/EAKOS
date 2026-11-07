# Rollout, rollback and known limitations
## EAK PUSTAK Workspace (PHASES 9)

Status: written 2026-11-29. **Nothing in phases 3-8 has been built or run against a database yet** (see `MEMORY.md`). Do not roll out to staff until Part 1 is done.

## 1. Before anyone outside the team signs in

Run on a machine with network access and Docker (the VM, or a laptop):

1. `npm ci && npm run lint && npm run build && npm test` (expect 202 passing tests; fix any type error first, the pages and server actions have never been compiled).
2. `docker compose up -d --build`. The app applies all 21 migrations on start. If it will not start, read `docker compose logs app`: a failing migration names the file and the CHECK or foreign key.
3. `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <scratch url> --exit-code` must print no difference.
4. Click through each module with at least four test accounts: an Administrator, a department head, an ordinary member, and someone in a different department. The checklist for each module is the **Next action** at the end of its section in `MEMORY.md`. The negative checks matter most: change an ID in the address bar and confirm you are redirected, never shown the record.
5. Take a backup, then run `./restore.sh` on a scratch copy (or on the VM after hours) with the database dump AND the documents archive from the same night. Sign in, open an employee document. A backup that has not been restored once is not a backup.
6. Copy `backups/` off the VM (OCI Object Storage, rclone). Nightly dumps on the same disk do not survive losing the disk.
7. Change the bootstrap administrator's temporary password (the app forces this at first sign-in) and remove `ADMIN_PASSWORD` from `.env` afterwards.

## 2. Confirm with stakeholders (assumptions currently in the code)

These are decisions the code made so it could be built. Each is listed in the section named. Get a yes or a change before go-live.

| Topic | Assumed | See MEMORY |
|---|---|---|
| Who counts as "management" | Management head + Sales head see the pipeline summary | 21 |
| Leave | Placeholder types, no balances, calendar days, approver = department head else Management head | 19 |
| Checklists | Placeholder templates; only the HR head runs them | 22 |
| Employee documents | Employee reads own; HR head reads all and adds/removes; nobody else, including admins | 24 |
| Expenses / purchases | Approver = department head else Management head; Finance records payment; Operations orders | 25, 27 |
| Who sees vendors, invoices, renewals | Heads of Operations and Finance & Administration | 26, 29, 30 |
| Technology records | Any Technology member reads; the head manages; creator or head records release outcomes | 31-34 |
| Production releases | No second-person confirmation | 33 |
| Notifications | In-app only, generic text | 14 |

## 3. Rollout order

Do not open every module at once.

1. Week 1: administrators and department heads only. Accounts, directory, tasks, handovers.
2. Week 2: all staff on tasks, handovers, hub, leave, holidays. One department at a time for UAT; record what confused people.
3. Later: sales (leads, projects), HR (checklists, documents), finance and operations, technology records, each only after that department has signed off its workflow.

## 4. Rollback

| Situation | Action |
|---|---|
| New release fails its health check | `./update.sh` rolls the code back automatically and prints the restore command for its pre-update database backup. |
| New release starts but is wrong | `git checkout <previous commit> && docker compose up -d --build`. Migrations only add tables and columns, so the older code runs against the newer schema; do not drop anything by hand. |
| Data is damaged or the wrong thing was restored | `./restore.sh backups/<dump>.sql.gz backups/documents-<stamp>.tar.gz`. It saves the current database to `backups/pre-restore-<stamp>.sql.gz` first and refuses unreadable archives before changing anything. |
| A module must be switched off | There is no feature flag. Remove its link from `lib/shell.tsx` and redeploy; the pages still enforce access themselves, so a hidden link is not a security control (RULES 2.4) and the route should also be removed if the module is to be unreachable. |

## 5. Known limitations (as of this document)

- **Never run against a database or a browser:** everything from phase 3 onward (see Part 1).
- **No scheduler:** nothing reminds or escalates. Unacknowledged handovers, overdue follow-ups, undecided leave, due renewals and unpaid invoices are only shown when someone opens a page.
- **No email.** Notifications are in-app only. Forgotten passwords are reset by an administrator.
- **No login throttling**, two-factor sign-in or session list.
- **Tests:** access rules and state machines are unit-tested as pure functions. There are no database-backed authorization tests yet, and no end-to-end tests.
- **Files:** employee documents only (PDF, PNG, JPEG, 5 MB). No malware scanning, no retention timers, no attachments on tasks, expenses or invoices.
- **Money:** integer minor units with a currency; no accounting, no GST, no cross-currency totals, no spending limits or budgets.
- **Secrets check** on Technology records is a heuristic, not a guarantee.
- **Not built:** monitoring and error reporting, performance and accessibility review, rich text in the hub, editing a lead's or project's details after creation, handover reassignment, team leave calendar, in-app admin editing of checklist templates, leave types and expense categories.
