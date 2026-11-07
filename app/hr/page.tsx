import Link from "next/link";
import { CalendarCheck, CalendarDays, ClipboardCheck, Hourglass, UserX } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { LeaveTable } from "@/lib/leave-ui";
import { PageHeader } from "@/lib/ui";
import { fmtDate, todayStr } from "@/lib/tasks";
import { isHrHead } from "@/lib/leave";
import { checklistSummary } from "@/lib/checklists";
import { untilLabel, upcomingHolidays } from "@/lib/holidays";

export const dynamic = "force-dynamic";

const SOON_DAYS = 14;

export default async function HrDashboard() {
  const user = await requireUser();
  if (!isHrHead(user)) redirect("/");
  const today = todayStr();
  const t = new Date(`${today}T00:00:00.000Z`);
  const soon = new Date(t.getTime() + SOON_DAYS * 86_400_000);
  const sel = { id: true, leaveType: true, startDate: true, endDate: true, status: true, requester: { select: { displayName: true } } } as const;

  const [pending, outToday, starting, holidays, openCases] = await Promise.all([
    db.leaveRequest.count({ where: { status: "PENDING" } }),
    db.leaveRequest.findMany({ where: { status: "APPROVED", startDate: { lte: t }, endDate: { gte: t } }, orderBy: { endDate: "asc" }, take: 50, select: sel }),
    db.leaveRequest.findMany({ where: { status: "APPROVED", startDate: { gt: t, lte: soon } }, orderBy: { startDate: "asc" }, take: 50, select: sel }),
    db.holiday.findMany({ where: { date: { gte: t } }, orderBy: { date: "asc" }, take: 5 }),
    db.peopleCase.findMany({ where: { status: "OPEN", subjectId: { not: user.id } }, take: 200, select: { type: true, items: { select: { status: true, dueAt: true } } } }),
  ]);
  const cl = checklistSummary(openCases, today);
  const next = upcomingHolidays(holidays, today, 1)[0];

  return (
    <Shell>
      <PageHeader title="HR overview" description="Read-only view of leave across the company. Decisions stay with each department head." />
      <div className="stats" style={{ marginBottom: "1.5rem" }}>
        <Link className="stat" href="/leave?view=all">
          <span className="stat-top">Awaiting a decision<Hourglass className="ic" aria-hidden="true" /></span>
          <span className="stat-num">{pending}</span><span className="stat-note">Pending leave requests</span>
        </Link>
        <div className="stat">
          <span className="stat-top">Out today<UserX className="ic" aria-hidden="true" /></span>
          <span className="stat-num">{outToday.length}</span><span className="stat-note">Approved leave in progress</span>
        </div>
        <div className="stat">
          <span className="stat-top">Starting soon<CalendarCheck className="ic" aria-hidden="true" /></span>
          <span className="stat-num">{starting.length}</span><span className="stat-note">Next {SOON_DAYS} days</span>
        </div>
        <Link className="stat" href="/checklists">
          <span className="stat-top">Checklists<ClipboardCheck className="ic" aria-hidden="true" /></span>
          <span className="stat-num">{cl.openCases}</span>
          <span className="stat-note">{cl.openSteps} open steps · {cl.overdueSteps} overdue</span>
        </Link>
        <Link className="stat" href="/holidays">
          <span className="stat-top">Next holiday<CalendarDays className="ic" aria-hidden="true" /></span>
          <span className="stat-num" style={{ fontSize: "1.1rem" }}>{next ? fmtDate(next.date) : "None set"}</span>
          <span className="stat-note">{next ? `${next.name} · ${untilLabel(next.date.toISOString().slice(0, 10), today)}` : "Add the calendar"}</span>
        </Link>
      </div>
      <h2 style={{ margin: "1.5rem 0 .75rem" }}>Out today</h2>
      <LeaveTable rows={outToday} showPerson empty="Nobody is on approved leave today." />
      <h2 style={{ margin: "1.5rem 0 .75rem" }}>Starting in the next {SOON_DAYS} days</h2>
      <LeaveTable rows={starting} showPerson empty="No approved leave starts in this window." />
    </Shell>
  );
}
