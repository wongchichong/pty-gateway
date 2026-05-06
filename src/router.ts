import { PtyClient, PtySnapshot } from "./pty-client.js";
import type {
  Channel,
  ChannelMessage,
  ChannelType,
  MessageHandler,
  SendMessageOptions,
} from "./channels/types.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import AnsiToHtml from "ansi-to-html";
import { checkRateLimit, getRateLimitMessage } from "./rate-limiter.js";

// ── Command Whitelist ───────────────────────────────────────────────────

// Default safe commands
const DEFAULT_SAFE_COMMANDS = [
  // File system navigation
  "ls", "pwd", "cd", "find", "tree", "dir",

  // File viewing
  "cat", "less", "more", "head", "tail", "grep", "wc",

  // Text processing
  "echo", "printf", "sed", "awk", "sort", "uniq", "cut",

  // System info
  "whoami", "hostname", "date", "uptime", "uname", "df", "du", "free",

  // Process management (view only)
  "ps", "top", "htop", "jobs", "pgrep", "pstree",

  // Development tools
  "vim", "nano", "emacs", "code", "git", "npm", "node", "python", "python3",
  "pip", "pip3", "cargo", "rustc", "go", "make", "gcc", "clang",

  // Shell utilities
  "clear", "history", "alias", "type", "which", "env", "printenv",
  "export", "set", "unset",

  // Network (safe subset)
  "ping", "curl", "wget", "ssh", "scp", "rsync",

  // Archive tools
  "tar", "gzip", "gunzip", "zip", "unzip",

  // Misc safe commands
  "man", "help", "exit", "logout", "true", "false", "yes", "no", "sleep",
];

// Commands that are NEVER allowed
const BLOCKED_COMMANDS = [
  "rm", "rmdir", "sudo", "su", "chmod", "chown", "chroot",
  "dd", "mkfs", "fdisk", "format",
  "shutdown", "reboot", "halt", "poweroff",
  "init", "systemctl", "service",
  "iptables", "ufw", "firewall-cmd",
  "crontab", "at", "batch",
  "useradd", "userdel", "usermod", "passwd",
];

function validateCommand(command: string, safeCommands: string[]): { valid: boolean; reason?: string } {
  // Extract the base command (first word)
  const baseCommand = command.trim().split(/\s+/)[0];

  // Check if command is blocked
  if (BLOCKED_COMMANDS.includes(baseCommand)) {
    return { valid: false, reason: `Command '${baseCommand}' is blocked for security reasons` };
  }

  // Check for piped execution patterns (curl | bash, wget | sh)
  if (command.includes("|") && (command.includes("bash") || command.includes("sh"))) {
    return { valid: false, reason: "Piped execution is blocked for security reasons" };
  }

  // Check if command is in safe list
  if (!safeCommands.includes(baseCommand)) {
    return {
      valid: false,
      reason: `Command '${baseCommand}' is not in the allowed list. Allowed commands: ${safeCommands.slice(0, 10).join(", ")}...`
    };
  }

  return { valid: true };
}

// ── Session Management ───────────────────────────────────────────────────

interface UserSession {
  instanceId: string;
  channel: ChannelType;
  chatId: string;
  lastActivity: number;
  cols?: number;  // Custom size for this session
  rows?: number;
}

interface ChannelDefaults {
  cols: number;
  rows: number;
}

export class Router {
  private pty: PtyClient;
  private channels: Map<ChannelType, Channel> = new Map();
  private sessions: Map<string, UserSession> = new Map();
  private messageHandlers: Set<MessageHandler> = new Set();
  private instanceIdMap: Map<string, string> = new Map(); // shortId -> fullId
  private reverseIdMap: Map<string, string> = new Map(); // fullId -> shortId
  private idCounter = 0;
  private idMapFile = join(homedir(), ".pty-gateway", "instance-ids.json");
  private ansiConverter: AnsiToHtml;
  private refreshIntervals: Map<string, NodeJS.Timeout> = new Map();
  private lastMessages: Map<string, { id: string; text: string }> = new Map();
  private editCounters: Map<string, number> = new Map(); // Track edit count per session
  private readonly MAX_EDITS = 20; // Telegram edit limit before delete

  // Default sizes per channel type
  private channelDefaults: Map<ChannelType, ChannelDefaults> = new Map([
    ["telegram", { cols: 40, rows: 80 }],  // Narrow for mobile
    ["discord", { cols: 60, rows: 40 }],   // Medium width
    ["slack", { cols: 80, rows: 40 }],     // Desktop width
  ]);

  constructor(pty: PtyClient) {
    this.pty = pty;
    this.ansiConverter = new AnsiToHtml({
      fg: '#FFF',
      bg: '#000',
      newline: false,
      escapeXML: true,
      stream: false
    });
    this.loadIdMap();
    // Initialize ID map from existing PTY instances
    this.initializeIdMap();
  }

  private loadIdMap() {
    try {
      if (existsSync(this.idMapFile)) {
        const data = readFileSync(this.idMapFile, "utf8");
        const map = JSON.parse(data);
        for (const [shortId, fullId] of Object.entries(map)) {
          this.instanceIdMap.set(shortId, fullId as string);
          this.reverseIdMap.set(fullId as string, shortId);
          // Update counter to be higher than existing IDs
          const num = parseInt(shortId, 36);
          if (num > this.idCounter) {
            this.idCounter = num;
          }
        }
      }
    } catch (err) {
      // Ignore errors
    }
  }

  private saveIdMap() {
    try {
      const map: Record<string, string> = {};
      for (const [shortId, fullId] of this.instanceIdMap) {
        map[shortId] = fullId;
      }
      const dir = dirname(this.idMapFile);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.idMapFile, JSON.stringify(map, null, 2));
    } catch (err) {
      // Ignore errors
    }
  }

  private async initializeIdMap() {
    try {
      const instances = await this.pty.list();
      for (const instance of instances) {
        if (!this.reverseIdMap.has(instance.id)) {
          const shortId = this.generateShortId();
          this.instanceIdMap.set(shortId, instance.id);
          this.reverseIdMap.set(instance.id, shortId);
        }
      }
      this.saveIdMap();
    } catch (err) {
      // Ignore errors during initialization
    }
  }

  private generateShortId(): string {
    this.idCounter++;
    return this.idCounter.toString(); // Simple numeric: 1, 2, 3...
  }

  private toShortId(fullId: string): string {
    if (this.reverseIdMap.has(fullId)) {
      return this.reverseIdMap.get(fullId)!;
    }
    const shortId = this.generateShortId();
    this.instanceIdMap.set(shortId, fullId);
    this.reverseIdMap.set(fullId, shortId);
    this.saveIdMap();
    return shortId;
  }

  private toFullId(shortId: string): string {
    return this.instanceIdMap.get(shortId) || shortId;
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
    // Log received message
    const timestamp = new Date(msg.timestamp).toISOString();
    console.log(`\n[${timestamp}] 📨 Message received:`);
    console.log(`  Channel: ${msg.channel}`);
    console.log(`  User: ${msg.userId}`);
    console.log(`  Chat: ${msg.chatId}`);
    console.log(`  Text: "${msg.text}"`);
    console.log(`  Message ID: ${msg.id}`);
    if (msg.replyTo) console.log(`  Reply to: ${msg.replyTo}`);

    // Rate limiting check
    const { allowed, remaining } = checkRateLimit(msg.channel, msg.userId);
    if (!allowed) {
      const channel = this.channels.get(msg.channel);
      if (channel) {
        await channel.sendMessage(msg.chatId, getRateLimitMessage(msg.channel));
      }
      console.log(`[${msg.channel}] ⚠️ Rate limit exceeded for user ${msg.userId}`);
      return;
    }

    console.log(`[${msg.channel}] ✅ Rate limit check passed (${remaining} remaining)`);

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
      console.log(`  ⚡ Command detected: /${cmd.name} ${cmd.args.join(" ")}`);
      await this.handleCommand(msg, cmd);
      return;
    }

    // If user has an active session, send input to PTY
    if (session) {
      // Check if it's a gateway command (starts with /)
      const isGatewayCommand = text.startsWith("/");

      // Validate PTY commands (not gateway commands)
      if (!isGatewayCommand) {
        const safeCommands = process.env.ALLOWED_COMMANDS
          ? process.env.ALLOWED_COMMANDS.split(",").map(c => c.trim())
          : DEFAULT_SAFE_COMMANDS;

        const validation = validateCommand(text, safeCommands);

        if (!validation.valid) {
          const channel = this.channels.get(msg.channel);
          if (channel) {
            await channel.sendMessage(msg.chatId, `❌ ${validation.reason}`);
          }
          console.log(`[${msg.channel}] ⚠️ Command blocked: ${text}`);
          return;
        }

        console.log(`[${msg.channel}] ✅ Command validated: ${text}`);
      }

      console.log(`  📤 Sending to PTY instance: ${session.instanceId}`);
      try {
        await this.pty.send(session.instanceId, msg.text + "\n");
        session.lastActivity = Date.now();

        // Auto-snapshot: Send snapshot immediately after command execution
        const channel = this.channels.get(msg.channel);
        if (channel) {
          // Small delay to let PTY process the command
          setTimeout(async () => {
            try {
              const lastMsg = this.lastMessages.get(`${msg.chatId}:${session.instanceId}`);
              await this.sendSnapshot(session.instanceId, msg.chatId, channel, lastMsg?.id);
            } catch (err) {
              console.error(`  ❌ Auto-snapshot error: ${err}`);
            }
          }, 500); // 500ms delay for command execution
        }
      } catch (err) {
        console.error(`  ❌ PTY error: ${err}`);
        const channel = this.channels.get(msg.channel);
        if (channel) {
          await channel.sendMessage(msg.chatId, `Error: ${err}`);
        }
      }
    } else {
      console.log(`  ℹ️  No active session - message ignored`);
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

      case "status":
        await this.cmdStatus(msg, channel, session);
        break;

      case "size":
        await this.cmdSize(msg, cmd.args, channel, session);
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

    // Get size for this channel
    const defaults = this.channelDefaults.get(msg.channel) || { cols: 80, rows: 24 };
    const sessionKey = this.getSessionKey(msg.channel, msg.chatId);
    const existingSession = this.sessions.get(sessionKey);
    const cols = existingSession?.cols || defaults.cols;
    const rows = existingSession?.rows || defaults.rows;

    try {
      console.log(`  🚀 Starting PTY: ${command} ${cmdArgs.join(" ")} (${cols}x${rows})`);
      const instance = await this.pty.spawn({
        command,
        args: cmdArgs,
        cols,
        rows,
      });

      const shortId = this.toShortId(instance.id);
      this.sessions.set(sessionKey, {
        instanceId: instance.id,
        channel: msg.channel,
        chatId: msg.chatId,
        cols,
        rows,
        lastActivity: Date.now(),
      });

      console.log(`  ✅ PTY started: ${shortId} (PID: ${instance.pid})`);

      // Subscribe to PTY output
      this.pty.subscribe(instance.id);

      await channel.sendMessage(
        msg.chatId,
        `Started PTY: ${shortId}\nCommand: ${command} ${cmdArgs.join(" ")}\nPID: ${instance.pid}`
      );

      // Send initial snapshot and start auto-refresh
      await this.sendSnapshot(instance.id, msg.chatId, channel);
      this.startAutoRefresh(sessionKey, instance.id, msg.chatId, channel);
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
      // List available instances with active session indicator
      const instances = await this.pty.list();
      if (instances.length === 0) {
        await channel.sendMessage(msg.chatId, "No PTY instances running.");
        return;
      }

      const sessionKey = this.getSessionKey(msg.channel, msg.chatId);
      const currentSession = this.sessions.get(sessionKey);

      const list = instances
        .map((i) => {
          const shortId = this.toShortId(i.id);
          const isActive = currentSession?.instanceId === i.id;
          const indicator = isActive ? " ✅" : "";
          return `${shortId}: ${i.name} (PID ${i.pid})${indicator}`;
        })
        .join("\n");

      const activeHint = currentSession
        ? `\n\n✅ = Currently connected`
        : "";

      await channel.sendMessage(
        msg.chatId,
        `Available instances:\n${list}${activeHint}\n\nUse /connect <id|pid> to connect.`
      );
      return;
    }

    const inputId = args[0];

    // Try to parse as short ID first
    let instanceId = this.toFullId(inputId);
    let instance = instanceId ? await this.pty.get(instanceId) : null;

    // If not found, try to find by PID
    if (!instance) {
      const pid = parseInt(inputId);
      if (!isNaN(pid)) {
        console.log(`  🔍 Looking up instance by PID: ${pid}`);
        const instances = await this.pty.list();
        instance = instances.find((i) => i.pid === pid) || null;
        if (instance) {
          instanceId = instance.id;
          console.log(`  ✅ Found instance: ${this.toShortId(instanceId)}`);
        }
      }
    }

    if (!instance) {
      await channel.sendMessage(msg.chatId, `Instance not found: ${inputId}\nUse /list to see available instances.`);
      return;
    }

    const shortId = this.toShortId(instanceId);
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
      `✅ Connected to PTY: ${shortId}\nCommand: ${instance.name}\nPID: ${instance.pid}`
    );

    // Send initial snapshot and start auto-refresh
    await this.sendSnapshot(instanceId, msg.chatId, channel);
    this.startAutoRefresh(sessionKey, instanceId, msg.chatId, channel);
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
      const shortId = this.toShortId(session.instanceId);
      await this.pty.kill(session.instanceId);
      const sessionKey = this.getSessionKey(msg.channel, msg.chatId);
      this.sessions.delete(sessionKey);
      this.pty.unsubscribe(session.instanceId);
      this.stopAutoRefresh(sessionKey);
      this.lastMessages.delete(`${msg.chatId}:${session.instanceId}`);
      await channel.sendMessage(msg.chatId, `Killed PTY: ${shortId}`);
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

    const sessionKey = this.getSessionKey(msg.channel, msg.chatId);
    const currentSession = this.sessions.get(sessionKey);

    const list = instances
      .map((i) => {
        const shortId = this.toShortId(i.id);
        const isActive = currentSession?.instanceId === i.id;
        const indicator = isActive ? " ✅" : "";
        return `${shortId}: ${i.name} (PID ${i.pid}, ${i.cols}x${i.rows})${indicator}`;
      })
      .join("\n");

    const activeHint = currentSession
      ? `\n\n✅ = Currently connected`
      : "";

    await channel.sendMessage(msg.chatId, `PTY instances:\n${list}${activeHint}`);
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
    console.log(`  📖 Sending help text`);
    const defaults = this.channelDefaults.get(msg.channel) || { cols: 80, rows: 24 };
    const help = `PTY Gateway Commands:
/start <command> [args...] - Start a new PTY instance
/connect [id|pid] - Connect to an existing PTY instance
/kill - Kill the current PTY instance
/list - List all PTY instances
/snapshot - Get current PTY buffer snapshot
/status - Show connection and session status
/size [colsxrows] - Set PTY size (default: ${defaults.cols}x${defaults.rows})
/help - Show this help

Any other message is sent as input to the connected PTY.`;
    await channel.sendMessage(msg.chatId, help);
  }

  private async cmdStatus(
    msg: ChannelMessage,
    channel: Channel,
    session?: UserSession
  ) {
    console.log(`  📊 Showing status`);

    const instances = await this.pty.list();
    const health = await this.pty.health();

    let status = `PTY Service Status:\n`;
    status += `  Health: ${health.status}\n`;
    status += `  Total Instances: ${instances.length}\n`;
    status += `  Active Sessions: ${this.sessions.size}\n\n`;

    if (session) {
      const instance = await this.pty.get(session.instanceId);
      if (instance) {
        const shortId = this.toShortId(session.instanceId);
        status += `Current Session:\n`;
        status += `  Instance ID: ${shortId}\n`;
        status += `  Command: ${instance.name}\n`;
        status += `  PID: ${instance.pid}\n`;
        status += `  Size: ${instance.cols}x${instance.rows}\n`;
        status += `  Connected: ✅\n`;
      } else {
        status += `Current Session: ⚠️ Instance not found\n`;
      }
    } else {
      status += `Current Session: ❌ Not connected\n`;
      status += `\nUse /connect <id|pid> to connect to an instance.`;
    }

    await channel.sendMessage(msg.chatId, status);
  }

  private async cmdSize(
    msg: ChannelMessage,
    args: string[],
    channel: Channel,
    session?: UserSession
  ) {
    console.log(`  📐 Setting size`);

    // Parse size argument (e.g., "40x80", "80x40")
    if (args.length === 0) {
      const defaults = this.channelDefaults.get(msg.channel) || { cols: 80, rows: 24 };
      const current = session ? `${session.cols || 'default'}x${session.rows || 'default'}` : 'default';
      const help = `Size Management:

Current size: ${current}
Channel default: ${defaults.cols}x${defaults.rows}

Usage:
  /size <cols>x<rows> - Set size for new PTY instances
  /size reset - Reset to channel default

Examples:
  /size 40x80   - Narrow for Telegram (mobile)
  /size 80x40   - Desktop width
  /size 120x40  - Wide terminal

Note: Size applies to new instances created with /start
Existing instances keep their original size.`;
      await channel.sendMessage(msg.chatId, help);
      return;
    }

    const sizeArg = args[0].toLowerCase();

    if (sizeArg === "reset") {
      // Reset to channel default
      const sessionKey = this.getSessionKey(msg.channel, msg.chatId);
      if (session) {
        const defaults = this.channelDefaults.get(msg.channel) || { cols: 80, rows: 24 };
        session.cols = defaults.cols;
        session.rows = defaults.rows;
        await channel.sendMessage(msg.chatId, `✅ Size reset to ${defaults.cols}x${defaults.rows} (channel default)`);
      } else {
        await channel.sendMessage(msg.chatId, `No active session. Size will use channel default for new instances.`);
      }
      return;
    }

    // Parse size format (e.g., "40x80")
    const match = sizeArg.match(/^(\d+)x(\d+)$/);
    if (!match) {
      await channel.sendMessage(msg.chatId, `Invalid size format: ${sizeArg}\nUse format: <cols>x<rows> (e.g., 40x80)`);
      return;
    }

    const cols = parseInt(match[1]);
    const rows = parseInt(match[2]);

    // Validate ranges
    if (cols < 20 || cols > 200) {
      await channel.sendMessage(msg.chatId, `Columns must be between 20 and 200 (got ${cols})`);
      return;
    }
    if (rows < 10 || rows > 100) {
      await channel.sendMessage(msg.chatId, `Rows must be between 10 and 100 (got ${rows})`);
      return;
    }

    // Update session size preference
    const sessionKey = this.getSessionKey(msg.channel, msg.chatId);
    if (session) {
      session.cols = cols;
      session.rows = rows;
      await channel.sendMessage(msg.chatId, `✅ Size set to ${cols}x${rows}\nNew PTY instances will use this size.`);
    } else {
      // Create temporary session entry just for size preference
      this.sessions.set(sessionKey, {
        instanceId: "",
        channel: msg.channel,
        chatId: msg.chatId,
        lastActivity: Date.now(),
        cols,
        rows,
      });
      await channel.sendMessage(msg.chatId, `✅ Size set to ${cols}x${rows}\nWill apply to new PTY instances created with /start`);
    }
  }

  private async sendSnapshot(
    instanceId: string,
    chatId: string,
    channel: Channel,
    editMessageId?: string
  ) {
    try {
      // Request snapshot WITHOUT colors for Telegram (plain text for MarkdownV2)
      const snapshot = await this.pty.snapshot(instanceId, false);
      const text = this.formatSnapshot(snapshot);

      // Try to edit existing message if provided
      if (editMessageId && channel.editMessage) {
        const edited = await channel.editMessage(chatId, editMessageId, text, {
          parseMode: "html"
        });

        if (edited) {
          // Update last message cache
          this.lastMessages.set(`${chatId}:${instanceId}`, {
            id: editMessageId,
            text
          });
          return;
        }
      }

      // Send new message if no edit or edit failed
      const msgId = await channel.sendMessage(chatId, text, {
        chunk: true,
        parseMode: "html"
      });

      // Cache the message
      this.lastMessages.set(`${chatId}:${instanceId}`, {
        id: msgId,
        text
      });
    } catch (err) {
      await channel.sendMessage(chatId, `Failed to get snapshot: ${err}`);
    }
  }

  private startAutoRefresh(sessionKey: string, instanceId: string, chatId: string, channel: Channel) {
    // Stop existing refresh if any
    this.stopAutoRefresh(sessionKey);

    console.log(`  🔄 Starting auto-refresh for session ${sessionKey}`);

    // Initialize edit counter
    this.editCounters.set(sessionKey, 0);

    const interval = setInterval(async () => {
      try {
        const session = this.sessions.get(sessionKey);
        if (!session) {
          this.stopAutoRefresh(sessionKey);
          return;
        }

        // Get snapshot
        const snapshot = await this.pty.snapshot(instanceId, false);
        const text = this.formatSnapshot(snapshot);

        // Get last message
        const lastMsg = this.lastMessages.get(`${chatId}:${instanceId}`);

        // Skip if content hasn't changed (buffer comparison)
        if (lastMsg && lastMsg.text === text) {
          console.log(`  ⏭️  Skipping update (buffer unchanged)`);
          return;
        }

        // Get edit counter
        let editCount = this.editCounters.get(sessionKey) || 0;

        // If we've reached max edits, delete old message and reset
        if (editCount >= this.MAX_EDITS && lastMsg) {
          console.log(`  🗑️  Max edits reached (${editCount}), deleting message`);
          if (channel.deleteMessage) {
            await channel.deleteMessage(chatId, lastMsg.id);
          }
          this.editCounters.set(sessionKey, 0);
          editCount = 0;
          // Clear last message to force new message creation
          this.lastMessages.delete(`${chatId}:${instanceId}`);
        }

        // Get updated last message (may have been deleted)
        const currentLastMsg = this.lastMessages.get(`${chatId}:${instanceId}`);

        // Send snapshot (will edit if message exists, create new if not)
        const msgId = await this.sendSnapshotWithId(instanceId, chatId, channel, currentLastMsg?.id);

        // Increment edit counter if we edited
        if (currentLastMsg?.id && msgId === currentLastMsg.id) {
          editCount++;
          this.editCounters.set(sessionKey, editCount);
          console.log(`  ✏️  Edit #${editCount}/${this.MAX_EDITS}`);
        } else {
          // New message created, reset counter
          this.editCounters.set(sessionKey, 0);
          console.log(`  📝 New message created`);
        }

        // Update last activity
        session.lastActivity = Date.now();
      } catch (err) {
        console.error(`  ❌ Auto-refresh error: ${err}`);
      }
    }, 10000); // 10 seconds

    this.refreshIntervals.set(sessionKey, interval);
  }

  private async sendSnapshotWithId(
    instanceId: string,
    chatId: string,
    channel: Channel,
    editMessageId?: string
  ): Promise<string> {
    try {
      const snapshot = await this.pty.snapshot(instanceId, false);
      const text = this.formatSnapshot(snapshot);

      // Try to edit existing message if provided
      if (editMessageId && channel.editMessage) {
        const edited = await channel.editMessage(chatId, editMessageId, text, {
          parseMode: "html"
        });

        if (edited) {
          // Update last message cache
          this.lastMessages.set(`${chatId}:${instanceId}`, {
            id: editMessageId,
            text
          });
          return editMessageId;
        }
      }

      // Send new message if no edit or edit failed
      const msgId = await channel.sendMessage(chatId, text, {
        chunk: true,
        parseMode: "html"
      });

      // Cache the message
      this.lastMessages.set(`${chatId}:${instanceId}`, {
        id: msgId,
        text
      });

      return msgId;
    } catch (err) {
      throw err;
    }
  }

  private stopAutoRefresh(sessionKey: string) {
    const interval = this.refreshIntervals.get(sessionKey);
    if (interval) {
      clearInterval(interval);
      this.refreshIntervals.delete(sessionKey);
      this.editCounters.delete(sessionKey);
      console.log(`  ⏹️  Stopped auto-refresh for session ${sessionKey}`);
    }
  }

  private formatSnapshot(snapshot: PtySnapshot): string {
    const lines = snapshot.visibleLines;
    if (lines.length === 0) {
      return "(empty buffer)";
    }

    // Join lines and wrap in HTML <pre> tag for Telegram
    const content = lines.join("\n");

    // Escape HTML special characters
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Truncate for Telegram message limits
    if (escaped.length > 3500) {
      return `<pre>${escaped.slice(0, 3500)}\n... (truncated)</pre>`;
    }
    return `<pre>${escaped}</pre>`;
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
          const shortId = this.toShortId(event.instanceId);
          await channel.sendMessage(
            session.chatId,
            `PTY exited with code ${event.code}`
          );
          this.sessions.delete(key);
          this.stopAutoRefresh(key);
          this.lastMessages.delete(`${session.chatId}:${event.instanceId}`);
        } else if (event.type === "output" && event.data) {
          // Send output to the chat
          console.log(`  📊 PTY output (${event.data.length} bytes)`);
          // Auto-refresh handles updates, so we don't need to send here
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
