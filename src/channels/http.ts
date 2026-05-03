// HTTP Channel - Generic REST API channel for platforms without SDKs
// Supports: BlueBubbles, Google Chat, MS Teams, Feishu, QQ Bot, Mattermost, etc.
import type {
  Channel,
  ChannelMessage,
  ChannelType,
  MessageHandler,
  SendMessageOptions,
} from "./types.js";

export interface HttpChannelConfig {
  type: string;
  name: string;
  baseUrl: string;
  headers?: Record<string, string>;
  messageEndpoint?: string;
  sendEndpoint?: string;
  transformMessage?: (data: any) => ChannelMessage | null;
  transformSend?: (chatId: string, text: string) => any;
}

export class HttpChannel implements Channel {
  readonly type: ChannelType;
  private config: HttpChannelConfig;
  private messageHandler?: MessageHandler;
  private _connected = false;

  constructor(config: HttpChannelConfig) {
    this.type = config.type as ChannelType;
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async start(): Promise<void> {
    // HTTP channels don't maintain connections
    // Just verify the endpoint is reachable
    try {
      const res = await fetch(this.config.baseUrl, {
        method: "HEAD",
        headers: this.config.headers,
      });
      
      if (res.ok) {
        this._connected = true;
        console.log(`[${this.config.name}] Ready!`);
      } else {
        console.log(`[${this.config.name}] Endpoint returned ${res.status}`);
        this._connected = true; // Still allow operation
      }
    } catch (err) {
      console.log(`[${this.config.name}] Warning: Could not reach endpoint`);
      this._connected = true; // Still allow operation
    }
  }

  async stop(): Promise<void> {
    this._connected = false;
    console.log(`[${this.config.name}] Disconnected`);
  }

  async sendMessage(
    chatId: string,
    text: string,
    options?: SendMessageOptions
  ): Promise<string> {
    const endpoint = this.config.sendEndpoint || "/messages";
    const url = `${this.config.baseUrl}${endpoint}`;

    const body = this.config.transformSend
      ? this.config.transformSend(chatId, text)
      : { chatId, text };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.config.headers,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const result = await res.json();
    return result.id || result.messageId || `${Date.now()}`;
  }

  async sendReply(message: ChannelMessage, text: string): Promise<string> {
    return this.sendMessage(message.chatId, text, {
      replyTo: message.id,
    });
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  // Call this when you receive a webhook
  async handleWebhook(data: any): Promise<void> {
    if (!this.config.transformMessage) {
      console.warn(`[${this.config.name}] No transformMessage configured`);
      return;
    }

    const msg = this.config.transformMessage(data);
    if (msg) {
      await this.messageHandler?.(msg);
    }
  }
}

// Factory functions for specific platforms

export function createBlueBubblesChannel(config: { serverUrl: string; password: string }) {
  return new HttpChannel({
    type: "bluebubbles",
    name: "BlueBubbles",
    baseUrl: config.serverUrl,
    headers: { Authorization: `Bearer ${config.password}` },
    sendEndpoint: "/api/v1/message/text",
    transformSend: (_chatId: string, text: string) => ({
      addresses: [], // Would need to be configured
      message: text,
    }),
    transformMessage: (data: any) => ({
      id: data.guid,
      channel: "bluebubbles",
      userId: data.sender?.handle || "unknown",
      chatId: data.chatGuid,
      text: data.text,
      timestamp: data.dateCreated * 1000,
      raw: data,
    }),
  });
}

export function createMattermostChannel(config: { serverUrl: string; botToken: string; teamName: string }) {
  return new HttpChannel({
    type: "mattermost",
    name: "Mattermost",
    baseUrl: config.serverUrl,
    headers: { Authorization: `Bearer ${config.botToken}` },
    sendEndpoint: "/api/v4/posts",
    transformSend: (chatId: string, text: string) => ({
      channel_id: chatId,
      message: text,
    }),
    transformMessage: (data: any) => ({
      id: data.id,
      channel: "mattermost",
      userId: data.user_id,
      chatId: data.channel_id,
      text: data.message,
      timestamp: data.create_at,
      raw: data,
    }),
  });
}

export function createFeishuChannel(config: { appId: string; appSecret: string }) {
  return new HttpChannel({
    type: "feishu",
    name: "Feishu",
    baseUrl: "https://open.feishu.cn/open-apis",
    headers: {}, // Would need to get tenant_access_token
    sendEndpoint: "/im/v1/messages",
    transformSend: (chatId: string, text: string) => ({
      receive_id: chatId,
      msg_type: "text",
      content: JSON.stringify({ text }),
    }),
    transformMessage: (data: any) => ({
      id: data.message_id,
      channel: "feishu",
      userId: data.sender?.id?.open_id || "unknown",
      chatId: data.chat_id,
      text: data.content,
      timestamp: data.create_time * 1000,
      raw: data,
    }),
  });
}

export function createQqBotChannel(config: { appId: string; appSecret: string }) {
  return new HttpChannel({
    type: "qqbot",
    name: "QQ Bot",
    baseUrl: "https://api.sgroup.qq.com",
    headers: { Authorization: `Bot ${config.appId}.${config.appSecret}` },
    sendEndpoint: "/v2/messages",
    transformSend: (chatId: string, text: string) => ({
      channel_id: chatId,
      content: text,
    }),
    transformMessage: (data: any) => ({
      id: data.id,
      channel: "qqbot",
      userId: data.author?.id || "unknown",
      chatId: data.channel_id,
      text: data.content,
      timestamp: data.timestamp * 1000,
      raw: data,
    }),
  });
}
