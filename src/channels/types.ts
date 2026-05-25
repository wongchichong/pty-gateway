// Channel Types - All 22+ supported platforms

export type ChannelType =
  | "telegram"
  | "discord"
  | "whatsapp"
  | "slack"
  | "matrix"
  | "wechat"
  | "line"
  | "irc"
  | "nostr"
  | "twitch"
  | "googlechat"
  | "msteams"
  | "feishu"
  | "qqbot"
  | "signal"
  | "mattermost"
  | "bluebubbles"
  | "nextcloud"
  | "synology"
  | "tlon"
  | "webchat"
  | "imessage";

export interface ChannelMessage {
  /** Unique message ID from platform */
  id: string;
  /** Channel/platform this message came from */
  channel: ChannelType;
  /** User ID on the platform */
  userId: string;
  /** Chat/Channel/Room ID */
  chatId: string;
  /** Message text content */
  text: string;
  /** Reply-to message ID (if replying) */
  replyTo?: string;
  /** Timestamp */
  timestamp: number;
  /** Raw platform-specific data */
  raw?: unknown;
}

export interface ChannelConfig {
  /** Channel type */
  type: ChannelType;
  /** Whether channel is enabled */
  enabled: boolean;
  /** Platform-specific configuration */
  options: Record<string, unknown>;
}

export interface Channel {
  /** Channel type identifier */
  readonly type: ChannelType;
  /** Whether channel is connected */
  readonly connected: boolean;
  /** Initialize and connect to platform */
  start(): Promise<void>;
  /** Stop and disconnect */
  stop(): Promise<void>;
  /** Send message to a chat */
  sendMessage(chatId: string, text: string, options?: SendMessageOptions): Promise<string>;
  /** Send reply to a specific message */
  sendReply(message: ChannelMessage, text: string): Promise<string>;
  /** Edit an existing message */
  editMessage?(chatId: string, messageId: string, text: string, options?: SendMessageOptions): Promise<boolean>;
  /** Delete a message */
  deleteMessage?(chatId: string, messageId: string): Promise<boolean>;
  /** Send a reaction to a message (emoji) */
  sendReaction?(chatId: string, messageId: string, reaction: string): Promise<boolean>;
  /** Show typing indicator */
  sendTyping?(chatId: string, durationMs?: number): Promise<void>;
  /** Stop typing indicator */
  stopTyping?(chatId: string): Promise<void>;
  /** Set message handler */
  onMessage(handler: MessageHandler): void;
}

export interface SendMessageOptions {
  replyTo?: string;
  parseMode?: "html" | "markdown" | "plain";
  /** For long messages, chunk into multiple messages */
  chunk?: boolean;
  /** Max chars per message (default: platform-specific) */
  maxChunkSize?: number;
}

export type MessageHandler = (message: ChannelMessage) => Promise<void> | void;

// ── Telegram Config ─────────────────────────────────────────────────────

export interface TelegramConfig {
  botToken: string;
  /** Allowed user IDs (empty = all allowed) */
  allowedUsers?: number[];
  /** Allowed chat IDs (empty = all allowed) */
  allowedChats?: number[];
  /** Use polling (default) or webhook */
  polling?: boolean;
}

// ── Discord Config ──────────────────────────────────────────────────────

export interface DiscordConfig {
  botToken: string;
  /** Guild ID to restrict to (optional) */
  guildId?: string;
  /** Channel IDs to allow (empty = all) */
  allowedChannels?: string[];
  /** Register slash commands globally */
  globalCommands?: boolean;
}

// ── WhatsApp Config ──────────────────────────────────────────────────────

export interface WhatsAppConfig {
  /** Session directory path */
  sessionPath?: string;
  /** Allowed phone numbers (empty = all) */
  allowedNumbers?: string[];
  /** Allow group chats */
  allowGroups?: boolean;
}

// ── Slack Config ────────────────────────────────────────────────────────

export interface SlackConfig {
  botToken: string;        // xoxb-...
  appToken: string;        // xapp-... (for Socket Mode)
  /** Allowed channel IDs */
  allowedChannels?: string[];
}

// ── Matrix Config ───────────────────────────────────────────────────────

export interface MatrixConfig {
  homeserverUrl: string;   // https://matrix.org
  accessToken: string;
  userId: string;          // @bot:matrix.org
  /** Allowed room IDs */
  allowedRooms?: string[];
}

// ── WeChat Config ───────────────────────────────────────────────────────

export interface WeChatConfig {
  /** Puppet type: wechat4u, padlocal, etc. */
  puppet?: string;
  /** Token for puppet service */
  puppetToken?: string;
}

// ── LINE Config ─────────────────────────────────────────────────────────

export interface LineConfig {
  channelAccessToken: string;
  channelSecret: string;
}

// ── IRC Config ──────────────────────────────────────────────────────────

export interface IrcConfig {
  server: string;
  port?: number;
  nick: string;
  userName?: string;
  realName?: string;
  password?: string;
  /** Channels to join */
  channels?: string[];
}

// ── Nostr Config ────────────────────────────────────────────────────────

export interface NostrConfig {
  /** Private key (hex or nsec) */
  privateKey: string;
  /** Relay URLs */
  relays: string[];
}

// ── Twitch Config ───────────────────────────────────────────────────────

export interface TwitchConfig {
  botToken: string;        // OAuth token
  channels: string[];      // Channels to join
}

// ── Google Chat Config ──────────────────────────────────────────────────

export interface GoogleChatConfig {
  projectId: string;
  privateKey: string;
  clientEmail: string;
}

// ── MS Teams Config ─────────────────────────────────────────────────────

export interface MsTeamsConfig {
  appId: string;
  appPassword: string;
}

// ── Feishu Config ───────────────────────────────────────────────────────

export interface FeishuConfig {
  appId: string;
  appSecret: string;
}

// ── QQ Bot Config ───────────────────────────────────────────────────────

export interface QqBotConfig {
  appId: string;
  appSecret: string;
}

// ── Signal Config ───────────────────────────────────────────────────────

export interface SignalConfig {
  /** Phone number */
  phoneNumber: string;
  /** signal-cli path */
  signalCliPath?: string;
}

// ── Mattermost Config ───────────────────────────────────────────────────

export interface MattermostConfig {
  serverUrl: string;
  botToken: string;
  teamName: string;
}

// ── BlueBubbles Config ──────────────────────────────────────────────────

export interface BlueBubblesConfig {
  serverUrl: string;
  password: string;
}

// ── Nextcloud Config ────────────────────────────────────────────────────

export interface NextcloudConfig {
  serverUrl: string;
  username: string;
  password: string;
}

// ── Synology Config ─────────────────────────────────────────────────────

export interface SynologyConfig {
  serverUrl: string;
  token: string;
}

// ── Tlon Config ─────────────────────────────────────────────────────────

export interface TlonConfig {
  shipName: string;
  apiKey: string;
}

// ── WebChat Config ──────────────────────────────────────────────────────

export interface WebChatConfig {
  port?: number;
  host?: string;
}

// ── Channel Dependency Info ─────────────────────────────────────────────

export interface ChannelDependency {
  packageName: string;
  minVersion: string;
  size: string;
  description: string;
}

export const CHANNEL_DEPENDENCIES: Record<ChannelType, ChannelDependency | null> = {
  telegram: {
    packageName: "grammy",
    minVersion: "^1.26.0",
    size: "1.4MB",
    description: "Telegram Bot API framework",
  },
  discord: {
    packageName: "discord.js",
    minVersion: "^14.14.0",
    size: "3.3MB",
    description: "Discord Bot API",
  },
  whatsapp: {
    packageName: "@whiskeysockets/baileys",
    minVersion: "^6.6.0",
    size: "9MB",
    description: "WhatsApp Web API (QR code pairing)",
  },
  slack: {
    packageName: "@slack/bolt",
    minVersion: "^3.17.0",
    size: "11MB",
    description: "Slack Bot SDK",
  },
  matrix: {
    packageName: "matrix-js-sdk",
    minVersion: "^30.0.0",
    size: "14MB",
    description: "Matrix client SDK",
  },
  wechat: {
    packageName: "wechaty",
    minVersion: "^1.20.0",
    size: "15MB",
    description: "WeChat bot framework",
  },
  line: {
    packageName: "@line/bot-sdk",
    minVersion: "^7.0.0",
    size: "16MB",
    description: "LINE Messaging API",
  },
  irc: {
    packageName: "irc-framework",
    minVersion: "^4.0.0",
    size: "0.5MB",
    description: "IRC client framework",
  },
  nostr: {
    packageName: "nostr-tools",
    minVersion: "^1.0.0",
    size: "0.5MB",
    description: "Nostr protocol tools",
  },
  twitch: {
    packageName: "tmi.js",
    minVersion: "^1.8.0",
    size: "0.3MB",
    description: "Twitch chat IRC client",
  },
  googlechat: null, // HTTP webhook
  msteams: null,    // HTTP webhook
  feishu: null,     // HTTP only
  qqbot: null,      // HTTP only
  signal: null,     // Requires Java signal-cli
  mattermost: null, // HTTP only
  bluebubbles: null, // HTTP only
  nextcloud: null,  // HTTP only
  synology: null,   // HTTP only
  tlon: null,       // HTTP only
  webchat: null,    // Uses ws (already included)
  imessage: null,   // Native CLI only
};
