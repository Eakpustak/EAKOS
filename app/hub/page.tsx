import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ContentList } from "@/lib/hub-ui";
import { Flash } from "@/lib/task-ui";
import { PageHeader } from "@/lib/ui";
import { CONTENT_TYPES, STATUS_LABEL, TYPE_LABEL_PLURAL, canAuthor, visibleContentWhere } from "@/lib/hub";

export const dynamic = "force-dynamic";
const PAGE = 25;

type SP = { type?: string; status?: string; q?: string; page?: string; error?: string; ok?: string };

export default async function Hub({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const author = canAuthor(user);
  const type = (CONTENT_TYPES as readonly string[]).includes(searchParams.type ?? "") ? searchParams.type! : "";
  // Only people who manage content ever see anything other than published items, because
  // visibleContentWhere never returns drafts to anyone else; the filter is a convenience, not security.
  const status = ["published", "draft", "archived", "all"].includes(searchParams.status ?? "") ? searchParams.status! : "published";
  const q = (searchParams.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);

  const and: Prisma.ContentItemWhereInput[] = [visibleContentWhere(user)];
  if (type) and.push({ type: type as (typeof CONTENT_TYPES)[number] });
  if (status !== "all") and.push({ status: status.toUpperCase() as "PUBLISHED" | "DRAFT" | "ARCHIVED" });
  if (q) and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }] });
  const where: Prisma.ContentItemWhereInput = { AND: and };

  const [rows, total] = await Promise.all([
    db.contentItem.findMany({
      where,
      include: {
        author: { select: { displayName: true } },
        audiences: { select: { department: { select: { name: true } } } },
      },
      orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
      skip: (page - 1) * PAGE, take: PAGE,
    }),
    db.contentItem.count({ where }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    const m = { type, status: status === "published" ? "" : status, q, page: "1", ...over };
    for (const [k, v] of Object.entries(m)) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/hub?${s}` : "/hub";
  };
  const from = total === 0 ? 0 : (page - 1) * PAGE + 1;
  const to = Math.min(page * PAGE, total);
  const types = [["", "All"], ...CONTENT_TYPES.map((t) => [t, TYPE_LABEL_PLURAL[t]] as const)] as const;

  return (
    <Shell>
      <PageHeader
        title="Company hub"
        description="Announcements, policies and SOPs, and shared resources. You only see what is published to you."
        actions={author && <Link className="btn" href="/hub/new"><Plus className="ic" aria-hidden="true" />New item</Link>}
      />
      <Flash error={searchParams.error} ok={searchParams.ok} />

      <div className="filters" style={{ marginBottom: "1rem", display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "center" }}>
        <div className="segmented" role="navigation" aria-label="Content type">
          {types.map(([v, label]) => (
            <Link key={v || "all"} href={qs({ type: v })} aria-current={type === v ? "true" : undefined}>{label}</Link>
          ))}
        </div>
        {author && (
          <div className="segmented" role="navigation" aria-label="Status">
            {(["published", "draft", "archived", "all"] as const).map((s) => (
              <Link key={s} href={qs({ status: s === "published" ? "" : s })} aria-current={status === s ? "true" : undefined}>
                {s === "all" ? "All" : STATUS_LABEL[s.toUpperCase()]}
              </Link>
            ))}
          </div>
        )}
        <form action="/hub" method="get" role="search" style={{ display: "flex", gap: ".4rem", marginLeft: "auto" }}>
          {type && <input type="hidden" name="type" value={type} />}
          {status !== "published" && <input type="hidden" name="status" value={status} />}
          <input name="q" defaultValue={q} placeholder="Search the hub" aria-label="Search the hub" maxLength={100} />
          <button type="submit" className="quiet"><Search className="ic" aria-hidden="true" />Search</button>
        </form>
      </div>

      <ContentList
        rows={rows}
        showStatus={author}
        empty={q ? "Nothing you can see matches that search." : status === "published" ? "Nothing has been published to you yet." : "No items with this status."}
      />

      {total > 0 && (
        <nav className="pager" aria-label="Pagination" style={{ display: "flex", alignItems: "center", gap: ".75rem", marginTop: "1rem" }}>
          <span className="muted">Showing {from}–{to} of {total}</span>
          {page > 1 && <Link className="btn quiet" href={qs({ page: String(page - 1) })}><ChevronLeft className="ic" aria-hidden="true" />Previous</Link>}
          {page < pages && <Link className="btn quiet" href={qs({ page: String(page + 1) })}>Next<ChevronRight className="ic" aria-hidden="true" /></Link>}
        </nav>
      )}
    </Shell>
  );
}
