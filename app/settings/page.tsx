import { KeyRound, UserRound } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { Alert, Field, PageHeader } from "@/lib/ui";
import { Flash } from "@/lib/task-ui";
import { MAX_NAME, MAX_PASSWORD_BYTES, MIN_PASSWORD } from "@/lib/account";
import { changePassword, updateProfile } from "./actions";

export const dynamic = "force-dynamic";

type Params = { error?: string; ok?: string; required?: string };

export default async function AccountSettings({ searchParams }: { searchParams: Params }) {
  const user = await requireUser({ allowPasswordChange: true });
  const mustChange = user.mustChangePassword;
  const departments = user.memberships.map((m) => `${m.department.name}${m.type === "HEAD" ? " (head)" : ""}`);

  return (
    <Shell allowPasswordChange>
      <PageHeader title="Account settings" description="Your name and your password. Your email and departments are managed by an administrator." />
      {mustChange && (
        <div style={{ marginBottom: "1rem" }}>
          <Alert kind="info">You are using a temporary password. Choose your own below to continue; nothing else in the workspace opens until you do.</Alert>
        </div>
      )}
      <Flash error={searchParams.error} ok={searchParams.ok} />

      <section className="card form-narrow" aria-labelledby="profile-h" style={{ marginBottom: "1.5rem" }}>
        <div className="card-head"><h2 id="profile-h"><UserRound className="ic" aria-hidden="true" /> Profile</h2></div>
        <div className="card-body">
          <dl className="props" style={{ marginBottom: "1.25rem" }}>
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            <div><dt>Departments</dt><dd>{departments.length ? departments.join(", ") : "None"}</dd></div>
          </dl>
          <form action={updateProfile}>
            <Field id="displayName" label="Full name" required>
              <input id="displayName" name="displayName" defaultValue={user.displayName} maxLength={MAX_NAME} required autoComplete="name" />
            </Field>
            <div className="btn-row"><button type="submit">Save name</button></div>
          </form>
        </div>
      </section>

      <section className="card form-narrow" aria-labelledby="password-h">
        <div className="card-head"><h2 id="password-h"><KeyRound className="ic" aria-hidden="true" /> Change password</h2></div>
        <div className="card-body">
          <p className="hint" style={{ marginBottom: "1rem" }}>
            Changing your password signs you out everywhere, including this browser. You will sign in again with the new one.
          </p>
          <form action={changePassword}>
            <div className="form-grid">
              <div className="full">
                <Field id="currentPassword" label="Current password" required>
                  <input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" />
                </Field>
              </div>
              <Field id="newPassword" label="New password" required hint={`At least ${MIN_PASSWORD} characters, up to ${MAX_PASSWORD_BYTES} bytes. A few unrelated words works well.`}>
                <input id="newPassword" name="newPassword" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" />
              </Field>
              <Field id="confirmPassword" label="Confirm new password" required>
                <input id="confirmPassword" name="confirmPassword" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" />
              </Field>
            </div>
            <div className="btn-row"><button type="submit">Change password</button></div>
          </form>
        </div>
      </section>
    </Shell>
  );
}
