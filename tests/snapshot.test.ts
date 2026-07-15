import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config.js";
import { createGuildSnapshot } from "../src/backup/create.js";
import { listSnapshotRecords, latestPointer, safeTimestamp } from "../src/backup/paths.js";
import { validateSnapshot } from "../src/backup/validate.js";
import type { GuildBackupAdapter } from "../src/backup/adapter.js";

describe("snapshot storage", () => {
  it("writes atomic snapshot, manifest, checksum, guild metadata, and latest pointer", async () => {
    const backupRoot = await mkdtemp(path.join(os.tmpdir(), "dss-snapshot-"));
    const config = testConfig(backupRoot);
    const guild = { id: "123456789012345678", name: "Test Guild" };
    const adapter: GuildBackupAdapter = {
      async create() {
        return Promise.resolve(backupData(guild.id, guild.name));
      },
      async restore() {}
    };
    const record = await createGuildSnapshot(config, guild as never, adapter, {
      now: new Date("2026-07-15T08:00:00.000Z")
    });

    expect(record.relativeSnapshotPath).toBe("snapshots/2026/07/15/2026-07-15T08-00-00.000Z.json");
    expect((await validateSnapshot(record.snapshotPath, guild.id)).ok).toBe(true);
    expect((await latestPointer(backupRoot, guild.id))?.snapshot).toBe(record.relativeSnapshotPath);
    expect(
      JSON.parse(await readFile(path.join(backupRoot, guild.id, "guild.json"), "utf8"))
    ).toMatchObject({
      guildId: guild.id,
      lastKnownName: guild.name
    });
    expect(await listSnapshotRecords(backupRoot, guild.id)).toHaveLength(1);
  });

  it("formats timestamps portably", () => {
    expect(safeTimestamp(new Date("2026-07-15T08:00:00.000Z"))).toBe("2026-07-15T08-00-00.000Z");
  });
});

export function testConfig(backupRoot: string): AppConfig {
  return {
    discordToken: "token",
    discordGuildIds: ["123456789012345678"],
    backupCron: "0 3 * * *",
    backupTimezone: "America/Chicago",
    backupOnStart: true,
    backupRoot,
    backupRetentionDays: 90,
    backupMinimumKeep: 2,
    backupPrettyJson: true,
    backupImages: "base64",
    backupMaxMessagesPerChannel: 0,
    backupExcludeBans: false,
    backupExcludeEmojis: false,
    backupExcludeRoles: false,
    backupExcludeChannels: false,
    logLevel: "silent",
    healthStatusFile: path.join(backupRoot, "..", "status", "health.json"),
    lockTimeoutSeconds: 3600,
    healthGraceSeconds: 93600
  };
}

export function backupData(guildId: string, name: string) {
  return {
    name,
    verificationLevel: 0,
    explicitContentFilter: 0,
    defaultMessageNotifications: 0,
    afk: null,
    widget: { enabled: false, channel: null },
    channels: { categories: [], others: [] },
    roles: [],
    bans: [],
    emojis: [],
    members: [],
    createdTimestamp: Date.now(),
    guildID: guildId,
    id: "999999999999999999"
  };
}
