import Link from "next/link";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/tasks";
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
      <h1>Notifications</h1>
      <p className="sub">Seeing a notification is not the same as acting on it. Open the task to respond.</p>
      {unread > 0 && (
        <form action={markAllNotificationsRead}><button className="quiet" type="submit">Mark all as read</button></form>
      )}
      {items.length === 0 ? <p className="empty">You have no notifications.</p> : (
        <ul className="thread">
          {items.map((n) => (
            <li key={n.id} className={n.readAt ? "" : "unread"}>
              {n.taskId ? <Link href={`/tasks/${n.taskId}`}>{n.title}</Link> : n.title}{" "}
              <span className="muted">{fmtDateTime(n.createdAt)}{n.readAt ? "" : " · unread"}</span>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
