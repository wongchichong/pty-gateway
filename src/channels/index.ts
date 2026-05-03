// Channel exports
export * from "./types.js";

// Core channels (always available - dependencies included)
export { TelegramChannel, createTelegramChannel } from "./telegram.js";
export { DiscordChannel, createDiscordChannel } from "./discord.js";

// Optional channels (require peer dependencies)
export { WhatsAppChannel, createWhatsAppChannel } from "./whatsapp.js";
export { SlackChannel, createSlackChannel } from "./slack.js";
export { MatrixChannel, createMatrixChannel } from "./matrix.js";
export { IrcChannel, createIrcChannel } from "./irc.js";
export { LineChannel, createLineChannel } from "./line.js";
export { NostrChannel, createNostrChannel } from "./nostr.js";
export { TwitchChannel, createTwitchChannel } from "./twitch.js";

// HTTP-based channels (no dependencies)
export {
  HttpChannel,
  createBlueBubblesChannel,
  createMattermostChannel,
  createFeishuChannel,
  createQqBotChannel,
} from "./http.js";

// Channel factory - creates channel by type
import type { ChannelType } from "./types.js";
import { createTelegramChannel } from "./telegram.js";
import { createDiscordChannel } from "./discord.js";
import { createWhatsAppChannel } from "./whatsapp.js";
import { createSlackChannel } from "./slack.js";
import { createMatrixChannel } from "./matrix.js";
import { createIrcChannel } from "./irc.js";
import { createLineChannel } from "./line.js";
import { createNostrChannel } from "./nostr.js";
import { createTwitchChannel } from "./twitch.js";
import {
  createBlueBubblesChannel,
  createMattermostChannel,
  createFeishuChannel,
  createQqBotChannel,
} from "./http.js";

export async function createChannel(
  type: ChannelType,
  config: Record<string, unknown>
): Promise<{ channel: any; error?: string }> {
  try {
    switch (type) {
      case "telegram":
        return { channel: createTelegramChannel(config as any) };
      case "discord":
        return { channel: createDiscordChannel(config as any) };
      case "whatsapp":
        return { channel: createWhatsAppChannel(config as any) };
      case "slack":
        return { channel: createSlackChannel(config as any) };
      case "matrix":
        return { channel: createMatrixChannel(config as any) };
      case "irc":
        return { channel: createIrcChannel(config as any) };
      case "line":
        return { channel: createLineChannel(config as any) };
      case "nostr":
        return { channel: createNostrChannel(config as any) };
      case "twitch":
        return { channel: createTwitchChannel(config as any) };
      case "bluebubbles":
        return { channel: createBlueBubblesChannel(config as any) };
      case "mattermost":
        return { channel: createMattermostChannel(config as any) };
      case "feishu":
        return { channel: createFeishuChannel(config as any) };
      case "qqbot":
        return { channel: createQqBotChannel(config as any) };
      default:
        return { channel: null, error: `Unknown channel type: ${type}` };
    }
  } catch (err) {
    return { channel: null, error: String(err) };
  }
}
