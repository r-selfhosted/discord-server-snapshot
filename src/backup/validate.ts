import { readFile } from "node:fs/promises";
import path from "node:path";
import { sha256 } from "./atomic.js";
import type { SnapshotManifest } from "../types.js";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  snapshotPath: string;
  manifest: SnapshotManifest | undefined;
  checksum: string | undefined;
}

export async function validateSnapshot(
  snapshotPath: string,
  expectedGuildId?: string
): Promise<ValidationResult> {
  const errors: string[] = [];
  const manifestPath = snapshotPath.replace(/\.json$/, ".manifest.json");
  const checksumPath = snapshotPath.replace(/\.json$/, ".sha256");
  let snapshot: unknown;
  let manifest: SnapshotManifest | undefined;
  let checksum: string | undefined;
  let snapshotContent = "";

  try {
    snapshotContent = await readFile(snapshotPath, "utf8");
    snapshot = JSON.parse(snapshotContent);
  } catch (error) {
    errors.push(`Snapshot JSON could not be parsed: ${String(error)}`);
  }

  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as SnapshotManifest;
  } catch (error) {
    errors.push(`Manifest could not be read or parsed: ${String(error)}`);
  }

  try {
    checksum = (await readFile(checksumPath, "utf8")).trim().split(/\s+/)[0];
  } catch (error) {
    errors.push(`Checksum file could not be read: ${String(error)}`);
  }

  if (snapshotContent && checksum && sha256(snapshotContent) !== checksum) {
    errors.push("Snapshot SHA-256 does not match checksum file.");
  }
  if (manifest && checksum && manifest.sha256 !== checksum) {
    errors.push("Manifest SHA-256 does not match checksum file.");
  }
  if (manifest && manifest.snapshotFile !== path.basename(snapshotPath)) {
    errors.push("Manifest snapshotFile does not match snapshot path.");
  }

  const record = asRecord(snapshot);
  const snapshotGuildId = typeof record.guildID === "string" ? record.guildID : undefined;
  if (!snapshotGuildId) errors.push("Snapshot is missing top-level guildID.");
  if (expectedGuildId && snapshotGuildId && snapshotGuildId !== expectedGuildId) {
    errors.push(
      `Snapshot guildID ${snapshotGuildId} does not match expected guild ${expectedGuildId}.`
    );
  }
  if (manifest && expectedGuildId && manifest.guildId !== expectedGuildId) {
    errors.push(
      `Manifest guildId ${manifest.guildId} does not match expected guild ${expectedGuildId}.`
    );
  }
  if (!record.channels || typeof record.channels !== "object")
    errors.push("Snapshot is missing channels.");
  if (!Array.isArray(record.roles)) errors.push("Snapshot is missing roles array.");
  if (!Array.isArray(record.emojis)) errors.push("Snapshot is missing emojis array.");
  if (!Array.isArray(record.bans)) errors.push("Snapshot is missing bans array.");

  return { ok: errors.length === 0, errors, snapshotPath, manifest, checksum };
}

export async function readValidatedSnapshot(
  snapshotPath: string,
  expectedGuildId?: string
): Promise<unknown> {
  const result = await validateSnapshot(snapshotPath, expectedGuildId);
  if (!result.ok) {
    throw new Error(`Snapshot validation failed: ${result.errors.join("; ")}`);
  }
  return JSON.parse(await readFile(snapshotPath, "utf8")) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
