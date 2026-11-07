import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { TaskTable } from "@/lib/task-ui";
import { PageHeader } from "@/lib/ui";
import { OPEN_STATUSES, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, todayStr, visibleTaskWhere } from "@/lib/tasks";

export const dynamic = "force-dynamic";
const PAGE = 25;

type SP = { scope?: string; status?: string; priority?: string; overdue?: string; due?: string; page?: string };

export default async function Tasks({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const scope = ["assigned", "created", "all"].includes(searchParams.scope ?? "") ? searchParams.scope! : "assigned";
  const status = searchParams.status ?? "open";
  const priority = (PRIORITIES as readonly string[]).includes(searchParams.priority ?? "") ? searchParams.priority : "";
  const overdueOnly = searchParams.overdue === "1";
  const dueWeek = searchParams.due === "week";
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);

  const and: Prisma.TaskWhereInput[] = [visibleTaskWhere(user)];
  if (scope === "assigned") and.push({ assigneeId: user.id });
  if (scope === "created") and.push({ creatorId: user.id });
  if (status === "open") and.push({ status: { in: [...OPEN_STATUSES] } });
  else if ((STATUSES as readonly string[]).includes(status)) and.push({ status: status as (typeof STATUSES)[number] });
  if (priority) and.push({ priority: priority as (typeof PRIORITIES)[number] });
  if (overdueOnly) and.push({ status: { in: [...OPEN_STATUSES] }, dueAt: { lt: new Date(`${todayStr()}T00:00:00.000Z`) } });
  if (dueWeek) {
    const start = new Date(`${todayStr()}T00:00:00.000Z`);
    and.push({ status: { in: [...OPEN_STATUSES] }, dueAt: { gte: start, lt: new Date(start.getTime() + 7 * 86_400_000) } });
  }
  const where: Prisma.TaskWhereInput = { AND: and };

  const [rows, total] = await Promise.all([
    db.task.findMany({
      where, include: { assignee: { select: { displayName: true } } },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE, take: PAGE,
    }),
    db.task.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    const m = { scope, status, priority: priority ?? "", overdue: overdueOnly ? "1" : "", due: dueWeek ? "week" : "", page: "1", ...over };
    for (const [k, v] of Object.entries(m)) if (v) p.set(k, String(v));
    return `/tasks?${p.toString()}`;
  };

  const from = total === 0 ? 0 : (page - 1) * PAGE + 1;
  const to = Math.min(page * PAGE, total);
  const scopes = [["assigned", "Assigned to me"], ["created", "Created by me"], ["all", "Everything I can see"]] as const;
  const filtered = status !== "open" || !!priority || overdueOnly || dueWeek;

  return (
    <Shell>
      <PageHeader
        title="Tasks"
        description="Tasks you own, created, or can see as a department head."
        actions={<Link className="btn" href="/tasks/new"><Plus className="ic" aria-hidden="true" />New task</Link>}
      />
      <nav aria-label="Task scope">
        <div className="segmented">
          {scopes.map(([v, label]) => (
            <Link key={v} href={qs({ scope: v })} aria-current={scope === v ? "true" : undefined}>{label}</Link>
          ))}
        </div>
      </nav>
      <form method="get" className="panel filters" aria-label="Filter tasks">
        <input type="hidden" name="scope" value={scope} />
        <div className="field"><label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status}>
            <option value="open">Open</option>
            <option value="all">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select></div>
        <div className="field"><label htmlFor="priority">Priority</label>
          <select id="priority" name="priority" defaultValue={priority ?? ""}>
            <option value="">Any</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select></div>
        <div className="field check-field">
          <label className="check"><input type="checkbox" name="overdue" value="1" defaultChecked={overdueOnly} /> Overdue only</label></div>
        <div className="field check-field">
          <label className="check"><input type="checkbox" name="due" value="week" defaultChecked={dueWeek} /> Due in 7 days</label></div>
        <div className="btn-row">
          <button type="submit">Apply</button>
          {filtered && <Link className="btn ghost" href={`/tasks?scope=${scope}`}>Clear</Link>}
        </div>
      </form>
      <TaskTable rows={rows} empty="No tasks match these filters.">
        <div className="table-foot">
          <span className="num">{total === 0 ? "0 tasks" : `Showing ${from}–${to} of ${total} task${total === 1 ? "" : "s"}`}</span>
          {pages > 1 && (
            <nav className="pager" aria-label="Pagination">
              {page > 1 ? <Link className="btn quiet sm" href={qs({ page: String(page - 1) })}><ChevronLeft className="ic" aria-hidden="true" />Previous</Link> : null}
              <span className="num">Page {page} of {pages}</span>
              {page < pages ? <Link className="btn quiet sm" href={qs({ page: String(page + 1) })}>Next<ChevronRight className="ic" aria-hidden="true" /></Link> : null}
            </nav>
          )}
        </div>
      </TaskTable>
    </Shell>
  );
}
