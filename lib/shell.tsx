import { Building2 } from "lucide-react";
import { requireUser } from "./auth";
import { db } from "./db";
import SignOutButton from "./signout";
import { NavItem, ShellFrame } from "./shell-client";
import { isSalesMember } from "./leads";
import { isHrHead } from "./leave";
import { canViewPipelineSummary } from "./pipeline";
import { canManageCases } from "./checklists";
import { Avatar } from "./ui";

export async function Shell({ children, allowPasswordChange }: { children: React.ReactNode; allowPasswordChange?: boolean }) {
  const user = await requireUser({ allowPasswordChange });
  const unread = await db.notification.count({ where: { userId: user.id, readAt: null } });
  const awaitingHandovers = await db.handover.count({ where: { receiverId: user.id, status: "PENDING" } });
  const openCaseItems = await db.caseItem.count({ where: { ownerId: user.id, status: "OPEN", case: { status: "OPEN", subjectId: { not: user.id } } } });
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
          <NavItem href="/holidays" label="Holidays" icon="holidays" />
          {isHrHead(user) && <NavItem href="/hr" label="HR overview" icon="hr" />}
          {(canManageCases(user) || openCaseItems > 0) && <NavItem href="/checklists" label="Checklists" icon="checklists" count={openCaseItems} countLabel="assigned to you" />}
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
