# Dependency Spike: discord-rebackup

Date: 2026-07-15

## Installed versions

- `discord-rebackup`: `4.1.0`
- `discord.js`: `14.27.0`
- Runtime target: Node.js 22
- Local spike runtime: Node.js 24.18.0, which triggered the project engine warning because this project intentionally targets Node 22.

## Package shape

`discord-rebackup@4.1.0` is a CommonJS package with TypeScript declarations at `lib/index.d.ts`.

Runtime exports verified with `require("discord-rebackup")`:

- `create`
- `load`
- `fetchBackup`
- `list`
- `remove`
- `setStorageFolder`
- `default`

The default export mirrors the same callable methods. The local adapter uses named imports from the package and keeps all direct package calls in `src/backup/adapter.ts`.

## Create behavior

Declaration:

```ts
create(guild: Guild, options?: CreateOptions): Promise<BackupData>
```

Relevant `CreateOptions` fields:

- `backupID?: string`
- `maxMessagesPerChannel?: number`
- `jsonSave?: boolean`
- `jsonBeautify?: boolean`
- `doNotBackup?: string[]`
- `backupMembers?: boolean`
- `saveImages?: boolean`
- `selfBot?: boolean`
- `devMode?: boolean`

The installed implementation initializes a complete `BackupData` object and resolves it even when `jsonSave` is false. JSON auto-save only happens when `jsonSave` is omitted or truthy, so the application can safely use `jsonSave: false` and own atomic storage, checksums, manifests, and latest-pointer updates.

Default application create options:

```ts
{
  jsonSave: false,
  jsonBeautify: true,
  maxMessagesPerChannel: 0,
  saveImages: true,
  backupMembers: false,
  selfBot: false,
  doNotBackup: []
}
```

`BACKUP_IMAGES=base64` maps to `saveImages: true`; `BACKUP_IMAGES=url` maps to `saveImages: false`.

## Restore behavior

Declaration:

```ts
load(backup: string | BackupData, guild: Guild, options?: LoadOptions): Promise<unknown>
```

Relevant `LoadOptions` fields:

- `clearGuildBeforeRestore: boolean`
- `maxMessagesPerChannel?: number`
- `allowedMentions?: MessageMentionOptions`
- `selfBot?: boolean`
- `devMode?: boolean`

The installed implementation accepts an in-memory backup object, so restore can load the validated snapshot JSON from application storage and avoid relying on `discord-rebackup` storage IDs.

Application default:

```ts
{
  clearGuildBeforeRestore: false,
  maxMessagesPerChannel: 0,
  allowedMentions: { parse: [] },
  selfBot: false,
  devMode: false
}
```

## Backup schema observations

The declared `BackupData` top-level fields are:

- `name`
- `iconURL`, `iconBase64`
- `verificationLevel`
- `explicitContentFilter`
- `defaultMessageNotifications`
- `afk`
- `widget`
- `splashURL`, `splashBase64`
- `bannerURL`, `bannerBase64`
- `channels`
- `roles`
- `bans`
- `emojis`
- `members`
- `createdTimestamp`
- `guildID`
- `id`

Channel data is grouped as:

- `channels.categories[]`
- `channels.others[]`

Counts in manifests are derived defensively from these fields because the package is external and may change schema in future versions.

## Channel and resource support

The installed create path handles:

- Categories
- Text channels
- Announcement/news channels
- Forum/media-like channels through the text-channel path
- Voice channels
- Stage voice channels
- Public, private, and announcement threads as nested text-channel data
- Permission overwrites
- Roles except managed roles
- Bans
- Emojis
- Server icon, splash, and banner when image saving is enabled

Known limitations from code inspection and Discord API constraints:

- Audit logs cannot be reconstructed.
- Invites and vanity URLs are not represented.
- Managed roles are filtered out.
- Role hierarchy and bot permissions constrain restore.
- Some Discord-managed/community channels are skipped by the create implementation.
- Message restoration is inherently lossy and uses webhook sends; this project disables message backup by default.

## Supply-chain note

`discord-rebackup@4.1.0` depends on `discord.js-selfbot-v13`, and npm warns that package is deprecated. This project does not enable `selfBot` mode and does not expose a configuration option for it.

## Live Discord validation status

No live Discord credentials or disposable guilds were available in this environment, so the spike did not perform destructive or live API tests. The implementation includes optional live-test hooks and documents that full restore validation requires a disposable test guild.
