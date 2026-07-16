import { afterEach, describe, expect, it, vi } from "vitest";
import { Emoji } from "discord.js";
import {
  applyDiscordJsEmojiUrlCompat,
  withDiscordRebackupConsoleFilter
} from "../src/backup/adapter.js";

describe("discord-rebackup adapter compatibility", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the deprecated Emoji#url getter quiet for discord-rebackup", () => {
    const emitWarning = vi.spyOn(process, "emitWarning");
    const emoji = {
      animated: false,
      imageURL(options: { extension?: string } = {}) {
        return `https://cdn.discordapp.com/emojis/123456789012345678.${options.extension ?? "webp"}`;
      }
    } as unknown as Emoji;

    applyDiscordJsEmojiUrlCompat();
    Object.setPrototypeOf(emoji, Emoji.prototype);

    expect(Reflect.get(emoji, "url")).toBe("https://cdn.discordapp.com/emojis/123456789012345678.png");
    expect(emitWarning).not.toHaveBeenCalled();
  });

  it("filters discord-rebackup's guild icon debug log only", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await withDiscordRebackupConsoleFilter(() => {
      console.log(
        "4149f1b5692a76a626f4ae3dbde09cd4",
        "https://cdn.discordapp.com/icons/446460880717217802/4149f1b5692a76a626f4ae3dbde09cd4.webp"
      );
      console.log("keep me");
      return Promise.resolve();
    });

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("keep me");
  });
});
