import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Directory() {
  await requireUser();
  // Only directory-safe fields are selected: no hashes, no status internals.
  const people = await db.user.findMany({
    where: { status: "ACTIVE" },
    orderBy: { displayName: "asc" },
    select: {
      id: true, displayName: true, email: true,
      memberships: { select: { department: { select: { name: true } }, type: true } },
    },
  });
  return (
    <Shell>
      <h1>Directory</h1>
      <p className="sub">Active people and the departments they belong to.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Departments</th></tr></thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td>{p.displayName}</td>
                <td>{p.email}</td>
                <td>
                  {p.memberships.length === 0 ? "—" : p.memberships.map((m) => (
                    <span className="tag" key={m.department.name}>
                      {m.department.name}{m.type === "HEAD" ? " (head)" : ""}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
