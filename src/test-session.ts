#!/usr/bin/env tsx
/**
 * Test session-based command routing
 * Simulates: /connect 2, then send "ls -la"
 */

import { PtyClient } from "./pty-client.js";
import { Router } from "./router.js";
import type { Channel, ChannelMessage, MessageHandler } from "./channels/types.js";

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
  }

  async stop(): Promise<void> {
    this._connected = false;
  }

  async sendMessage(chatId: string, text: string): Promise<string> {
    const msgId = (this.messageCounter++).toString();
    console.log(`\n📤 BOT: ${text.slice(0, 200)}${text.length > 200 ? '...' : ''}\n`);
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

    console.log(`\n👤 You: ${msg.text}`);
    await this.messageHandler(msg);
  }
}

async function test() {
  console.log("════════════════════════════════════════════════════════════");
  console.log("Testing Session-Based Command Routing");
  console.log("════════════════════════════════════════════════════════════\n");

  const pty = new PtyClient({ url: "http://localhost:3000" });
  const router = new Router(pty);
  const mockChannel = new MockChannel();

  router.addChannel(mockChannel);
  pty.onEvent(router.handlePtyEvent);

  await pty.connect();
  await router.startAll();

  // Wait a bit for initialization
  await new Promise(r => setTimeout(r, 500));

  // Step 1: Connect to bash instance
  console.log("Step 1: Connect to bash instance 2");
  await mockChannel.receiveMessage("/connect 2");
  await new Promise(r => setTimeout(r, 500));

  // Step 2: Send command to connected PTY
  console.log("\nStep 2: Send 'ls -la' to connected PTY");
  await mockChannel.receiveMessage("ls -la");
  await new Promise(r => setTimeout(r, 1000));

  // Step 3: Get snapshot to see output
  console.log("\nStep 3: Get snapshot");
  await mockChannel.receiveMessage("/snapshot");
  await new Promise(r => setTimeout(r, 500));

  await router.stopAll();
  pty.disconnect();
  process.exit(0);
}

test().catch(console.error);
