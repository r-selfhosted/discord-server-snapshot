import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Guild } from "discord.js";
import type { AppConfig } from "../config.js";
import type { GuildBackupAdapter } from "./adapter.js";
import { createGuildSnapshot } from "./create.js";
import { resolveSnapshotReference } from "./paths.js";
import { readValidatedSnapshot, validateSnapshot } from "./validate.js";
import { writeJsonAtomic } from "./atomic.js";

export interface RestoreOptions {
  snapshot: string;
  clearGuild: boolean;
  yes: boolean;
  acknowledgeDestructiveRestore: boolean;
  skipPreRestoreBackup: boolean;
}

export async function restoreGuildSnapshot(
  config: AppConfig,
  guild: Guild,
  adapter: GuildBackupAdapter,
  options: RestoreOptions
): Promise<void> {
  if (options.yes && !options.acknowledgeDestructiveRestore) {
    throw new Error("--yes requires --acknowledge-destructive-restore.");
  }
  const snapshotPath = await resolveSnapshotReference(
    config.backupRoot,
    guild.id,
    options.snapshot
  );
  const validation = await validateSnapshot(snapshotPath);
  if (!validation.ok) {
    throw new Error(`Snapshot validation failed: ${validation.errors.join("; ")}`);
  }
  if (!options.yes) {
    await confirmRestore(guild.id, options.clearGuild);
  }
  let preRestoreSnapshot: string | null = null;
  if (!options.skipPreRestoreBackup) {
    const record = await createGuildSnapshot(config, guild, adapter);
    preRestoreSnapshot = record.relativeSnapshotPath;
  }
  const backupData = await readValidatedSnapshot(snapshotPath);
  await adapter.restore(guild, backupData, {
    clearGuildBeforeRestore: options.clearGuild,
    maxMessagesPerChannel: config.backupMaxMessagesPerChannel,
    allowedMentions: { parse: [] },
    selfBot: false,
    devMode: false
  });
  await writeRestoreAudit(config, guild, {
    snapshotPath,
    clearGuild: options.clearGuild,
    preRestoreSnapshot
  });
}

export async function confirmRestore(guildId: string, clearGuild: boolean): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    const typedGuild = await rl.question(`Type target guild ID ${guildId} to continue restore: `);
    if (typedGuild.trim() !== guildId)
      throw new Error("Restore confirmation did not match target guild ID.");
    if (clearGuild) {
      const typedClear = await rl.question(
        "Type CLEAR GUILD to confirm destructive clearing before restore: "
      );
      if (typedClear.trim() !== "CLEAR GUILD") {
        throw new Error("Destructive restore confirmation was not provided.");
      }
    }
  } finally {
    rl.close();
  }
}

async function writeRestoreAudit(
  config: AppConfig,
  guild: Guild,
  inputData: { snapshotPath: string; clearGuild: boolean; preRestoreSnapshot: string | null }
): Promise<void> {
  const directory = path.join(path.dirname(config.backupRoot), "restore-history");
  await mkdir(directory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/:/g, "-");
  await writeJsonAtomic(
    path.join(directory, `${timestamp}-${guild.id}.json`),
    {
      schemaVersion: 1,
      restoredAt: new Date().toISOString(),
      targetGuildId: guild.id,
      targetGuildName: guild.name,
      sourceSnapshot: inputData.snapshotPath,
      clearGuildBeforeRestore: inputData.clearGuild,
      preRestoreSnapshot: inputData.preRestoreSnapshot
    },
    true
  );
}
