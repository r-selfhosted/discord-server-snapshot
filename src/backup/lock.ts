import { constants } from "node:fs";
import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";

export interface BackupLock {
  path: string;
  release(): Promise<void>;
}

export async function acquireBackupLock(root: string, timeoutSeconds: number): Promise<BackupLock> {
  const lockDirectory = path.join(path.dirname(root), "locks");
  await mkdir(lockDirectory, { recursive: true });
  const lockPath = path.join(lockDirectory, "backup.lock");
  await clearStaleLock(lockPath, timeoutSeconds);
  let handle;
  try {
    handle = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  } catch {
    throw new Error(`A backup or restore is already running: ${lockPath}`);
  }
  await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
  await handle.close();
  return {
    path: lockPath,
    async release() {
      await rm(lockPath, { force: true });
    }
  };
}

export async function clearStaleLock(lockPath: string, timeoutSeconds: number): Promise<boolean> {
  const lockStat = await stat(lockPath).catch(() => null);
  if (!lockStat) return false;
  if (Date.now() - lockStat.mtimeMs <= timeoutSeconds * 1000) return false;
  await rm(lockPath, { force: true });
  return true;
}

export async function readLock(lockPath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(lockPath, "utf8")) as unknown;
  } catch {
    return null;
  }
}
