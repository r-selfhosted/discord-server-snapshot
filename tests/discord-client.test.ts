import { describe, expect, it } from "vitest";
import { fetchConfiguredGuilds } from "../src/discord/client.js";

describe("Discord client helpers", () => {
  it("includes the guild ID when a configured guild cannot be fetched", async () => {
    const client = {
      guilds: {
        fetch: () => Promise.reject(new Error("DiscordAPIError[10004]: Unknown Guild"))
      }
    };

    await expect(fetchConfiguredGuilds(client as never, ["123456789012345678"])).rejects.toThrow(
      /123456789012345678.*Unknown Guild/
    );
  });
});
