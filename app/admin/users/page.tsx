import { UserPlus } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ConfirmSubmit } from "@/lib/confirm";
import { Flash } from "@/lib/task-ui";
import { Field, PageHeader, Person } from "@/lib/ui";
import { createUser, setUserStatus } from "./actions";

export const dynamic = "force-dynamic";

type Params = { error?: string; ok?: string; email?: string; displayName?: string; departmentId?: string };

export default async function ManageUsers({ searchParams }: { searchParams: Params }) {
  await requireAdmin();
  const [users, departments] = await Promise.all([
    db.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, displayName: true, email: true, status: true, systemRole: true } }),
    db.department.findMany({ orderBy: { name: "asc" } }),
  ]);
  const v = searchParams;
  return (
    <Shell>
      <PageHeader
        title="Manage people"
        crumbs={[{ label: "Administration" }, { label: "Manage people" }]}
        description="Add people with a temporary password and deactivate accounts that should no longer sign in."
      />

      <section className="card form-narrow" aria-labelledby="add-h">
        <div className="card-head"><h2 id="add-h">Add a person</h2></div>
        <div className="card-body">
          <Flash error={v.error} ok={v.ok} />
          <form action={createUser}>
            <div className="form-grid">
              <Field id="displayName" label="Full name" required>
                <input id="displayName" name="displayName" defaultValue={v.displayName ?? ""} maxLength={120} required />
              </Field>
              <Field id="email" label="Email" required>
                <input id="email" name="email" type="email" defaultValue={v.email ?? ""} required />
              </Field>
              <Field id="password" label="Temporary password" required hint="At least 10 characters. Share it securely.">
                <input id="password" name="password" type="text" minLength={10} required autoComplete="off" />
              </Field>
              <Field id="departmentId" label="Primary department" required>
                <select id="departmentId" name="departmentId" defaultValue={v.departmentId ?? ""} required>
                  <option value="" disabled>Choose a department</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <div className="full"><label className="check"><input type="checkbox" name="isHead" /> Department head</label></div>
            </div>
            <div className="btn-row"><button type="submit"><UserPlus className="ic" aria-hidden="true" />Add person</button></div>
          </form>
        </div>
      </section>

      <section className="section" aria-labelledby="people-h">
        <div className="section-head"><h2 id="people-h">People <span className="muted num">({users.length})</span></h2></div>
        <div className="table-wrap">
          <div className="table-scroll">
            <table className="responsive">
              <thead><tr><th>Name</th><th>Role</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="primary"><Person name={u.displayName} sub={u.email} /></td>
                    <td data-label="Role">{u.systemRole === "ADMIN" ? <span className="badge head">Administrator</span> : "Member"}</td>
                    <td data-label="Status">{u.status === "ACTIVE" ? <span className="badge ok">Active</span> : <span className="badge off">Deactivated</span>}</td>
                    <td data-label="">
                      <form action={setUserStatus}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="status" value={u.status === "ACTIVE" ? "DEACTIVATED" : "ACTIVE"} />
                        {u.status === "ACTIVE" ? (
                          <ConfirmSubmit danger label="Deactivate" title={`Deactivate ${u.displayName}?`}
                            message="They will be signed out of new requests immediately and can no longer sign in. Their tasks and history are kept. You can reactivate them later."
                            confirmLabel="Deactivate" />
                        ) : <button className="quiet sm" type="submit">Reactivate</button>}
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </Shell>
  );
}
