import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import HubForm from "@/lib/hub-form";
import { PageHeader } from "@/lib/ui";
import { allowedAudience, canEditItem } from "@/lib/hub";

export const dynamic = "force-dynamic";

export default async function EditContent({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const item = await db.contentItem.findUnique({ where: { id: params.id }, include: { audiences: { select: { departmentId: true } } } });
  // Same response for "missing" and "forbidden" so IDs cannot be probed.
  if (!item || !canEditItem(user, { status: item.status, authorId: item.authorId, audienceScope: item.audienceScope, audienceDepartmentIds: item.audiences.map((a) => a.departmentId) })) {
    redirect("/hub");
  }
  const a = allowedAudience(user);
  const departments = await db.department.findMany({ where: { id: { in: a.departmentIds } }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <Shell>
      <PageHeader
        title="Edit item"
        crumbs={[{ label: "Company hub", href: "/hub" }, { label: item.title, href: `/hub/${item.id}` }, { label: "Edit" }]}
        description={item.status === "PUBLISHED" ? "This item is live. Saving changes publishes a new version straight away; the old version stays in the history." : undefined}
      />
      <HubForm
        contentId={item.id}
        version={item.version}
        clientToken={randomUUID()}
        initial={{
          type: item.type, title: item.title, body: item.body, resourceUrl: item.resourceUrl ?? "",
          scope: item.audienceScope, departmentIds: item.audiences.map((x) => x.departmentId),
        }}
        allowed={{ companyWide: a.companyWide, departments }}
        cancelHref={`/hub/${item.id}`}
      />
    </Shell>
  );
}
