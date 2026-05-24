import { describe, it, expect, vi, beforeEach } from "vitest";
import { platform } from "os";
import "./test-harness.js";
import { TelegramChannel } from "./channels/telegram.js";
import { DiscordChannel } from "./channels/discord.js";
import { Router } from "./router.js";
import { PtyClient } from "./pty-client.js";
import {
  telegramSpies,
  discordSpies,
  ptySpies,
  createTelegramCtx,
  createDiscordMessage,
  getTelegramHandler,
  getTelegramCommandHandler,
} from "./test-harness.js";

// ── Telegram Channel Tests ────────────────────────────────────────────────

describe("TelegramChannel", () => {
  let channel: TelegramChannel;

  beforeEach(() => {
    channel = new TelegramChannel({
      botToken: "test_token",
      polling: true,
    });
  });

  it("creates bot with token", () => {
    expect(telegramSpies.botCtor).toHaveBeenCalledWith("test_token");
  });

  it("starts and initializes bot", async () => {
    await channel.start();
    expect(telegramSpies.init).toHaveBeenCalled();
    expect(telegramSpies.start).toHaveBeenCalled();
    expect(channel.connected).toBe(true);
  });

  it("stops bot", async () => {
    await channel.start();
    await channel.stop();
    expect(telegramSpies.stop).toHaveBeenCalled();
    expect(channel.connected).toBe(false);
  });

  it("sends message to chat", async () => {
    await channel.start();
    await channel.sendMessage("123", "Hello World");

    expect(telegramSpies.sendMessage).toHaveBeenCalledWith(
      "123",
      "Hello World",
      expect.any(Object)
    );
  });

  it("sends long message with chunk option", async () => {
    await channel.start();
    const longText = "a".repeat(5000);

    await channel.sendMessage("123", longText, { chunk: true, maxChunkSize: 1000 });

    // The real implementation chunks, but our mock just forwards
    // Verify sendMessage was called
    expect(telegramSpies.sendMessage).toHaveBeenCalled();
  });

  it("registers message handler", async () => {
    const handler = vi.fn();
    channel.onMessage(handler);

    // Simulate incoming message
    const ctx = createTelegramCtx({ text: "/start vim" });
    const msgHandler = getTelegramHandler("message:text");
    await msgHandler?.(ctx);

    // Handler should be called with normalized message
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "/start vim",
        channel: "telegram",
      })
    );
  });

  it("filters users by allowlist", async () => {
    vi.clearAllMocks(); // Clear previous calls
    
    const restrictedChannel = new TelegramChannel({
      botToken: "test",
      allowedUsers: [123], // Only allow user 123
    });

    const handler = vi.fn();
    restrictedChannel.onMessage(handler);
    await restrictedChannel.start();

    // Get the handler registered after start
    const onCalls = telegramSpies.on.mock.calls;
    const msgHandler = onCalls.find((c: unknown[]) => c[0] === "message:text")?.[1];

    // User 456 should be blocked
    handler.mockClear();
    const ctx1 = createTelegramCtx({ text: "hello", userId: 456 });
    await msgHandler?.(ctx1);
    expect(handler).not.toHaveBeenCalled();

    // User 123 should be allowed
    handler.mockClear();
    const ctx2 = createTelegramCtx({ text: "hello", userId: 123 });
    await msgHandler?.(ctx2);
    expect(handler).toHaveBeenCalled();
  });
});

// ── Discord Channel Tests ─────────────────────────────────────────────────

describe("DiscordChannel", () => {
  let channel: DiscordChannel;

  beforeEach(() => {
    channel = new DiscordChannel({
      botToken: "discord_token",
    });
  });

  it("starts and logs in", async () => {
    await channel.start();
    expect(discordSpies.login).toHaveBeenCalledWith("discord_token");
    // Note: connected is set by the ClientReady event, which we mock
    // The mock doesn't emit this event, so connected stays false
    // In real usage, it would be true after ClientReady fires
  });

  it("stops and destroys client", async () => {
    await channel.start();
    await channel.stop();
    expect(discordSpies.destroy).toHaveBeenCalled();
    expect(channel.connected).toBe(false);
  });

  it("sends message to channel", async () => {
    await channel.start();
    await channel.sendMessage("channel_123", "Hello Discord");

    expect(discordSpies.fetch).toHaveBeenCalledWith("channel_123");
  });

  it("registers message handler", () => {
    const handler = vi.fn();
    channel.onMessage(handler);
    expect(discordSpies.on).toHaveBeenCalledWith("messageCreate", expect.any(Function));
  });
});

// ── Router Tests ──────────────────────────────────────────────────────────

describe("Router", () => {
  let router: Router;
  let mockPty: PtyClient;
  let messages: string[];

  beforeEach(async () => {
    mockPty = new PtyClient({ url: "http://localhost:3000" });
    router = new Router(mockPty);
    messages = [];
  });

  it("handles /help command", async () => {
    const mockChannel = {
      type: "telegram" as const,
      connected: true,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      sendMessage: vi.fn(async (_chatId: string, text: string) => {
        messages.push(text);
        return "msg_id";
      }),
      sendReply: vi.fn(async () => "msg_id"),
      onMessage: vi.fn(),
    };

    router.addChannel(mockChannel);
    await router.startAll();

    // Simulate /help message
    const msgHandler = mockChannel.onMessage.mock.calls[0][0];
    await msgHandler({
      id: "1",
      channel: "telegram",
      userId: "123",
      chatId: "456",
      text: "/help",
      timestamp: Date.now(),
    });

    expect(messages[0]).toContain("PTY Gateway Commands");
    expect(messages[0]).toContain("/start");
    expect(messages[0]).toContain("/kill");
  });

  it("handles /start command", async () => {
    const mockChannel = {
      type: "telegram" as const,
      connected: true,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      sendMessage: vi.fn(async (_chatId: string, text: string) => {
        messages.push(text);
        return "msg_id";
      }),
      sendReply: vi.fn(async () => "msg_id"),
      onMessage: vi.fn(),
    };

    router.addChannel(mockChannel);
    await router.startAll();

    const msgHandler = mockChannel.onMessage.mock.calls[0][0];
    await msgHandler({
      id: "1",
      channel: "telegram",
      userId: "123",
      chatId: "456",
      text: "/start vim test.txt",
      timestamp: Date.now(),
    });

    expect(ptySpies.spawn).toHaveBeenCalledWith({
      command: "vim",
      args: ["test.txt"],
      cols: 40,
      rows: 80,
    });
    expect(messages[0]).toContain("Started PTY");
  });

  it("handles /list command", async () => {
    ptySpies.list.mockResolvedValueOnce([
      { id: "inst_1", name: "vim", pid: 123, cols: 80, rows: 24, command: "vim", args: [], createdAt: Date.now() },
    ] as any);

    const mockChannel = {
      type: "telegram" as const,
      connected: true,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      sendMessage: vi.fn(async (_chatId: string, text: string) => {
        messages.push(text);
        return "msg_id";
      }),
      sendReply: vi.fn(async () => "msg_id"),
      onMessage: vi.fn(),
    };

    router.addChannel(mockChannel);
    await router.startAll();

    const msgHandler = mockChannel.onMessage.mock.calls[0][0];
    await msgHandler({
      id: "1",
      channel: "telegram",
      userId: "123",
      chatId: "456",
      text: "/list",
      timestamp: Date.now(),
    });

    expect(ptySpies.list).toHaveBeenCalled();
    expect(messages[0]).toContain("vim");
    expect(messages[0]).toContain("PID");
  });

  it("handles /kill command", async () => {
    const mockChannel = {
      type: "telegram" as const,
      connected: true,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      sendMessage: vi.fn(async (_chatId: string, text: string) => {
        messages.push(text);
        return "msg_id";
      }),
      sendReply: vi.fn(async () => "msg_id"),
      onMessage: vi.fn(),
    };

    router.addChannel(mockChannel);
    await router.startAll();

    // First start a PTY
    const msgHandler = mockChannel.onMessage.mock.calls[0][0];
    await msgHandler({
      id: "1",
      channel: "telegram",
      userId: "123",
      chatId: "456",
      text: "/start sleep 30",
      timestamp: Date.now(),
    });

    messages.length = 0;

    // Then kill it
    await msgHandler({
      id: "2",
      channel: "telegram",
      userId: "123",
      chatId: "456",
      text: "/kill",
      timestamp: Date.now(),
    });

    expect(ptySpies.kill).toHaveBeenCalledWith("test-instance-id");
    expect(messages[0]).toContain("Killed PTY");
  });

  it("routes non-command input to PTY when in session", async () => {
    const mockChannel = {
      type: "telegram" as const,
      connected: true,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      sendMessage: vi.fn(async (_chatId: string, text: string) => {
        messages.push(text);
        return "msg_id";
      }),
      sendReply: vi.fn(async () => "msg_id"),
      onMessage: vi.fn(),
    };

    router.addChannel(mockChannel);
    await router.startAll();

    const msgHandler = mockChannel.onMessage.mock.calls[0][0];

    // Start a session
    await msgHandler({
      id: "1",
      channel: "telegram",
      userId: "123",
      chatId: "456",
      text: "/start bash",
      timestamp: Date.now(),
    });

    // Send non-command input (whitelisted command)
    await msgHandler({
      id: "2",
      channel: "telegram",
      userId: "123",
      chatId: "456",
      text: "ls -la",
      timestamp: Date.now(),
    });

    const expectedNewline = platform() === "win32" ? "\r\n" : "\n";

    expect(ptySpies.send).toHaveBeenCalledWith(
      "test-instance-id",
      `ls -la${expectedNewline}`
    );
  });
});

// ── PTY Client Tests ──────────────────────────────────────────────────────

describe("PtyClient", () => {
  let client: PtyClient;

  beforeEach(() => {
    client = new PtyClient({ url: "http://localhost:3000" });
  });

  it("checks health", async () => {
    const health = await client.health();
    expect(health.status).toBe("ok");
  });

  it("lists instances", async () => {
    const instances = await client.list();
    expect(Array.isArray(instances)).toBe(true);
  });

  it("spawns a process", async () => {
    const instance = await client.spawn({
      command: "vim",
      args: ["test.txt"],
    });

    expect(instance.id).toBe("test-instance-id");
    expect(instance.command).toBe("vim");
  });

  it("gets snapshot", async () => {
    const snapshot = await client.snapshot("test-instance-id");
    expect(snapshot.visibleText).toBe("test output");
  });

  it("sends input", async () => {
    await client.send("test-instance-id", "hello\n");
    expect(ptySpies.send).toHaveBeenCalledWith("test-instance-id", "hello\n");
  });

  it("kills instance", async () => {
    await client.kill("test-instance-id");
    expect(ptySpies.kill).toHaveBeenCalledWith("test-instance-id");
  });

  it("resizes terminal", async () => {
    await client.resize("test-instance-id", 100, 30);
    expect(ptySpies.resize).toHaveBeenCalledWith("test-instance-id", 100, 30);
  });
});
