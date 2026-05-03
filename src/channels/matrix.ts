// Matrix Channel - uses matrix-js-sdk
import type {
  Channel,
  ChannelMessage,
  MessageHandler,
  SendMessageOptions,
  MatrixConfig,
} from "./types.js";
import { loadPackage } from "../utils/deps.js";

export class MatrixChannel implements Channel {
  readonly type = "matrix" as const;
  private config: MatrixConfig;
  private messageHandler?: MessageHandler;
  private _connected = false;
  private client: any = null;

  constructor(config: MatrixConfig) {
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async start(): Promise<void> {
    const sdk = await loadPackage<{
      createClient: (opts: any) => any;
    }>("matrix-js-sdk");

    if (!sdk) {
      throw new Error("Matrix requires matrix-js-sdk. Run: npm install matrix-js-sdk");
    }

    const { createClient } = sdk;

    this.client = createClient({
      baseUrl: this.config.homeserverUrl,
      accessToken: this.config.accessToken,
      userId: this.config.userId,
    });

    // Handle room messages
    this.client.on("Room.timeline", (event: any, room: any) => {
      if (event.getType() !== "m.room.message") return;
      if (event.getSender() === this.config.userId) return; // Skip own messages

      const content = event.getContent();
      if (content.msgtype !== "m.text") return;

      const channelMsg: ChannelMessage = {
        id: event.getId(),
        channel: "matrix",
        userId: event.getSender(),
        chatId: room.roomId,
        text: content.body || "",
        timestamp: event.getTs(),
        raw: event,
      };

      if (this.isAllowed(channelMsg)) {
        this.messageHandler?.(channelMsg);
      }
    });

    await this.client.startClient();
    this._connected = true;
    console.log("[Matrix] Connected!");
  }

  private isAllowed(msg: ChannelMessage): boolean {
    const allowed = this.config.allowedRooms;
    if (!allowed || allowed.length === 0) return true;
    return allowed.includes(msg.chatId);
  }

  async stop(): Promise<void> {
    if (this.client) {
      this.client.stopClient();
      this.client = null;
    }
    this._connected = false;
    console.log("[Matrix] Disconnected");
  }

  async sendMessage(
    chatId: string,
    text: string,
    options?: SendMessageOptions
  ): Promise<string> {
    if (!this.client) throw new Error("Matrix not connected");

    const maxLen = options?.maxChunkSize || 16000;

    if (options?.chunk && text.length > maxLen) {
      const chunks = this.chunkText(text, maxLen);
      const ids: string[] = [];

      for (const chunk of chunks) {
        const result = await this.client.sendEvent(
          chatId,
          "m.room.message",
          { msgtype: "m.text", body: chunk },
          ""
        );
        ids.push(result.event_id);
      }

      return ids.join(",");
    }

    const result = await this.client.sendEvent(
      chatId,
      "m.room.message",
      { msgtype: "m.text", body: text },
      ""
    );

    return result.event_id;
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

export function createMatrixChannel(config: MatrixConfig): MatrixChannel {
  return new MatrixChannel(config);
}
