import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { Flash } from "@/lib/task-ui";
import { Field, PageHeader } from "@/lib/ui";
import { todayStr } from "@/lib/tasks";
import { BACKDATE_DAYS, CATEGORIES, CURRENCIES, MAX_DESC, MAX_EVIDENCE } from "@/lib/expenses";
import { submitExpense } from "../actions";

export const dynamic = "force-dynamic";

type P = { error?: string; amount?: string; currency?: string; category?: string; date?: string; description?: string; evidenceRef?: string; clientToken?: string };

export default async function NewExpense({ searchParams }: { searchParams: P }) {
  await requireUser();
  const v = searchParams;
  const today = todayStr();
  const earliest = new Date(new Date(`${today}T00:00:00.000Z`).getTime() - BACKDATE_DAYS * 86_400_000).toISOString().slice(0, 10);
  return (
    <Shell>
      <PageHeader title="New expense" crumbs={[{ label: "Expenses", href: "/expenses" }, { label: "New expense" }]}
        description="A head of your department decides, then Finance records payment. Nothing is paid by submitting this form." />
      <Flash error={v.error} />
      <form action={submitExpense} className="panel form-narrow">
        <input type="hidden" name="clientToken" value={v.clientToken || randomUUID()} />
        <div className="form-grid">
          <Field id="amount" label="Amount" required hint="Digits with up to two decimals, for example 1250.50.">
            <input id="amount" name="amount" type="text" inputMode="decimal" autoComplete="off" required defaultValue={v.amount ?? ""} />
          </Field>
          <Field id="currency" label="Currency" required>
            <select id="currency" name="currency" required defaultValue={v.currency ?? ""}>
              <option value="" disabled>Choose…</option>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field id="category" label="Category" required>
            <select id="category" name="category" required defaultValue={v.category ?? ""}>
              <option value="" disabled>Choose a category…</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field id="date" label="Date of expense" required hint={`Up to ${BACKDATE_DAYS} days ago.`}>
            <input id="date" name="date" type="date" min={earliest} max={today} required defaultValue={v.date ?? ""} />
          </Field>
          <div className="full"><Field id="description" label="What was it for?" required>
            <textarea id="description" name="description" rows={3} maxLength={MAX_DESC} required defaultValue={v.description ?? ""} />
          </Field></div>
          <div className="full"><Field id="evidenceRef" label="Receipt reference" required hint="A receipt or invoice number, or where the paper receipt is kept. File upload is not available yet.">
            <input id="evidenceRef" name="evidenceRef" type="text" maxLength={MAX_EVIDENCE} required defaultValue={v.evidenceRef ?? ""} />
          </Field></div>
        </div>
        <div className="btn-row">
          <button type="submit">Submit expense</button>
          <Link className="btn ghost" href="/expenses">Cancel</Link>
        </div>
      </form>
    </Shell>
  );
}
