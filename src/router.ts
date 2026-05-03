import { PtyClient, PtySnapshot } from "./pty-client.js";
import type {
  Channel,
  ChannelMessage,
  ChannelType,
  MessageHandler,
  SendMessageOptions,
} from "./channels/types.js";

// ── Session Management ───────────────────────────────────────────────────

interface UserSession {
  instanceId: string;
  channel: ChannelType;
  chatId: string;
  lastActivity: number;
}

export class Router {
  private pty: PtyClient;
  private channels: Map<ChannelType, Channel> = new Map();
  private sessions: Map<string, UserSession> = new Map();
  private messageHandlers: Set<MessageHandler> = new Set();

  constructor(pty: PtyClient) {
    this.pty = pty;
  }

  // ── Channel Management ────────────────────────────────────────────────

  addChannel(channel: Channel) {
    this.channels.set(channel.type, channel);
    channel.onMessage((msg) => this.handleChannelMessage(msg));
  }

  async startAll() {
    const starts = Array.from(this.channels.values()).map((ch) => ch.start());
    await Promise.all(starts);
  }

  async stopAll() {
    const stops = Array.from(this.channels.values()).map((ch) => ch.stop());
    await Promise.all(stops);
  }

  // ── Message Routing ───────────────────────────────────────────────────

  private getSessionKey(channel: ChannelType, chatId: string): string {
    return `${channel}:${chatId}`;
  }

  private async handleChannelMessage(msg: ChannelMessage) {
    // Notify message handlers
    for (const handler of this.messageHandlers) {
      await handler(msg);
    }

    const sessionKey = this.getSessionKey(msg.channel, msg.chatId);
    const session = this.sessions.get(sessionKey);

    // Parse command
    const text = msg.text.trim();
    const cmd = this.parseCommand(text);

    if (cmd) {
      await this.handleCommand(msg, cmd);
      return;
    }

    // If user has an active session, send input to PTY
    if (session) {
      try {
        await this.pty.send(session.instanceId, msg.text + "\n");
        session.lastActivity = Date.now();
      } catch (err) {
        const channel = this.channels.get(msg.channel);
        if (channel) {
          await channel.sendMessage(msg.chatId, `Error: ${err}`);
        }
      }
    }
  }

  private parseCommand(text: string): { name: string; args: string[] } | null {
    if (!text.startsWith("/")) return null;

    const parts = text.slice(1).split(/\s+/);
    const name = parts[0]?.toLowerCase() || "";
    const args = parts.slice(1);

    return { name, args };
  }

  private async handleCommand(
    msg: ChannelMessage,
    cmd: { name: string; args: string[] }
  ) {
    const channel = this.channels.get(msg.channel);
    if (!channel) return;

    const sessionKey = this.getSessionKey(msg.channel, msg.chatId);
    const session = this.sessions.get(sessionKey);

    switch (cmd.name) {
      case "start":
      case "pty-start":
        await this.cmdStart(msg, cmd.args, channel);
        break;

      case "connect":
      case "pty-connect":
        await this.cmdConnect(msg, cmd.args, channel);
        break;

      case "kill":
      case "pty-kill":
        await this.cmdKill(msg, channel, session);
        break;

      case "list":
      case "pty-list":
        await this.cmdList(msg, channel);
        break;

      case "snapshot":
      case "pty-snapshot":
        await this.cmdSnapshot(msg, channel, session);
        break;

      case "help":
        await this.cmdHelp(msg, channel);
        break;

      default:
        // Unknown command - if in session, send to PTY
        if (session) {
          await this.pty.send(session.instanceId, msg.text + "\n");
        } else {
          await channel.sendMessage(
            msg.chatId,
            `Unknown command: ${cmd.name}\nUse /help for available commands.`
          );
        }
    }
  }

  private async cmdStart(
    msg: ChannelMessage,
    args: string[],
    channel: Channel
  ) {
    if (args.length === 0) {
      await channel.sendMessage(
        msg.chatId,
        "Usage: /start <command> [args...]\nExample: /start vim file.txt"
      );
      return;
    }

    const command = args[0];
    const cmdArgs = args.slice(1);

    try {
      const instance = await this.pty.spawn({
        command,
        args: cmdArgs,
        cols: 80,
        rows: 24,
      });

      const sessionKey = this.getSessionKey(msg.channel, msg.chatId);
      this.sessions.set(sessionKey, {
        instanceId: instance.id,
        channel: msg.channel,
        chatId: msg.chatId,
        lastActivity: Date.now(),
      });

      // Subscribe to PTY output
      this.pty.subscribe(instance.id);

      await channel.sendMessage(
        msg.chatId,
        `Started PTY: ${instance.id}\nCommand: ${command} ${cmdArgs.join(" ")}\nPID: ${instance.pid}`
      );

      // Send initial snapshot
      await this.sendSnapshot(instance.id, msg.chatId, channel);
    } catch (err) {
      await channel.sendMessage(msg.chatId, `Failed to start: ${err}`);
    }
  }

  private async cmdConnect(
    msg: ChannelMessage,
    args: string[],
    channel: Channel
  ) {
    if (args.length === 0) {
      // List available instances
      const instances = await this.pty.list();
      if (instances.length === 0) {
        await channel.sendMessage(msg.chatId, "No PTY instances running.");
        return;
      }

      const list = instances
        .map((i) => `${i.id}: ${i.name} (PID ${i.pid})`)
        .join("\n");
      await channel.sendMessage(
        msg.chatId,
        `Available instances:\n${list}\n\nUse /connect <id> to connect.`
      );
      return;
    }

    const instanceId = args[0];
    const instance = await this.pty.get(instanceId);

    if (!instance) {
      await channel.sendMessage(msg.chatId, `Instance not found: ${instanceId}`);
      return;
    }

    const sessionKey = this.getSessionKey(msg.channel, msg.chatId);
    this.sessions.set(sessionKey, {
      instanceId,
      channel: msg.channel,
      chatId: msg.chatId,
      lastActivity: Date.now(),
    });

    this.pty.subscribe(instanceId);

    await channel.sendMessage(
      msg.chatId,
      `Connected to PTY: ${instanceId}\nCommand: ${instance.name}`
    );

    await this.sendSnapshot(instanceId, msg.chatId, channel);
  }

  private async cmdKill(
    msg: ChannelMessage,
    channel: Channel,
    session?: UserSession
  ) {
    if (!session) {
      await channel.sendMessage(msg.chatId, "No active session to kill.");
      return;
    }

    try {
      await this.pty.kill(session.instanceId);
      this.sessions.delete(this.getSessionKey(msg.channel, msg.chatId));
      this.pty.unsubscribe(session.instanceId);
      await channel.sendMessage(msg.chatId, `Killed PTY: ${session.instanceId}`);
    } catch (err) {
      await channel.sendMessage(msg.chatId, `Failed to kill: ${err}`);
    }
  }

  private async cmdList(msg: ChannelMessage, channel: Channel) {
    const instances = await this.pty.list();
    if (instances.length === 0) {
      await channel.sendMessage(msg.chatId, "No PTY instances running.");
      return;
    }

    const list = instances
      .map((i) => `${i.id}: ${i.name} (PID ${i.pid}, ${i.cols}x${i.rows})`)
      .join("\n");
    await channel.sendMessage(msg.chatId, `PTY instances:\n${list}`);
  }

  private async cmdSnapshot(
    msg: ChannelMessage,
    channel: Channel,
    session?: UserSession
  ) {
    if (!session) {
      await channel.sendMessage(msg.chatId, "No active session.");
      return;
    }

    await this.sendSnapshot(session.instanceId, msg.chatId, channel);
  }

  private async cmdHelp(msg: ChannelMessage, channel: Channel) {
    const help = `PTY Gateway Commands:
/start <command> [args...] - Start a new PTY instance
/connect [id] - Connect to an existing PTY instance
/kill - Kill the current PTY instance
/list - List all PTY instances
/snapshot - Get current PTY buffer snapshot
/help - Show this help

Any other message is sent as input to the connected PTY.`;
    await channel.sendMessage(msg.chatId, help);
  }

  private async sendSnapshot(
    instanceId: string,
    chatId: string,
    channel: Channel
  ) {
    try {
      const snapshot = await this.pty.snapshot(instanceId);
      const text = this.formatSnapshot(snapshot);
      await channel.sendMessage(chatId, text, { chunk: true });
    } catch (err) {
      await channel.sendMessage(chatId, `Failed to get snapshot: ${err}`);
    }
  }

  private formatSnapshot(snapshot: PtySnapshot): string {
    const lines = snapshot.visibleLines;
    if (lines.length === 0) {
      return "(empty buffer)";
    }

    // Use code block for better formatting
    const content = lines.join("\n");
    if (content.length > 3500) {
      // Truncate for message limits
      return "```\n" + content.slice(0, 3500) + "\n... (truncated)\n```";
    }
    return "```\n" + content + "\n```";
  }

  // ── PTY Event Handling ────────────────────────────────────────────────

  handlePtyEvent = async (event: {
    type: string;
    instanceId: string;
    data?: string;
    code?: number;
  }) => {
    // Find sessions for this instance
    for (const [key, session] of this.sessions) {
      if (session.instanceId === event.instanceId) {
        const channel = this.channels.get(session.channel);
        if (!channel) continue;

        if (event.type === "exit") {
          await channel.sendMessage(
            session.chatId,
            `PTY exited with code ${event.code}`
          );
          this.sessions.delete(key);
        } else if (event.type === "output" && event.data) {
          // Send output to the chat (debounced/batched in production)
          // For now, we skip raw output streaming and rely on /snapshot
        }
      }
    }
  };

  // ── Hooks ─────────────────────────────────────────────────────────────

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }
}
