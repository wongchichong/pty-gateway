// LINE Channel - uses @line/bot-sdk
import type {
  Channel,
  ChannelMessage,
  MessageHandler,
  SendMessageOptions,
  LineConfig,
} from "./types.js";
import { loadPackage } from "../utils/deps.js";

export class LineChannel implements Channel {
  readonly type = "line" as const;
  private config: LineConfig;
  private messageHandler?: MessageHandler;
  private _connected = false;
  private client: any = null;

  constructor(config: LineConfig) {
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async start(): Promise<void> {
    const sdk = await loadPackage<{
      Client: new (opts: any) => any;
      middleware: any;
    }>("@line/bot-sdk");

    if (!sdk) {
      throw new Error("LINE requires @line/bot-sdk. Run: npm install @line/bot-sdk");
    }

    const { Client } = sdk;

    this.client = new Client({
      channelAccessToken: this.config.channelAccessToken,
      channelSecret: this.config.channelSecret,
    });

    this._connected = true;
    console.log("[LINE] Ready! Set up webhook to receive messages.");
  }

  // Handle webhook event (call this from your HTTP handler)
  async handleWebhookEvent(event: any): Promise<void> {
    if (event.type === "message" && event.message.type === "text") {
      const channelMsg: ChannelMessage = {
        id: event.message.id,
        channel: "line",
        userId: event.source.userId,
        chatId: event.source.groupId || event.source.roomId || event.source.userId,
        text: event.message.text,
        timestamp: event.timestamp,
        raw: event,
      };

      await this.messageHandler?.(channelMsg);
    }
  }

  async stop(): Promise<void> {
    this.client = null;
    this._connected = false;
    console.log("[LINE] Disconnected");
  }

  async sendMessage(
    chatId: string,
    text: string,
    options?: SendMessageOptions
  ): Promise<string> {
    if (!this.client) throw new Error("LINE not connected");

    const maxLen = options?.maxChunkSize || 5000;

    if (options?.chunk && text.length > maxLen) {
      const chunks = this.chunkText(text, maxLen);
      const ids: string[] = [];

      for (const chunk of chunks) {
        const result = await this.client.pushMessage(chatId, {
          type: "text",
          text: chunk,
        });
        ids.push(result?.messageId || `${Date.now()}`);
      }

      return ids.join(",");
    }

    await this.client.pushMessage(chatId, {
      type: "text",
      text,
    });

    return `${chatId}-${Date.now()}`;
  }

  async sendReply(message: ChannelMessage, text: string): Promise<string> {
    if (!this.client) throw new Error("LINE not connected");

    await this.client.replyMessage(message.id, {
      type: "text",
      text,
    });

    return message.id;
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

export function createLineChannel(config: LineConfig): LineChannel {
  return new LineChannel(config);
}
