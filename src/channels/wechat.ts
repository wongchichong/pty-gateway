// WeChat Channel - uses wechaty
import type {
  Channel,
  ChannelMessage,
  MessageHandler,
  SendMessageOptions,
  WeChatConfig,
} from "./types.js";
import { loadPackage } from "../utils/deps.js";

export class WeChatChannel implements Channel {
  readonly type = "wechat" as const;
  private config: WeChatConfig;
  private messageHandler?: MessageHandler;
  private _connected = false;
  private bot: any = null;

  constructor(config: WeChatConfig) {
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async start(): Promise<void> {
    const wechaty = await loadPackage<{
      WechatyBuilder: any;
    }>("wechaty");

    if (!wechaty) {
      throw new Error("WeChat requires wechaty. Run: npm install wechaty");
    }

    const { WechatyBuilder } = wechaty;

    this.bot = WechatyBuilder.build({
      puppet: this.config.puppet || "wechaty-puppet-wechat4u",
      puppetOptions: {
        token: this.config.puppetToken,
      },
    });

    // Handle scan (QR code)
    this.bot.on("scan", (qrcode: string, status: string) => {
      console.log(`\n[WeChat] Scan QR Code (${status}):`);
      console.log(`https://wechaty.js.org/qrcode/${qrcode}`);
    });

    // Handle login
    this.bot.on("login", (user: any) => {
      console.log(`[WeChat] Logged in as ${user}`);
      this._connected = true;
    });

    // Handle logout
    this.bot.on("logout", (user: any) => {
      console.log(`[WeChat] Logged out from ${user}`);
      this._connected = false;
    });

    // Handle messages
    this.bot.on("message", async (message: any) => {
      if (message.self()) return; // Skip own messages

      const text = await message.text();
      const contact = await message.contact();
      const room = message.room();

      const channelMsg: ChannelMessage = {
        id: message.id,
        channel: "wechat",
        userId: contact?.id || "unknown",
        chatId: room?.id || contact?.id || "unknown",
        text,
        timestamp: Date.now(),
        raw: message,
      };

      await this.messageHandler?.(channelMsg);
    });

    await this.bot.start();
    console.log("[WeChat] Starting... Please scan QR code");
  }

  async stop(): Promise<void> {
    if (this.bot) {
      await this.bot.stop();
      this.bot = null;
    }
    this._connected = false;
    console.log("[WeChat] Stopped");
  }

  async sendMessage(
    chatId: string,
    text: string,
    options?: SendMessageOptions
  ): Promise<string> {
    if (!this.bot) throw new Error("WeChat not connected");

    const contactOrRoom = await this.bot.Contact.find({ id: chatId }) ||
                          await this.bot.Room.find({ id: chatId });

    if (!contactOrRoom) {
      throw new Error(`Contact/Room not found: ${chatId}`);
    }

    await contactOrRoom.say(text);
    return `${chatId}-${Date.now()}`;
  }

  async sendReply(message: ChannelMessage, text: string): Promise<string> {
    return this.sendMessage(message.chatId, text);
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }
}

export function createWeChatChannel(config: WeChatConfig): WeChatChannel {
  return new WeChatChannel(config);
}