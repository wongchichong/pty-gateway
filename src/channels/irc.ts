// IRC Channel - uses irc-framework
import type {
  Channel,
  ChannelMessage,
  MessageHandler,
  SendMessageOptions,
  IrcConfig,
} from "./types.js";
import { loadPackage } from "../utils/deps.js";

export class IrcChannel implements Channel {
  readonly type = "irc" as const;
  private config: IrcConfig;
  private messageHandler?: MessageHandler;
  private _connected = false;
  private client: any = null;

  constructor(config: IrcConfig) {
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async start(): Promise<void> {
    const irc = await loadPackage<{
      Client: new (opts: any) => any;
    }>("irc-framework");

    if (!irc) {
      throw new Error("IRC requires irc-framework. Run: npm install irc-framework");
    }

    const { Client } = irc;

    this.client = new Client({
      host: this.config.server,
      port: this.config.port || 6667,
      nick: this.config.nick,
      username: this.config.userName || this.config.nick,
      gecos: this.config.realName || this.config.nick,
      password: this.config.password,
      autoRejoin: true,
    });

    // Handle messages
    this.client.on("message", (event: any) => {
      const channelMsg: ChannelMessage = {
        id: `${event.nick}-${Date.now()}`,
        channel: "irc",
        userId: event.nick,
        chatId: event.target,
        text: event.message,
        timestamp: Date.now(),
        raw: event,
      };

      this.messageHandler?.(channelMsg);
    });

    // Handle private messages
    this.client.on("pm", (event: any) => {
      const channelMsg: ChannelMessage = {
        id: `${event.nick}-${Date.now()}`,
        channel: "irc",
        userId: event.nick,
        chatId: event.nick, // PMs use nick as chatId
        text: event.message,
        timestamp: Date.now(),
        raw: event,
      };

      this.messageHandler?.(channelMsg);
    });

    // Join channels on connect
    this.client.on("registered", () => {
      console.log("[IRC] Connected!");
      this._connected = true;

      if (this.config.channels) {
        for (const chan of this.config.channels) {
          this.client.join(chan);
          console.log(`[IRC] Joined ${chan}`);
        }
      }
    });

    this.client.connect();
  }

  async stop(): Promise<void> {
    if (this.client) {
      this.client.quit("pty-gateway shutting down");
      this.client = null;
    }
    this._connected = false;
    console.log("[IRC] Disconnected");
  }

  async sendMessage(
    chatId: string,
    text: string,
    _options?: SendMessageOptions
  ): Promise<string> {
    if (!this.client) throw new Error("IRC not connected");

    // IRC has message limits (~512 bytes including protocol)
    const maxLen = 400;

    if (text.length > maxLen) {
      const chunks = this.chunkText(text, maxLen);
      for (const chunk of chunks) {
        this.client.say(chatId, chunk);
      }
      return `${chatId}-${Date.now()}`;
    }

    this.client.say(chatId, text);
    return `${chatId}-${Date.now()}`;
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

export function createIrcChannel(config: IrcConfig): IrcChannel {
  return new IrcChannel(config);
}
