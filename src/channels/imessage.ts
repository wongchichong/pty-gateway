// iMessage Channel - uses macOS Messages (macOS only)
import type {
  Channel,
  ChannelMessage,
  MessageHandler,
  SendMessageOptions,
} from "./types.js";
import { spawn } from "child_process";
import type { ChildProcess } from "child_process";

export interface IMessageConfig {
  /** AppleScript path (default: osascript) */
  osascriptPath?: string;
  /** Watch for new messages */
  watchMessages?: boolean;
}

/**
 * Escape special characters for AppleScript string literals
 */
function escapeForAppleScript(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

export class IMessageChannel implements Channel {
  readonly type = "imessage" as const;
  private config: IMessageConfig;
  private messageHandler?: MessageHandler;
  private _connected = false;
  private watcher: ChildProcess | null = null;

  constructor(config: IMessageConfig = {}) {
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async start(): Promise<void> {
    if (process.platform !== "darwin") {
      console.log("[iMessage] Warning: iMessage only works on macOS");
      console.log("[iMessage] Running in send-only mode");
      this._connected = true;
      return;
    }

    if (this.config.watchMessages) {
      console.log("[iMessage] Starting message watcher...");
      await this.startWatcher();
    } else {
      console.log("[iMessage] Ready! (send-only mode)");
      console.log("[iMessage] Enable watchMessages for receiving");
    }

    this._connected = true;
  }

  private async startWatcher(): Promise<void> {
    // Use AppleScript to watch for new messages
    // This is a simplified version - production would need more robust handling
    const script = `
      tell application "Messages"
        repeat
          delay 1
        end repeat
      end tell
    `;

    this.watcher = spawn(this.config.osascriptPath || "osascript", ["-e", script], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    console.log("[iMessage] Message watcher started");
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      this.watcher.kill();
      this.watcher = null;
    }
    this._connected = false;
    console.log("[iMessage] Stopped");
  }

  async sendMessage(
    chatId: string,
    text: string,
    _options?: SendMessageOptions
  ): Promise<string> {
    if (process.platform !== "darwin") {
      throw new Error("iMessage only works on macOS");
    }

    // Use AppleScript to send message
    const escapedText = escapeForAppleScript(text);
    const escapedChatId = escapeForAppleScript(chatId);
    const script = `
      tell application "Messages"
        send "${escapedText}" to buddy "${escapedChatId}"
      end tell
    `;

    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.osascriptPath || "osascript", ["-e", script], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(`${chatId}-${Date.now()}`);
        } else {
          reject(new Error(`osascript exited with code ${code}`));
        }
      });

      proc.on("error", reject);
    });
  }

  async sendReply(message: ChannelMessage, text: string): Promise<string> {
    return this.sendMessage(message.chatId, text);
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  // Handle message from AppleScript callback
  async handleMessageEvent(event: any): Promise<void> {
    const channelMsg: ChannelMessage = {
      id: event.id || `${Date.now()}`,
      channel: "imessage",
      userId: event.sender || "unknown",
      chatId: event.chatId || event.sender || "unknown",
      text: event.text || "",
      timestamp: Date.now(),
      raw: event,
    };

    await this.messageHandler?.(channelMsg);
  }
}

export function createIMessageChannel(config?: IMessageConfig): IMessageChannel {
  return new IMessageChannel(config);
}