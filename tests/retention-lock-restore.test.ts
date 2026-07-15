import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createGuildSnapshot } from "../src/backup/create.js";
import type { GuildBackupAdapter } from "../src/backup/adapter.js";
import { applyRetention } from "../src/backup/retention.js";
import { acquireBackupLock } from "../src/backup/lock.js";
import { restoreGuildSnapshot } from "../src/backup/restore.js";
import { backupData, testConfig } from "./snapshot.test.js";

describe("retention, locking, restore safety", () => {
  it("keeps minimum snapshots and latest pointer when pruning", async () => {
    const backupRoot = await mkdtemp(path.join(os.tmpdir(), "dss-retention-"));
    const config = { ...testConfig(backupRoot), backupRetentionDays: 1, backupMinimumKeep: 2 };
    const guild = { id: "123456789012345678", name: "Test Guild" };
    const adapter = mockAdapter(guild.id, guild.name);
    await createGuildSnapshot(config, guild as never, adapter, {
      now: new Date("2026-07-10T08:00:00.000Z")
    });
    await createGuildSnapshot(config, guild as never, adapter, {
      now: new Date("2026-07-11T08:00:00.000Z")
    });
    await createGuildSnapshot(config, guild as never, adapter, {
      now: new Date("2026-07-15T08:00:00.000Z")
    });

    const result = await applyRetention(config, guild.id, {
      now: new Date("2026-07-15T09:00:00.000Z"),
      dryRun: true
    });
    expect(result.deleted).toEqual(["snapshots/2026/07/10/2026-07-10T08-00-00.000Z.json"]);
  });

  it("prevents concurrent backup locks", async () => {
    const backupRoot = await mkdtemp(path.join(os.tmpdir(), "dss-lock-"));
    const lock = await acquireBackupLock(backupRoot, 3600);
    await expect(acquireBackupLock(backupRoot, 3600)).rejects.toThrow(/already running/);
    await lock.release();
  });

  it("requires destructive acknowledgement when --yes is used for restore", async () => {
    const backupRoot = await mkdtemp(path.join(os.tmpdir(), "dss-restore-"));
    const config = testConfig(backupRoot);
    const guild = { id: "123456789012345678", name: "Test Guild" };
    const adapter = mockAdapter(guild.id, guild.name);
    const record = await createGuildSnapshot(config, guild as never, adapter, {
      now: new Date("2026-07-15T08:00:00.000Z")
    });
    await expect(
      restoreGuildSnapshot(config, guild as never, adapter, {
        snapshot: record.relativeSnapshotPath,
        clearGuild: false,
        yes: true,
        acknowledgeDestructiveRestore: false,
        skipPreRestoreBackup: true
      })
    ).rejects.toThrow(/requires --acknowledge-destructive-restore/);
  });
});

function mockAdapter(guildId: string, name: string): GuildBackupAdapter {
  return {
    async create() {
      return Promise.resolve(backupData(guildId, name));
    },
    async restore() {}
  };
}
