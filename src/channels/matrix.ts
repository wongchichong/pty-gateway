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
  private typingTimeout: Map<string, NodeJS.Timeout> = new Map();
  private startTime: number = 0; // Track when we started

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
      if (content.msgtype !== "m.text" && content.msgtype !== "m.notice") return;

      // Handle reactions
      if (event.getType() === "m.reaction") {
        console.log(`[Matrix] Reaction received: ${content["m.relates_to"]?.key}`);
        return;
      }

      // Skip old messages (from before we started)
      const eventTime = event.getTs();
      if (eventTime < this.startTime) {
        return; // Skip old cached messages
      }

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

    // Set start time BEFORE starting sync to filter old messages
    this.startTime = Date.now();

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
    // Clear all typing timeouts
    for (const [chatId, timeout] of this.typingTimeout) {
      clearTimeout(timeout);
    }
    this.typingTimeout.clear();

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
          {
            msgtype: "m.text",
            body: chunk, // Plain text fallback
            format: "org.matrix.custom.html",
            formatted_body: this.formatForMatrix(chunk), // HTML version
          },
          ""
        );
        ids.push(result.event_id);
      }

      return ids.join(",");
    }

    const result = await this.client.sendEvent(
      chatId,
      "m.room.message",
      {
        msgtype: "m.text",
        body: text, // Plain text fallback (no HTML tags)
        format: "org.matrix.custom.html",
        formatted_body: this.formatForMatrix(text), // HTML version
      },
      ""
    );

    console.log(`[Matrix] ✅ Message sent (${result.event_id.slice(0, 10)}...)`);
    return result.event_id;
  }

  async sendReply(message: ChannelMessage, text: string): Promise<string> {
    if (!this.client) throw new Error("Matrix not connected");

    const result = await this.client.sendEvent(
      message.chatId,
      "m.room.message",
      {
        msgtype: "m.text",
        body: text,
        format: "org.matrix.custom.html",
        formatted_body: this.formatForMatrix(text),
        "m.relates_to": {
          "m.in_reply_to": {
            event_id: message.id,
          },
        },
      },
      ""
    );

    return result.event_id;
  }

  async editMessage(
    chatId: string,
    messageId: string,
    text: string,
    options?: SendMessageOptions
  ): Promise<boolean> {
    if (!this.client) throw new Error("Matrix not connected");

    try {
      await this.client.sendEvent(
        chatId,
        "m.room.message",
        {
          msgtype: "m.text",
          body: text,
          format: "org.matrix.custom.html",
          formatted_body: this.formatForMatrix(text),
          "m.relates_to": {
            rel_type: "m.replace",
            event_id: messageId,
          },
          "m.new_content": {
            msgtype: "m.text",
            body: text,
            format: "org.matrix.custom.html",
            formatted_body: this.formatForMatrix(text),
          },
        },
        ""
      );

      console.log(`[Matrix] ✏️ Message edited (${messageId.slice(0, 10)}...)`);
      return true;
    } catch (err) {
      console.error(`[Matrix] ❌ Edit failed: ${err}`);
      return false;
    }
  }

  async deleteMessage(chatId: string, messageId: string): Promise<boolean> {
    if (!this.client) throw new Error("Matrix not connected");

    try {
      await this.client.redactEvent(chatId, messageId);
      console.log(`[Matrix] 🗑️ Message deleted (${messageId.slice(0, 10)}...)`);
      return true;
    } catch (err) {
      console.error(`[Matrix] ❌ Delete failed: ${err}`);
      return false;
    }
  }

  /**
   * Send a reaction to a message
   * @param chatId Room ID
   * @param messageId Message ID to react to
   * @param reaction Emoji or shortcode (e.g., "✅", "🎉")
   */
  async sendReaction(
    chatId: string,
    messageId: string,
    reaction: string
  ): Promise<boolean> {
    if (!this.client) throw new Error("Matrix not connected");

    try {
      const key = reaction; // The emoji or text for the reaction
      const txnId = `reaction_${Date.now()}`;

      await this.client.sendEvent(
        chatId,
        "m.reaction",
        {
          "m.relates_to": {
            rel_type: "m.annotation",
            event_id: messageId,
            key: key,
          },
        },
        txnId
      );

      console.log(`[Matrix] 👍 Reaction "${reaction}" sent to ${messageId.slice(0, 10)}...`);
      return true;
    } catch (err) {
      console.error(`[Matrix] ❌ Reaction failed: ${err}`);
      return false;
    }
  }

  /**
   * Show typing indicator while processing
   * @param chatId Room ID
   * @param duration_ms How long to show typing (default 30 seconds)
   */
  async sendTyping(chatId: string, duration_ms: number = 30000): Promise<void> {
    if (!this.client) throw new Error("Matrix not connected");

    try {
      // Stop any existing typing for this room
      const existing = this.typingTimeout.get(chatId);
      if (existing) {
        clearTimeout(existing);
        this.client.sendTyping(chatId, 0); // Stop
      }

      // Send typing indicator
      await this.client.sendTyping(chatId, duration_ms / 1000);
      console.log(`[Matrix] ⏳ Typing indicator sent for ${duration_ms}ms`);

      // Auto-stop after duration
      const timeout = setTimeout(() => {
        this.client.sendTyping(chatId, 0);
        this.typingTimeout.delete(chatId);
      }, duration_ms);

      this.typingTimeout.set(chatId, timeout);
    } catch (err) {
      console.error(`[Matrix] ❌ Typing indicator failed: ${err}`);
    }
  }

  /**
   * Stop typing indicator
   */
  async stopTyping(chatId: string): Promise<void> {
    if (!this.client) throw new Error("Matrix not connected");

    const existing = this.typingTimeout.get(chatId);
    if (existing) {
      clearTimeout(existing);
      this.typingTimeout.delete(chatId);
    }

    try {
      await this.client.sendTyping(chatId, 0);
    } catch (err) {
      // Ignore errors when stopping
    }
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  private formatForMatrix(text: string): string {
    // Escape HTML special characters
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Simple pre/code block - no colors (stripped by Element)
    // white-space:pre-wrap may also be stripped but worth trying
    return `<pre style="white-space:pre-wrap"><code>${escaped}</code></pre>`;
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