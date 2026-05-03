// Slack Channel - uses Bolt SDK
import type {
  Channel,
  ChannelMessage,
  MessageHandler,
  SendMessageOptions,
  SlackConfig,
} from "./types.js";
import { loadPackage } from "../utils/deps.js";

export class SlackChannel implements Channel {
  readonly type = "slack" as const;
  private config: SlackConfig;
  private messageHandler?: MessageHandler;
  private _connected = false;
  private app: any = null;

  constructor(config: SlackConfig) {
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async start(): Promise<void> {
    const bolt = await loadPackage<{
      App: new (opts: any) => any;
    }>("@slack/bolt");

    if (!bolt) {
      throw new Error("Slack requires @slack/bolt. Run: npm install @slack/bolt");
    }

    const { App } = bolt;

    this.app = new App({
      token: this.config.botToken,
      socketMode: true,
      appToken: this.config.appToken,
    });

    // Handle messages
    this.app.message(async ({ message, say, client }: any) => {
      // Skip bot messages
      if (message.subtype || message.bot_id) return;

      const channelMsg: ChannelMessage = {
        id: message.ts,
        channel: "slack",
        userId: message.user,
        chatId: message.channel,
        text: message.text || "",
        timestamp: parseFloat(message.ts) * 1000,
        raw: message,
      };

      if (this.isAllowed(channelMsg)) {
        await this.messageHandler?.(channelMsg);
      }
    });

    // Start the app
    await this.app.start();
    this._connected = true;
    console.log("[Slack] Connected!");
  }

  private isAllowed(msg: ChannelMessage): boolean {
    const allowed = this.config.allowedChannels;
    if (!allowed || allowed.length === 0) return true;
    return allowed.includes(msg.chatId);
  }

  async stop(): Promise<void> {
    if (this.app) {
      await this.app.stop();
      this.app = null;
    }
    this._connected = false;
    console.log("[Slack] Disconnected");
  }

  async sendMessage(
    chatId: string,
    text: string,
    options?: SendMessageOptions
  ): Promise<string> {
    if (!this.app) throw new Error("Slack not connected");

    const maxLen = options?.maxChunkSize || 40000; // Slack has high limits

    if (options?.chunk && text.length > maxLen) {
      const chunks = this.chunkText(text, maxLen);
      const ids: string[] = [];

      for (const chunk of chunks) {
        const result = await this.app.client.chat.postMessage({
          channel: chatId,
          text: chunk,
          thread_ts: options?.replyTo,
        });
        ids.push(result.ts);
      }

      return ids.join(",");
    }

    const result = await this.app.client.chat.postMessage({
      channel: chatId,
      text,
      thread_ts: options?.replyTo,
    });

    return result.ts;
  }

  async sendReply(message: ChannelMessage, text: string): Promise<string> {
    return this.sendMessage(message.chatId, text, {
      replyTo: message.id,
    });
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

export function createSlackChannel(config: SlackConfig): SlackChannel {
  return new SlackChannel(config);
}
