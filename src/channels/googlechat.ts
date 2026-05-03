// Google Chat Channel - uses Google Chat API
import type {
  Channel,
  ChannelMessage,
  MessageHandler,
  SendMessageOptions,
  GoogleChatConfig,
} from "./types.js";

export class GoogleChatChannel implements Channel {
  readonly type = "googlechat" as const;
  private config: GoogleChatConfig;
  private messageHandler?: MessageHandler;
  private _connected = false;
  private accessToken: string | null = null;

  constructor(config: GoogleChatConfig) {
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async start(): Promise<void> {
    // Note: For production, implement JWT auth with google-auth-library
    console.log("[Google Chat] Webhook mode - set up webhook URL in Google Chat API");
    this._connected = true;
    console.log("[Google Chat] Ready! Configure webhook in Google Chat API console.");
    console.log("[Google Chat] Webhook endpoint: POST /webhook/googlechat");
  }

  // Handle webhook event
  async handleWebhookEvent(event: any): Promise<void> {
    if (event.type === "MESSAGE") {
      const channelMsg: ChannelMessage = {
        id: event.message?.name || `${Date.now()}`,
        channel: "googlechat",
        userId: event.user?.name || "unknown",
        chatId: event.space?.name || "unknown",
        text: event.message?.text || "",
        timestamp: Date.now(),
        raw: event,
      };

      await this.messageHandler?.(channelMsg);
    }
  }

  async stop(): Promise<void> {
    this._connected = false;
    console.log("[Google Chat] Stopped");
  }

  async sendMessage(
    chatId: string,
    text: string,
    _options?: SendMessageOptions
  ): Promise<string> {
    // Google Chat API call
    const url = `https://chat.googleapis.com/v1/${chatId}/messages`;
    
    // For now, use simple HTTP (in production, use proper OAuth)
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
      }),
    });

    if (!res.ok) {
      throw new Error(`Google Chat API error: ${res.status}`);
    }

    const result = await res.json();
    return result.name || `${Date.now()}`;
  }

  async sendReply(message: ChannelMessage, text: string): Promise<string> {
    return this.sendMessage(message.chatId, text);
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }
}

export function createGoogleChatChannel(config: GoogleChatConfig): GoogleChatChannel {
  return new GoogleChatChannel(config);
}