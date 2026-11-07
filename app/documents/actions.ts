"use server";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditMeta, canManageDocuments, MAX_DOC_BYTES, newStorageKey, validateUpload } from "@/lib/documents";
import { putFile, removeFile, sha256 } from "@/lib/document-storage";

/** Redirect back with a message. Never call inside try/catch (redirect throws). */
function back(path: string, kind: "error" | "ok", msg: string, keep?: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams({ [kind]: msg, ...(keep ?? {}) }).toString()}`);
}
const g = (f: FormData, k: string) => String(f.get(k) ?? "");

/** Add a document for one person. HR head only, never about themselves. The file itself is never echoed back into the form. */
export async function uploadDocument(formData: FormData) {
  const user = await requireUser();
  const raw = { subjectId: g(formData, "subjectId"), kind: g(formData, "kind"), note: g(formData, "note"), clientToken: g(formData, "clientToken") };
  const keep = { subjectId: raw.subjectId, kind: raw.kind, note: raw.note, clientToken: raw.clientToken };
  const fail = (m: string): never => back("/documents/new", "error", m, keep);

  // Same answer whether the person exists or not, so this form cannot be used to probe.
  if (!raw.subjectId || !canManageDocuments(user, raw.subjectId)) {
    await db.auditEvent.create({ data: { actorUserId: user.id, action: "document.upload", resourceType: "document", outcome: "denied" } });
    redirect("/");
  }
  if (raw.clientToken.length < 8 || raw.clientToken.length > 80) fail("Could not submit the form. Reload and try again.");
  const dup = await db.employeeDocument.findUnique({ where: { clientToken: raw.clientToken }, select: { uploadedById: true, subjectId: true } });
  if (dup) {
    if (dup.uploadedById !== user.id) fail("Could not submit the form.");
    back("/documents", "ok", "Document added.", { person: dup.subjectId });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) fail("Choose a file.");
  if ((file as File).size > MAX_DOC_BYTES) fail("The file is larger than 5 MB.");
  const subject = await db.user.findUnique({ where: { id: raw.subjectId }, select: { id: true, status: true } });
  if (!subject || subject.status !== "ACTIVE") fail("Choose an active person.");

  const bytes = new Uint8Array(await (file as File).arrayBuffer());
  const v = validateUpload({ kind: raw.kind, fileName: (file as File).name, bytes, note: raw.note });
  if (!v.ok) return fail(v.error);

  const key = newStorageKey(v.ext);
  try {
    await putFile(key, bytes);
  } catch (e) {
    console.error("uploadDocument: storage write failed", e);
    fail("The file could not be stored. Nothing was saved; please try again.");
  }
  try {
    await db.$transaction(async (tx) => {
      const d = await tx.employeeDocument.create({
        data: {
          subjectId: subject!.id, kind: v.kind, fileName: v.name, mimeType: v.mime, sizeBytes: bytes.length, sha256: sha256(bytes),
          storageKey: key, note: v.note, uploadedById: user.id, clientToken: raw.clientToken,
        },
      });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "document.upload", resourceType: "document", resourceId: d.id, outcome: "success", metadata: { ...auditMeta({ kind: v.kind, sizeBytes: bytes.length }), subjectId: subject!.id } } });
    });
  } catch (e) {
    // The row did not commit, so the stored file would be an orphan with no owner.
    await removeFile(key).catch((x) => console.error("uploadDocument: could not remove orphan file", x));
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await db.employeeDocument.findUnique({ where: { clientToken: raw.clientToken }, select: { uploadedById: true, subjectId: true } });
      if (again && again.uploadedById === user.id) back("/documents", "ok", "Document added.", { person: again.subjectId });
    }
    console.error("uploadDocument failed", e);
    fail("The document could not be saved. Nothing was added; please try again.");
  }
  back("/documents", "ok", "Document added.", { person: subject!.id });
}

/** Remove a document and its file. HR head only, never about themselves. The audit event keeps kind and size, not the name. */
export async function deleteDocument(formData: FormData) {
  const user = await requireUser();
  const id = g(formData, "id");
  const doc = id ? await db.employeeDocument.findUnique({ where: { id } }) : null;
  if (!doc || !canManageDocuments(user, doc.subjectId)) {
    if (doc) await db.auditEvent.create({ data: { actorUserId: user.id, action: "document.delete", resourceType: "document", resourceId: doc.id, outcome: "denied" } });
    back("/documents", "error", "That document is not available.");
  }
  const d = doc!;
  try {
    await db.$transaction(async (tx) => {
      await tx.employeeDocument.delete({ where: { id: d.id } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "document.delete", resourceType: "document", resourceId: d.id, outcome: "success", metadata: { ...auditMeta(d), subjectId: d.subjectId } } });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") back("/documents", "ok", "Document removed.", { person: d.subjectId });
    console.error("deleteDocument failed", e);
    back("/documents", "error", "The document could not be removed. Nothing changed; please try again.", { person: d.subjectId });
  }
  await removeFile(d.storageKey).catch((x) => console.error("deleteDocument: row removed but file remains", d.id, x));
  back("/documents", "ok", "Document removed.", { person: d.subjectId });
}
