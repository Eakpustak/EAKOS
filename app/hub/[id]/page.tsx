import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, Pencil } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ContentStatusBadge, ContentTypeBadge, hostOf } from "@/lib/hub-ui";
import { Flash } from "@/lib/task-ui";
import { PageHeader } from "@/lib/ui";
import { fmtDateTime } from "@/lib/tasks";
import {
  audienceLabel, availableContentActions, canEditItem, canManageItem, canReadItem, safeHttpUrl, splitParagraphs,
  type ContentAction,
} from "@/lib/hub";
import { actOnContent } from "../actions";

export const dynamic = "force-dynamic";

const ACTION_UI: Record<ContentAction, { label: string; note: string; danger?: boolean; quiet?: boolean }> = {
  publish: { label: "Publish", note: "Makes it visible to its audience and notifies them." },
  unpublish: { label: "Unpublish", note: "Returns it to draft. Its audience can no longer see it; versions are kept.", quiet: true },
  archive: { label: "Archive", note: "Removes it from the hub. History is kept and it can be restored.", quiet: true, danger: true },
  restore: { label: "Restore to draft", note: "Brings it back as a draft; it is not visible until published.", quiet: true },
};

export default async function ContentDetail({
  params, searchParams,
}: { params: { id: string }; searchParams: { error?: string; ok?: string } }) {
  const user = await requireUser();
  const c = await db.contentItem.findUnique({
    where: { id: params.id },
    include: {
      author: { select: { displayName: true } },
      publisher: { select: { displayName: true } },
      audiences: { select: { departmentId: true, department: { select: { name: true } } } },
    },
  });
  const hubItem = c && {
    status: c.status, authorId: c.authorId, audienceScope: c.audienceScope,
    audienceDepartmentIds: c.audiences.map((a) => a.departmentId),
  };
  // Same response for "missing" and "forbidden" (including drafts) so IDs cannot be probed.
  if (!c || !hubItem || !canReadItem(user, hubItem)) redirect("/hub");

  await db.notification.updateMany({ where: { userId: user.id, contentId: c.id, readAt: null }, data: { readAt: new Date() } });

  const manage = canManageItem(user, hubItem);
  const canEdit = canEditItem(user, hubItem);
  const actions = availableContentActions(user, hubItem);
  // Only managers see the revision history; readers see the current version only.
  const versions = manage
    ? await db.contentVersion.findMany({
        where: { contentId: c.id }, orderBy: { version: "desc" }, take: 50,
        include: { editedBy: { select: { displayName: true } } },
      })
    : [];
  const paragraphs = splitParagraphs(c.body);
  // Re-validate on render: even a bad row can never produce a script-capable link.
  const href = c.type === "RESOURCE" && c.resourceUrl ? safeHttpUrl(c.resourceUrl) : null;
  const audienceNames = c.audiences.map((a) => a.department.name).sort();

  return (
    <Shell>
      <PageHeader
        title={c.title}
        crumbs={[{ label: "Company hub", href: "/hub" }, { label: c.title }]}
        actions={canEdit && <Link className="btn quiet" href={`/hub/${c.id}/edit`}><Pencil className="ic" aria-hidden="true" />Edit</Link>}
      >
        <div className="meta-row">
          <ContentTypeBadge type={c.type} />
          {manage && <ContentStatusBadge status={c.status} />}
        </div>
      </PageHeader>
      <Flash error={searchParams.error} ok={searchParams.ok} />

      <div className="layout-2">
        <div className="stack">
          {href && (
            <section className="card" aria-labelledby="link-h">
              <div className="card-head"><h2 id="link-h">Link</h2></div>
              <div className="card-body">
                <a className="btn" href={href} target="_blank" rel="noopener noreferrer nofollow">
                  Open {hostOf(href) ?? "link"}<ExternalLink className="ic" aria-hidden="true" />
                </a>
                <p className="muted" style={{ marginTop: ".6rem", overflowWrap: "anywhere" }}>{href}</p>
              </div>
            </section>
          )}
          {c.type === "RESOURCE" && !href && (
            <section className="card"><div className="card-body"><p className="muted">This resource has no valid link.</p></div></section>
          )}
          {paragraphs.length > 0 && (
            <section className="card" aria-labelledby="body-h">
              <div className="card-head"><h2 id="body-h">{c.type === "RESOURCE" ? "About this resource" : "Content"}</h2></div>
              <div className="card-body prose">
                {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            </section>
          )}
          {manage && versions.length > 0 && (
            <section className="card" aria-labelledby="ver-h">
              <div className="card-head"><h2 id="ver-h">Version history</h2></div>
              <div className="card-body">
                {versions.map((v) => (
                  <details key={v.id} className="ver">
                    <summary>
                      Version {v.version}{v.version === c.version ? " (current)" : ""} · {v.editedBy.displayName} · {fmtDateTime(v.createdAt)}
                    </summary>
                    <p><b>{v.title}</b></p>
                    <div className="prose">{splitParagraphs(v.body).map((p, i) => <p key={i}>{p}</p>)}</div>
                    {v.resourceUrl && <p className="muted" style={{ overflowWrap: "anywhere" }}>Link: {v.resourceUrl}</p>}
                  </details>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="stack" aria-label="Item details">
          {actions.length > 0 && (
            <section className="card" aria-labelledby="act-h">
              <div className="card-head"><h2 id="act-h">Publishing</h2></div>
              <div className="card-body">
                {actions.map((a) => (
                  <form key={a} action={actOnContent} className="action-block">
                    <input type="hidden" name="contentId" value={c.id} />
                    <input type="hidden" name="action" value={a} />
                    <p className="muted">{ACTION_UI[a].note}</p>
                    <button type="submit" className={`${ACTION_UI[a].quiet ? "quiet" : ""} ${ACTION_UI[a].danger ? "danger-text" : ""}`.trim() || undefined}>
                      {ACTION_UI[a].label}
                    </button>
                  </form>
                ))}
              </div>
            </section>
          )}
          <section className="card">
            <div className="card-head"><h2>Details</h2></div>
            <div className="card-body">
              <dl className="props">
                <div><dt>Audience</dt><dd>{audienceLabel(c.audienceScope, audienceNames)}</dd></div>
                <div><dt>Author</dt><dd>{c.author.displayName}</dd></div>
                {c.publisher && c.publishedAt && <div><dt>Published by</dt><dd>{c.publisher.displayName}</dd></div>}
                {c.publishedAt && <div><dt>Published</dt><dd className="num">{fmtDateTime(c.publishedAt)}</dd></div>}
                <div><dt>Last updated</dt><dd className="num">{fmtDateTime(c.updatedAt)}</dd></div>
                <div><dt>Version</dt><dd className="num">{c.version}</dd></div>
              </dl>
            </div>
          </section>
        </aside>
      </div>
    </Shell>
  );
}
