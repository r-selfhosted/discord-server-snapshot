import {
  Client,
  Events,
  GatewayIntentBits,
  Guild,
  PermissionFlagsBits,
  PermissionsBitField
} from "discord.js";
import type { AppConfig } from "../config.js";
import { redactSecrets } from "../logging.js";

export function createDiscordClient(config: AppConfig): Client {
  const intents = [GatewayIntentBits.Guilds];
  if (!config.backupExcludeBans) intents.push(GatewayIntentBits.GuildModeration);
  return new Client({ intents });
}

export async function loginDiscord(config: AppConfig): Promise<Client> {
  if (!config.discordToken) throw new Error("Discord token is required.");
  const client = createDiscordClient(config);
  await client.login(config.discordToken);
  await new Promise<void>((resolve) => {
    if (client.isReady()) resolve();
    else client.once(Events.ClientReady, () => resolve());
  });
  return client;
}

export async function fetchConfiguredGuilds(client: Client, guildIds: string[]): Promise<Guild[]> {
  const guilds: Guild[] = [];
  for (const guildId of guildIds) {
    try {
      guilds.push(await client.guilds.fetch(guildId));
    } catch (error) {
      throw new Error(`Unable to fetch Discord guild ${guildId}: ${redactSecrets(error)}`, {
        cause: error
      });
    }
  }
  return guilds;
}

export function checkGuildPermissions(guild: Guild, config: AppConfig): string[] {
  const me = guild.members.me;
  if (!me) return ["Bot member cache is unavailable; run doctor after login."];
  const required = [
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageWebhooks,
    PermissionFlagsBits.ViewChannel
  ];
  if (!config.backupExcludeBans) required.push(PermissionFlagsBits.BanMembers);
  if (!config.backupExcludeEmojis) required.push(PermissionFlagsBits.ManageGuildExpressions);
  const missing = new PermissionsBitField(required).remove(me.permissions).toArray();
  const warnings = missing.map((permission) => `Missing permission: ${permission}`);
  const highestManaged = guild.roles.cache
    .filter((role) => !role.managed && role.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .first();
  if (highestManaged && me.roles.highest.comparePositionTo(highestManaged) <= 0) {
    warnings.push(
      "Bot highest role is not above every normal role; role restore may be incomplete."
    );
  }
  return warnings;
}
