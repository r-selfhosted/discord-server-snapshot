import { rm } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config.js";
import { latestPointer, listSnapshotRecords } from "./paths.js";

export interface RetentionResult {
  deleted: string[];
  kept: string[];
}

export async function applyRetention(
  config: AppConfig,
  guildId: string,
  options: { dryRun?: boolean; now?: Date } = {}
): Promise<RetentionResult> {
  const records = await listSnapshotRecords(config.backupRoot, guildId);
  const latest = await latestPointer(config.backupRoot, guildId);
  const latestSnapshot = latest?.snapshot;
  const cutoff =
    (options.now ?? new Date()).getTime() - config.backupRetentionDays * 24 * 60 * 60 * 1000;
  const newestProtected = new Set(
    records.slice(0, config.backupMinimumKeep).map((record) => record.relativeSnapshotPath)
  );
  const deleted: string[] = [];
  const kept: string[] = [];

  for (const record of records) {
    const createdAt = new Date(record.manifest.createdAt).getTime();
    const protectedByLatest = latestSnapshot === record.relativeSnapshotPath;
    const protectedByMinimum = newestProtected.has(record.relativeSnapshotPath);
    if (createdAt < cutoff && !protectedByLatest && !protectedByMinimum) {
      deleted.push(record.relativeSnapshotPath);
      if (!options.dryRun) {
        await rm(record.snapshotPath, { force: true });
        await rm(record.manifestPath, { force: true });
        await rm(record.checksumPath, { force: true });
      }
    } else {
      kept.push(record.relativeSnapshotPath);
    }
  }
  return { deleted: deleted.map((file) => path.normalize(file)), kept };
}
