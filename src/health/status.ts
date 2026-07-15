import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config.js";
import { writeJsonAtomic } from "../backup/atomic.js";

export interface HealthStatus {
  status: "healthy" | "unhealthy";
  startedAt: string;
  lastCycleStartedAt: string | null;
  lastCycleCompletedAt: string | null;
  lastCycleSucceeded: boolean | null;
  nextScheduledRunAt: string | null;
  guilds: Record<
    string,
    {
      lastBackupAt: string | null;
      lastBackupSucceeded: boolean | null;
      lastSnapshot: string | null;
      lastError: string | null;
    }
  >;
}

export function initialHealth(config: AppConfig): HealthStatus {
  return {
    status: "healthy",
    startedAt: new Date().toISOString(),
    lastCycleStartedAt: null,
    lastCycleCompletedAt: null,
    lastCycleSucceeded: null,
    nextScheduledRunAt: null,
    guilds: Object.fromEntries(
      config.discordGuildIds.map((guildId) => [
        guildId,
        {
          lastBackupAt: null,
          lastBackupSucceeded: null,
          lastSnapshot: null,
          lastError: null
        }
      ])
    )
  };
}

export async function writeHealthStatus(filePath: string, status: HealthStatus): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeJsonAtomic(filePath, status, true);
}

export async function checkHealth(config: AppConfig): Promise<void> {
  const status = JSON.parse(await readFile(config.healthStatusFile, "utf8")) as HealthStatus;
  if (status.status !== "healthy") throw new Error("Health status is unhealthy.");
  if (status.lastCycleSucceeded === false) throw new Error("Last backup cycle failed.");
  if (status.lastCycleCompletedAt) {
    const ageSeconds = (Date.now() - new Date(status.lastCycleCompletedAt).getTime()) / 1000;
    if (ageSeconds > config.healthGraceSeconds) {
      throw new Error(
        `Last backup cycle is overdue by health policy: ${Math.round(ageSeconds)} seconds old.`
      );
    }
  }
}
