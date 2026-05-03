// Tlon/Urbit Channel - uses Urbit API
import type {
  Channel,
  ChannelMessage,
  MessageHandler,
  SendMessageOptions,
  TlonConfig,
} from "./types.js";

export class TlonChannel implements Channel {
  readonly type = "tlon" as const;
  private config: TlonConfig;
  private messageHandler?: MessageHandler;
  private _connected = false;

  constructor(config: TlonConfig) {
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async start(): Promise<void> {
    this._connected = true;
    console.log("[Tlon] Ready! Configure webhook in Urbit.");
    console.log("[Tlon] Webhook endpoint: POST /webhook/tlon");
  }

  async stop(): Promise<void> {
    this._connected = false;
    console.log("[Tlon] Stopped");
  }

  async sendMessage(
    chatId: string,
    text: string,
    _options?: SendMessageOptions
  ): Promise<string> {
    // Urbit HTTP API
    const url = `https://${this.config.shipName}.urbit.org/api/graph`;
    
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        resource: chatId,
        contents: [{ text }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Tlon API error: ${res.status}`);
    }

    return `${Date.now()}`;
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
      id: event.index || `${Date.now()}`,
      channel: "tlon",
      userId: event.author || "unknown",
      chatId: event.resource || "unknown",
      text: event.contents?.[0]?.text || "",
      timestamp: Date.now(),
      raw: event,
    };

    await this.messageHandler?.(channelMsg);
  }
}

export function createTlonChannel(config: TlonConfig): TlonChannel {
  return new TlonChannel(config);
}