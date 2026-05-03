// Webhook Server - for platforms that need webhooks (LINE, Google Chat, MS Teams, etc.)
import { createServer, IncomingMessage, ServerResponse } from "http";
import type { Channel } from "./channels/types.js";

export interface WebhookServerConfig {
  port?: number;
  host?: string;
  path?: string;
}

export interface WebhookHandler {
  channel: Channel;
  path: string;
  handler: (req: IncomingMessage, res: ServerResponse, body: any) => Promise<void>;
}

export class WebhookServer {
  private config: WebhookServerConfig;
  private server: ReturnType<typeof createServer> | null = null;
  private handlers: Map<string, WebhookHandler> = new Map();
  private running = false;

  constructor(config: WebhookServerConfig = {}) {
    this.config = {
      port: config.port || 3002,
      host: config.host || "0.0.0.0",
      path: config.path || "/webhook",
    };
  }

  /**
   * Register a webhook handler for a channel
   */
  register(handler: WebhookHandler): void {
    this.handlers.set(handler.path, handler);
    console.log(`[Webhook] Registered: ${handler.path}`);
  }

  /**
   * Start the webhook server
   */
  async start(): Promise<void> {
    if (this.running) return;

    return new Promise((resolve, reject) => {
      this.server = createServer(async (req, res) => {
        await this.handleRequest(req, res);
      });

      this.server.listen(this.config.port, this.config.host, () => {
        this.running = true;
        console.log(`[Webhook] Server listening on http://${this.config.host}:${this.config.port}`);
        console.log(`[Webhook] Base path: ${this.config.path}`);
        resolve();
      });

      this.server.on("error", reject);
    });
  }

  /**
   * Stop the webhook server
   */
  async stop(): Promise<void> {
    if (!this.running || !this.server) return;

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.running = false;
        console.log("[Webhook] Server stopped");
        resolve();
      });
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url || "/";
    const method = req.method || "GET";

    // Parse body for POST requests
    let body: any = null;
    if (method === "POST") {
      body = await this.parseBody(req);
    }

    // Find handler
    const handler = this.handlers.get(url);
    if (handler) {
      try {
        await handler.handler(req, res, body);
      } catch (err) {
        console.error(`[Webhook] Handler error for ${url}:`, err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
      return;
    }

    // Health check
    if (url === "/health" || url === this.config.path + "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", handlers: Array.from(this.handlers.keys()) }));
      return;
    }

    // Not found
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  private async parseBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString();

        // Try JSON parse
        try {
          resolve(JSON.parse(body));
        } catch {
          // Return raw body
          resolve(body);
        }
      });
      req.on("error", reject);
    });
  }

  /**
   * Create standard webhook handlers for common platforms
   */
  static createLineHandler(channel: any, path: string): WebhookHandler {
    return {
      channel,
      path,
      handler: async (req, res, body) => {
        if (body?.events) {
          for (const event of body.events) {
            if (channel.handleWebhookEvent) {
              await channel.handleWebhookEvent(event);
            }
          }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      },
    };
  }

  static createGoogleChatHandler(channel: any, path: string): WebhookHandler {
    return {
      channel,
      path,
      handler: async (req, res, body) => {
        if (channel.handleWebhookEvent) {
          await channel.handleWebhookEvent(body);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      },
    };
  }

  static createMsTeamsHandler(channel: any, path: string): WebhookHandler {
    return {
      channel,
      path,
      handler: async (req, res, body) => {
        if (channel.handleWebhookEvent) {
          await channel.handleWebhookEvent(body);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      },
    };
  }

  static createSynologyHandler(channel: any, path: string): WebhookHandler {
    return {
      channel,
      path,
      handler: async (req, res, body) => {
        if (channel.handleWebhookEvent) {
          await channel.handleWebhookEvent(body);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      },
    };
  }

  static createNextcloudHandler(channel: any, path: string): WebhookHandler {
    return {
      channel,
      path,
      handler: async (req, res, body) => {
        if (channel.handlePushEvent) {
          await channel.handlePushEvent(body);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      },
    };
  }
}

export function createWebhookServer(config?: WebhookServerConfig): WebhookServer {
  return new WebhookServer(config);
}
