import { Command } from "commander";
import { createRequire } from "node:module";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { createLogger, redactSecrets } from "./logging.js";
import { DiscordRebackupAdapter } from "./backup/adapter.js";
import { createGuildSnapshot } from "./backup/create.js";
import { applyRetention } from "./backup/retention.js";
import { resolveSnapshotReference, listSnapshotRecords } from "./backup/paths.js";
import { validateSnapshot } from "./backup/validate.js";
import { restoreGuildSnapshot } from "./backup/restore.js";
import { checkHealth } from "./health/status.js";
import { checkGuildPermissions, fetchConfiguredGuilds, loginDiscord } from "./discord/client.js";
import { runDaemon } from "./daemon.js";
import { clearStaleLock } from "./backup/lock.js";
import { writeFileAtomic } from "./backup/atomic.js";

const require = createRequire(import.meta.url);

export async function runCli(argv: string[]): Promise<void> {
  const program = new Command();
  program
    .name("discord-server-snapshot")
    .description("Self-hosted point-in-time snapshots and recovery for Discord servers.")
    .version("0.1.0");

  program
    .command("daemon")
    .description("Run the scheduled backup daemon.")
    .action(wrap(runDaemonCommand));
  program
    .command("healthcheck")
    .description("Validate daemon health status.")
    .action(wrap(runHealthcheckCommand));
  program
    .command("backup")
    .option("--guild <id>", "Back up one configured guild.")
    .description("Run an immediate backup.")
    .action(wrap(runBackupCommand));
  program
    .command("list")
    .option("--guild <id>", "List one guild.")
    .option("--json", "Print JSON.")
    .description("List snapshots.")
    .action(wrap(runListCommand));
  program
    .command("inspect")
    .requiredOption("--guild <id>", "Guild ID.")
    .requiredOption("--snapshot <path-or-timestamp>", "Snapshot path or timestamp.")
    .option("--json", "Print full manifest JSON.")
    .description("Inspect a snapshot manifest.")
    .action(wrap(runInspectCommand));
  program
    .command("validate")
    .requiredOption("--guild <id>", "Guild ID.")
    .requiredOption("--snapshot <path-or-timestamp>", "Snapshot path or timestamp.")
    .description("Validate snapshot JSON, checksum, and manifest.")
    .action(wrap(runValidateCommand));
  program
    .command("prune")
    .option("--guild <id>", "Prune one guild.")
    .option("--dry-run", "Show files that would be removed.")
    .description("Apply retention policy.")
    .action(wrap(runPruneCommand));
  program
    .command("restore")
    .requiredOption("--guild <id>", "Target guild ID.")
    .requiredOption("--snapshot <path-or-timestamp>", "Snapshot path or timestamp.")
    .option("--clear-guild", "Clear target guild before restore.")
    .option("--yes", "Skip interactive prompts; requires --acknowledge-destructive-restore.")
    .option("--acknowledge-destructive-restore", "Acknowledge restore can be destructive.")
    .option("--skip-pre-restore-backup", "Skip mandatory pre-restore backup.")
    .description("Restore a snapshot into a guild through a safe shell workflow.")
    .action(wrap(runRestoreCommand));
  program
    .command("doctor")
    .description("Check configuration, Discord access, storage, and dependencies.")
    .action(wrap(runDoctorCommand));

  await program.parseAsync(argv);
}

function wrap<T>(fn: (options: T) => Promise<void>) {
  return async (options: T) => {
    try {
      await fn(options);
    } catch (error) {
      console.error(redactSecrets(error));
      process.exitCode = 1;
    }
  };
}

async function runDaemonCommand(): Promise<void> {
  const config = loadConfig();
  await runDaemon(config, new DiscordRebackupAdapter(), createLogger(config.logLevel));
}

async function runHealthcheckCommand(): Promise<void> {
  const config = loadConfig({ requireDiscord: false });
  await checkHealth(config);
  console.log("healthy");
}

async function runBackupCommand(options: { guild?: string }): Promise<void> {
  const config = loadConfig();
  const client = await loginDiscord(config);
  const guildIds = selectGuilds(config.discordGuildIds, options.guild);
  const guilds = await fetchConfiguredGuilds(client, guildIds);
  const adapter = new DiscordRebackupAdapter();
  let failed = false;
  for (const guild of guilds) {
    try {
      const record = await createGuildSnapshot(config, guild, adapter);
      console.log(`${guild.id} ${record.relativeSnapshotPath} ${record.manifest.sha256}`);
    } catch (error) {
      failed = true;
      console.error(`${guild.id} failed: ${redactSecrets(error)}`);
    }
  }
  await client.destroy();
  if (failed) process.exitCode = 1;
}

async function runListCommand(options: { guild?: string; json?: boolean }): Promise<void> {
  const config = loadConfig({ requireDiscord: false });
  const guildIds = selectGuilds(config.discordGuildIds, options.guild);
  const records = (
    await Promise.all(guildIds.map((guildId) => listSnapshotRecords(config.backupRoot, guildId)))
  ).flat();
  if (options.json) {
    console.log(JSON.stringify(records, null, 2));
    return;
  }
  for (const record of records) {
    console.log(
      `${record.manifest.createdAt} ${record.guildId} ${record.manifest.guildName} ${record.sizeBytes}B ${record.manifest.sha256} roles=${record.manifest.counts.roles} channels=${record.manifest.counts.channels} categories=${record.manifest.counts.categories}`
    );
  }
}

async function runInspectCommand(options: {
  guild: string;
  snapshot: string;
  json?: boolean;
}): Promise<void> {
  const config = loadConfig({ requireDiscord: false });
  const snapshotPath = await resolveSnapshotReference(
    config.backupRoot,
    options.guild,
    options.snapshot
  );
  const validation = await validateSnapshot(snapshotPath, options.guild);
  if (!validation.manifest) throw new Error("Snapshot manifest is missing.");
  if (options.json) {
    console.log(JSON.stringify(validation.manifest, null, 2));
    return;
  }
  console.log(`${validation.manifest.guildName} (${validation.manifest.guildId})`);
  console.log(`Created: ${validation.manifest.createdAt}`);
  console.log(`Snapshot: ${validation.manifest.snapshotFile}`);
  console.log(`Checksum: ${validation.manifest.sha256}`);
  console.log(`Counts: ${JSON.stringify(validation.manifest.counts)}`);
  console.log(`Validation: ${validation.ok ? "ok" : validation.errors.join("; ")}`);
}

async function runValidateCommand(options: { guild: string; snapshot: string }): Promise<void> {
  const config = loadConfig({ requireDiscord: false });
  const snapshotPath = await resolveSnapshotReference(
    config.backupRoot,
    options.guild,
    options.snapshot
  );
  const validation = await validateSnapshot(snapshotPath, options.guild);
  if (!validation.ok) {
    console.error(validation.errors.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log("valid");
}

async function runPruneCommand(options: { guild?: string; dryRun?: boolean }): Promise<void> {
  const config = loadConfig({ requireDiscord: false });
  const guildIds = selectGuilds(config.discordGuildIds, options.guild);
  for (const guildId of guildIds) {
    const result = await applyRetention(config, guildId, { dryRun: options.dryRun ?? false });
    for (const file of result.deleted) {
      console.log(`${options.dryRun ? "would delete" : "deleted"} ${guildId}/${file}`);
    }
  }
}

async function runRestoreCommand(options: {
  guild: string;
  snapshot: string;
  clearGuild?: boolean;
  yes?: boolean;
  acknowledgeDestructiveRestore?: boolean;
  skipPreRestoreBackup?: boolean;
}): Promise<void> {
  const config = loadConfig();
  const client = await loginDiscord(config);
  const [guild] = await fetchConfiguredGuilds(client, [options.guild]);
  if (!guild) throw new Error(`Guild not found: ${options.guild}`);
  await restoreGuildSnapshot(config, guild, new DiscordRebackupAdapter(), {
    snapshot: options.snapshot,
    clearGuild: options.clearGuild ?? false,
    yes: options.yes ?? false,
    acknowledgeDestructiveRestore: options.acknowledgeDestructiveRestore ?? false,
    skipPreRestoreBackup: options.skipPreRestoreBackup ?? false
  });
  await client.destroy();
  console.log("restore completed");
}

async function runDoctorCommand(): Promise<void> {
  const config = loadConfig();
  await mkdir(config.backupRoot, { recursive: true });
  const testFile = path.join(config.backupRoot, ".doctor-atomic-test");
  await writeFileAtomic(testFile, "ok\n");
  await stat(testFile);
  await clearStaleLock(
    path.join(path.dirname(config.backupRoot), "locks", "backup.lock"),
    config.lockTimeoutSeconds
  );
  const client = await loginDiscord(config);
  const guilds = await fetchConfiguredGuilds(client, config.discordGuildIds);
  for (const guild of guilds) {
    const warnings = checkGuildPermissions(guild, config);
    console.log(`${guild.id} ${guild.name}: ${warnings.length === 0 ? "ok" : warnings.join("; ")}`);
  }
  await client.destroy();
  console.log(`discord-rebackup ${dependencyVersion("discord-rebackup")}`);
  console.log(`discord.js ${dependencyVersion("discord.js")}`);
}

function selectGuilds(configuredGuildIds: string[], requestedGuildId?: string): string[] {
  if (requestedGuildId) return [requestedGuildId];
  if (configuredGuildIds.length === 0) {
    throw new Error("No guild IDs configured; pass --guild or set DISCORD_GUILD_IDS.");
  }
  return configuredGuildIds;
}

function dependencyVersion(packageName: string): string {
  if (packageName === "discord.js") {
    const discordJs = require("discord.js") as { version: string };
    return discordJs.version;
  }
  const packageJson = require(`${packageName}/package.json`) as { version: string };
  return packageJson.version;
}
