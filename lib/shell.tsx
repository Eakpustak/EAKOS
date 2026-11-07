import { Building2 } from "lucide-react";
import { requireUser } from "./auth";
import { db } from "./db";
import SignOutButton from "./signout";
import { NavItem, ShellFrame } from "./shell-client";
import { isSalesMember } from "./leads";
import { isHrHead } from "./leave";
import { canViewPipelineSummary } from "./pipeline";
import { canManageCases } from "./checklists";
import { isDocHrHead } from "./documents";
import { canViewVendors } from "./vendors";
import { canViewRecords } from "./finance-records";
import { attentionCount, canViewRenewals } from "./renewals";
import { todayStr } from "./tasks";
import { canViewAssets, isTechHead } from "./assets";
import { Avatar } from "./ui";

export async function Shell({ children, allowPasswordChange }: { children: React.ReactNode; allowPasswordChange?: boolean }) {
  const user = await requireUser({ allowPasswordChange });
  const unread = await db.notification.count({ where: { userId: user.id, readAt: null } });
  const awaitingHandovers = await db.handover.count({ where: { receiverId: user.id, status: "PENDING" } });
  const openCaseItems = await db.caseItem.count({ where: { ownerId: user.id, status: "OPEN", case: { status: "OPEN", subjectId: { not: user.id } } } });
  const assignedService = await db.serviceRequest.count({ where: { assigneeId: user.id, requesterId: { not: user.id }, status: { in: ["OPEN", "IN_PROGRESS"] } } });
  // No scheduler yet: the sidebar count is computed here, only for people who may read renewals.
  const renewalRows = canViewRenewals(user) ? await db.renewal.findMany({ where: { status: "ACTIVE" }, select: { status: true, renewalDate: true, reminderDays: true }, take: 500 }) : [];
  const renewalsAttention = attentionCount(renewalRows.map((r) => ({ status: r.status, renewalDate: r.renewalDate.toISOString().slice(0, 10), reminderDays: r.reminderDays })), todayStr());
  // Technology only: unresolved incidents assigned to me, plus unassigned ones for the head.
  const openIncidents = canViewAssets(user) ? await db.incident.count({ where: { status: { not: "RESOLVED" }, OR: [{ assigneeId: user.id }, ...(isTechHead(user) ? [{ assigneeId: null }] : [])] } }) : 0;
  const ownDocs = await db.employeeDocument.count({ where: { subjectId: user.id } });
  const primary = user.memberships.find((m) => m.isPrimary) ?? user.memberships[0];

  const sidebar = (
    <>
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">EP</span>
        <span className="brand-name">EAK PUSTAK<small>Workspace</small></span>
      </div>
      <div className="workspace-chip">
        <Building2 className="ic" aria-hidden="true" />
        <div><b>{primary?.department.name ?? "No department"}</b><span>{user.memberships.length > 1 ? `+${user.memberships.length - 1} more` : "Your department"}</span></div>
      </div>
      <nav aria-label="Main" className="nav-group">
        <div className="nav">
          <NavItem href="/" label="My work" icon="work" />
          <NavItem href="/tasks" label="Tasks" icon="tasks" />
          <NavItem href="/handovers" label="Handovers" icon="handovers" count={awaitingHandovers} countLabel="awaiting your response" />
          <NavItem href="/projects" label="Projects" icon="projects" />
          <NavItem href="/leave" label="Leave" icon="leave" />
          <NavItem href="/expenses" label="Expenses" icon="expenses" />
          <NavItem href="/purchases" label="Purchases" icon="purchases" />
          <NavItem href="/service-requests" label="Service requests" icon="service" count={assignedService} countLabel="assigned to you" />
          {canViewVendors(user) && <NavItem href="/vendors" label="Vendors" icon="vendors" />}
          {canViewRecords(user) && <NavItem href="/invoices" label="Invoices & quotes" icon="invoices" />}
          {canViewRenewals(user) && <NavItem href="/renewals" label="Renewals" icon="renewals" count={renewalsAttention} countLabel="due soon or overdue" />}
          {canViewAssets(user) && <NavItem href="/assets" label="Technical assets" icon="assets" />}
          {canViewAssets(user) && <NavItem href="/incidents" label="Incidents" icon="incidents" count={openIncidents} countLabel="need your attention" />}
          {canViewAssets(user) && <NavItem href="/releases" label="Releases" icon="releases" />}
          {canViewAssets(user) && <NavItem href="/hub?type=POLICY&dept=technology" label="Technical SOPs" icon="hub" />}
          <NavItem href="/holidays" label="Holidays" icon="holidays" />
          {isHrHead(user) && <NavItem href="/hr" label="HR overview" icon="hr" />}
          {(canManageCases(user) || openCaseItems > 0) && <NavItem href="/checklists" label="Checklists" icon="checklists" count={openCaseItems} countLabel="assigned to you" />}
          {(isDocHrHead(user) || ownDocs > 0) && <NavItem href="/documents" label={isDocHrHead(user) ? "Employee documents" : "Your documents"} icon="documents" />}
          <NavItem href="/hub" label="Company hub" icon="hub" />
          {isSalesMember(user) && <NavItem href="/leads" label="Leads" icon="leads" />}
          {canViewPipelineSummary(user) && <NavItem href="/pipeline" label="Pipeline summary" icon="pipeline" />}
          <NavItem href="/notifications" label="Notifications" icon="bell" count={unread} />
          <NavItem href="/directory" label="Directory" icon="people" />
          <NavItem href="/settings" label="Account settings" icon="settings" />
        </div>
      </nav>
      {user.systemRole === "ADMIN" && (
        <nav aria-label="Administration" className="nav-group">
          <div className="nav-label">Administration</div>
          <div className="nav"><NavItem href="/admin/users" label="Manage people" icon="admin" /></div>
        </nav>
      )}
      <div className="sidebar-foot">
        <Avatar name={user.displayName} />
        <div className="who"><b>{user.displayName}</b><span>{user.email}</span></div>
        <SignOutButton />
      </div>
    </>
  );
  return <ShellFrame sidebar={sidebar}>{children}</ShellFrame>;
}
