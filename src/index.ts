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

  # Start with Telegram only
  pty-gateway --telegram-token "123456:ABC..."

  # Start with both
  pty-gateway \\
    --telegram-token "$TELEGRAM_BOT_TOKEN" \\
    --discord-token "$DISCORD_BOT_TOKEN"
`);
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs();

  // Run registration wizard
  if (options.register) {
    await runRegistration();
    process.exit(0);
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
