import Link from "next/link";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/tasks";
import { EmptyState, PageHeader } from "@/lib/ui";
import { markAllNotificationsRead } from "../tasks/actions";

export const dynamic = "force-dynamic";

export default async function Notifications() {
  const user = await requireUser();
  const items = await db.notification.findMany({
    where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50,
  });
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <Shell>
      <PageHeader
        title="Notifications"
        description="Seeing a notification is not the same as acting on it. Open the item to respond."
        actions={unread > 0 && (
          <form action={markAllNotificationsRead}>
            <button className="quiet" type="submit"><CheckCheck className="ic" aria-hidden="true" />Mark all as read</button>
          </form>
        )}
      />
      <div className="table-wrap">
        {items.length === 0 ? (
          <EmptyState icon={BellOff} title="No notifications">You will be notified here when work or a handover is sent to you.</EmptyState>
        ) : (
          <ul className="list">
            {items.map((n) => (
              <li key={n.id} className={n.readAt ? "" : "unread"}>
                <span className="ico"><Bell className="ic" aria-hidden="true" /></span>
                <div className="grow">
                  {n.handoverId ? <Link href={`/handovers/${n.handoverId}`}>{n.title}</Link> : n.contentId ? <Link href={`/hub/${n.contentId}`}>{n.title}</Link> : n.leadId ? <Link href={`/leads/${n.leadId}`}>{n.title}</Link> : n.projectId ? <Link href={`/projects/${n.projectId}`}>{n.title}</Link> : n.taskId ? <Link href={`/tasks/${n.taskId}`}>{n.title}</Link> : <b>{n.title}</b>}
                  <span className="sub-line muted"><time dateTime={n.createdAt.toISOString()}>{fmtDateTime(n.createdAt)}</time></span>
                </div>
                {!n.readAt && <span className="badge head">Unread</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}
