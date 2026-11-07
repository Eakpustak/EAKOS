import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { Flash } from "@/lib/task-ui";
import { Field, PageHeader } from "@/lib/ui";
import { todayStr } from "@/lib/tasks";
import { LEAVE_TYPES, MAX_BACKDATE_DAYS, MAX_DAYS, MAX_REASON } from "@/lib/leave";
import { submitLeave } from "../actions";

export const dynamic = "force-dynamic";

type P = { error?: string; leaveType?: string; startDate?: string; endDate?: string; reason?: string; clientToken?: string };

export default async function NewLeave({ searchParams }: { searchParams: P }) {
  await requireUser();
  const v = searchParams;
  const today = todayStr();
  const earliest = new Date(new Date(`${today}T00:00:00.000Z`).getTime() - MAX_BACKDATE_DAYS * 86_400_000).toISOString().slice(0, 10);
  return (
    <Shell>
      <PageHeader title="Request leave" crumbs={[{ label: "Leave", href: "/leave" }, { label: "Request leave" }]}
        description="Your department head decides. You are told the outcome here; nothing is approved until they respond." />
      <Flash error={v.error} />
      <form action={submitLeave} className="panel form-narrow">
        <input type="hidden" name="clientToken" value={v.clientToken || randomUUID()} />
        <div className="form-grid">
          <Field id="leaveType" label="Leave type" required>
            <select id="leaveType" name="leaveType" required defaultValue={v.leaveType ?? ""}>
              <option value="" disabled>Choose a type…</option>
              {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <span />
          <Field id="startDate" label="First day" required><input id="startDate" name="startDate" type="date" min={earliest} required defaultValue={v.startDate ?? ""} /></Field>
          <Field id="endDate" label="Last day" required hint={`Inclusive. Up to ${MAX_DAYS} days.`}><input id="endDate" name="endDate" type="date" min={earliest} required defaultValue={v.endDate ?? ""} /></Field>
          <div className="full"><Field id="reason" label="Reason" hint="Optional. Only you, the approver and the HR head can read it.">
            <textarea id="reason" name="reason" rows={4} maxLength={MAX_REASON} defaultValue={v.reason ?? ""} />
          </Field></div>
        </div>
        <div className="btn-row">
          <button type="submit">Send request</button>
          <Link className="btn ghost" href="/leave">Cancel</Link>
        </div>
      </form>
    </Shell>
  );
}
