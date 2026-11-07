import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSafeStorageKey } from "./documents";

/** Private on-disk store (a Docker volume, never under /public). Bytes never go in a database row. */
const dir = () => path.resolve(process.env.DOCUMENTS_DIR || "/data/documents");

function fileFor(key: string): string {
  if (!isSafeStorageKey(key)) throw new Error("unsafe storage key");
  return path.join(dir(), key);
}
export const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export async function putFile(key: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dir(), { recursive: true, mode: 0o700 });
  await writeFile(fileFor(key), bytes, { flag: "wx", mode: 0o600 });
}
export async function getFile(key: string): Promise<Buffer | null> {
  try { return await readFile(fileFor(key)); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
export async function removeFile(key: string): Promise<void> {
  try { await unlink(fileFor(key)); } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
