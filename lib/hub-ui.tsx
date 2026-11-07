import Link from "next/link";
import { Megaphone } from "lucide-react";
import { STATUS_LABEL, TYPE_LABEL, audienceLabel } from "./hub";
import { fmtDate } from "./tasks";
import { EmptyState } from "./ui";

export function ContentStatusBadge({ status }: { status: string }) {
  return <span className={`badge hub-${status.toLowerCase()}`}>{STATUS_LABEL[status] ?? status}</span>;
}
export function ContentTypeBadge({ type }: { type: string }) {
  return <span className="badge hub-type">{TYPE_LABEL[type] ?? type}</span>;
}

type Row = {
  id: string; type: string; title: string; body: string; status: string; resourceUrl: string | null;
  audienceScope: string; publishedAt: Date | null; updatedAt: Date;
  author: { displayName: string };
  audiences: { department: { name: string } }[];
};

export function hostOf(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname; } catch { return null; }
}

export function ContentList({ rows, empty, showStatus }: { rows: Row[]; empty: string; showStatus: boolean }) {
  if (rows.length === 0) {
    return (
      <div className="table-wrap">
        <EmptyState icon={Megaphone} title="Nothing here">{empty}</EmptyState>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <ul className="hub-list">
        {rows.map((r) => {
          const excerpt = (r.body || hostOf(r.resourceUrl) || "").replace(/\s+/g, " ").slice(0, 220);
          return (
            <li key={r.id}>
              <Link className="t" href={`/hub/${r.id}`}>{r.title}</Link>
              {excerpt && <span className="excerpt">{excerpt}</span>}
              <span className="meta">
                <ContentTypeBadge type={r.type} />
                {showStatus && <ContentStatusBadge status={r.status} />}
                <span>{audienceLabel(r.audienceScope, r.audiences.map((a) => a.department.name))}</span>
                <span>By {r.author.displayName}</span>
                <span>{r.publishedAt ? `Published ${fmtDate(r.publishedAt)}` : `Updated ${fmtDate(r.updatedAt)}`}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
