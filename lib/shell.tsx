import Link from "next/link";
import { requireUser } from "./auth";
import { db } from "./db";
import SignOutButton from "./signout";

export async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await db.notification.count({ where: { userId: user.id, readAt: null } });
  return (
    <>
      <header className="top">
        <span className="brand">EAK PUSTAK Workspace</span>
        <nav aria-label="Main">
          <Link href="/">My work</Link>
          <Link href="/tasks">Tasks</Link>
          <Link href="/notifications">Notifications{unread > 0 ? ` (${unread})` : ""}</Link>
          <Link href="/directory">Directory</Link>
          {user.systemRole === "ADMIN" && <Link href="/admin/users">Manage people</Link>}
        </nav>
        <span>{user.displayName}</span>
        <SignOutButton />
      </header>
      <main>{children}</main>
    </>
  );
}
