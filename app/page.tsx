import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";

export default async function Home() {
  const user = await requireUser();
  return (
    <Shell>
      <h1>Welcome, {user.displayName}</h1>
      <p className="sub">
        Your work, handovers and company updates will appear here as the next phases are added.
      </p>
      <h2>Your departments</h2>
      {user.memberships.length === 0 ? (
        <p>You are not in a department yet. Ask an administrator to add you.</p>
      ) : (
        <div className="grid">
          {user.memberships.map((m) => (
            <div className="panel" key={m.id}>
              <strong>{m.department.name}</strong>
              <div>{m.type === "HEAD" ? "Department head" : "Member"}{m.isPrimary ? " · primary" : ""}</div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
