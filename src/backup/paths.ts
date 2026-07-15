import path from "node:path";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import type { LatestPointer, SnapshotManifest, SnapshotRecord } from "../types.js";

export function safeTimestamp(date = new Date()): string {
  return date.toISOString().replace(/:/g, "-");
}

export function parseSafeTimestamp(value: string): Date {
  const normalized = value.replace(
    /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2}\.\d{3}Z)$/,
    "$1:$2:$3"
  );
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid snapshot timestamp: ${value}`);
  }
  return date;
}

export function guildRoot(backupRoot: string, guildId: string): string {
  return path.join(backupRoot, guildId);
}

export function snapshotsRoot(backupRoot: string, guildId: string): string {
  return path.join(guildRoot(backupRoot, guildId), "snapshots");
}

export function snapshotPaths(backupRoot: string, guildId: string, date = new Date()) {
  const timestamp = safeTimestamp(date);
  const year = timestamp.slice(0, 4);
  const month = timestamp.slice(5, 7);
  const day = timestamp.slice(8, 10);
  const directory = path.join(snapshotsRoot(backupRoot, guildId), year, month, day);
  const snapshotFile = `${timestamp}.json`;
  return {
    timestamp,
    directory,
    snapshotFile,
    snapshotPath: path.join(directory, snapshotFile),
    manifestPath: path.join(directory, `${timestamp}.manifest.json`),
    checksumPath: path.join(directory, `${timestamp}.sha256`),
    relativeSnapshotPath: path.join("snapshots", year, month, day, snapshotFile),
    relativeManifestPath: path.join("snapshots", year, month, day, `${timestamp}.manifest.json`)
  };
}

export async function ensureGuildDirectories(backupRoot: string, guildId: string): Promise<void> {
  await mkdir(snapshotsRoot(backupRoot, guildId), { recursive: true });
}

export async function resolveSnapshotReference(
  backupRoot: string,
  guildId: string,
  reference: string
): Promise<string> {
  if (path.isAbsolute(reference)) return reference;
  if (reference.includes("/") || reference.includes("\\")) {
    return path.join(guildRoot(backupRoot, guildId), reference);
  }
  const withExt = reference.endsWith(".json") ? reference : `${reference}.json`;
  const found = await findSnapshotByFileName(snapshotsRoot(backupRoot, guildId), withExt);
  if (!found) {
    throw new Error(`Snapshot not found for guild ${guildId}: ${reference}`);
  }
  return found;
}

export async function latestPointer(
  backupRoot: string,
  guildId: string
): Promise<LatestPointer | null> {
  try {
    return JSON.parse(
      await readFile(path.join(guildRoot(backupRoot, guildId), "latest.json"), "utf8")
    ) as LatestPointer;
  } catch {
    return null;
  }
}

export async function listSnapshotRecords(
  backupRoot: string,
  guildId: string
): Promise<SnapshotRecord[]> {
  const root = snapshotsRoot(backupRoot, guildId);
  const files = await walk(root).catch(() => []);
  const snapshotFiles = files.filter(
    (file) => file.endsWith(".json") && !file.endsWith(".manifest.json")
  );
  const records = await Promise.all(
    snapshotFiles.map(async (snapshotPath) => {
      const manifestPath = snapshotPath.replace(/\.json$/, ".manifest.json");
      const checksumPath = snapshotPath.replace(/\.json$/, ".sha256");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as SnapshotManifest;
      const size = await stat(snapshotPath);
      return {
        guildId,
        snapshotPath,
        manifestPath,
        checksumPath,
        relativeSnapshotPath: path.relative(guildRoot(backupRoot, guildId), snapshotPath),
        manifest,
        sizeBytes: size.size
      } satisfies SnapshotRecord;
    })
  );
  return records.sort((a, b) => b.manifest.createdAt.localeCompare(a.manifest.createdAt));
}

async function findSnapshotByFileName(root: string, filename: string): Promise<string | null> {
  const files = await walk(root).catch(() => []);
  return files.find((file) => path.basename(file) === filename) ?? null;
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return walk(entryPath);
      return [entryPath];
    })
  );
  return results.flat();
}
