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
export { WeChatChannel, createWeChatChannel } from "./wechat.js";
export { GoogleChatChannel, createGoogleChatChannel } from "./googlechat.js";
export { MsTeamsChannel, createMsTeamsChannel } from "./msteams.js";
export { NextcloudChannel, createNextcloudChannel } from "./nextcloud.js";
export { SynologyChannel, createSynologyChannel } from "./synology.js";
export { TlonChannel, createTlonChannel } from "./tlon.js";
export { WebChatChannel, createWebChatChannel } from "./webchat.js";
export { SignalChannel, createSignalChannel } from "./signal.js";

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
import { createWeChatChannel } from "./wechat.js";
import { createGoogleChatChannel } from "./googlechat.js";
import { createMsTeamsChannel } from "./msteams.js";
import { createNextcloudChannel } from "./nextcloud.js";
import { createSynologyChannel } from "./synology.js";
import { createTlonChannel } from "./tlon.js";
import { createWebChatChannel } from "./webchat.js";
import { createSignalChannel } from "./signal.js";
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
      case "wechat":
        return { channel: createWeChatChannel(config as any) };
      case "googlechat":
        return { channel: createGoogleChatChannel(config as any) };
      case "msteams":
        return { channel: createMsTeamsChannel(config as any) };
      case "nextcloud":
        return { channel: createNextcloudChannel(config as any) };
      case "synology":
        return { channel: createSynologyChannel(config as any) };
      case "tlon":
        return { channel: createTlonChannel(config as any) };
      case "webchat":
        return { channel: createWebChatChannel(config as any) };
      case "signal":
        return { channel: createSignalChannel(config as any) };
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