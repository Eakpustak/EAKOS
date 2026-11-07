import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { attachmentHeader, auditMeta, canReadDocument } from "@/lib/documents";
import { getFile } from "@/lib/document-storage";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/** Authorized download. A missing document and a forbidden one look the same to the caller; a forbidden attempt is audited. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const doc = await db.employeeDocument.findUnique({ where: { id: params.id } });
  if (!doc) return notFound();
  if (!canReadDocument(user, doc.subjectId)) {
    await db.auditEvent.create({ data: { actorUserId: user.id, action: "document.download", resourceType: "document", resourceId: doc.id, outcome: "denied" } });
    return notFound();
  }
  let bytes: Buffer | null;
  try { bytes = await getFile(doc.storageKey); } catch (e) {
    console.error("document download: storage read failed", doc.id, e);
    return new Response("Storage error", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  if (!bytes) {
    console.error("document download: file missing on disk", doc.id);
    await db.auditEvent.create({ data: { actorUserId: user.id, action: "document.download", resourceType: "document", resourceId: doc.id, outcome: "missing" } });
    return notFound();
  }
  await db.auditEvent.create({ data: { actorUserId: user.id, action: "document.download", resourceType: "document", resourceId: doc.id, outcome: "success", metadata: { ...auditMeta(doc), subjectId: doc.subjectId } } });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": attachmentHeader(doc.fileName),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
