import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ChevronLeft, ChevronRight, Clock, Inbox, Plus, Send, TimerOff } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { HandoverTable } from "@/lib/handover-ui";
import { Flash } from "@/lib/task-ui";
import { PageHeader } from "@/lib/ui";
import {
  ACTIVE_HANDOVER_STATUSES, HANDOVER_STATUSES, HANDOVER_STATUS_LABEL, type HandoverStatus,
  ackCutoff, ackWindowHours, visibleHandoverWhere,
} from "@/lib/handovers";
import { todayStr } from "@/lib/tasks";

export const dynamic = "force-dynamic";
const PAGE = 25;

type SP = { scope?: string; status?: string; ack?: string; overdue?: string; page?: string; error?: string; ok?: string };

export default async function Handovers({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const scope = ["incoming", "outgoing", "all"].includes(searchParams.scope ?? "") ? searchParams.scope! : "incoming";
  const status = searchParams.status ?? "active";
  const ackOverdue = searchParams.ack === "overdue";
  const dueOverdue = searchParams.overdue === "1";
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const hours = ackWindowHours();
  const cutoff = ackCutoff(new Date(), hours);
  const todayStart = new Date(`${todayStr()}T00:00:00.000Z`);

  const visible = visibleHandoverWhere(user);
  const overdueAck: Prisma.HandoverWhereInput = { status: "PENDING", sentAt: { lt: cutoff } };
  const overdueWork: Prisma.HandoverWhereInput = { status: "ACCEPTED", dueAt: { lt: todayStart } };

  const and: Prisma.HandoverWhereInput[] = [visible];
  if (scope === "incoming") and.push({ receiverId: user.id });
  if (scope === "outgoing") and.push({ senderId: user.id });
  if (status === "active") and.push({ status: { in: ACTIVE_HANDOVER_STATUSES } });
  else if ((HANDOVER_STATUSES as readonly string[]).includes(status)) and.push({ status: status as HandoverStatus });
  if (ackOverdue) and.push(overdueAck);
  if (dueOverdue) and.push(overdueWork);
  const where: Prisma.HandoverWhereInput = { AND: and };

  const [rows, total, awaitingMe, sentWaiting, unackedLate, workLate] = await Promise.all([
    db.handover.findMany({
      where,
      include: {
        sender: { select: { displayName: true } }, receiver: { select: { displayName: true } },
        fromDepartment: { select: { name: true } }, toDepartment: { select: { name: true } },
      },
      orderBy: [{ sentAt: "asc" }],
      skip: (page - 1) * PAGE, take: PAGE,
    }),
    db.handover.count({ where }),
    db.handover.count({ where: { receiverId: user.id, status: "PENDING" } }),
    db.handover.count({ where: { senderId: user.id, status: { in: ["PENDING", "CLARIFICATION_REQUESTED"] } } }),
    db.handover.count({ where: { AND: [visible, overdueAck] } }),
    db.handover.count({ where: { AND: [visible, overdueWork] } }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    const m = { scope, status, ack: ackOverdue ? "overdue" : "", overdue: dueOverdue ? "1" : "", page: "1", ...over };
    for (const [k, v] of Object.entries(m)) if (v) p.set(k, String(v));
    return `/handovers?${p.toString()}`;
  };
  const from = total === 0 ? 0 : (page - 1) * PAGE + 1;
  const to = Math.min(page * PAGE, total);
  const scopes = [["incoming", "Sent to me"], ["outgoing", "Sent by me"], ["all", "Everything I can see"]] as const;
  const filtered = status !== "active" || ackOverdue || dueOverdue;

  return (
    <Shell>
      <PageHeader
        title="Handovers"
        description="Work passed between departments. A handover is only accepted when the named receiver says so; a message or notification is not acknowledgement."
        actions={<Link className="btn" href="/handovers/new"><Plus className="ic" aria-hidden="true" />New handover</Link>}
      />
      <Flash error={searchParams.error} ok={searchParams.ok} />

      <div className="stats" style={{ marginBottom: "1.5rem" }}>
        <Link className={`stat${awaitingMe > 0 ? " warn" : ""}`} href="/handovers?scope=incoming&status=PENDING">
          <span className="stat-top">Needs my response<Inbox className="ic" aria-hidden="true" /></span>
          <span className="stat-num">{awaitingMe}</span>
          <span className="stat-note">Waiting for you to accept or reply</span>
        </Link>
        <Link className="stat" href="/handovers?scope=outgoing">
          <span className="stat-top">Sent, not settled<Send className="ic" aria-hidden="true" /></span>
          <span className="stat-num">{sentWaiting}</span>
          <span className="stat-note">Awaiting the receiver</span>
        </Link>
        <Link className={`stat${unackedLate > 0 ? " bad" : ""}`} href="/handovers?scope=all&ack=overdue">
          <span className="stat-top">Not acknowledged<Clock className="ic" aria-hidden="true" /></span>
          <span className="stat-num">{unackedLate}</span>
          <span className="stat-note">Unanswered for over {hours}h</span>
        </Link>
        <Link className={`stat${workLate > 0 ? " bad" : ""}`} href="/handovers?scope=all&overdue=1">
          <span className="stat-top">Overdue<TimerOff className="ic" aria-hidden="true" /></span>
          <span className="stat-num">{workLate}</span>
          <span className="stat-note">Accepted, past due date</span>
        </Link>
      </div>

      <nav aria-label="Handover scope">
        <div className="segmented">
          {scopes.map(([v, label]) => (
            <Link key={v} href={qs({ scope: v })} aria-current={scope === v ? "true" : undefined}>{label}</Link>
          ))}
        </div>
      </nav>
      <form method="get" className="panel filters" aria-label="Filter handovers">
        <input type="hidden" name="scope" value={scope} />
        <div className="field"><label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status}>
            <option value="active">Active</option>
            <option value="all">All</option>
            {HANDOVER_STATUSES.map((s) => <option key={s} value={s}>{HANDOVER_STATUS_LABEL[s]}</option>)}
          </select></div>
        <div className="field check-field">
          <label className="check"><input type="checkbox" name="ack" value="overdue" defaultChecked={ackOverdue} /> Not acknowledged in time</label></div>
        <div className="field check-field">
          <label className="check"><input type="checkbox" name="overdue" value="1" defaultChecked={dueOverdue} /> Overdue</label></div>
        <div className="btn-row">
          <button type="submit">Apply</button>
          {filtered && <Link className="btn ghost" href={`/handovers?scope=${scope}`}>Clear</Link>}
        </div>
      </form>

      <HandoverTable rows={rows} empty={filtered ? "No handovers match these filters." : "No handovers here yet. Create one when work needs to move to another department."}>
        <div className="table-foot">
          <span className="num">{total === 0 ? "0 handovers" : `Showing ${from}–${to} of ${total} handover${total === 1 ? "" : "s"}`}</span>
          {pages > 1 && (
            <nav className="pager" aria-label="Pagination">
              {page > 1 ? <Link className="btn quiet sm" href={qs({ page: String(page - 1) })}><ChevronLeft className="ic" aria-hidden="true" />Previous</Link> : null}
              <span className="num">Page {page} of {pages}</span>
              {page < pages ? <Link className="btn quiet sm" href={qs({ page: String(page + 1) })}>Next<ChevronRight className="ic" aria-hidden="true" /></Link> : null}
            </nav>
          )}
        </div>
      </HandoverTable>
    </Shell>
  );
}
