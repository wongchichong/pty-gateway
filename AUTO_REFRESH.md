# Auto-refresh Implementation

## Overview

The gateway implements automatic PTY buffer updates for connected sessions, with intelligent message management to work within Telegram's API limits.

## How It Works

### 1. **Session Activation**

Auto-refresh starts when a user:
- Sends `/connect <id>` to connect to an existing PTY instance
- Sends `/start <command>` to create a new PTY instance

### 2. **Update Cycle (Every 10 seconds)**

```
┌─────────────────────────────────────┐
│   Get PTY snapshot                  │
│   Compare with last sent buffer     │
└──────────────┬──────────────────────┘
               │
               ▼
       ┌───────────────┐
       │ Buffer changed?│
       └───┬───────┬───┘
           │ No    │ Yes
           │       │
           ▼       ▼
      Skip update  Check edit count
                       │
                       ▼
              ┌────────────────┐
              │ Edits < 20?    │
              └──┬─────────┬───┘
                 │ Yes     │ No
                 │         │
                 ▼         ▼
            Edit message  Delete message
            (increment)   Reset counter
                          Create new message
```

### 3. **Buffer Comparison**

Before sending any update:
```typescript
const snapshot = await pty.snapshot(instanceId, false);
const text = formatSnapshot(snapshot);

if (lastMsg.text === text) {
  // Skip update - buffer unchanged
  return;
}
```

**Why**: Avoids unnecessary API calls and "message not modified" errors.

### 4. **Edit Limit Management**

Telegram doesn't have a hard limit on edits, but:
- Frequent edits can trigger rate limits
- Old messages become stale
- Better UX with periodic fresh messages

**Implementation**:
```typescript
// Track edits per session
private editCounters: Map<string, number> = new Map();
private readonly MAX_EDITS = 20;

// After 20 edits, delete and start fresh
if (editCount >= MAX_EDITS) {
  await channel.deleteMessage(chatId, lastMsg.id);
  editCount = 0;
}
```

### 5. **Message Flow**

**First Update**:
```
User: /connect h
Bot: ✅ Connected to PTY: h
     Command: htop
     PID: 12345
Bot: <pre>htop output...</pre>  (Message ID: 100)
[Edit counter: 0]
```

**Updates 2-20** (every 10s if buffer changed):
```
Bot: <pre>htop output (updated)...</pre>  (Edit Message ID: 100)
[Edit counter: 1, 2, 3, ..., 19]
```

**Update 21**:
```
Bot: 🗑️ Max edits reached, deleting message
Bot: <pre>htop output (fresh)...</pre>  (New Message ID: 101)
[Edit counter: 0 - reset]
```

## Configuration

### Timing
- **Update interval**: 10 seconds (hardcoded in `startAutoRefresh`)
- **Can be configured**: Yes, by changing the interval value

### Limits
- **MAX_EDITS**: 20 edits before delete
- **Can be configured**: Yes, by changing `this.MAX_EDITS`

### Format
- **HTML format**: `<pre>` tags for monospace
- **No ANSI codes**: Stripped for Telegram compatibility
- **Chunking**: Automatic for messages > 4096 chars

## Testing

### Manual Test

1. Start gateway:
   ```bash
   pnpm dev --telegram-token <TOKEN> --telegram-users <USER_ID>
   ```

2. Connect to PTY:
   ```
   /start htop
   ```

3. Monitor logs:
   ```bash
   tail -f /tmp/gateway-new.log | grep -E "auto-refresh|Edit|buffer"
   ```

4. Expected output:
   ```
   🔄 Starting auto-refresh for session telegram:123456
   ✏️ Edit #1/20
   ✏️ Edit #2/20
   ...
   ✏️ Edit #19/20
   🗑️ Max edits reached (20), deleting message
   📝 New message created
   ✏️ Edit #1/20
   ```

### Automated Test

```bash
# Monitor for 60 seconds
timeout 60 tail -f /tmp/gateway-new.log | \
  grep --line-buffered "Edit\|buffer unchanged\|Max edits"
```

## Edge Cases

### 1. **Buffer Unchanged**
```
⏭️ Skipping update (buffer unchanged)
```
- No API call made
- Edit counter not incremented
- Saves API quota

### 2. **Session Disconnected**
```
⏹️ Stopped auto-refresh for session telegram:123456
```
- Interval cleared
- Counter deleted
- Resources freed

### 3. **Edit Fails** (message deleted, too old)
```
❌ Edit failed: [error]
📝 New message created
```
- Falls back to new message
- Counter reset to 0

### 4. **PTY Instance Killed**
```
❌ Auto-refresh error: Instance not found
```
- Error logged
- Auto-refresh continues (will stop when session checked)

## Performance

### API Calls
- **Best case**: 0 calls (buffer unchanged)
- **Normal case**: 1 edit per 10s
- **Worst case**: 1 delete + 1 new message per 200s (20 edits × 10s)

### Memory
- Last message cache: ~4KB per session
- Edit counter: ~8 bytes per session
- Total: Negligible

### CPU
- Buffer comparison: O(n) where n = buffer size
- Snapshot retrieval: Network I/O bound
- Negligible CPU impact

## Future Improvements

### 1. **Dynamic Interval**
- Faster updates (5s) for active TUIs (htop, top)
- Slower updates (30s) for idle sessions (bash prompt)

### 2. **Smart Delete**
- Delete after N seconds of inactivity
- Instead of fixed edit count

### 3. **Diff Updates**
- Send only changed lines
- Reduce message size

### 4. **Webhook Mode**
- Telegram pushes updates
- No polling needed
- Eliminates queue issues

## Troubleshooting

### No Updates Received

1. Check session exists:
   ```bash
   grep "Connected to PTY" /tmp/gateway-new.log
   ```

2. Check auto-refresh started:
   ```bash
   grep "Starting auto-refresh" /tmp/gateway-new.log
   ```

3. Check buffer changes:
   ```bash
   grep "buffer unchanged" /tmp/gateway-new.log
   ```

### Too Many Messages

1. Check edit counter:
   ```bash
   grep "Edit #" /tmp/gateway-new.log
   ```

2. Check MAX_EDITS value in code

3. Check if deletes working:
   ```bash
   grep "Max edits reached" /tmp/gateway-new.log
   ```

### Edit Failures

1. Check Telegram API errors:
   ```bash
   grep "Edit failed" /tmp/gateway-new.log
   ```

2. Common causes:
   - Message too old (>48h)
   - Message deleted by user
   - Rate limiting

## Related Files

- `src/router.ts` - Auto-refresh implementation
- `src/channels/telegram.ts` - Message edit/delete methods
- `src/pty-client.ts` - Snapshot retrieval

## References

- [Telegram Bot API - editMessageText](https://core.telegram.org/bots/api#editmessagetext)
- [Telegram Bot API - deleteMessage](https://core.telegram.org/bots/api#deletemessage)
- [Telegram Rate Limits](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this)
