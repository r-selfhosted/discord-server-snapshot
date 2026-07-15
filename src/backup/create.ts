import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Guild } from "discord.js";
import type { AppConfig } from "../config.js";
import { excludedResources } from "../config.js";
import type { GuildBackupAdapter } from "./adapter.js";
import { createManifest } from "./manifest.js";
import { ensureGuildDirectories, guildRoot, snapshotPaths } from "./paths.js";
import { sha256, writeFileAtomic, writeJsonAtomic } from "./atomic.js";
import { validateSnapshot } from "./validate.js";
import type { GuildMetadata, SnapshotRecord } from "../types.js";

export async function createGuildSnapshot(
  config: AppConfig,
  guild: Guild,
  adapter: GuildBackupAdapter,
  options: { now?: Date } = {}
): Promise<SnapshotRecord> {
  await ensureGuildDirectories(config.backupRoot, guild.id);
  const createdAt = options.now ?? new Date();
  const paths = snapshotPaths(config.backupRoot, guild.id, createdAt);
  const doNotBackup = excludedResources(config);
  const backupData = await adapter.create(guild, {
    jsonSave: false,
    jsonBeautify: config.backupPrettyJson,
    maxMessagesPerChannel: config.backupMaxMessagesPerChannel,
    saveImages: config.backupImages === "base64",
    doNotBackup,
    backupMembers: false,
    selfBot: false
  });
  const snapshotJson = `${JSON.stringify(backupData, null, config.backupPrettyJson ? 2 : 0)}\n`;
  JSON.parse(snapshotJson);
  const checksum = sha256(snapshotJson);
  await writeFileAtomic(paths.snapshotPath, snapshotJson);
  const validation = await validateSnapshot(paths.snapshotPath, guild.id);
  if (validation.errors.some((error) => error.startsWith("Snapshot JSON"))) {
    throw new Error(`Snapshot validation failed after write: ${validation.errors.join("; ")}`);
  }
  await writeFileAtomic(paths.checksumPath, `${checksum}  ${paths.snapshotFile}\n`);
  const manifest = createManifest({
    config,
    guildId: guild.id,
    guildName: guild.name,
    createdAt: createdAt.toISOString(),
    snapshotFile: paths.snapshotFile,
    sha256: checksum,
    backupData,
    excludedResources: doNotBackup
  });
  await writeJsonAtomic(paths.manifestPath, manifest, true);
  await writeJsonAtomic(
    path.join(guildRoot(config.backupRoot, guild.id), "latest.json"),
    {
      schemaVersion: 1,
      guildId: guild.id,
      updatedAt: new Date().toISOString(),
      snapshot: paths.relativeSnapshotPath,
      manifest: paths.relativeManifestPath,
      sha256: checksum
    },
    true
  );
  await updateGuildMetadata(config.backupRoot, guild.id, guild.name, createdAt.toISOString());
  return {
    guildId: guild.id,
    snapshotPath: paths.snapshotPath,
    manifestPath: paths.manifestPath,
    checksumPath: paths.checksumPath,
    relativeSnapshotPath: paths.relativeSnapshotPath,
    manifest,
    sizeBytes: Buffer.byteLength(snapshotJson)
  };
}

async function updateGuildMetadata(
  backupRoot: string,
  guildId: string,
  guildName: string,
  timestamp: string
): Promise<void> {
  const filePath = path.join(guildRoot(backupRoot, guildId), "guild.json");
  let existing: GuildMetadata | null;
  try {
    existing = JSON.parse(await readFile(filePath, "utf8")) as GuildMetadata;
  } catch {
    existing = null;
  }
  const next: GuildMetadata = {
    guildId,
    lastKnownName: guildName,
    firstBackupAt: existing?.firstBackupAt ?? timestamp,
    lastBackupAt: timestamp
  };
  await writeJsonAtomic(filePath, next, true);
}

export async function assertBackupRootWritable(backupRoot: string): Promise<void> {
  const testPath = path.join(backupRoot, ".write-test");
  await writeFile(path.join(backupRoot, ".mkdir-test"), "");
  await writeFileAtomic(testPath, "ok\n");
  await readFile(testPath, "utf8");
}
