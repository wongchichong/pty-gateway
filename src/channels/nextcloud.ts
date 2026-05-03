// Nextcloud Talk Channel - uses Nextcloud API
import type {
  Channel,
  ChannelMessage,
  MessageHandler,
  SendMessageOptions,
  NextcloudConfig,
} from "./types.js";

export class NextcloudChannel implements Channel {
  readonly type = "nextcloud" as const;
  private config: NextcloudConfig;
  private messageHandler?: MessageHandler;
  private _connected = false;

  constructor(config: NextcloudConfig) {
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async start(): Promise<void> {
    // Verify connection
    try {
      const res = await fetch(`${this.config.serverUrl}/ocs/v2.php/cloud/user`, {
        headers: {
          "OCS-APIRequest": "true",
          "Authorization": `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")}`,
        },
      });

      if (res.ok) {
        this._connected = true;
        console.log("[Nextcloud] Connected!");
      } else {
        console.log(`[Nextcloud] Warning: Auth failed (${res.status})`);
        this._connected = true; // Still allow operation
      }
    } catch (err) {
      console.log("[Nextcloud] Warning: Could not reach server");
      this._connected = true;
    }
  }

  async stop(): Promise<void> {
    this._connected = false;
    console.log("[Nextcloud] Stopped");
  }

  async sendMessage(
    chatId: string,
    text: string,
    _options?: SendMessageOptions
  ): Promise<string> {
    const url = `${this.config.serverUrl}/ocs/v2.php/apps/spreed/api/v1/chat/${chatId}`;
    
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "OCS-APIRequest": "true",
        "Authorization": `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")}`,
      },
      body: JSON.stringify({
        message: text,
      }),
    });

    if (!res.ok) {
      throw new Error(`Nextcloud API error: ${res.status}`);
    }

    const result = await res.json();
    return result.ocs?.data?.id || `${Date.now()}`;
  }

  async sendReply(message: ChannelMessage, text: string): Promise<string> {
    return this.sendMessage(message.chatId, text);
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  // Handle webhook/push event
  async handlePushEvent(event: any): Promise<void> {
    if (event.type === "chat_message") {
      const channelMsg: ChannelMessage = {
        id: event.message?.id || `${Date.now()}`,
        channel: "nextcloud",
        userId: event.actor?.id || "unknown",
        chatId: event.token || "unknown",
        text: event.message || "",
        timestamp: Date.now(),
        raw: event,
      };

      await this.messageHandler?.(channelMsg);
    }
  }
}

export function createNextcloudChannel(config: NextcloudConfig): NextcloudChannel {
  return new NextcloudChannel(config);
}