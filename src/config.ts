import { readFile } from "node:fs/promises";
import { z } from "zod";
import cron from "node-cron";

export type ImageStorageMode = "base64" | "url" | "none";

export interface AppConfig {
  discordToken: string | undefined;
  discordGuildIds: string[];
  backupCron: string;
  backupTimezone: string;
  backupOnStart: boolean;
  backupRoot: string;
  backupRetentionDays: number;
  backupMinimumKeep: number;
  backupPrettyJson: boolean;
  backupImages: ImageStorageMode;
  backupMaxMessagesPerChannel: number;
  backupExcludeBans: boolean;
  backupExcludeEmojis: boolean;
  backupExcludeRoles: boolean;
  backupExcludeChannels: boolean;
  logLevel: string;
  healthStatusFile: string;
  lockTimeoutSeconds: number;
  healthGraceSeconds: number;
}

const boolFromEnv = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value, ctx) => {
    if (["true", "1", "yes", "on"].includes(value)) return true;
    if (["false", "0", "no", "off"].includes(value)) return false;
    ctx.addIssue({ code: "custom", message: "expected boolean-like value" });
    return z.NEVER;
  });

const numberFromEnv = z.coerce.number().int();

const envSchema = z.object({
  DISCORD_TOKEN: z.string().optional(),
  DISCORD_TOKEN_FILE: z.string().optional(),
  DISCORD_GUILD_IDS: z.string().default(""),
  BACKUP_CRON: z.string().default("0 3 * * *"),
  BACKUP_TIMEZONE: z.string().default("America/Chicago"),
  BACKUP_ON_START: boolFromEnv.default(true),
  BACKUP_ROOT: z.string().default("/data/backups"),
  BACKUP_RETENTION_DAYS: numberFromEnv.min(1).default(90),
  BACKUP_MINIMUM_KEEP: numberFromEnv.min(1).default(14),
  BACKUP_PRETTY_JSON: boolFromEnv.default(true),
  BACKUP_IMAGES: z.enum(["base64", "url", "none"]).default("base64"),
  BACKUP_MAX_MESSAGES_PER_CHANNEL: numberFromEnv.min(0).default(0),
  BACKUP_EXCLUDE_BANS: boolFromEnv.default(false),
  BACKUP_EXCLUDE_EMOJIS: boolFromEnv.default(false),
  BACKUP_EXCLUDE_ROLES: boolFromEnv.default(false),
  BACKUP_EXCLUDE_CHANNELS: boolFromEnv.default(false),
  LOG_LEVEL: z.string().default("info"),
  HEALTH_STATUS_FILE: z.string().default("/data/status/health.json"),
  LOCK_TIMEOUT_SECONDS: numberFromEnv.min(1).default(3600),
  HEALTH_GRACE_SECONDS: numberFromEnv.min(60).default(93600)
});

export interface LoadConfigOptions {
  requireDiscord?: boolean;
  env?: NodeJS.ProcessEnv;
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<AppConfig> {
  const requireDiscord = options.requireDiscord ?? true;
  const parsed = envSchema.parse(options.env ?? process.env);
  const discordToken = await resolveToken(parsed.DISCORD_TOKEN, parsed.DISCORD_TOKEN_FILE);
  const guildIds = parseGuildIds(parsed.DISCORD_GUILD_IDS);

  if (requireDiscord && !discordToken) {
    throw new Error("DISCORD_TOKEN or DISCORD_TOKEN_FILE is required.");
  }
  if (requireDiscord && guildIds.length === 0) {
    throw new Error("DISCORD_GUILD_IDS must include at least one guild ID.");
  }
  if (!cron.validate(parsed.BACKUP_CRON)) {
    throw new Error(`Invalid BACKUP_CRON expression: ${parsed.BACKUP_CRON}`);
  }

  return {
    discordToken,
    discordGuildIds: guildIds,
    backupCron: parsed.BACKUP_CRON,
    backupTimezone: parsed.BACKUP_TIMEZONE,
    backupOnStart: parsed.BACKUP_ON_START,
    backupRoot: parsed.BACKUP_ROOT,
    backupRetentionDays: parsed.BACKUP_RETENTION_DAYS,
    backupMinimumKeep: parsed.BACKUP_MINIMUM_KEEP,
    backupPrettyJson: parsed.BACKUP_PRETTY_JSON,
    backupImages: parsed.BACKUP_IMAGES,
    backupMaxMessagesPerChannel: parsed.BACKUP_MAX_MESSAGES_PER_CHANNEL,
    backupExcludeBans: parsed.BACKUP_EXCLUDE_BANS,
    backupExcludeEmojis: parsed.BACKUP_EXCLUDE_EMOJIS,
    backupExcludeRoles: parsed.BACKUP_EXCLUDE_ROLES,
    backupExcludeChannels: parsed.BACKUP_EXCLUDE_CHANNELS,
    logLevel: parsed.LOG_LEVEL,
    healthStatusFile: parsed.HEALTH_STATUS_FILE,
    lockTimeoutSeconds: parsed.LOCK_TIMEOUT_SECONDS,
    healthGraceSeconds: parsed.HEALTH_GRACE_SECONDS
  };
}

export function parseGuildIds(raw: string): string[] {
  const guildIds = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  for (const guildId of guildIds) {
    if (!/^\d{17,20}$/.test(guildId)) {
      throw new Error(`Invalid Discord guild ID: ${guildId}`);
    }
    if (seen.has(guildId)) {
      throw new Error(`Duplicate Discord guild ID: ${guildId}`);
    }
    seen.add(guildId);
  }
  return guildIds;
}

export function excludedResources(config: AppConfig): string[] {
  return [
    config.backupExcludeBans ? "bans" : undefined,
    config.backupExcludeEmojis ? "emojis" : undefined,
    config.backupExcludeRoles ? "roles" : undefined,
    config.backupExcludeChannels ? "channels" : undefined
  ].filter((value): value is string => Boolean(value));
}

async function resolveToken(
  token: string | undefined,
  tokenFile: string | undefined
): Promise<string | undefined> {
  if (tokenFile) {
    return (await readFile(tokenFile, "utf8")).trim();
  }
  return token?.trim() || undefined;
}
