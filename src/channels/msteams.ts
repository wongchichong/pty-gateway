// MS Teams Channel - uses Bot Framework
import type {
  Channel,
  ChannelMessage,
  MessageHandler,
  SendMessageOptions,
  MsTeamsConfig,
} from "./types.js";

export class MsTeamsChannel implements Channel {
  readonly type = "msteams" as const;
  private config: MsTeamsConfig;
  private messageHandler?: MessageHandler;
  private _connected = false;

  constructor(config: MsTeamsConfig) {
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async start(): Promise<void> {
    this._connected = true;
    console.log("[MS Teams] Ready! Configure webhook in Azure Bot Service.");
    console.log("[MS Teams] Webhook endpoint: POST /webhook/msteams");
  }

  // Handle webhook event
  async handleWebhookEvent(event: any): Promise<void> {
    if (event.type === "message" || event.text) {
      const channelMsg: ChannelMessage = {
        id: event.id || `${Date.now()}`,
        channel: "msteams",
        userId: event.from?.id || "unknown",
        chatId: event.conversation?.id || "unknown",
        text: event.text || "",
        timestamp: Date.now(),
        raw: event,
      };

      await this.messageHandler?.(channelMsg);
    }
  }

  async stop(): Promise<void> {
    this._connected = false;
    console.log("[MS Teams] Stopped");
  }

  async sendMessage(
    chatId: string,
    text: string,
    _options?: SendMessageOptions
  ): Promise<string> {
    // MS Teams Bot Framework API
    const url = `https://smba.trafficmanager.net/amer/v3/conversations/${chatId}/activities`;
    
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${await this.getAccessToken()}`,
      },
      body: JSON.stringify({
        type: "message",
        text,
      }),
    });

    if (!res.ok) {
      throw new Error(`MS Teams API error: ${res.status}`);
    }

    const result = await res.json();
    return result.id || `${Date.now()}`;
  }

  private async getAccessToken(): Promise<string> {
    // In production, implement OAuth token retrieval
    // For now, return placeholder
    return this.config.appPassword;
  }

  async sendReply(message: ChannelMessage, text: string): Promise<string> {
    return this.sendMessage(message.chatId, text);
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }
}

export function createMsTeamsChannel(config: MsTeamsConfig): MsTeamsChannel {
  return new MsTeamsChannel(config);
}