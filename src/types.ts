export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface ResourceCounts {
  roles: number;
  channels: number;
  categories: number;
  emojis: number;
  bans: number;
}

export interface SnapshotManifest {
  schemaVersion: 1;
  applicationVersion: string;
  createdAt: string;
  guildId: string;
  guildName: string;
  discordRebackupVersion: string;
  discordJsVersion: string;
  messageLimitPerChannel: number;
  imageStorage: "base64" | "url" | "none";
  excludedResources: string[];
  snapshotFile: string;
  sha256: string;
  counts: ResourceCounts;
}

export interface LatestPointer {
  schemaVersion: 1;
  guildId: string;
  updatedAt: string;
  snapshot: string;
  manifest: string;
  sha256: string;
}

export interface SnapshotRecord {
  guildId: string;
  snapshotPath: string;
  manifestPath: string;
  checksumPath: string;
  relativeSnapshotPath: string;
  manifest: SnapshotManifest;
  sizeBytes: number;
}

export interface GuildMetadata {
  guildId: string;
  lastKnownName: string;
  firstBackupAt: string;
  lastBackupAt: string;
}
