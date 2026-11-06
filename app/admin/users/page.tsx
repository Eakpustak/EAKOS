import { Shell } from "@/lib/shell";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createUser, setUserStatus } from "./actions";

export const dynamic = "force-dynamic";

export default async function ManageUsers() {
  await requireAdmin();
  const [users, departments] = await Promise.all([
    db.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, displayName: true, email: true, status: true, systemRole: true } }),
    db.department.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <Shell>
      <h1>Manage people</h1>
      <p className="sub">Add people with a temporary password and deactivate accounts that should no longer sign in.</p>

      <h2>Add a person</h2>
      <form action={createUser} className="panel">
        <label htmlFor="displayName">Full name</label>
        <input id="displayName" name="displayName" required />
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required />
        <label htmlFor="password">Temporary password</label>
        <input id="password" name="password" type="text" minLength={10} required />
        <label htmlFor="departmentId">Primary department</label>
        <select id="departmentId" name="departmentId" required>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <label><input type="checkbox" name="isHead" style={{ width: "auto" }} /> Department head</label>
        <p><button type="submit">Add person</button></p>
      </form>

      <h2>People</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.displayName}</td><td>{u.email}</td>
                <td>{u.systemRole === "ADMIN" ? "Administrator" : "Member"}</td>
                <td>{u.status === "ACTIVE" ? "Active" : "Deactivated"}</td>
                <td>
                  <form action={setUserStatus}>
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="status" value={u.status === "ACTIVE" ? "DEACTIVATED" : "ACTIVE"} />
                    <button className="quiet" type="submit">{u.status === "ACTIVE" ? "Deactivate" : "Reactivate"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
