import { createRequire } from "node:module";
import path from "node:path";
import type { AppConfig } from "../config.js";
import type { ResourceCounts, SnapshotManifest } from "../types.js";

const require = createRequire(import.meta.url);

export function createManifest(input: {
  config: AppConfig;
  guildId: string;
  guildName: string;
  createdAt: string;
  snapshotFile: string;
  sha256: string;
  backupData: unknown;
  excludedResources: string[];
}): SnapshotManifest {
  return {
    schemaVersion: 1,
    applicationVersion: packageVersion(),
    createdAt: input.createdAt,
    guildId: input.guildId,
    guildName: input.guildName,
    discordRebackupVersion: dependencyVersion("discord-rebackup"),
    discordJsVersion: dependencyVersion("discord.js"),
    messageLimitPerChannel: input.config.backupMaxMessagesPerChannel,
    imageStorage: input.config.backupImages,
    excludedResources: input.excludedResources,
    snapshotFile: path.basename(input.snapshotFile),
    sha256: input.sha256,
    counts: deriveCounts(input.backupData)
  };
}

export function deriveCounts(backupData: unknown): ResourceCounts {
  const data = asRecord(backupData);
  const channels = asRecord(data.channels);
  const categories = asArray(channels.categories);
  const others = asArray(channels.others);
  const categoryChildren = categories.reduce<number>((sum, category) => {
    const record = asRecord(category);
    return sum + asArray(record.children).length;
  }, 0);
  return {
    roles: asArray(data.roles).length,
    channels: others.length + categoryChildren,
    categories: categories.length,
    emojis: asArray(data.emojis).length,
    bans: asArray(data.bans).length
  };
}

function dependencyVersion(packageName: string): string {
  if (packageName === "discord.js") {
    const discordJs = require("discord.js") as { version: string };
    return discordJs.version;
  }
  const packageJson = require(`${packageName}/package.json`) as { version: string };
  return packageJson.version;
}

function packageVersion(): string {
  const packageJson = require("../../package.json") as { version: string };
  return packageJson.version;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
