import WebSocket from "ws";

// ── PTY Service Client ───────────────────────────────────────────────────

export interface PtyClientOptions {
  /** PTY service URL (e.g., http://localhost:3000) */
  url: string;
  /** Auth token (optional) */
  token?: string;
}

export interface PtyInstance {
  id: string;
  name: string;
  command: string;
  args: string[];
  pid: number;
  cols: number;
  rows: number;
  createdAt: number;
}

export interface PtySnapshot {
  fullLines: string[];
  visibleLines: string[];
  fullText: string;
  visibleText: string;
  bufRows: number;
  bufCols: number;
}

export interface PtySpawnOptions {
  command: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
}

type PtyEventHandler = (event: PtyEvent) => void;

interface PtyEvent {
  type: "output" | "exit" | "resize";
  instanceId: string;
  data?: string;
  code?: number;
  cols?: number;
  rows?: number;
}

export class PtyClient {
  private baseUrl: string;
  private token?: string;
  private ws: WebSocket | null = null;
  private handlers: Set<PtyEventHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: PtyClientOptions) {
    this.baseUrl = options.url.replace(/\/$/, "");
    this.token = options.token;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers["X-PTY-Token"] = this.token;
    }
    return headers;
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`PTY API error: ${res.status} ${res.statusText} - ${text}`);
    }

    return res.json() as Promise<T>;
  }

  // ── HTTP API ──────────────────────────────────────────────────────────

  async health(): Promise<{ status: string; apps: number }> {
    return this.fetch("/health");
  }

  async list(): Promise<PtyInstance[]> {
    const res = await this.fetch<{ apps: PtyInstance[] }>("/apps");
    return res.apps;
  }

  async get(id: string): Promise<PtyInstance | null> {
    try {
      return await this.fetch<PtyInstance>(`/app/${id}/status`);
    } catch {
      return null;
    }
  }

  async spawn(options: PtySpawnOptions): Promise<PtyInstance> {
    return this.fetch<PtyInstance>("/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });
  }

  async snapshot(id: string): Promise<PtySnapshot> {
    return this.fetch<PtySnapshot>(`/app/${id}/snapshot`);
  }

  async send(id: string, text: string): Promise<void> {
    await this.fetch(`/app/${id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  }

  async resize(id: string, cols: number, rows: number): Promise<void> {
    await this.fetch(`/app/${id}/resize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cols, rows }),
    });
  }

  async kill(id: string): Promise<void> {
    await this.fetch("/kill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  // ── WebSocket Streaming ───────────────────────────────────────────────

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.baseUrl.replace(/^http/, "ws") + "/ws";
      const headers = this.getHeaders();

      this.ws = new WebSocket(wsUrl, {
        headers,
      });

      this.ws.on("open", () => {
        resolve();
      });

      this.ws.on("error", (err) => {
        reject(err);
      });

      this.ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch {
          // Ignore parse errors
        }
      });

      this.ws.on("close", () => {
        this.scheduleReconnect();
      });
    });
  }

  private handleMessage(msg: { type: string; instanceId?: string; data?: string; code?: number; cols?: number; rows?: number }) {
    if (msg.instanceId) {
      const event: PtyEvent = {
        type: msg.type as PtyEvent["type"],
        instanceId: msg.instanceId,
        data: msg.data,
        code: msg.code,
        cols: msg.cols,
        rows: msg.rows,
      };
      this.handlers.forEach((h) => h(event));
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {
        this.scheduleReconnect();
      });
    }, 5000);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  onEvent(handler: PtyEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  // Subscribe to a specific instance
  subscribe(instanceId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "subscribe", instanceId }));
    }
  }

  unsubscribe(instanceId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "unsubscribe", instanceId }));
    }
  }
}
