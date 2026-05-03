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

      // Use polling (default) or webhook based on config
      if (this.config.polling !== false) {
        await this.bot.start({
          onStart: () => {
            console.log(`[Telegram] Bot started: @${this.bot.botInfo.username}`);
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
      // Handle chunking for long messages
      const maxLen = options?.maxChunkSize || 4096;

      if (options?.chunk && text.length > maxLen) {
        const chunks = this.chunkText(text, maxLen);
        const ids: string[] = [];

        for (const chunk of chunks) {
          const msg = await this.bot.api.sendMessage(chatId, chunk, {
            parse_mode: options.parseMode === "html" ? "HTML" : undefined,
          });
          ids.push(msg.message_id.toString());
        }

        return ids.join(",");
      }

      const msg = await this.bot.api.sendMessage(chatId, text, {
        parse_mode: options?.parseMode === "html" ? "HTML" : undefined,
        reply_to_message_id: options?.replyTo ? parseInt(options.replyTo) : undefined,
      });

      return msg.message_id.toString();
    } catch (err) {
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
