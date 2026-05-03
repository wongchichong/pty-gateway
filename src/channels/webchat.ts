// WebChat Channel - built-in WebSocket web chat
import type {
  Channel,
  ChannelMessage,
  MessageHandler,
  SendMessageOptions,
  WebChatConfig,
} from "./types.js";
import { WebSocketServer, WebSocket } from "ws";

export class WebChatChannel implements Channel {
  readonly type = "webchat" as const;
  private config: WebChatConfig;
  private messageHandler?: MessageHandler;
  private _connected = false;
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocket> = new Map();

  constructor(config: WebChatConfig) {
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async start(): Promise<void> {
    const port = this.config.port || 3001;
    const host = this.config.host || "0.0.0.0";

    this.wss = new WebSocketServer({ port, host });

    this.wss.on("connection", (ws, req) => {
      const clientId = `webchat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.clients.set(clientId, ws);

      console.log(`[WebChat] Client connected: ${clientId}`);

      ws.on("message", async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          
          if (msg.type === "message" && msg.text) {
            const channelMsg: ChannelMessage = {
              id: msg.id || `${Date.now()}`,
              channel: "webchat",
              userId: msg.userId || clientId,
              chatId: msg.chatId || clientId,
              text: msg.text,
              timestamp: Date.now(),
              raw: msg,
            };

            await this.messageHandler?.(channelMsg);
          }
        } catch (err) {
          // Ignore parse errors
        }
      });

      ws.on("close", () => {
        this.clients.delete(clientId);
        console.log(`[WebChat] Client disconnected: ${clientId}`);
      });

      // Send welcome
      ws.send(JSON.stringify({
        type: "connected",
        clientId,
      }));
    });

    this._connected = true;
    console.log(`[WebChat] WebSocket server listening on ws://${host}:${port}`);
  }

  async stop(): Promise<void> {
    if (this.wss) {
      // Close all clients
      for (const ws of this.clients.values()) {
        ws.close();
      }
      this.clients.clear();
      
      // Close server
      this.wss.close();
      this.wss = null;
    }
    this._connected = false;
    console.log("[WebChat] Stopped");
  }

  async sendMessage(
    chatId: string,
    text: string,
    _options?: SendMessageOptions
  ): Promise<string> {
    const ws = this.clients.get(chatId);
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Client not found: ${chatId}`);
    }

    ws.send(JSON.stringify({
      type: "message",
      text,
      timestamp: Date.now(),
    }));

    return `${chatId}-${Date.now()}`;
  }

  async sendReply(message: ChannelMessage, text: string): Promise<string> {
    return this.sendMessage(message.chatId, text);
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  // Broadcast to all connected clients
  broadcast(text: string): void {
    const msg = JSON.stringify({
      type: "broadcast",
      text,
      timestamp: Date.now(),
    });

    for (const ws of this.clients.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }
}

export function createWebChatChannel(config: WebChatConfig): WebChatChannel {
  return new WebChatChannel(config);
}