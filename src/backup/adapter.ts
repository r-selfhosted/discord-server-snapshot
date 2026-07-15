import type { Guild } from "discord.js";
import { create, load } from "discord-rebackup";

export interface CreateBackupOptions {
  backupID?: string;
  jsonSave: false;
  jsonBeautify: boolean;
  maxMessagesPerChannel: number;
  saveImages: boolean;
  doNotBackup: string[];
  backupMembers: false;
  selfBot: false;
  devMode?: boolean;
}

export interface RestoreBackupOptions {
  clearGuildBeforeRestore: boolean;
  maxMessagesPerChannel: number;
  allowedMentions: { parse: [] };
  selfBot: false;
  devMode: false;
}

export interface GuildBackupAdapter {
  create(guild: Guild, options: CreateBackupOptions): Promise<unknown>;
  restore(guild: Guild, backupData: unknown, options: RestoreBackupOptions): Promise<void>;
}

export class DiscordRebackupAdapter implements GuildBackupAdapter {
  async create(guild: Guild, options: CreateBackupOptions): Promise<unknown> {
    return create(guild as never, options);
  }

  async restore(guild: Guild, backupData: unknown, options: RestoreBackupOptions): Promise<void> {
    await load(backupData as never, guild as never, options);
  }
}
