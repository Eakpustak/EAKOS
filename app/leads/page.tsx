import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { AlarmClock, Briefcase, CalendarX, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LeadTable } from "@/lib/lead-ui";
import { Flash } from "@/lib/task-ui";
import { EmptyState, PageHeader } from "@/lib/ui";
import { LEAD_STAGES, OPEN_STAGES, STAGE_LABEL, canCreateLead, isSalesHead, isSalesMember, visibleLeadWhere } from "@/lib/leads";
import { todayStr } from "@/lib/tasks";

export const dynamic = "force-dynamic";
const PAGE = 25;

type SP = { scope?: string; stage?: string; fu?: string; q?: string; page?: string; error?: string; ok?: string };

export default async function Leads({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  if (!isSalesMember(user)) {
    return (
      <Shell>
        <PageHeader title="Leads" />
        <div className="table-wrap">
          <EmptyState icon={Briefcase} title="Leads are for Sales & Marketing">You are not a member of that department, so there are no leads for you to see.</EmptyState>
        </div>
      </Shell>
    );
  }
  const head = isSalesHead(user);
  const scope = searchParams.scope === "all" ? "all" : "mine";
  const stage = searchParams.stage ?? "open";
  const fu = ["overdue", "none"].includes(searchParams.fu ?? "") ? searchParams.fu! : "";
  const q = (searchParams.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const today = new Date(`${todayStr()}T00:00:00.000Z`);

  const visible = visibleLeadWhere(user);
  const open: Prisma.LeadWhereInput = { stage: { in: OPEN_STAGES } };
  const overdue: Prisma.LeadWhereInput = { AND: [open, { nextFollowUpAt: { lt: today } }] };
  const none: Prisma.LeadWhereInput = { AND: [open, { nextFollowUpAt: null }] };

  const and: Prisma.LeadWhereInput[] = [visible];
  if (scope === "mine") and.push({ ownerId: user.id });
  if (stage === "open") and.push(open);
  else if ((LEAD_STAGES as readonly string[]).includes(stage)) and.push({ stage: stage as (typeof LEAD_STAGES)[number] });
  if (fu === "overdue") and.push(overdue);
  if (fu === "none") and.push(none);
  if (q) and.push({ OR: [{ organizationName: { contains: q, mode: "insensitive" } }, { contactName: { contains: q, mode: "insensitive" } }] });
  const where: Prisma.LeadWhereInput = { AND: and };
  const scoped = scope === "mine" ? [visible, { ownerId: user.id }] : [visible];

  const [rows, total, nOpen, nOverdue, nNone] = await Promise.all([
    db.lead.findMany({
      where, include: { owner: { select: { displayName: true } } },
      // Overdue follow-ups first, then the soonest; leads with no follow-up date come after.
      orderBy: [{ nextFollowUpAt: { sort: "asc", nulls: "last" } }, { lastActivityAt: "desc" }],
      skip: (page - 1) * PAGE, take: PAGE,
    }),
    db.lead.count({ where }),
    db.lead.count({ where: { AND: [...scoped, open] } }),
    db.lead.count({ where: { AND: [...scoped, overdue] } }),
    db.lead.count({ where: { AND: [...scoped, none] } }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    const m = { scope, stage, fu, q, page: "1", ...over };
    for (const [k, v] of Object.entries(m)) if (v) p.set(k, String(v));
    return `/leads?${p.toString()}`;
  };
  const from = total === 0 ? 0 : (page - 1) * PAGE + 1;
  const to = Math.min(page * PAGE, total);
  const scopes = [["mine", "My leads"], ...(head ? [["all", "Everyone's leads"]] : [])] as const;

  return (
    <Shell>
      <PageHeader
        title="Leads"
        description="Every lead has one owner and a planned next step. You see leads you own or created; the Sales head sees them all."
        actions={canCreateLead(user) && <Link className="btn" href="/leads/new"><Plus className="ic" aria-hidden="true" />New lead</Link>}
      />
      <Flash error={searchParams.error} ok={searchParams.ok} />

      <div className="stats" style={{ marginBottom: "1.5rem" }}>
        <Link className="stat" href={qs({ stage: "open", fu: "" })}>
          <span className="stat-top">Open leads<Briefcase className="ic" aria-hidden="true" /></span>
          <span className="stat-num">{nOpen}</span>
          <span className="stat-note">New through proposal</span>
        </Link>
        <Link className={`stat${nOverdue > 0 ? " bad" : ""}`} href={qs({ stage: "open", fu: "overdue" })}>
          <span className="stat-top">Follow-up overdue<AlarmClock className="ic" aria-hidden="true" /></span>
          <span className="stat-num">{nOverdue}</span>
          <span className="stat-note">Planned date has passed</span>
        </Link>
        <Link className={`stat${nNone > 0 ? " warn" : ""}`} href={qs({ stage: "open", fu: "none" })}>
          <span className="stat-top">No follow-up planned<CalendarX className="ic" aria-hidden="true" /></span>
          <span className="stat-num">{nNone}</span>
          <span className="stat-note">Open, with no next step</span>
        </Link>
      </div>

      <div style={{ marginBottom: "1rem", display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "center" }}>
        {scopes.length > 1 && (
          <div className="segmented" role="navigation" aria-label="Scope">
            {scopes.map(([v, label]) => <Link key={v} href={qs({ scope: v })} aria-current={scope === v ? "true" : undefined}>{label}</Link>)}
          </div>
        )}
        <div className="segmented" role="navigation" aria-label="Stage">
          {[["open", "Open"], ...LEAD_STAGES.filter((s) => s === "WON" || s === "LOST").map((s) => [s, STAGE_LABEL[s]]), ["all", "All"]].map(([v, label]) => (
            <Link key={v} href={qs({ stage: v })} aria-current={stage === v ? "true" : undefined}>{label}</Link>
          ))}
        </div>
        <form action="/leads" method="get" role="search" style={{ display: "flex", gap: ".4rem", marginLeft: "auto" }}>
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="stage" value={stage} />
          {fu && <input type="hidden" name="fu" value={fu} />}
          <input name="q" defaultValue={q} placeholder="Search organisation or contact" aria-label="Search leads" maxLength={100} />
          <button type="submit" className="quiet"><Search className="ic" aria-hidden="true" />Search</button>
        </form>
      </div>

      <LeadTable rows={rows} empty={q || fu || stage !== "open" ? "No leads match these filters." : scope === "mine" ? "You don't own any open leads. Create one to get started." : "No open leads."} />

      {total > 0 && (
        <nav aria-label="Pagination" style={{ display: "flex", alignItems: "center", gap: ".75rem", marginTop: "1rem" }}>
          <span className="muted">Showing {from}–{to} of {total}</span>
          {page > 1 && <Link className="btn quiet" href={qs({ page: String(page - 1) })}><ChevronLeft className="ic" aria-hidden="true" />Previous</Link>}
          {page < pages && <Link className="btn quiet" href={qs({ page: String(page + 1) })}>Next<ChevronRight className="ic" aria-hidden="true" /></Link>}
        </nav>
      )}
    </Shell>
  );
}
