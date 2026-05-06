import { Bot, Context, GrammyError } from "grammy";
import type {
  Channel,
  ChannelMessage,
  MessageHandler,
  SendMessageOptions,
  TelegramConfig,
} from "./types.js";

export class TelegramChannel implements Channel {
  readonly type = "telegram" as const;
  private bot: Bot;
  private config: TelegramConfig;
  private messageHandler?: MessageHandler;
  private _connected = false;

  constructor(config: TelegramConfig) {
    this.config = config;
    this.bot = new Bot(config.botToken);

    // Set up message handler
    this.bot.on("message:text", async (ctx) => {
      const msg = this.toChannelMessage(ctx);
      if (msg && this.isAllowed(msg)) {
        await this.messageHandler?.(msg);
      }
    });

    // Handle commands
    this.bot.command("start", async (ctx) => {
      const msg = this.toChannelMessage(ctx);
      if (msg && this.isAllowed(msg)) {
        // Rewrite as /start command with args
        msg.text = "/start " + msg.text.replace(/^\/start\s*/, "");
        await this.messageHandler?.(msg);
      }
    });
  }

  get connected(): boolean {
    return this._connected;
  }

  private toChannelMessage(ctx: Context): ChannelMessage | null {
    const msg = ctx.message;
    if (!msg?.text) return null;

    return {
      id: msg.message_id.toString(),
      channel: "telegram",
      userId: msg.from?.id.toString() || "",
      chatId: msg.chat.id.toString(),
      text: msg.text,
      replyTo: msg.reply_to_message?.message_id.toString(),
      timestamp: msg.date * 1000,
      raw: msg,
    };
  }

  private isAllowed(msg: ChannelMessage): boolean {
    const allowedUsers = this.config.allowedUsers;
    const allowedChats = this.config.allowedChats;

    if (allowedUsers && allowedUsers.length > 0) {
      if (!allowedUsers.includes(parseInt(msg.userId))) {
        return false;
      }
    }

    if (allowedChats && allowedChats.length > 0) {
      if (!allowedChats.includes(parseInt(msg.chatId))) {
        return false;
      }
    }

    return true;
  }

  async start(): Promise<void> {
    try {
      await this.bot.init();
      this._connected = true;

      // Set bot commands for Telegram menu
      await this.bot.api.setMyCommands([
        { command: "start", description: "Start a new PTY instance" },
        { command: "connect", description: "Connect to an existing PTY instance" },
        { command: "kill", description: "Kill the current PTY instance" },
        { command: "list", description: "List all PTY instances" },
        { command: "snapshot", description: "Get current PTY buffer snapshot" },
        { command: "status", description: "Show connection and session status" },
        { command: "size", description: "Set PTY size (e.g., 40x80)" },
        { command: "help", description: "Show available commands" },
      ]);

      // Use polling (default) or webhook based on config
      if (this.config.polling !== false) {
        await this.bot.start({
          onStart: () => {
            console.log(`[Telegram] Bot started: @${this.bot.botInfo.username}`);
            console.log(`[Telegram] Commands menu updated`);
          },
        });
      }
    } catch (err) {
      console.error("[Telegram] Failed to start:", err);
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.bot.stop();
    this._connected = false;
    console.log("[Telegram] Bot stopped");
  }

  async sendMessage(
    chatId: string,
    text: string,
    options?: SendMessageOptions
  ): Promise<string> {
    try {
      console.log(`[Telegram] 📤 Sending message to chat ${chatId}:`);
      console.log(`  Text: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`);

      // Handle chunking for long messages
      const maxLen = options?.maxChunkSize || 4096;

      if (options?.chunk && text.length > maxLen) {
        const chunks = this.chunkText(text, maxLen);
        console.log(`  Chunking into ${chunks.length} parts`);
        const ids: string[] = [];

        for (const chunk of chunks) {
          const msg = await this.bot.api.sendMessage(chatId, chunk, {
            parse_mode: options.parseMode === "html" ? "HTML" : options.parseMode === "markdown" ? "MarkdownV2" : undefined,
          });
          ids.push(msg.message_id.toString());
        }

        console.log(`  ✅ Sent ${ids.length} messages`);
        return ids.join(",");
      }

      const msg = await this.bot.api.sendMessage(chatId, text, {
        parse_mode: options?.parseMode === "html" ? "HTML" : options?.parseMode === "markdown" ? "MarkdownV2" : undefined,
        reply_to_message_id: options?.replyTo ? parseInt(options.replyTo) : undefined,
      });

      console.log(`  ✅ Message sent (ID: ${msg.message_id})`);
      return msg.message_id.toString();
    } catch (err) {
      console.error(`[Telegram] ❌ Send failed: ${err}`);
      if (err instanceof GrammyError) {
        console.error("[Telegram] API error:", err.description);
      }
      throw err;
    }
  }

  async sendReply(message: ChannelMessage, text: string): Promise<string> {
    return this.sendMessage(message.chatId, text, {
      replyTo: message.id,
    });
  }

  async editMessage(
    chatId: string,
    messageId: string,
    text: string,
    options?: SendMessageOptions
  ): Promise<boolean> {
    try {
      await this.bot.api.editMessageText(chatId, parseInt(messageId), text, {
        parse_mode: options?.parseMode === "html" ? "HTML" : options?.parseMode === "markdown" ? "MarkdownV2" : undefined,
      });
      return true;
    } catch (err) {
      // Message might be too old or deleted
      console.error(`[Telegram] ❌ Edit failed: ${err}`);
      return false;
    }
  }

  async deleteMessage(chatId: string, messageId: string): Promise<boolean> {
    try {
      await this.bot.api.deleteMessage(chatId, parseInt(messageId));
      return true;
    } catch (err) {
      console.error(`[Telegram] ❌ Delete failed: ${err}`);
      return false;
    }
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

// Factory function
export function createTelegramChannel(config: TelegramConfig): TelegramChannel {
  return new TelegramChannel(config);
}
