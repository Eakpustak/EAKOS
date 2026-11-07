import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { Flash } from "@/lib/task-ui";
import { Field, PageHeader } from "@/lib/ui";
import { MAX_DESCRIPTION, MAX_TITLE, PRIORITIES, PRIORITY_LABEL, SERVICE_CATEGORIES } from "@/lib/service-requests";
import { submitService } from "../actions";

export const dynamic = "force-dynamic";

type P = { error?: string; title?: string; description?: string; category?: string; priority?: string; clientToken?: string };

export default async function NewService({ searchParams }: { searchParams: P }) {
  await requireUser();
  const v = searchParams;
  return (
    <Shell>
      <PageHeader title="New service request" crumbs={[{ label: "Service requests", href: "/service-requests" }, { label: "New request" }]}
        description="The category decides which team handles it. A head of that team assigns someone." />
      <Flash error={v.error} />
      <form action={submitService} className="panel form-narrow">
        <input type="hidden" name="clientToken" value={v.clientToken || randomUUID()} />
        <div className="form-grid">
          <Field id="category" label="Category" required>
            <select id="category" name="category" required defaultValue={v.category ?? ""}>
              <option value="" disabled>Choose a category…</option>
              {SERVICE_CATEGORIES.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
            </select>
          </Field>
          <Field id="priority" label="Priority" required>
            <select id="priority" name="priority" required defaultValue={v.priority ?? "NORMAL"}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </Field>
          <div className="full"><Field id="title" label="Title" required>
            <input id="title" name="title" type="text" maxLength={MAX_TITLE} required defaultValue={v.title ?? ""} />
          </Field></div>
          <div className="full"><Field id="description" label="What do you need?" required hint="Do not include passwords or other secrets.">
            <textarea id="description" name="description" rows={5} maxLength={MAX_DESCRIPTION} required defaultValue={v.description ?? ""} />
          </Field></div>
        </div>
        <div className="btn-row">
          <button type="submit">Submit request</button>
          <Link className="btn ghost" href="/service-requests">Cancel</Link>
        </div>
      </form>
    </Shell>
  );
}
