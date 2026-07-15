# discord-server-snapshot

Self-hosted point-in-time snapshots and recovery for Discord servers, powered by `discord-rebackup`.

The first release focuses on guild structure and configuration: roles, channels, categories, permission overwrites, bans, emojis, and supported server settings. Message backup is disabled by default with `BACKUP_MAX_MESSAGES_PER_CHANNEL=0`.

## Known Limitations

Discord and `discord-rebackup` cannot faithfully restore everything. Audit logs, invites, vanity URLs, managed roles, integration-created roles, booster roles, and objects above the bot role hierarchy are not guaranteed to restore. Message history is disabled by default and is lossy even when enabled in the upstream library.

## Bot Setup

1. Create an application in the Discord Developer Portal.
2. Add a bot and provide its token as `DISCORD_BOT_TOKEN`.
3. Invite the bot with permissions for Manage Server, Manage Channels, Manage Roles, Manage Webhooks, Manage Emojis and Stickers, View Channels, and Ban Members when bans are enabled.
4. Place the bot's highest role above every normal role it may need to recreate or manage.
5. Keep privileged message and member intents disabled for the default structure-only mode.

Administrator is operationally simpler but not required when the explicit permissions above are granted.

## Configuration

Copy `.env.example` and set:

- `DISCORD_BOT_TOKEN`.
- `DISCORD_GUILD_IDS`, comma-separated.
- `BACKUP_CRON` and `BACKUP_TIMEZONE`.
- `BACKUP_ROOT`, default `/data/backups`.
- `BACKUP_RETENTION_DAYS` and `BACKUP_MINIMUM_KEEP`.
- `BACKUP_IMAGES=base64`, `url`, or `none`.
- `BACKUP_MAX_MESSAGES_PER_CHANNEL=0` to keep message backup disabled.

Tokens, complete snapshot JSON, and Base64 image payloads are never intentionally logged.

## Docker Compose

```sh
DISCORD_BOT_TOKEN=YOUR_DISCORD_BOT_TOKEN DISCORD_GUILD_IDS=123456789012345678 docker compose up -d --build
```

The container runs as a non-root user with a read-only root filesystem. The `/data` volume must be writable by the container user.

## Docker Swarm

```sh
docker node update --label-add discord-backup=true <node>
DISCORD_BOT_TOKEN=YOUR_DISCORD_BOT_TOKEN DISCORD_GUILD_IDS=123456789012345678 docker stack deploy -c stack.yaml discord-snapshot
```

Run one replica only. The application lock is a final guard, not a replacement for `replicas: 1`.

## CLI

Inside the container:

```sh
docker compose exec discord-server-snapshot node dist/index.js backup
docker compose exec discord-server-snapshot node dist/index.js list --guild 123456789012345678
docker compose exec discord-server-snapshot node dist/index.js inspect --guild 123456789012345678 --snapshot 2026-07-15T08-00-00.000Z
docker compose exec discord-server-snapshot node dist/index.js validate --guild 123456789012345678 --snapshot 2026-07-15T08-00-00.000Z
docker compose exec discord-server-snapshot node dist/index.js prune --dry-run
docker compose exec discord-server-snapshot node dist/index.js doctor
```

Restore is deliberately not exposed through Discord or HTTP:

```sh
docker compose run --rm discord-server-snapshot restore --guild 123456789012345678 --snapshot 2026-07-15T08-00-00.000Z
```

See `docs/recovery.md` before using `--clear-guild`.

## Snapshot Layout

```text
/data/backups/<guild-id>/
├── guild.json
├── latest.json
└── snapshots/YYYY/MM/DD/
    ├── <timestamp>.json
    ├── <timestamp>.manifest.json
    └── <timestamp>.sha256
```

Each backup is written through a same-directory temporary file, parsed before finalization, checksummed with SHA-256, and only then promoted to `latest.json`.

## Retention

Retention keeps all snapshots newer than `BACKUP_RETENTION_DAYS`, always keeps at least `BACKUP_MINIMUM_KEEP` snapshots per guild, and never deletes the snapshot referenced by `latest.json`.

## Health

The daemon writes `HEALTH_STATUS_FILE`, default `/data/status/health.json`. Docker healthcheck runs `node dist/index.js healthcheck`; no HTTP server is included for health.

## Offsite Backups

This service only writes local snapshots. Back up `/data/backups`, `/data/status`, and `/data/restore-history` with your host-level system such as Restic or Zerobyte. Exclude transient lock files. Do not commit snapshots containing private guild data to a public Git repository.

## Upgrade Procedure

1. Read `docs/dependency-spike.md` for upstream package behavior.
2. Pull the new image.
3. Run `doctor`.
4. Run a manual backup and validate it.
5. Perform a disposable-guild restore drill for major version changes.

## Troubleshooting

- Missing channels or roles usually means the bot lacks permissions or role hierarchy.
- Ban backup requires `BACKUP_EXCLUDE_BANS=false` and Ban Members permission.
- If health is unhealthy, inspect `/data/status/health.json` and container logs.
- If restore fails, keep the source snapshot and inspect `/data/restore-history`.
