"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayStr } from "@/lib/tasks";
import { MANAGEMENT_SLUG, chooseApproverDepartment } from "@/lib/leave";
import { OPERATIONS_SLUG } from "@/lib/vendors";
import {
  PURCHASE_NOTIFY, PURCHASE_SUBMITTED_TITLE, PURCHASE_TO_ORDER_TITLE, canViewPurchase, decidePurchase, formatMoney, validatePurchase, vendorUsable,
  type PurchaseAction,
} from "@/lib/purchases";

/** Redirect back with a message. Never call inside try/catch (redirect throws). */
function back(path: string, kind: "error" | "ok", msg: string, keep?: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams({ [kind]: msg, ...(keep ?? {}) }).toString()}`);
}
const g = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function submitPurchase(formData: FormData) {
  const user = await requireUser();
  const raw = {
    title: g(formData, "title"), justification: g(formData, "justification"), category: g(formData, "category"), quantity: g(formData, "quantity"),
    amount: g(formData, "amount"), currency: g(formData, "currency"), neededBy: g(formData, "neededBy"), clientToken: g(formData, "clientToken"),
  };
  const fail = (m: string): never => back("/purchases/new", "error", m, raw);

  if (raw.clientToken.length < 8 || raw.clientToken.length > 80) fail("Could not submit the form. Reload and try again.");
  const dup = await db.purchaseRequest.findUnique({ where: { clientToken: raw.clientToken }, select: { id: true, requesterId: true } });
  if (dup) {
    if (dup.requesterId !== user.id) fail("Could not submit the form.");
    redirect(`/purchases/${dup.id}`);
  }
  const v = validatePurchase(raw, todayStr());
  if (!v.ok) return fail(v.error);

  // An approver and an orderer must exist now, so a request is never submitted that nobody can decide or order.
  const deptIds = user.memberships.map((m) => m.departmentId);
  const mgmt = await db.department.findUnique({ where: { slug: MANAGEMENT_SLUG }, select: { id: true } });
  const headRows = await db.departmentMembership.findMany({
    where: { type: "HEAD", departmentId: { in: [...deptIds, ...(mgmt ? [mgmt.id] : [])] }, user: { status: "ACTIVE" } },
    select: { departmentId: true, userId: true },
  });
  const headsByDept: Record<string, string[]> = {};
  for (const h of headRows) (headsByDept[h.departmentId] ??= []).push(h.userId);
  const approverDepartmentId = chooseApproverDepartment(user.id, deptIds, headsByDept, mgmt?.id ?? null);
  if (!approverDepartmentId) fail("There is nobody who can approve this yet. Ask an administrator to assign a department head.");
  const opsHeads = await db.departmentMembership.count({
    where: { type: "HEAD", department: { slug: OPERATIONS_SLUG }, user: { status: "ACTIVE" }, userId: { not: user.id } },
  });
  if (opsHeads === 0) fail("There is nobody in Operations who could place the order yet. Ask an administrator to assign an Operations head.");

  const approvers = (headsByDept[approverDepartmentId!] ?? []).filter((id) => id !== user.id);
  let id: string;
  try {
    const created = await db.$transaction(async (tx) => {
      const x = await tx.purchaseRequest.create({
        data: {
          requesterId: user.id, title: v.title, justification: v.justification, category: v.category, quantity: v.quantity,
          estimatedMinor: v.estimatedMinor, currency: v.currency, neededBy: v.neededBy ? new Date(`${v.neededBy}T00:00:00.000Z`) : null,
          approverDepartmentId: approverDepartmentId!, clientToken: raw.clientToken,
        },
      });
      await tx.purchaseEvent.create({ data: { purchaseId: x.id, actorId: user.id, action: "submit", toStatus: "SUBMITTED" } });
      for (const uid of approvers) await tx.notification.create({ data: { userId: uid, type: "purchase.submitted", title: PURCHASE_SUBMITTED_TITLE, purchaseId: x.id } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "purchase.submit", resourceType: "purchase", resourceId: x.id, outcome: "success", metadata: { estimatedMinor: v.estimatedMinor, currency: v.currency } } });
      return x;
    });
    id = created.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await db.purchaseRequest.findUnique({ where: { clientToken: raw.clientToken }, select: { id: true, requesterId: true } });
      if (again && again.requesterId === user.id) redirect(`/purchases/${again.id}`);
    }
    console.error("submitPurchase failed", e);
    fail("The request could not be saved. Nothing was sent; please try again.");
  }
  revalidatePath("/purchases");
  redirect(`/purchases/${id!}`);
}

const SUCCESS: Record<PurchaseAction, string> = {
  approve: "Request approved. Operations has been told it is ready to order.",
  reject: "Request rejected. The requester has been notified.",
  cancel: "Request cancelled.",
  order: "Order recorded. The requester has been notified.",
  receive: "Marked as received. Thank you.",
};

/** One entry point for approve, reject, cancel, order and receive. Roles come from stored data; the write is status-guarded. */
export async function actOnPurchase(formData: FormData) {
  const user = await requireUser();
  const id = g(formData, "purchaseId");
  const action = g(formData, "action");
  const path = `/purchases/${id}`;

  const x = await db.purchaseRequest.findUnique({ where: { id } });
  // Same reply for missing and forbidden so IDs cannot be probed.
  if (!x || !canViewPurchase(user, x)) redirect("/purchases");

  const dec = decidePurchase(user, x, action, g(formData, "text"));
  if (!dec.ok) back(path, dec.code === "ALREADY_DONE" ? "ok" : "error", dec.message);
  const ok = dec as Extract<typeof dec, { ok: true }>;
  const act = action as PurchaseAction;
  const notify = PURCHASE_NOTIFY[act];

  // The vendor is looked up on the server; the form only names it. It must exist and be active.
  let vendorId: string | null = null;
  if (act === "order") {
    const vendor = await db.vendor.findUnique({ where: { id: g(formData, "vendorId") }, select: { id: true, status: true } });
    if (!vendorUsable(vendor)) back(path, "error", "Choose an active vendor from the register.");
    vendorId = vendor!.id;
  }

  try {
    await db.$transaction(async (tx) => {
      const now = new Date();
      const data: Prisma.PurchaseRequestUncheckedUpdateManyInput =
        act === "approve" || act === "reject" ? { status: ok.to, decidedById: user.id, decidedAt: now, decisionNote: ok.text }
        : act === "order" ? { status: ok.to, orderedById: user.id, orderedAt: now, orderRef: ok.text, vendorId }
        : act === "receive" ? { status: ok.to, receivedAt: now }
        : { status: ok.to };
      // Status-guarded: if someone else got there first, nothing is written.
      const res = await tx.purchaseRequest.updateMany({ where: { id: x.id, status: x.status }, data });
      if (res.count !== 1) throw new Error("STALE");
      await tx.purchaseEvent.create({ data: { purchaseId: x.id, actorId: user.id, action: act, fromStatus: x.status, toStatus: ok.to, comment: act === "order" ? null : ok.text } });
      const targets = notify.to === "requester" ? [x.requesterId]
        : (await tx.departmentMembership.findMany({ where: { type: "HEAD", departmentId: x.approverDepartmentId, userId: { not: x.requesterId }, user: { status: "ACTIVE" } }, select: { userId: true } })).map((t) => t.userId);
      for (const uid of targets) await tx.notification.create({ data: { userId: uid, type: `purchase.${act}`, title: notify.title, purchaseId: x.id } });
      if (act === "approve") {
        const ops = await tx.departmentMembership.findMany({ where: { type: "HEAD", department: { slug: OPERATIONS_SLUG }, userId: { not: x.requesterId }, user: { status: "ACTIVE" } }, select: { userId: true } });
        for (const o of ops) await tx.notification.create({ data: { userId: o.userId, type: "purchase.to_order", title: PURCHASE_TO_ORDER_TITLE, purchaseId: x.id } });
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: `purchase.${act}`, resourceType: "purchase", resourceId: x.id, outcome: "success", metadata: { from: x.status, to: ok.to, estimate: formatMoney(x.estimatedMinor, x.currency), ...(vendorId ? { vendorId } : {}) } } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This request changed since you opened it. Review it and try again.");
    console.error("actOnPurchase failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath("/purchases");
  back(path, "ok", SUCCESS[act]);
}
