import { randomUUID } from "node:crypto";
import { Megaphone } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import HubForm from "@/lib/hub-form";
import { EmptyState, PageHeader } from "@/lib/ui";
import { allowedAudience, canAuthor } from "@/lib/hub";

export const dynamic = "force-dynamic";

export default async function NewContent() {
  const user = await requireUser();
  const crumbs = [{ label: "Company hub", href: "/hub" }, { label: "New item" }];
  if (!canAuthor(user)) {
    return (
      <Shell>
        <PageHeader title="New item" crumbs={crumbs} />
        <div className="table-wrap">
          <EmptyState icon={Megaphone} title="You can't create hub content">
            Announcements, policies and resources are written by department heads, administrators and the head of Management.
          </EmptyState>
        </div>
      </Shell>
    );
  }
  const a = allowedAudience(user);
  const departments = await db.department.findMany({ where: { id: { in: a.departmentIds } }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <Shell>
      <PageHeader title="New item" crumbs={crumbs} description="Save a draft first. It is only visible to you and to people who can publish it until it is published." />
      <HubForm
        clientToken={randomUUID()}
        initial={{ type: "ANNOUNCEMENT", title: "", body: "", resourceUrl: "", scope: a.companyWide ? "ALL" : "DEPARTMENTS", departmentIds: [] }}
        allowed={{ companyWide: a.companyWide, departments }}
        cancelHref="/hub"
      />
    </Shell>
  );
}
