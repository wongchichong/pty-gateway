// Signal Channel - uses signal-cli (requires Java)
import type {
  Channel,
  ChannelMessage,
  MessageHandler,
  SendMessageOptions,
  SignalConfig,
} from "./types.js";
import { spawn, ChildProcess } from "child_process";

export class SignalChannel implements Channel {
  readonly type = "signal" as const;
  private config: SignalConfig;
  private messageHandler?: MessageHandler;
  private _connected = false;
  private signalCli: ChildProcess | null = null;

  constructor(config: SignalConfig) {
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async start(): Promise<void> {
    const signalCliPath = this.config.signalCliPath || "signal-cli";
    
    console.log("[Signal] Note: signal-cli requires Java to be installed");
    console.log("[Signal] Starting signal-cli...");

    // Start signal-cli in receive mode
    this.signalCli = spawn(signalCliPath, [
      "-u", this.config.phoneNumber,
      "receive",
      "--json",
    ], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.signalCli.stdout?.on("data", async (data) => {
      try {
        const lines = data.toString().split("\n").filter(Boolean);
        
        for (const line of lines) {
          const msg = JSON.parse(line);
          
          if (msg.envelope?.dataMessage) {
            const channelMsg: ChannelMessage = {
              id: msg.envelope.timestamp?.toString() || `${Date.now()}`,
              channel: "signal",
              userId: msg.envelope.source || "unknown",
              chatId: msg.envelope.sourceUuid || msg.envelope.source || "unknown",
              text: msg.envelope.dataMessage.body || "",
              timestamp: msg.envelope.timestamp || Date.now(),
              raw: msg,
            };

            await this.messageHandler?.(channelMsg);
          }
        }
      } catch (err) {
        // Ignore parse errors
      }
    });

    this.signalCli.stderr?.on("data", (data) => {
      console.error(`[Signal] Error: ${data}`);
    });

    this.signalCli.on("error", (err) => {
      console.error(`[Signal] Failed to start signal-cli: ${err.message}`);
      console.error("[Signal] Make sure signal-cli and Java are installed");
    });

    this._connected = true;
    console.log("[Signal] Started (requires signal-cli + Java)");
  }

  async stop(): Promise<void> {
    if (this.signalCli) {
      this.signalCli.kill();
      this.signalCli = null;
    }
    this._connected = false;
    console.log("[Signal] Stopped");
  }

  async sendMessage(
    chatId: string,
    text: string,
    _options?: SendMessageOptions
  ): Promise<string> {
    const signalCliPath = this.config.signalCliPath || "signal-cli";

    // Validate chatId format (phone number or UUID)
    // Phone numbers: optional + prefix, 10-15 digits
    // UUIDs: standard UUID format for Signal
    const isPhoneValid = /^\+?\d{10,15}$/.test(chatId);
    const isUuidValid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chatId);

    if (!isPhoneValid && !isUuidValid) {
      throw new Error("Invalid chatId format: must be a phone number (+digits, 10-15 digits) or UUID");
    }

    // Use signal-cli send command
    const args = [
      "-u", this.config.phoneNumber,
      "send",
      "-m", text,
      chatId,
    ];

    const result = spawn(signalCliPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    return new Promise((resolve, reject) => {
      result.on("close", (code) => {
        if (code === 0) {
          resolve(`${chatId}-${Date.now()}`);
        } else {
          reject(new Error(`signal-cli exited with code ${code}`));
        }
      });

      result.on("error", reject);
    });
  }

  async sendReply(message: ChannelMessage, text: string): Promise<string> {
    return this.sendMessage(message.userId, text);
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }
}

export function createSignalChannel(config: SignalConfig): SignalChannel {
  return new SignalChannel(config);
}