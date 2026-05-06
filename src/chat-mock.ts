#!/usr/bin/env tsx
/**
 * PTY Gateway Mock Chat - Test gateway logic without real Telegram
 *
 * Usage: pty-gateway-chat "your message here"
 */

import { PtyClient } from "./pty-client.js";
import { Router } from "./router.js";
import type { Channel, ChannelMessage, MessageHandler } from "./channels/types.js";

// ── Mock Channel for Testing ────────────────────────────────────────────────

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
    console.log("Mock channel stopped");
  }

  async sendMessage(chatId: string, text: string): Promise<string> {
    const msgId = (this.messageCounter++).toString();
    console.log(`\n${"─".repeat(60)}`);
    console.log(`📤 BOT REPLY (Message ID: ${msgId})`);
    console.log(`${"─".repeat(60)}`);
    console.log(text);
    console.log(`${"─".repeat(60)}\n`);
    return msgId;
  }

  async sendReply(message: ChannelMessage, text: string): Promise<string> {
    return this.sendMessage(message.chatId, text);
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  // Simulate receiving a message from user
  async receiveMessage(text: string): Promise<void> {
    if (!this.messageHandler) {
      console.error("❌ No message handler registered");
      return;
    }

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

// ── Interactive Test Mode ───────────────────────────────────────────────────

async function interactiveMode() {
  console.log("\n" + "═".repeat(60));
  console.log("PTY Gateway Mock Chat - Interactive Mode");
  console.log("═".repeat(60));
  console.log("\nCommands:");
  console.log("  /start <cmd>   - Start PTY instance");
  console.log("  /connect <id>  - Connect to instance");
  console.log("  /list          - List instances");
  console.log("  /kill          - Kill current instance");
  console.log("  /snapshot      - Get PTY buffer");
  console.log("  /help          - Show help");
  console.log("  exit           - Quit test mode");
  console.log("  <any text>     - Send to connected PTY");
  console.log("\n" + "═".repeat(60) + "\n");

  // Create PTY client
  const pty = new PtyClient({
    url: "http://localhost:3000",
  });

  // Check PTY health
  try {
    const health = await pty.health();
    console.log(`✅ PTY health: ${health.status}\n`);
  } catch (err) {
    console.error("❌ PTY service not running!");
    console.error("Start it with: pty --serve --port 3000\n");
    process.exit(1);
  }

  // Create router and mock channel
  const router = new Router(pty);
  const mockChannel = new MockChannel();

  router.addChannel(mockChannel);
  pty.onEvent(router.handlePtyEvent);

  // Connect to PTY WebSocket
  try {
    await pty.connect();
    console.log("✅ Connected to PTY WebSocket\n");
  } catch (err) {
    console.error("❌ Failed to connect to PTY WebSocket:", err);
    process.exit(1);
  }

  // Start channel
  await router.startAll();

  // Read from stdin
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

  // Main loop
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

  // Cleanup
  await router.stopAll();
  pty.disconnect();
  rl.close();
  process.exit(0);
}

// ── Single Message Mode ─────────────────────────────────────────────────────

async function singleMessageMode(message: string) {
  console.log("\n" + "═".repeat(60));
  console.log("PTY Gateway Mock Chat - Single Message Mode");
  console.log("═".repeat(60) + "\n");

  // Create PTY client
  const pty = new PtyClient({
    url: "http://localhost:3000",
  });

  // Check PTY health
  try {
    const health = await pty.health();
    console.log(`✅ PTY health: ${health.status}\n`);
  } catch (err) {
    console.error("❌ PTY service not running!");
    console.error("Start it with: pty --serve --port 3000\n");
    process.exit(1);
  }

  // Create router and mock channel
  const router = new Router(pty);
  const mockChannel = new MockChannel();

  router.addChannel(mockChannel);
  pty.onEvent(router.handlePtyEvent);

  // Connect to PTY WebSocket
  try {
    await pty.connect();
    console.log("✅ Connected to PTY WebSocket\n");
  } catch (err) {
    console.error("❌ Failed to connect to PTY WebSocket:", err);
    process.exit(1);
  }

  // Start channel
  await router.startAll();

  // Send the message
  await mockChannel.receiveMessage(message);

  // Wait a bit for any async responses
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Cleanup
  await router.stopAll();
  pty.disconnect();
  process.exit(0);
}

// ── CLI Entry Point ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0) {
  // Interactive mode
  interactiveMode().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
} else {
  // Single message mode
  const message = args.join(" ");
  singleMessageMode(message).catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
