import { constants } from "node:fs";
import { mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export async function writeFileAtomic(targetPath: string, content: string | Buffer): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`
  );
  const handle = await open(
    tempPath,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600
  );
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tempPath, targetPath);
}

export async function writeJsonAtomic(
  targetPath: string,
  value: unknown,
  pretty: boolean
): Promise<void> {
  const content = `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`;
  JSON.parse(content);
  await writeFileAtomic(targetPath, content);
}

export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function removeOldTempFiles(
  directory: string,
  olderThanMs: number
): Promise<string[]> {
  const { readdir, stat } = await import("node:fs/promises");
  const removed: string[] = [];
  const now = Date.now();
  const entries = await readdir(directory, { recursive: true, withFileTypes: true }).catch(
    () => []
  );
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".tmp")) continue;
    const parentPath = "parentPath" in entry ? String(entry.parentPath) : directory;
    const filePath = path.join(parentPath, entry.name);
    const fileStat = await stat(filePath).catch(() => null);
    if (fileStat && now - fileStat.mtimeMs > olderThanMs) {
      await rm(filePath, { force: true });
      removed.push(filePath);
    }
  }
  return removed;
}
