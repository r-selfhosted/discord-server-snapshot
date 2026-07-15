import cron from "node-cron";
import { CronExpressionParser } from "cron-parser";
import type pino from "pino";
import type { AppConfig } from "./config.js";
import { acquireBackupLock } from "./backup/lock.js";
import { applyRetention } from "./backup/retention.js";
import { createGuildSnapshot } from "./backup/create.js";
import type { GuildBackupAdapter } from "./backup/adapter.js";
import { fetchConfiguredGuilds, loginDiscord } from "./discord/client.js";
import { initialHealth, writeHealthStatus, type HealthStatus } from "./health/status.js";
import { redactSecrets } from "./logging.js";

export async function runDaemon(
  config: AppConfig,
  adapter: GuildBackupAdapter,
  logger: pino.Logger
): Promise<void> {
  const client = await loginDiscord(config);
  const guilds = await fetchConfiguredGuilds(client, config.discordGuildIds);
  const health = initialHealth(config);
  health.nextScheduledRunAt = nextRun(config);
  await writeHealthStatus(config.healthStatusFile, health);
  logger.info({ event: "daemon_started", nextScheduledRunAt: health.nextScheduledRunAt });
  const runCycle = async () => {
    await runBackupCycle(config, guilds, adapter, logger, health);
  };
  if (config.backupOnStart) await runCycle();
  cron.schedule(config.backupCron, runCycle, { timezone: config.backupTimezone });
}

export async function runBackupCycle(
  config: AppConfig,
  guilds: Awaited<ReturnType<typeof fetchConfiguredGuilds>>,
  adapter: GuildBackupAdapter,
  logger: pino.Logger,
  health: HealthStatus
): Promise<boolean> {
  const lock = await acquireBackupLock(config.backupRoot, config.lockTimeoutSeconds);
  let succeeded = true;
  health.lastCycleStartedAt = new Date().toISOString();
  try {
    for (const guild of guilds) {
      const startedAt = Date.now();
      try {
        const record = await createGuildSnapshot(config, guild, adapter);
        await applyRetention(config, guild.id);
        health.guilds[guild.id] = {
          lastBackupAt: new Date().toISOString(),
          lastBackupSucceeded: true,
          lastSnapshot: record.relativeSnapshotPath,
          lastError: null
        };
        logger.info({
          event: "backup_completed",
          guildId: guild.id,
          guildName: guild.name,
          durationMs: Date.now() - startedAt,
          snapshotPath: record.relativeSnapshotPath,
          snapshotSize: record.sizeBytes,
          checksum: record.manifest.sha256,
          counts: record.manifest.counts
        });
      } catch (error) {
        succeeded = false;
        health.guilds[guild.id] = {
          lastBackupAt: new Date().toISOString(),
          lastBackupSucceeded: false,
          lastSnapshot: health.guilds[guild.id]?.lastSnapshot ?? null,
          lastError: redactSecrets(error)
        };
        logger.error({ event: "backup_failed", guildId: guild.id, error: redactSecrets(error) });
      }
    }
  } finally {
    await lock.release();
    health.lastCycleCompletedAt = new Date().toISOString();
    health.lastCycleSucceeded = succeeded;
    health.status = succeeded ? "healthy" : "unhealthy";
    health.nextScheduledRunAt = nextRun(config);
    await writeHealthStatus(config.healthStatusFile, health);
  }
  return succeeded;
}

export function nextRun(config: AppConfig): string | null {
  try {
    return CronExpressionParser.parse(config.backupCron, {
      currentDate: new Date(),
      tz: config.backupTimezone
    })
      .next()
      .toDate()
      .toISOString();
  } catch {
    return null;
  }
}
