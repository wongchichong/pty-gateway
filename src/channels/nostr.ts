// Nostr Channel - uses nostr-tools
import type {
  Channel,
  ChannelMessage,
  MessageHandler,
  SendMessageOptions,
  NostrConfig,
} from "./types.js";
import { loadPackage } from "../utils/deps.js";

export class NostrChannel implements Channel {
  readonly type = "nostr" as const;
  private config: NostrConfig;
  private messageHandler?: MessageHandler;
  private _connected = false;
  private sockets: WebSocket[] = [];

  constructor(config: NostrConfig) {
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async start(): Promise<void> {
    const nostr = await loadPackage<{
      finalizeEvent: (event: any, privateKey: Uint8Array) => any;
      verifyEvent: (event: any) => boolean;
      nip19: any;
      getPublicKey: (privateKey: Uint8Array) => string;
    }>("nostr-tools");

    if (!nostr) {
      throw new Error("Nostr requires nostr-tools. Run: npm install nostr-tools");
    }

    // Connect to relays
    for (const relay of this.config.relays) {
      const ws = new WebSocket(relay);
      
      ws.onopen = () => {
        console.log(`[Nostr] Connected to ${relay}`);
        this._connected = true;
        
        // Subscribe to DMs (kind 4)
        ws.send(JSON.stringify([
          "REQ",
          `dm-sub-${Date.now()}`,
          { kinds: [4], limit: 100 }
        ]));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data[0] === "EVENT") {
            this.handleNostrEvent(data[2], nostr);
          }
        } catch (err) {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        console.log(`[Nostr] Disconnected from ${relay}`);
      };

      this.sockets.push(ws);
    }
  }

  private async handleNostrEvent(event: any, nostr: any): Promise<void> {
    if (event.kind !== 4) return; // Only handle DMs

    // Decrypt message (requires nip44 or nip04)
    // For simplicity, we'll just pass the encrypted content
    const channelMsg: ChannelMessage = {
      id: event.id,
      channel: "nostr",
      userId: event.pubkey,
      chatId: event.pubkey, // DMs are 1:1
      text: event.content, // Would need decryption
      timestamp: event.created_at * 1000,
      raw: event,
    };

    await this.messageHandler?.(channelMsg);
  }

  async stop(): Promise<void> {
    for (const ws of this.sockets) {
      ws.close();
    }
    this.sockets = [];
    this._connected = false;
    console.log("[Nostr] Disconnected");
  }

  async sendMessage(
    chatId: string,
    text: string,
    _options?: SendMessageOptions
  ): Promise<string> {
    // Create and sign event
    const event = {
      kind: 4, // DM
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", chatId]],
      content: text, // Should be encrypted
    };

    // Broadcast to all relays
    const eventId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    for (const ws of this.sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(["EVENT", { ...event, id: eventId }]));
      }
    }

    return eventId;
  }

  async sendReply(message: ChannelMessage, text: string): Promise<string> {
    return this.sendMessage(message.userId, text);
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }
}

export function createNostrChannel(config: NostrConfig): NostrChannel {
  return new NostrChannel(config);
}
