import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { Flash } from "@/lib/task-ui";
import { PageHeader } from "@/lib/ui";
import { canManageVendors } from "@/lib/vendors";
import { createVendor } from "../actions";
import { VendorFields } from "../vendor-form";

export const dynamic = "force-dynamic";

type P = { error?: string; name?: string; category?: string; contactName?: string; email?: string; phone?: string; notes?: string; clientToken?: string };

export default async function NewVendor({ searchParams }: { searchParams: P }) {
  const user = await requireUser();
  if (!canManageVendors(user)) redirect("/");
  return (
    <Shell>
      <PageHeader title="Add vendor" crumbs={[{ label: "Vendors", href: "/vendors" }, { label: "Add vendor" }]} description="Names are unique. A vendor is deactivated, never deleted." />
      <Flash error={searchParams.error} />
      <form action={createVendor} className="panel form-narrow">
        <input type="hidden" name="clientToken" value={searchParams.clientToken || randomUUID()} />
        <VendorFields v={searchParams} />
        <div className="btn-row"><button type="submit">Add vendor</button><Link className="btn ghost" href="/vendors">Cancel</Link></div>
      </form>
    </Shell>
  );
}
