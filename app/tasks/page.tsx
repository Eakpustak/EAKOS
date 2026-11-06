import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TaskTable } from "@/lib/task-ui";
import { OPEN_STATUSES, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, todayStr, visibleTaskWhere } from "@/lib/tasks";

export const dynamic = "force-dynamic";
const PAGE = 25;

type SP = { scope?: string; status?: string; priority?: string; overdue?: string; page?: string };

export default async function Tasks({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const scope = ["assigned", "created", "all"].includes(searchParams.scope ?? "") ? searchParams.scope! : "assigned";
  const status = searchParams.status ?? "open";
  const priority = (PRIORITIES as readonly string[]).includes(searchParams.priority ?? "") ? searchParams.priority : "";
  const overdueOnly = searchParams.overdue === "1";
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);

  const and: Prisma.TaskWhereInput[] = [visibleTaskWhere(user)];
  if (scope === "assigned") and.push({ assigneeId: user.id });
  if (scope === "created") and.push({ creatorId: user.id });
  if (status === "open") and.push({ status: { in: [...OPEN_STATUSES] } });
  else if ((STATUSES as readonly string[]).includes(status)) and.push({ status: status as (typeof STATUSES)[number] });
  if (priority) and.push({ priority: priority as (typeof PRIORITIES)[number] });
  if (overdueOnly) and.push({ status: { in: [...OPEN_STATUSES] }, dueAt: { lt: new Date(`${todayStr()}T00:00:00.000Z`) } });
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
    const m = { scope, status, priority: priority ?? "", overdue: overdueOnly ? "1" : "", page: "1", ...over };
    for (const [k, v] of Object.entries(m)) if (v) p.set(k, String(v));
    return `/tasks?${p.toString()}`;
  };

  return (
    <Shell>
      <h1>Tasks</h1>
      <p className="sub">Tasks you own, created, or can see as a department head.</p>
      <p><Link className="btn" href="/tasks/new">New task</Link></p>
      <form method="get" className="panel filters">
        <div><label htmlFor="scope">Show</label>
          <select id="scope" name="scope" defaultValue={scope}>
            <option value="assigned">Assigned to me</option>
            <option value="created">Created by me</option>
            <option value="all">Everything I can see</option>
          </select></div>
        <div><label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status}>
            <option value="open">Open</option>
            <option value="all">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select></div>
        <div><label htmlFor="priority">Priority</label>
          <select id="priority" name="priority" defaultValue={priority ?? ""}>
            <option value="">Any</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select></div>
        <div><label><input type="checkbox" name="overdue" value="1" defaultChecked={overdueOnly} style={{ width: "auto" }} /> Overdue only</label>
          <button type="submit">Apply</button></div>
      </form>
      <h2>{total} task{total === 1 ? "" : "s"}</h2>
      <TaskTable rows={rows} empty="No tasks match these filters." />
      {pages > 1 && (
        <p className="pager">
          {page > 1 && <Link href={qs({ page: String(page - 1) })}>Previous</Link>}{" "}
          Page {page} of {pages}{" "}
          {page < pages && <Link href={qs({ page: String(page + 1) })}>Next</Link>}
        </p>
      )}
    </Shell>
  );
}
