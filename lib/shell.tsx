import Link from "next/link";
import { requireUser } from "./auth";
import SignOutButton from "./signout";

export async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <header className="top">
        <span className="brand">EAK PUSTAK Workspace</span>
        <nav aria-label="Main">
          <Link href="/">Home</Link>
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
