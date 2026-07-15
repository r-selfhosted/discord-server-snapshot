# Recovery Runbook

Restores are intentionally shell-only. There are no Discord commands or HTTP endpoints for restore in v1.

## Before a Restore

1. Confirm the target guild is correct and, for practice, use a disposable Discord test guild.
2. Run `discord-server-snapshot list --guild <guild-id>`.
3. Run `discord-server-snapshot validate --guild <guild-id> --snapshot <timestamp-or-path>`.
4. Run `discord-server-snapshot inspect --guild <guild-id> --snapshot <timestamp-or-path>`.
5. Confirm the bot has the required permissions and role hierarchy with `discord-server-snapshot doctor`.

## Restore Command

Non-clearing restore:

```sh
docker compose run --rm discord-server-snapshot restore --guild 123456789012345678 --snapshot 2026-07-15T08-00-00.000Z
```

Clearing restore:

```sh
docker compose run --rm discord-server-snapshot restore --guild 123456789012345678 --snapshot 2026-07-15T08-00-00.000Z --clear-guild
```

Interactive restore requires typing the exact target guild ID. If `--clear-guild` is present, it also requires typing `CLEAR GUILD`.

Automation must use both flags:

```sh
discord-server-snapshot restore --guild 123456789012345678 --snapshot snapshots/2026/07/15/2026-07-15T08-00-00.000Z.json --yes --acknowledge-destructive-restore
```

## Pre-Restore Backup

Restore creates a fresh backup of the target guild before changing anything. If that pre-restore backup fails, restore aborts. Use `--skip-pre-restore-backup` only when you have a separate, verified recovery point and understand the risk.

## What Cannot Be Perfectly Restored

- Audit logs cannot be recreated.
- Invites and vanity URLs are not restored.
- Managed, integration-created, booster, or higher-than-bot roles may not restore exactly.
- Discord permissions and rate limits can cause partial restore failures.
- Message history is disabled by default and is inherently lossy when enabled in a future release.
- Some Discord-managed channels and server features may need manual follow-up.

## Recovery Drill

At least quarterly:

1. Create or reset a disposable Discord guild.
2. Back up the production guild.
3. Restore the snapshot into the disposable guild.
4. Compare roles, channels, categories, permission overwrites, emojis, bans, and key settings.
5. Record gaps and update internal recovery notes.

Never perform destructive restore testing against a production guild.
