// Twitch Channel - uses tmi.js
import type {
  Channel,
  ChannelMessage,
  MessageHandler,
  SendMessageOptions,
  TwitchConfig,
} from "./types.js";
import { loadPackage } from "../utils/deps.js";

export class TwitchChannel implements Channel {
  readonly type = "twitch" as const;
  private config: TwitchConfig;
  private messageHandler?: MessageHandler;
  private _connected = false;
  private client: any = null;

  constructor(config: TwitchConfig) {
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async start(): Promise<void> {
    const tmi = await loadPackage<{
      Client: new (opts: any) => any;
    }>("tmi.js");

    if (!tmi) {
      throw new Error("Twitch requires tmi.js. Run: npm install tmi.js");
    }

    const { Client } = tmi;

    this.client = new Client({
      identity: {
        username: "pty-gateway",
        password: this.config.botToken,
      },
      channels: this.config.channels,
    });

    this.client.on("message", (target: string, context: any, msg: string) => {
      const channelMsg: ChannelMessage = {
        id: context.id || `${context.username}-${Date.now()}`,
        channel: "twitch",
        userId: context.username,
        chatId: target,
        text: msg,
        timestamp: Date.now(),
        raw: context,
      };

      this.messageHandler?.(channelMsg);
    });

    this.client.on("connected", () => {
      console.log("[Twitch] Connected!");
      this._connected = true;
    });

    await this.client.connect();
  }

  async stop(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
    this._connected = false;
    console.log("[Twitch] Disconnected");
  }

  async sendMessage(
    chatId: string,
    text: string,
    _options?: SendMessageOptions
  ): Promise<string> {
    if (!this.client) throw new Error("Twitch not connected");

    // Twitch has 500 char limit
    const maxLen = 500;

    if (text.length > maxLen) {
      const chunks = this.chunkText(text, maxLen);
      for (const chunk of chunks) {
        await this.client.say(chatId, chunk);
      }
      return `${chatId}-${Date.now()}`;
    }

    await this.client.say(chatId, text);
    return `${chatId}-${Date.now()}`;
  }

  async sendReply(message: ChannelMessage, text: string): Promise<string> {
    return this.sendMessage(message.chatId, text);
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  private chunkText(text: string, maxLen: number): string[] {
    const chunks: string[] = [];
    const lines = text.split("\n");
    let current = "";

    for (const line of lines) {
      if (current.length + line.length + 1 > maxLen) {
        if (current) chunks.push(current);
        current = line;
      } else {
        current += (current ? "\n" : "") + line;
      }
    }

    if (current) chunks.push(current);
    return chunks;
  }
}

export function createTwitchChannel(config: TwitchConfig): TwitchChannel {
  return new TwitchChannel(config);
}
