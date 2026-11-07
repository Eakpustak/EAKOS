import Link from "next/link";
import { AlertTriangle, ClipboardList, Clock, Handshake, Inbox, Bell, OctagonAlert, CalendarClock } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TaskTable } from "@/lib/task-ui";
import { HandoverTable } from "@/lib/handover-ui";
import { PageHeader } from "@/lib/ui";
import { OPEN_STATUSES, todayStr } from "@/lib/tasks";
import { ackCutoff, ackWindowHours } from "@/lib/handovers";

export const dynamic = "force-dynamic";

/** "My work": everything that is mine and needs attention. Every number is a real count that links to the list behind it. */
export default async function MyWork() {
  const user = await requireUser();
  const start = new Date(`${todayStr()}T00:00:00.000Z`);
  const weekEnd = new Date(start.getTime() + 7 * 86_400_000);
  const open = { assigneeId: user.id, status: { in: [...OPEN_STATUSES] } };
  const hours = ackWindowHours();

  const [openCount, overdue, dueWeek, blocked, unread, rows, handoverRows, awaitingMe, sentLate] = await Promise.all([
    db.task.count({ where: open }),
    db.task.count({ where: { ...open, dueAt: { lt: start } } }),
    db.task.count({ where: { ...open, dueAt: { gte: start, lt: weekEnd } } }),
    db.task.count({ where: { assigneeId: user.id, status: "BLOCKED" } }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.task.findMany({
      where: open, include: { assignee: { select: { displayName: true } } },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: 8,
    }),
    db.handover.findMany({
      where: { receiverId: user.id, status: "PENDING" },
      include: {
        sender: { select: { displayName: true } }, receiver: { select: { displayName: true } },
        fromDepartment: { select: { name: true } }, toDepartment: { select: { name: true } },
      },
      orderBy: { sentAt: "asc" }, take: 5,
    }),
    db.handover.count({ where: { receiverId: user.id, status: "PENDING" } }),
    db.handover.count({ where: { senderId: user.id, status: "PENDING", sentAt: { lt: ackCutoff(new Date(), hours) } } }),
  ]);

  return (
    <Shell>
      <PageHeader title="My work" description={`Hello ${user.displayName.split(" ")[0]}. Here is what needs your attention.`} />
      <div className="stats">
        <Link className="stat" href="/tasks"><span className="stat-top">Open tasks<ClipboardList className="ic" aria-hidden="true" /></span><span className="stat-num">{openCount}</span><span className="stat-note">Assigned to you</span></Link>
        <Link className={`stat${overdue ? " bad" : ""}`} href="/tasks?overdue=1"><span className="stat-top">Overdue<AlertTriangle className="ic" aria-hidden="true" /></span><span className="stat-num">{overdue}</span><span className="stat-note">Past due date</span></Link>
        <Link className="stat" href="/tasks?due=week"><span className="stat-top">Due in 7 days<CalendarClock className="ic" aria-hidden="true" /></span><span className="stat-num">{dueWeek}</span><span className="stat-note">Coming up</span></Link>
        <Link className={`stat${blocked ? " warn" : ""}`} href="/tasks?status=BLOCKED"><span className="stat-top">Blocked<OctagonAlert className="ic" aria-hidden="true" /></span><span className="stat-num">{blocked}</span><span className="stat-note">Waiting on something</span></Link>
        <Link className={`stat${awaitingMe ? " warn" : ""}`} href="/handovers?scope=incoming&status=PENDING"><span className="stat-top">Handovers to answer<Inbox className="ic" aria-hidden="true" /></span><span className="stat-num">{awaitingMe}</span><span className="stat-note">Need your response</span></Link>
        <Link className={`stat${sentLate ? " bad" : ""}`} href="/handovers?scope=outgoing&status=PENDING&ack=overdue"><span className="stat-top">Sent, unanswered<Clock className="ic" aria-hidden="true" /></span><span className="stat-num">{sentLate}</span><span className="stat-note">No reply in {hours}h</span></Link>
        <Link className={`stat${unread ? " warn" : ""}`} href="/notifications"><span className="stat-top">Unread<Bell className="ic" aria-hidden="true" /></span><span className="stat-num">{unread}</span><span className="stat-note">Notifications</span></Link>
      </div>

      {handoverRows.length > 0 && (
        <section aria-labelledby="ho-h" style={{ marginTop: "2rem" }}>
          <h2 id="ho-h" style={{ fontSize: "1.05rem", margin: "0 0 .75rem" }}><Handshake className="ic" aria-hidden="true" style={{ verticalAlign: "-.15em", marginRight: ".4rem" }} />Handovers waiting for you</h2>
          <HandoverTable rows={handoverRows} empty="" />
        </section>
      )}

      <section aria-labelledby="tasks-h" style={{ marginTop: "2rem" }}>
        <h2 id="tasks-h" style={{ fontSize: "1.05rem", margin: "0 0 .75rem" }}>Your open tasks</h2>
        <TaskTable rows={rows} empty="You have no open tasks. Create one or ask a colleague to assign you work." />
        {openCount > rows.length && <p style={{ marginTop: ".75rem" }}><Link href="/tasks">See all {openCount} open tasks</Link></p>}
      </section>
    </Shell>
  );
}
