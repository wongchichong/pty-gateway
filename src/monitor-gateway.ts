#!/usr/bin/env tsx
/**
 * Gateway Health Monitor
 *
 * Monitors gateway health and can auto-restart if needed.
 * Run as: pnpm exec tsx src/monitor-gateway.ts
 */

import { PtyClient } from "./pty-client.js";
import { spawn } from "child_process";

const PTY_URL = process.env.PTY_URL || "http://localhost:3000";
const CHECK_INTERVAL = 30000; // 30 seconds
const MAX_QUEUE_SIZE = 5; // Alert if more than 5 messages queued

let gatewayProcess: ReturnType<typeof spawn> | null = null;

async function checkPtyServer(): Promise<boolean> {
  try {
    const client = new PtyClient({ url: PTY_URL });
    const health = await client.health();
    return health.status === "ok";
  } catch {
    return false;
  }
}

async function checkTelegramQueue(): Promise<number> {
  try {
    const { Bot } = await import("grammy");
    const token = process.env.TELEGRAM_BOT_TOKEN || "8520957421:AAGBrVEnuGDeFAfAE1GRyJ_-0rJSTL9FtKU";

    const bot = new Bot(token);
    const updates = await bot.api.getUpdates({ limit: 100, timeout: 0 });
    return updates.length;
  } catch (err) {
    console.error("[Monitor] Failed to check Telegram queue:", err);
    return -1;
  }
}

async function checkGatewayProcess(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("pgrep", ["-f", "tsx src/index.ts"]);
    proc.on("close", (code) => {
      resolve(code === 0);
    });
  });
}

async function startGateway() {
  console.log("[Monitor] Starting gateway...");

  const args = ["exec", "tsx", "src/index.ts"];

  // Pass through environment variables
  if (process.env.TELEGRAM_BOT_TOKEN) {
    args.push("--telegram-token", process.env.TELEGRAM_BOT_TOKEN);
  }
  if (process.env.TELEGRAM_ALLOWED_USERS) {
    args.push("--telegram-users", process.env.TELEGRAM_ALLOWED_USERS);
  }
  if (process.env.TELEGRAM_ALLOWED_CHATS) {
    args.push("--telegram-chats", process.env.TELEGRAM_ALLOWED_CHATS);
  }

  gatewayProcess = spawn("pnpm", args, {
    detached: true,
    stdio: "inherit",
  });

  gatewayProcess.on("error", (err) => {
    console.error("[Monitor] Gateway process error:", err);
  });

  gatewayProcess.on("exit", (code) => {
    console.log(`[Monitor] Gateway exited with code ${code}`);
    gatewayProcess = null;
  });

  // Give it time to start
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

async function monitor() {
  console.log("\n" + "═".repeat(60));
  console.log("  PTY Gateway Health Monitor");
  console.log("═".repeat(60));
  console.log(`  Check interval: ${CHECK_INTERVAL / 1000}s`);
  console.log(`  Max queue size: ${MAX_QUEUE_SIZE}`);
  console.log("═".repeat(60) + "\n");

  while (true) {
    const timestamp = new Date().toISOString();

    try {
      // Check PTY server
      const ptyOk = await checkPtyServer();
      console.log(`[${timestamp}] PTY Server: ${ptyOk ? "✅ OK" : "❌ DOWN"}`);

      // Check gateway process
      const gatewayRunning = await checkGatewayProcess();
      console.log(`[${timestamp}] Gateway Process: ${gatewayRunning ? "✅ Running" : "❌ Not running"}`);

      // Check Telegram queue
      const queueSize = await checkTelegramQueue();
      if (queueSize >= 0) {
        const queueStatus = queueSize > MAX_QUEUE_SIZE ? "⚠️  ALERT" : "✅ OK";
        console.log(`[${timestamp}] Telegram Queue: ${queueStatus} (${queueSize} messages)`);

        if (queueSize > MAX_QUEUE_SIZE) {
          console.log(`[${timestamp}] ⚠️  WARNING: Message queue is building up!`);
          console.log(`[${timestamp}] ⚠️  Gateway may not be processing messages.`);
        }
      }

      // Auto-restart if needed (optional)
      if (!gatewayRunning && process.env.AUTO_RESTART === "true") {
        console.log(`[${timestamp}] 🔄 Auto-restarting gateway...`);
        await startGateway();
      }

      console.log();
    } catch (err) {
      console.error(`[${timestamp}] Monitor error:`, err);
    }

    await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL));
  }
}

monitor().catch((err) => {
  console.error("Monitor fatal error:", err);
  process.exit(1);
});
