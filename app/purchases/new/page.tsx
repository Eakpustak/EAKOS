import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { Flash } from "@/lib/task-ui";
import { Field, PageHeader } from "@/lib/ui";
import { todayStr } from "@/lib/tasks";
import { CATEGORIES, MAX_JUSTIFICATION, MAX_QTY, MAX_TITLE, NEEDED_BY_MAX_DAYS } from "@/lib/purchases";
import { CURRENCIES } from "@/lib/expenses";
import { submitPurchase } from "../actions";

export const dynamic = "force-dynamic";

type P = { error?: string; title?: string; justification?: string; category?: string; quantity?: string; amount?: string; currency?: string; neededBy?: string; clientToken?: string };

export default async function NewPurchase({ searchParams }: { searchParams: P }) {
  await requireUser();
  const v = searchParams;
  const today = todayStr();
  const latest = new Date(new Date(`${today}T00:00:00.000Z`).getTime() + NEEDED_BY_MAX_DAYS * 86_400_000).toISOString().slice(0, 10);
  return (
    <Shell>
      <PageHeader title="New purchase request" crumbs={[{ label: "Purchases", href: "/purchases" }, { label: "New request" }]}
        description="A head of your department decides, then Operations places the order. Nothing is bought by submitting this form." />
      <Flash error={v.error} />
      <form action={submitPurchase} className="panel form-narrow">
        <input type="hidden" name="clientToken" value={v.clientToken || randomUUID()} />
        <div className="form-grid">
          <div className="full"><Field id="title" label="What do you want to buy?" required>
            <input id="title" name="title" type="text" maxLength={MAX_TITLE} required defaultValue={v.title ?? ""} />
          </Field></div>
          <Field id="category" label="Category" required>
            <select id="category" name="category" required defaultValue={v.category ?? ""}>
              <option value="" disabled>Choose a category…</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field id="quantity" label="Quantity" required hint={`A whole number, 1 to ${MAX_QTY}.`}>
            <input id="quantity" name="quantity" type="text" inputMode="numeric" autoComplete="off" required defaultValue={v.quantity ?? "1"} />
          </Field>
          <Field id="amount" label="Estimated total" required hint="For the whole quantity. Digits with up to two decimals, for example 25000.50.">
            <input id="amount" name="amount" type="text" inputMode="decimal" autoComplete="off" required defaultValue={v.amount ?? ""} />
          </Field>
          <Field id="currency" label="Currency" required>
            <select id="currency" name="currency" required defaultValue={v.currency ?? ""}>
              <option value="" disabled>Choose…</option>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field id="neededBy" label="Needed by" hint="Optional.">
            <input id="neededBy" name="neededBy" type="date" min={today} max={latest} defaultValue={v.neededBy ?? ""} />
          </Field>
          <div className="full"><Field id="justification" label="Why is it needed?" required>
            <textarea id="justification" name="justification" rows={4} maxLength={MAX_JUSTIFICATION} required defaultValue={v.justification ?? ""} />
          </Field></div>
        </div>
        <div className="btn-row">
          <button type="submit">Submit request</button>
          <Link className="btn ghost" href="/purchases">Cancel</Link>
        </div>
      </form>
    </Shell>
  );
}
