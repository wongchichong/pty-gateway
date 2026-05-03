// WhatsApp Channel - uses Baileys (WhatsApp Web protocol)
import type {
  Channel,
  ChannelMessage,
  MessageHandler,
  SendMessageOptions,
  WhatsAppConfig,
} from "./types.js";
import { loadPackage } from "../utils/deps.js";

// Baileys types (dynamically loaded)
type BaileysSocket = any;
type BaileysConnectionState = any;

export class WhatsAppChannel implements Channel {
  readonly type = "whatsapp" as const;
  private config: WhatsAppConfig;
  private messageHandler?: MessageHandler;
  private _connected = false;
  private sock: BaileysSocket | null = null;

  constructor(config: WhatsAppConfig) {
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async start(): Promise<void> {
    // Dynamically load baileys
    const baileys = await loadPackage<{
      makeWASocket: (opts: any) => BaileysSocket;
      useMultiFileAuthState: (path: string) => Promise<any>;
      DisconnectReason: any;
      fetchLatestBaileysVersion: () => Promise<{ version: number[]; isLatest: boolean }>;
    }>("@whiskeysockets/baileys");

    if (!baileys) {
      throw new Error("WhatsApp requires @whiskeysockets/baileys. Run: npm install @whiskeysockets/baileys");
    }

    const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

    // Load or create auth state
    const sessionPath = this.config.sessionPath || "~/.pty-gateway/whatsapp-session";
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    // Get latest version
    const { version } = await fetchLatestBaileysVersion();

    // Create socket
    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
      browser: ["pty-gateway", "Chrome", "1.0.0"],
    });

    // Handle connection updates
    this.sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("\n[WhatsApp] Scan this QR code with WhatsApp on your phone:");
        console.log(qr); // QR code string - terminal will render it
      }

      if (connection === "close") {
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        
        console.log("[WhatsApp] Connection closed. Reconnecting:", shouldReconnect);
        this._connected = false;

        if (shouldReconnect) {
          await this.start();
        }
      } else if (connection === "open") {
        console.log("[WhatsApp] Connected!");
        this._connected = true;
      }
    });

    // Save credentials on update
    this.sock.ev.on("creds.update", saveCreds);

    // Handle incoming messages
    this.sock.ev.on("messages.upsert", async ({ messages, type }: any) => {
      if (type !== "notify") return;

      for (const msg of messages) {
        if (msg.key.fromMe) continue; // Skip own messages

        const channelMsg = this.toChannelMessage(msg);
        if (channelMsg && this.isAllowed(channelMsg)) {
          await this.messageHandler?.(channelMsg);
        }
      }
    });
  }

  private toChannelMessage(msg: any): ChannelMessage | null {
    if (!msg.message?.conversation && !msg.message?.extendedTextMessage?.text) {
      return null;
    }

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    return {
      id: msg.key.id,
      channel: "whatsapp",
      userId: msg.key.remoteJid?.split("@")[0] || "",
      chatId: msg.key.remoteJid || "",
      text,
      timestamp: msg.messageTimestamp * 1000,
      raw: msg,
    };
  }

  private isAllowed(msg: ChannelMessage): boolean {
    const allowed = this.config.allowedNumbers;
    if (!allowed || allowed.length === 0) return true;
    return allowed.includes(msg.userId);
  }

  async stop(): Promise<void> {
    if (this.sock) {
      await this.sock.end();
      this.sock = null;
    }
    this._connected = false;
    console.log("[WhatsApp] Disconnected");
  }

  async sendMessage(
    chatId: string,
    text: string,
    options?: SendMessageOptions
  ): Promise<string> {
    if (!this.sock) throw new Error("WhatsApp not connected");

    const maxLen = options?.maxChunkSize || 4096;

    if (options?.chunk && text.length > maxLen) {
      const chunks = this.chunkText(text, maxLen);
      const ids: string[] = [];

      for (const chunk of chunks) {
        const result = await this.sock.sendMessage(chatId, { text: chunk });
        ids.push(result.key.id);
      }

      return ids.join(",");
    }

    const result = await this.sock.sendMessage(chatId, { text });
    return result.key.id;
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

export function createWhatsAppChannel(config: WhatsAppConfig): WhatsAppChannel {
  return new WhatsAppChannel(config);
}
