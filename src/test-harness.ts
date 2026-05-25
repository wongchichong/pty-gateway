import { vi, beforeEach, afterEach, type Mock } from "vitest";
import type { ChannelMessage } from "./channels/types.js";

// ── Grammy (Telegram) Mock Spies ──────────────────────────────────────────

export const telegramSpies = {
  botCtor: vi.fn(),
  on: vi.fn(),
  command: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  init: vi.fn(),
  sendMessage: vi.fn(async () => ({ message_id: 1 })),
  getMe: vi.fn(async () => ({ username: "test_bot" })),
  setMyCommands: vi.fn(async () => true),
  botInfo: { username: "test_bot" },
};

// Mock grammy module
vi.mock("grammy", () => ({
  Bot: class MockBot {
    api = {
      sendMessage: telegramSpies.sendMessage,
      getMe: telegramSpies.getMe,
      setMyCommands: telegramSpies.setMyCommands,
    };
    botInfo = telegramSpies.botInfo;
    on = telegramSpies.on;
    command = telegramSpies.command;
    start = telegramSpies.start;
    stop = telegramSpies.stop;
    init = telegramSpies.init;
    constructor(token: string) {
      telegramSpies.botCtor(token);
    }
  },
  GrammyError: class GrammyError extends Error {
    error_code = 404;
    description = "Not Found";
    constructor(message: string) {
      super(message);
    }
  },
  Context: class MockContext {},
}));

// ── Discord.js Mock Spies ─────────────────────────────────────────────────

export const discordSpies = {
  clientCtor: vi.fn(),
  login: vi.fn(async () => undefined),
  destroy: vi.fn(),
  on: vi.fn(),
  fetch: vi.fn(async () => ({
    id: "channel_123",
    isTextBased: () => true,
    send: vi.fn(async () => ({ id: "msg_1" })),
  })),
  user: { id: "bot_id", tag: "TestBot#0000" },
  rest: { put: vi.fn(async () => undefined) },
};

vi.mock("discord.js", () => ({
  Client: class MockClient {
    channels = { fetch: discordSpies.fetch };
    user = discordSpies.user;
    on = discordSpies.on;
    login = discordSpies.login;
    destroy = discordSpies.destroy;
    constructor() {
      discordSpies.clientCtor();
    }
  },
  GatewayIntentBits: { Guilds: 1, GuildMessages: 2, MessageContent: 4 },
  Events: {
    ClientReady: "ready",
    MessageCreate: "messageCreate",
    InteractionCreate: "interactionCreate",
  },
  SlashCommandBuilder: class {
    setName = vi.fn().mockReturnThis();
    setDescription = vi.fn().mockReturnThis();
    addStringOption = vi.fn().mockReturnThis();
    toJSON = vi.fn().mockReturnValue({});
  },
  REST: class {
    setToken = vi.fn().mockReturnThis();
    put = discordSpies.rest.put;
  },
  Routes: {
    applicationCommands: vi.fn().mockReturnValue(""),
    applicationGuildCommands: vi.fn().mockReturnValue(""),
  },
}));

// ── PTY Client Mock Spies ─────────────────────────────────────────────────

export const ptySpies = {
  health: vi.fn(async () => ({ status: "ok", apps: 0 })),
  list: vi.fn(async () => []),
  get: vi.fn(async () => null),
  spawn: vi.fn(async (opts: { command: string; args?: string[]; cols?: number; rows?: number }) => ({
    id: "test-instance-id",
    pid: 12345,
    name: opts.command,
    command: opts.command,
    args: opts.args || [],
    cols: opts.cols || 80,
    rows: opts.rows || 24,
    createdAt: Date.now(),
  })),
  snapshot: vi.fn(async () => ({
    fullLines: [],
    visibleLines: ["test output"],
    fullText: "test output",
    visibleText: "test output",
    bufRows: 24,
    bufCols: 80,
  })),
  send: vi.fn(async () => undefined),
  resize: vi.fn(async () => undefined),
  kill: vi.fn(async () => undefined),
  connect: vi.fn(async () => undefined),
  disconnect: vi.fn(),
  onEvent: vi.fn(() => () => {}),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
};

vi.mock("./pty-client.js", () => ({
  PtyClient: class MockPtyClient {
    health = ptySpies.health;
    list = ptySpies.list;
    get = ptySpies.get;
    spawn = ptySpies.spawn;
    snapshot = ptySpies.snapshot;
    send = ptySpies.send;
    resize = ptySpies.resize;
    kill = ptySpies.kill;
    connect = ptySpies.connect;
    disconnect = ptySpies.disconnect;
    onEvent = ptySpies.onEvent;
    subscribe = ptySpies.subscribe;
    unsubscribe = ptySpies.unsubscribe;
  },
}));

// ── Test Helpers ──────────────────────────────────────────────────────────

export function createTelegramCtx(options: {
  text: string;
  chatId?: number;
  userId?: number;
  username?: string;
}) {
  return {
    message: {
      message_id: 1,
      chat: { id: options.chatId ?? 123, type: "private" },
      from: { id: options.userId ?? 456, username: options.username ?? "testuser" },
      text: options.text,
      date: Math.floor(Date.now() / 1000),
    },
    chat: { id: options.chatId ?? 123 },
    from: { id: options.userId ?? 456 },
    me: { username: "test_bot" },
    reply: vi.fn(async () => ({ message_id: 2 })),
  };
}

export function createDiscordMessage(options: {
  content: string;
  channelId?: string;
  authorId?: string;
}) {
  return {
    id: "msg_1",
    channelId: options.channelId ?? "channel_123",
    author: { id: options.authorId ?? "user_456", bot: false },
    content: options.content,
    createdTimestamp: Date.now(),
    reply: vi.fn(async () => ({ id: "msg_2" })),
    guild: { id: "guild_123" },
  };
}

export function createMockChannelMessage(
  text: string,
  options?: { channel?: "telegram" | "discord"; chatId?: string; userId?: string }
): ChannelMessage {
  return {
    id: "msg_1",
    channel: options?.channel ?? "telegram",
    userId: options?.userId ?? "user_456",
    chatId: options?.chatId ?? "chat_123",
    text,
    timestamp: Date.now(),
  };
}

// Get registered handler from telegram bot
export function getTelegramHandler(event: string): Function | undefined {
  const call = telegramSpies.on.mock.calls.find((c) => c[0] === event);
  return call?.[1];
}

// Get registered command handler from telegram bot
export function getTelegramCommandHandler(cmd: string): Function | undefined {
  const call = telegramSpies.command.mock.calls.find((c) => c[0] === cmd);
  return call?.[1];
}

// ── Reset Spies ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Telegram defaults
  telegramSpies.sendMessage.mockResolvedValue({ message_id: 1 });
  telegramSpies.getMe.mockResolvedValue({ username: "test_bot" });
  telegramSpies.init.mockResolvedValue(undefined);
  telegramSpies.start.mockImplementation(async (opts?: { onStart?: () => void }) => {
    opts?.onStart?.();
    return Promise.resolve();
  });

  // Discord defaults
  discordSpies.login.mockResolvedValue(undefined);
  discordSpies.fetch.mockResolvedValue({
    id: "channel_123",
    isTextBased: () => true,
    send: vi.fn(async () => ({ id: "msg_1" })),
  });

  // PTY defaults
  ptySpies.health.mockResolvedValue({ status: "ok", apps: 0 });
  ptySpies.list.mockResolvedValue([]);
  ptySpies.spawn.mockImplementation(async (opts) => ({
    id: "test-instance-id",
    pid: 12345,
    name: opts.command,
    command: opts.command,
    args: opts.args || [],
    cols: opts.cols || 80,
    rows: opts.rows || 24,
    createdAt: Date.now(),
  }));
  ptySpies.snapshot.mockResolvedValue({
    fullLines: [],
    visibleLines: ["test output"],
    fullText: "test output",
    visibleText: "test output",
    bufRows: 24,
    bufCols: 80,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
