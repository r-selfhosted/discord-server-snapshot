import type { Guild } from "discord.js";
import { Emoji } from "discord.js";
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

let emojiUrlCompatApplied = false;

export function applyDiscordJsEmojiUrlCompat(): void {
  if (emojiUrlCompatApplied) return;
  Object.defineProperty(Emoji.prototype, "url", {
    configurable: true,
    get(this: Emoji) {
      return this.imageURL({ extension: this.animated ? "gif" : "png" });
    }
  });
  emojiUrlCompatApplied = true;
}

export async function withDiscordRebackupConsoleFilter<T>(callback: () => Promise<T>): Promise<T> {
  const originalConsoleLog = console.log;
  console.log = (...args: unknown[]) => {
    if (
      args.length === 2 &&
      typeof args[0] === "string" &&
      typeof args[1] === "string" &&
      args[1].startsWith("https://cdn.discordapp.com/icons/")
    ) {
      return;
    }
    originalConsoleLog(...args);
  };
  try {
    return await callback();
  } finally {
    console.log = originalConsoleLog;
  }
}

export class DiscordRebackupAdapter implements GuildBackupAdapter {
  async create(guild: Guild, options: CreateBackupOptions): Promise<unknown> {
    applyDiscordJsEmojiUrlCompat();
    return withDiscordRebackupConsoleFilter(() => create(guild as never, options));
  }

  async restore(guild: Guild, backupData: unknown, options: RestoreBackupOptions): Promise<void> {
    await load(backupData as never, guild as never, options);
  }
}
