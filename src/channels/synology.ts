// Synology Chat Channel - uses Synology Chat API
import type {
  Channel,
  ChannelMessage,
  MessageHandler,
  SendMessageOptions,
  SynologyConfig,
} from "./types.js";

export class SynologyChannel implements Channel {
  readonly type = "synology" as const;
  private config: SynologyConfig;
  private messageHandler?: MessageHandler;
  private _connected = false;

  constructor(config: SynologyConfig) {
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async start(): Promise<void> {
    this._connected = true;
    console.log("[Synology Chat] Ready! Configure outgoing webhook in Synology Chat.");
    console.log("[Synology Chat] Webhook endpoint: POST /webhook/synology");
  }

  async stop(): Promise<void> {
    this._connected = false;
    console.log("[Synology Chat] Stopped");
  }

  async sendMessage(
    chatId: string,
    text: string,
    _options?: SendMessageOptions
  ): Promise<string> {
    const url = `${this.config.serverUrl}/webapi/entry.cgi`;
    
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        api: "SYNO.Chat.External",
        method: "chat",
        version: "2",
        token: this.config.token,
        text,
      }).toString(),
    });

    if (!res.ok) {
      throw new Error(`Synology API error: ${res.status}`);
    }

    const result = await res.json();
    return result.success ? `${Date.now()}` : "error";
  }

  async sendReply(message: ChannelMessage, text: string): Promise<string> {
    return this.sendMessage(message.chatId, text);
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  // Handle webhook event
  async handleWebhookEvent(event: any): Promise<void> {
    const channelMsg: ChannelMessage = {
      id: event.message_id || `${Date.now()}`,
      channel: "synology",
      userId: event.user_id || "unknown",
      chatId: event.channel_id || "unknown",
      text: event.text || "",
      timestamp: Date.now(),
      raw: event,
    };

    await this.messageHandler?.(channelMsg);
  }
}

export function createSynologyChannel(config: SynologyConfig): SynologyChannel {
  return new SynologyChannel(config);
}