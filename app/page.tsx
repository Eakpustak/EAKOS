import { Users } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { EmptyState, PageHeader, Person } from "@/lib/ui";

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
      <PageHeader title="Directory" description="Active people and the departments they belong to." />
      <div className="table-wrap">
        {people.length === 0 ? <EmptyState icon={Users} title="No people yet" /> : (
          <div className="table-scroll">
            <table className="responsive">
              <thead><tr><th>Name</th><th>Email</th><th>Departments</th></tr></thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id}>
                    <td className="primary"><Person name={p.displayName} /></td>
                    <td data-label="Email">{p.email}</td>
                    <td data-label="Departments">
                      <span>
                        {p.memberships.length === 0 ? "—" : p.memberships.map((m) => (
                          <span className="tag" key={m.department.name}>{m.department.name}{m.type === "HEAD" ? " · head" : ""}</span>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
