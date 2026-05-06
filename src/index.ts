#!/usr/bin/env node
import { PtyClient } from "./pty-client.js";
import { Router } from "./router.js";
import {
  createTelegramChannel,
  createDiscordChannel,
  TelegramConfig,
  DiscordConfig,
} from "./channels/index.js";
import { createInterface } from "readline";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ── Environment Validation ────────────────────────────────────────────────────

function validateEnvironment(): void {
  const required = [
    'TELEGRAM_BOT_TOKEN',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`  - ${key}`));
    console.error('\nSet them via:');
    console.error('  export TELEGRAM_BOT_TOKEN="your-token"');
    console.error('  TELEGRAM_ALLOWED_USERS="your-user-id"');
    console.error('  or');
    console.error('  TELEGRAM_BOT_TOKEN="your-token" pm2 start ecosystem.config.js');
    process.exit(1);
  }
}

// ── Config Storage ────────────────────────────────────────────────────────

const CONFIG_DIR = join(homedir(), ".pty-gateway");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface GatewayConfig {
  telegram?: {
    botToken: string;
    allowedUsers?: number[];
    allowedChats?: number[];
  };
  discord?: {
    botToken: string;
    guildId?: string;
    allowedChannels?: string[];
  };
  ptyUrl?: string;
  ptyToken?: string;
}

function loadConfig(): GatewayConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = readFileSync(CONFIG_FILE, "utf8");
      return JSON.parse(raw);
    }
  } catch {}
  return {};
}

function saveConfig(config: GatewayConfig) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
}

// ── Interactive Registration ──────────────────────────────────────────────

async function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function registerTelegram(rl: ReturnType<typeof createInterface>): Promise<string | null> {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    TELEGRAM BOT REGISTRATION                     ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Step 1: Open Telegram and search for @BotFather                 ║
║                                                                  ║
║  Step 2: Send the message: /newbot                               ║
║                                                                  ║
║  Step 3: Choose a name for your bot (e.g., "PTY Gateway")        ║
║                                                                  ║
║  Step 4: Choose a username ending in 'bot' (e.g., my_pty_bot)    ║
║                                                                  ║
║  Step 5: BotFather will give you a token like:                   ║
║          1234567890:ABCdefGHIjklMNOpqrsTUVwxyz                   ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);

  const token = await prompt(rl, "Paste your Telegram bot token (or press Enter to skip): ");
  
  if (!token.trim()) {
    console.log("Skipped Telegram registration.\n");
    return null;
  }

  // Validate token format
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token.trim())) {
    console.log("Warning: Token format looks invalid. Expected format: 123456789:ABCdef...");
    const confirm = await prompt(rl, "Save anyway? (y/n): ");
    if (confirm.toLowerCase() !== 'y') {
      return null;
    }
  }

  console.log("\n✓ Telegram bot token saved!\n");
  return token.trim();
}

async function registerDiscord(rl: ReturnType<typeof createInterface>): Promise<string | null> {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    DISCORD BOT REGISTRATION                      ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Step 1: Go to https://discord.com/developers/applications       ║
║                                                                  ║
║  Step 2: Click "New Application" and give it a name              ║
║                                                                  ║
║  Step 3: Go to "Bot" section and click "Add Bot"                 ║
║                                                                  ║
║  Step 4: Enable "Message Content Intent" under Privileged        ║
║          Gateway Intents                                         ║
║                                                                  ║
║  Step 5: Click "Reset Token" to get your bot token               ║
║          (starts with MTk... or similar base64)                  ║
║                                                                  ║
║  Step 6: To invite the bot, go to OAuth2 > URL Generator:        ║
║          - Select "bot" scope                                    ║
║          - Select permissions: Send Messages, Read Messages      ║
║          - Copy and open the generated URL                       ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);

  const token = await prompt(rl, "Paste your Discord bot token (or press Enter to skip): ");
  
  if (!token.trim()) {
    console.log("Skipped Discord registration.\n");
    return null;
  }

  const guildId = await prompt(rl, "Discord Guild ID (optional, for slash commands): ");

  console.log("\n✓ Discord bot token saved!\n");
  return token.trim();
}

async function runRegistration() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("\nPTY Gateway - Channel Registration\n");
  console.log("This wizard will help you connect Telegram and/or Discord to your PTY.\n");

  const config = loadConfig();

  // Show current config
  if (config.telegram?.botToken || config.discord?.botToken) {
    console.log("Current configuration:");
    if (config.telegram?.botToken) {
      console.log(`  Telegram: ${config.telegram.botToken.slice(0, 10)}...`);
    }
    if (config.discord?.botToken) {
      console.log(`  Discord: ${config.discord.botToken.slice(0, 10)}...`);
    }
    console.log();
  }

  const register = await prompt(rl, "Register a new channel? (telegram/discord/both/skip): ");
  const choice = register.toLowerCase().trim();

  if (choice === "telegram" || choice === "both") {
    const token = await registerTelegram(rl);
    if (token) {
      config.telegram = { botToken: token };
    }
  }

  if (choice === "discord" || choice === "both") {
    const token = await registerDiscord(rl);
    if (token) {
      config.discord = { botToken: token };
    }
  }

  if (choice !== "skip") {
    saveConfig(config);
    console.log(`Configuration saved to: ${CONFIG_FILE}\n`);
  }

  rl.close();

  // Show how to start
  console.log("To start the gateway, run:");
  console.log("  pty-gateway\n");
  console.log("Or with specific options:");
  console.log("  pty-gateway --telegram-token \"$TELEGRAM_BOT_TOKEN\"\n");
}

// ── CLI Parsing ───────────────────────────────────────────────────────────

interface CliOptions {
  ptyUrl: string;
  ptyToken?: string;
  telegramToken?: string;
  telegramAllowedUsers?: number[];
  telegramAllowedChats?: number[];
  discordToken?: string;
  discordGuildId?: string;
  discordAllowedChannels?: string[];
  discordGlobalCommands?: boolean;
  register?: boolean;
  command?: "chat" | "snapshot" | "connect" | "list" | "send";
  commandArgs?: string[];
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const config = loadConfig();

  const options: CliOptions = {
    ptyUrl: config.ptyUrl || process.env.PTY_URL || "http://localhost:3000",
    ptyToken: config.ptyToken,
    telegramToken: config.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN,
    discordToken: config.discord?.botToken || process.env.DISCORD_BOT_TOKEN,
    telegramAllowedUsers: config.telegram?.allowedUsers,
    telegramAllowedChats: config.telegram?.allowedChats,
    discordGuildId: config.discord?.guildId,
    discordAllowedChannels: config.discord?.allowedChannels,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Check for subcommands first
    if (arg === "chat" && !arg.startsWith("-")) {
      return { ...options, command: "chat", commandArgs: args.slice(i + 1) };
    }
    if (arg === "snapshot" && !arg.startsWith("-")) {
      return { ...options, command: "snapshot", commandArgs: args.slice(i + 1) };
    }
    if (arg === "connect" && !arg.startsWith("-")) {
      return { ...options, command: "connect", commandArgs: args.slice(i + 1) };
    }
    if (arg === "list" && !arg.startsWith("-")) {
      return { ...options, command: "list", commandArgs: args.slice(i + 1) };
    }
    if (arg === "send" && !arg.startsWith("-")) {
      return { ...options, command: "send", commandArgs: args.slice(i + 1) };
    }

    switch (arg) {
      case "--pty":
      case "-p":
        options.ptyUrl = args[++i] || options.ptyUrl;
        break;

      case "--token":
      case "-t":
        options.ptyToken = args[++i];
        break;

      case "--telegram-token":
        options.telegramToken = args[++i];
        break;

      case "--telegram-users":
        options.telegramAllowedUsers = args[++i]
          ?.split(",")
          .map((s) => parseInt(s.trim()))
          .filter((n) => !isNaN(n));
        break;

      case "--telegram-chats":
        options.telegramAllowedChats = args[++i]
          ?.split(",")
          .map((s) => parseInt(s.trim()))
          .filter((n) => !isNaN(n));
        break;

      case "--discord-token":
        options.discordToken = args[++i];
        break;

      case "--discord-guild":
        options.discordGuildId = args[++i];
        break;

      case "--discord-channels":
        options.discordAllowedChannels = args[++i]?.split(",").map((s) => s.trim());
        break;

      case "--discord-global":
        options.discordGlobalCommands = true;
        break;

      case "--register":
      case "-r":
        options.register = true;
        break;

      case "--help":
      case "-h":
        printHelp();
        process.exit(0);

      default:
        if (arg.startsWith("-")) {
          console.error(`Unknown option: ${arg}`);
          printHelp();
          process.exit(1);
        }
    }
  }

  return options;
}

function printHelp() {
  console.log(`
PTY Gateway - Connect Telegram/Discord to PTY service

Usage: pty-gateway [options]
       pty-gateway <command> [args]

Commands:
  chat [message]        Interactive chat mode (or send single message)
  send <id> <cmd>       Send command to PTY instance (TUI format)
  snapshot <instance>   Get PTY snapshot (instance ID or short ID)
  connect <instance>    Connect to PTY instance
  list                  List all PTY instances

Options:
  -r, --register             Interactive channel registration
  -p, --pty <url>            PTY service URL (default: http://localhost:3000)
  -t, --token <token>        PTY auth token

Telegram:
  --telegram-token <token>   Telegram bot token (from @BotFather)
  --telegram-users <ids>     Comma-separated allowed user IDs
  --telegram-chats <ids>     Comma-separated allowed chat IDs

Discord:
  --discord-token <token>    Discord bot token
  --discord-guild <id>       Restrict to specific guild
  --discord-channels <ids>   Comma-separated allowed channel IDs
  --discord-global           Register slash commands globally

Environment Variables:
  PTY_URL                    PTY service URL
  TELEGRAM_BOT_TOKEN         Telegram bot token
  DISCORD_BOT_TOKEN          Discord bot token

Config file: ~/.pty-gateway/config.json

Examples:
  # Interactive registration
  pty-gateway --register

  # Start with saved config
  pty-gateway

  # Interactive chat mode
  pty-gateway chat

  # Send single command
  pty-gateway chat "/list"

  # Send command to PTY (TUI format)
  pty-gateway send 4 'ls -la'

  # Get snapshot
  pty-gateway snapshot 4

  # Start with Telegram only
  pty-gateway --telegram-token "123456:ABC..."

  # Start with both
  pty-gateway \\
    --telegram-token "$TELEGRAM_BOT_TOKEN" \\
    --discord-token "$DISCORD_BOT_TOKEN"
`);
}

// ── Command Handlers ───────────────────────────────────────────────────────

async function handleCommand(options: CliOptions) {
  const pty = new PtyClient({
    url: options.ptyUrl,
    token: options.ptyToken,
  });

  // Check PTY health
  try {
    const health = await pty.health();
    if (health.status !== "ok") {
      console.error("PTY service unhealthy");
      process.exit(1);
    }
  } catch (err) {
    console.error(`Failed to connect to PTY service: ${err}`);
    console.error(`Make sure PTY is running: pty --serve --port 3000`);
    process.exit(1);
  }

  switch (options.command) {
    case "chat":
      await chatCommand(pty, options.commandArgs || []);
      break;

    case "snapshot":
      await snapshotCommand(pty, options.commandArgs || []);
      break;

    case "connect":
      await connectCommand(pty, options.commandArgs || []);
      break;

    case "list":
      await listCommand(pty);
      break;

    case "send":
      await sendCommand(pty, options.commandArgs || []);
      break;

    default:
      console.error(`Unknown command: ${options.command}`);
      printHelp();
      process.exit(1);
  }
}

async function chatCommand(pty: PtyClient, args: string[]) {
  // Import chat-mock functionality
  const { Router } = await import("./router.js");
  const router = new Router(pty);

  // Detect terminal size
  const terminalCols = process.stdout.columns || 80;
  const terminalRows = process.stdout.rows || 24;
  console.log(`📐 Terminal size: ${terminalCols}x${terminalRows}\n`);

  // Set default size for mock channel based on terminal
  router["channelDefaults"].set("telegram", {
    cols: Math.min(terminalCols, 120),  // Cap at 120 for readability
    rows: Math.min(terminalRows, 40),   // Cap at 40
  });

  // Create mock channel
  const { Channel, ChannelMessage, MessageHandler } = await import("./channels/types.js");

  class MockChannel implements Channel {
    readonly type = "telegram" as const;
    private messageHandler?: MessageHandler;
    private _connected = false;
    private chatId = "test-chat-123";
    private userId = "test-user-456";
    private messageCounter = 1;

    get connected(): boolean {
      return this._connected;
    }

    async start(): Promise<void> {
      this._connected = true;
      console.log("✅ Mock channel started\n");
    }

    async stop(): Promise<void> {
      this._connected = false;
    }

    async sendMessage(chatId: string, text: string): Promise<string> {
      const msgId = (this.messageCounter++).toString();
      console.log(`\n${"─".repeat(60)}`);
      console.log(`📤 BOT REPLY (Message ID: ${msgId})`);
      console.log(`${"─".repeat(60)}`);
      // Format output like Telegram (MarkdownV2 code blocks)
      if (text.startsWith("```") && text.endsWith("```")) {
        console.log(text);
      } else {
        console.log(text);
      }
      console.log(`${"─".repeat(60)}\n`);
      return msgId;
    }

    async sendReply(message: ChannelMessage, text: string): Promise<string> {
      return this.sendMessage(message.chatId, text);
    }

    onMessage(handler: MessageHandler): void {
      this.messageHandler = handler;
    }

    async receiveMessage(text: string): Promise<void> {
      if (!this.messageHandler) return;

      const msg: ChannelMessage = {
        id: (this.messageCounter++).toString(),
        channel: this.type,
        userId: this.userId,
        chatId: this.chatId,
        text,
        timestamp: Date.now(),
      };

      console.log(`\n${"═".repeat(60)}`);
      console.log(`📨 INCOMING MESSAGE`);
      console.log(`${"═".repeat(60)}`);
      console.log(`User ID: ${msg.userId}`);
      console.log(`Chat ID: ${msg.chatId}`);
      console.log(`Text: "${msg.text}"`);
      console.log(`${"═".repeat(60)}\n`);

      await this.messageHandler(msg);
    }
  }

  const mockChannel = new MockChannel();
  router.addChannel(mockChannel);
  pty.onEvent(router.handlePtyEvent);

  await pty.connect();
  await router.startAll();

  if (args.length === 0) {
    // Interactive mode
    console.log("\n" + "═".repeat(60));
    console.log("PTY Gateway Chat - Interactive Mode");
    console.log("═".repeat(60));
    console.log("\nCommands:");
    console.log("  /start <cmd>   - Start PTY instance");
    console.log("  /connect <id>  - Connect to instance");
    console.log("  /list          - List instances");
    console.log("  /snapshot      - Get PTY buffer");
    console.log("  /help          - Show help");
    console.log("  exit           - Quit");
    console.log("  <any text>     - Send to PTY");
    console.log("\n" + "═".repeat(60) + "\n");

    const readline = await import("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const question = (prompt: string): Promise<string> => {
      return new Promise((resolve) => {
        rl.question(prompt, resolve);
      });
    };

    let running = true;
    while (running) {
      const input = await question("👤 You: ");

      if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
        console.log("\n👋 Exiting...\n");
        running = false;
        break;
      }

      if (input.trim()) {
        await mockChannel.receiveMessage(input);
      }
    }

    await router.stopAll();
    pty.disconnect();
    rl.close();
  } else {
    // Single message mode
    const message = args.join(" ");
    await mockChannel.receiveMessage(message);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await router.stopAll();
    pty.disconnect();
  }

  process.exit(0);
}

async function sendCommand(pty: PtyClient, args: string[]) {
  if (args.length === 0) {
    console.error("Usage: pty-gateway send <instance-id> <command>");
    console.error("Example: pty-gateway send 4 'ls -la'");
    process.exit(1);
  }

  const inputId = args[0];
  const command = args.slice(1).join(" ");

  if (!command) {
    console.error("Error: No command specified");
    console.error("Usage: pty-gateway send <instance-id> <command>");
    process.exit(1);
  }

  try {
    // Resolve short ID to full ID
    let instanceId = inputId;
    const instances = await pty.list();

    // Check if it's a short ID (numeric)
    if (/^\d+$/.test(inputId)) {
      const { existsSync, readFileSync } = await import("fs");
      const { join } = await import("path");
      const { homedir } = await import("os");
      const idMapFile = join(homedir(), ".pty-gateway", "instance-ids.json");

      if (existsSync(idMapFile)) {
        const data = readFileSync(idMapFile, "utf8");
        const map = JSON.parse(data);
        if (map[inputId]) {
          instanceId = map[inputId];
        }
      }
    }

    // If still not found, try partial match
    if (instanceId === inputId) {
      const match = instances.find((i) => i.id === inputId || i.id.startsWith(inputId));
      if (match) {
        instanceId = match.id;
      }
    }

    // Check if instance exists
    const instance = instances.find((i) => i.id === instanceId);

    if (!instance) {
      console.error(`Instance not found: ${inputId}`);
      process.exit(1);
    }

    // Send command to PTY
    console.log(`\n📤 Sending to PTY ${instanceId}: "${command}"`);
    await pty.send(instanceId, command + "\n");

    // Wait for command execution
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get snapshot with colors
    const snapshot = await pty.snapshot(instanceId, true);
    const content = snapshot.visibleLines.join("\n");
    // Output ANSI-colored content directly (terminal will render colors)
    process.stdout.write("\n" + content + "\n\n");
  } catch (err) {
    console.error(`Failed to send command: ${err}`);
    process.exit(1);
  }

  process.exit(0);
}

async function snapshotCommand(pty: PtyClient, args: string[]) {
  if (args.length === 0) {
    console.error("Usage: pty-gateway snapshot <instance-id>");
    process.exit(1);
  }

  const inputId = args[0];

  try {
    // Try to resolve short ID to full ID
    let instanceId = inputId;
    const instances = await pty.list();

    // Check if it's a short ID (numeric)
    if (/^\d+$/.test(inputId)) {
      // Load ID map
      const { existsSync, readFileSync } = await import("fs");
      const { join } = await import("path");
      const { homedir } = await import("os");
      const idMapFile = join(homedir(), ".pty-gateway", "instance-ids.json");

      if (existsSync(idMapFile)) {
        const data = readFileSync(idMapFile, "utf8");
        const map = JSON.parse(data);
        if (map[inputId]) {
          instanceId = map[inputId];
        }
      }
    }

    // If still not found, try partial match
    if (instanceId === inputId) {
      const match = instances.find((i) => i.id === inputId || i.id.startsWith(inputId));
      if (match) {
        instanceId = match.id;
      }
    }

    // Get snapshot with color support
    const snapshot = await pty.snapshot(instanceId, true);

    // Output ANSI-colored content directly to terminal (terminal will render colors)
    const content = snapshot.visibleLines.join("\n");
    process.stdout.write("\n" + content + "\n\n");
  } catch (err) {
    console.error(`Failed to get snapshot: ${err}`);
    process.exit(1);
  }

  process.exit(0);
}

async function connectCommand(pty: PtyClient, args: string[]) {
  if (args.length === 0) {
    console.error("Usage: pty-gateway connect <instance-id>");
    process.exit(1);
  }

  const inputId = args[0];

  try {
    // Resolve short ID to full ID
    let instanceId = inputId;
    const instances = await pty.list();

    // Check if it's a short ID (numeric)
    if (/^\d+$/.test(inputId)) {
      const { existsSync, readFileSync } = await import("fs");
      const { join } = await import("path");
      const { homedir } = await import("os");
      const idMapFile = join(homedir(), ".pty-gateway", "instance-ids.json");

      if (existsSync(idMapFile)) {
        const data = readFileSync(idMapFile, "utf8");
        const map = JSON.parse(data);
        if (map[inputId]) {
          instanceId = map[inputId];
        }
      }
    }

    // If still not found, try partial match
    if (instanceId === inputId) {
      const match = instances.find((i) => i.id === inputId || i.id.startsWith(inputId));
      if (match) {
        instanceId = match.id;
      }
    }

    // Check if instance exists
    const instance = instances.find((i) => i.id === instanceId);

    if (!instance) {
      console.error(`Instance not found: ${inputId}`);
      console.error("\nAvailable instances:");
      const list = instances
        .map((i) => {
          const shortId = parseInt(i.id.split('-')[0], 16) % 10000;
          return `  ${shortId}: ${i.name || 'unknown'} (PID ${i.pid})`;
        })
        .join("\n");
      console.error(list);
      process.exit(1);
    }

    // Get snapshot with colors
    const snapshot = await pty.snapshot(instanceId, true);
    const content = snapshot.visibleLines.join("\n");

    console.log(`\n✅ Connected to PTY: ${instanceId}`);
    console.log(`Command: ${instance.name}`);
    console.log(`PID: ${instance.pid}`);
    // Output ANSI-colored content directly (terminal will render colors)
    process.stdout.write("\n" + content + "\n\n");
  } catch (err) {
    console.error(`Failed to connect: ${err}`);
    process.exit(1);
  }

  process.exit(0);
}

async function listCommand(pty: PtyClient) {
  try {
    const instances = await pty.list();

    if (instances.length === 0) {
      console.log("No active instances.");
    } else {
      // Load Router's instance ID map for consistent short IDs
      const { existsSync, readFileSync } = await import("fs");
      const { join } = await import("path");
      const { homedir } = await import("os");
      const idMapFile = join(homedir(), ".pty-gateway", "instance-ids.json");

      let instanceIdMap: Map<string, string> = new Map();
      let reverseIdMap: Map<string, string> = new Map();

      if (existsSync(idMapFile)) {
        const data = readFileSync(idMapFile, "utf8");
        const map = JSON.parse(data);
        for (const [shortId, fullId] of Object.entries(map)) {
          instanceIdMap.set(shortId, fullId as string);
          reverseIdMap.set(fullId as string, shortId);
        }
      }

      // Format like /list command in chat
      const list = instances
        .map((i) => {
          const shortId = reverseIdMap.get(i.id) || "?";
          return `${shortId}: ${i.name || 'unknown'} (PID ${i.pid}, ${i.cols}x${i.rows})`;
        })
        .join("\n");

      console.log("\nPTY instances:");
      console.log(list);
      console.log();
    }
  } catch (err) {
    console.error(`Failed to list instances: ${err}`);
    process.exit(1);
  }

  process.exit(0);
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  // Validate environment variables
  validateEnvironment();

  const options = parseArgs();

  // Run registration wizard
  if (options.register) {
    await runRegistration();
    process.exit(0);
  }

  // Handle subcommands
  if (options.command) {
    await handleCommand(options);
    return;
  }

  // Check if at least one channel is configured
  if (!options.telegramToken && !options.discordToken) {
    console.error("Error: No channels configured.");
    console.error("\nRun 'pty-gateway --register' to set up Telegram/Discord interactively.\n");
    console.error("Or provide tokens via CLI:");
    console.error("  pty-gateway --telegram-token \"YOUR_TOKEN\"");
    console.error("  pty-gateway --discord-token \"YOUR_TOKEN\"\n");
    process.exit(1);
  }

  console.log(`PTY Gateway starting...`);
  console.log(`PTY URL: ${options.ptyUrl}`);

  // Create PTY client
  const pty = new PtyClient({
    url: options.ptyUrl,
    token: options.ptyToken,
  });

  // Check PTY health
  try {
    const health = await pty.health();
    console.log(`PTY health: ${health.status}`);
  } catch (err) {
    console.error(`Failed to connect to PTY service: ${err}`);
    console.error(`Make sure PTY is running: pty --serve --port 3000`);
    process.exit(1);
  }

  // Create router
  const router = new Router(pty);

  // Set up PTY event handling
  pty.onEvent(router.handlePtyEvent);

  // Connect to PTY WebSocket
  try {
    await pty.connect();
    console.log("Connected to PTY WebSocket");
  } catch (err) {
    console.error(`Failed to connect to PTY WebSocket: ${err}`);
  }

  // Add Telegram channel
  if (options.telegramToken) {
    const config: TelegramConfig = {
      botToken: options.telegramToken,
      allowedUsers: options.telegramAllowedUsers,
      allowedChats: options.telegramAllowedChats,
      polling: true,
    };

    const telegram = createTelegramChannel(config);
    router.addChannel(telegram);
    console.log("Telegram channel configured");
  }

  // Add Discord channel
  if (options.discordToken) {
    const config: DiscordConfig = {
      botToken: options.discordToken,
      guildId: options.discordGuildId,
      allowedChannels: options.discordAllowedChannels,
      globalCommands: options.discordGlobalCommands,
    };

    const discord = createDiscordChannel(config);
    router.addChannel(discord);
    console.log("Discord channel configured");
  }

  // Start all channels
  console.log("Starting channels...");
  await router.startAll();

  console.log("PTY Gateway is running. Press Ctrl+C to stop.");

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");
    await router.stopAll();
    pty.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
