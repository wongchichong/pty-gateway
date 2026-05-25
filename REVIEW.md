# PTY Gateway - Code Review Report

**Reviewed:** 2026-05-24T00:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

The pty-gateway codebase has been reviewed for production readiness. Multiple critical security vulnerabilities were found, including hardcoded secrets and potential injection vulnerabilities. Several bugs around error handling and memory management also exist. The core architecture is sound, but these issues must be addressed before production deployment.

---

## Critical Issues

### CR-01: Hardcoded Telegram Bot Token

**File:** `src/check-telegram-queue.ts:3`
**Issue:** A production Telegram bot token is hardcoded in the source code:
```typescript
const token = "8520957421:AAGBrVEnuGDeFAfAE1GRyJ_-0rJSTL9FtKU";
```

**Fix:** Replace with environment variable:
```typescript
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN not set");
  process.exit(1);
}
```

---

### CR-02: Hardcoded Telegram Bot Token (Monitor)

**File:** `src/monitor-gateway.ts:31`
**Issue:** Same hardcoded Telegram bot token appears again:
```typescript
const token = process.env.TELEGRAM_BOT_TOKEN || "8520957421:AAGBrVEnuGDeFAfAE1GRyJ_-0rJSTL9FtKU";
```

**Fix:** Remove the fallback hardcoded token:
```typescript
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN not set");
  process.exit(1);
}
```

---

### CR-03: AppleScript Injection Vulnerability

**File:** `src/channels/imessage.ts:88-92`
**Issue:** User-controlled text is directly interpolated into AppleScript without sanitization:
```typescript
const script = `
  tell application "Messages"
    send "${text.replace(/"/g, '\\"')}" to buddy "${chatId}"
  end tell
`;
```

If text contains double quotes or special AppleScript characters, it can break the script or enable injection.

**Fix:** Escape all special characters and use parameterized approach:
```typescript
// Escape special characters for AppleScript
const escapeForAppleScript = (str: string): string => {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
};

const script = `tell application "Messages"
  send "${escapeForAppleScript(text)}" to buddy "${escapeForAppleScript(chatId)}"
end tell`;
```

---

### CR-04: Command Injection via Signal chatId

**File:** `src/channels/signal.ts:96-102`
**Issue:** The `chatId` parameter is passed directly to the command line without sanitization:
```typescript
const args = [
  "-u", this.config.phoneNumber,
  "send",
  "-m", text,
  chatId,  // Unsanitized user input
];
```

If `chatId` contains shell metacharacters, command injection is possible.

**Fix:** Validate chatId format (e.g., phone number regex) and reject invalid characters:
```typescript
// Only allow phone numbers with optional + prefix
if (!/^\+?\d{10,15}$/.test(chatId)) {
  throw new Error("Invalid phone number format");
}
```

---

## Warnings

### WR-01: Silent Error Swallowing in Router

**File:** `src/router.ts:181-183, 197-199, 213-215`
**Issue:** Multiple catch blocks ignore all errors silently:
```typescript
catch (err) {
  // Ignore errors
}
```

This makes debugging difficult and can mask serious issues like disk full or file permission errors.

**Fix:** Log errors at minimum:
```typescript
catch (err) {
  console.error(`[Router] Failed to load ID map: ${err}`);
}
```

---

### WR-02: Memory Leak in Matrix Typing Timeout

**File:** `src/channels/matrix.ts:284-289`
**Issue:** The timeout is stored but not cleaned up on stop():
```typescript
const timeout = setTimeout(() => {
  this.client.sendTyping(chatId, 0);
  this.typingTimeout.delete(chatId);
}, duration_ms);

this.typingTimeout.set(chatId, timeout);
```

When the channel stops, existing timeouts continue running until they fire.

**Fix:** Clear all timeouts in stop():
```typescript
async stop(): Promise<void> {
  // Clear all typing timeouts
  for (const [chatId, timeout] of this.typingTimeout) {
    clearTimeout(timeout);
  }
  this.typingTimeout.clear();

  if (this.client) {
    this.client.stopClient();
    this.client = null;
  }
  this._connected = false;
}
```

---

### WR-03: Unhandled Promise Rejection in Auto-Refresh

**File:** `src/router.ts:903-976`
**Issue:** The setInterval callback is async but exceptions are only caught by try/catch inside. If an unhandled rejection occurs, it could crash the process:
```typescript
const interval = setInterval(async () => {
  try {
    // ... async code
  } catch (err) {
    console.error(`  ❌ Auto-refresh error: ${err}`);
  }
}, AUTO_REFRESH_INTERVAL);
```

**Fix:** Add global rejection handler:
```typescript
// In constructor or initialization
process.on('unhandledRejection', (err) => {
  console.error('[Router] Unhandled rejection:', err);
});
```

---

### WR-04: Null Message Silently Dropped in Telegram

**File:** `src/channels/telegram.ts:22-27`
**Issue:** When `toChannelMessage` returns null, nothing happens and the message is silently dropped:
```typescript
const msg = this.toChannelMessage(ctx);
if (msg && this.isAllowed(msg)) {
  await this.messageHandler?.(msg);
}
// Silent drop if msg is null
```

**Fix:** Log when messages are dropped:
```typescript
const msg = this.toChannelMessage(ctx);
if (!msg) {
  console.warn('[Telegram] Dropped message: no text content');
  return;
}
if (!this.isAllowed(msg)) {
  return; // Allowed check is silent - user not in allowlist
}
```

---

### WR-05: No Retry Logic in Discord Message Sending

**File:** `src/channels/discord.ts:204-243`
**Issue:** `sendMessage` throws on failure with no retry mechanism. Network glitches will fail immediately.

**Fix:** Add retry with backoff:
```typescript
async sendMessage(
  chatId: string,
  text: string,
  options?: SendMessageOptions,
  retries = 3
): Promise<string> {
  // ... existing logic
  } catch (err) {
    if (retries > 0 && isRetryableError(err)) {
      await new Promise(r => setTimeout(r, 1000 * (4 - retries)));
      return this.sendMessage(chatId, text, options, retries - 1);
    }
    throw err;
  }
}
```

---

### WR-06: Unchecked Array Access in formatSnapshot

**File:** `src/router.ts:1039-1055`
**Issue:** Accesses `lines[lines.length - 1]` without bounds check if array is empty after trim:
```typescript
while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
  lines = lines.slice(0, -1);
}
```

While the condition checks for `lines.length > 0`, the logic is hard to follow and could cause confusion.

**Fix:** Simplify with explicit check:
```typescript
if (lines.length === 0) {
  return "(empty buffer)";
}

// Remove trailing empty lines
while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
  lines.pop();
}

return lines.length === 0 ? "(empty buffer)" : lines.join("\n");
```

---

### WR-07: Race Condition in Session Auto-Snapshot

**File:** `src/router.ts:325-337`
**Issue:** setTimeout with async callback has no cancellation when session ends:
```typescript
setTimeout(async () => {
  try {
    const lastMsg = this.lastMessages.get(`${msg.chatId}:${session.instanceId}`);
    await this.sendSnapshot(session.instanceId, msg.chatId, channel, lastMsg?.id);
  } catch (err) {
    console.error(`  ❌ Auto-snapshot error: ${err}`);
  }
}, AUTO_SNAPSHOT_DELAY);
```

If the session ends before the timeout fires, this could operate on a stale session.

**Fix:** Store timeout handle and clear on session end:
```typescript
private autoSnapshotTimeouts: Map<string, NodeJS.Timeout> = new Map();

// When starting timeout
const timeout = setTimeout(async () => {
  this.autoSnapshotTimeouts.delete(sessionKey);
  // ... rest of logic
}, AUTO_SNAPSHOT_DELAY);
this.autoSnapshotTimeouts.set(sessionKey, timeout);

// When stopping session
const timeout = this.autoSnapshotTimeouts.get(sessionKey);
if (timeout) {
  clearTimeout(timeout);
  this.autoSnapshotTimeouts.delete(sessionKey);
}
```

---

## Info

### IN-01: Excessive Console Logging in Production

**Files:** Multiple files
**Issue:** Extensive `console.log` and `console.error` throughout the codebase. While useful for development, these should be controlled via a proper logging framework in production.

**Fix:** Replace with structured logging:
```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

logger.info('[Router] Starting channels');
logger.error({ err }, '[Router] Channel failed to start');
```

---

### IN-02: Type Safety Issues

**File:** `src/router.ts:302, 332, 345`
**Issue:** Multiple uses of `as any` to access Matrix-specific methods:
```typescript
await (channel as any).sendTyping(msg.chatId, 5000);
```

**Fix:** Define a MatrixChannel interface:
```typescript
interface MatrixChannelLike extends Channel {
  sendTyping(chatId: string, duration: number): Promise<void>;
  sendReaction(chatId: string, messageId: string, reaction: string): Promise<boolean>;
  stopTyping(chatId: string): Promise<void>;
}
```

---

### IN-03: Config File Permissions Unix-Only

**File:** `src/index.ts:77`
**Issue:** Config file permissions set to 0o600 only work on Unix:
```typescript
writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
```

On Windows, this has no effect.

**Fix:** Add platform-specific handling or document the limitation.

---

### IN-04: Magic Numbers

**Files:** Multiple files
**Issue:** Hardcoded magic numbers throughout:
- `AUTO_SNAPSHOT_DELAY = 500`
- `AUTO_REFRESH_INTERVAL = 10000`
- `MAX_EDITS = 20`
- `MAX_MESSAGE_LENGTH = 3500`

**Fix:** Extract to configuration or constants file:
```typescript
export const CONFIG = {
  AUTO_SNAPSHOT_DELAY: 500,
  AUTO_REFRESH_INTERVAL: 10000,
  MAX_EDITS: 20,
  MAX_MESSAGE_LENGTH: 3500,
} as const;
```

---

### IN-05: Unused Imports

**File:** `src/channels/imessage.ts:8`
**Issue:** `ChildProcess` type imported but not explicitly used:
```typescript
import { spawn, ChildProcess } from "child_process";
```

**Fix:** Remove unused import:
```typescript
import { spawn } from "child_process";
```

---

_Reviewed: 2026-05-24T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_