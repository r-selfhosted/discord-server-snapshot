import { describe, expect, it } from "vitest";
import { loadConfig, parseGuildIds } from "../src/config.js";
import { redactSecrets } from "../src/logging.js";

describe("config", () => {
  it("parses guild IDs and rejects duplicates", () => {
    expect(parseGuildIds("123456789012345678, 223456789012345678")).toEqual([
      "123456789012345678",
      "223456789012345678"
    ]);
    expect(() => parseGuildIds("123456789012345678,123456789012345678")).toThrow(/Duplicate/);
  });

  it("loads defaults without Discord requirements for storage commands", async () => {
    const config = await loadConfig({
      requireDiscord: false,
      env: { DISCORD_GUILD_IDS: "123456789012345678" }
    });
    expect(config.backupRoot).toBe("/data/backups");
    expect(config.backupMaxMessagesPerChannel).toBe(0);
    expect(config.backupImages).toBe("base64");
  });

  it("redacts token-shaped values", () => {
    const redacted = redactSecrets("token=abc.defgh.abcdefghijklmnopqrstuvwxyz");
    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });
});
