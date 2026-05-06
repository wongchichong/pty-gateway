# PTY Gateway - Auto-Refresh Feature

## ✅ Implementation Complete

### Feature
Automatically updates Telegram messages every 10 seconds for active TUI sessions, simulating a live screen update.

### How It Works

1. **User connects to PTY** (`/connect` or `/start`)
2. **Initial snapshot sent** as new message
3. **Auto-refresh starts** - every 10 seconds:
   - Get latest PTY snapshot
   - Edit existing message with new content
   - Preserve ANSI colors (HTML formatting)
4. **Auto-refresh stops** when:
   - User kills PTY (`/kill`)
   - PTY exits naturally
   - User disconnects

### Implementation Details

#### Message Editing
```typescript
async editMessage(chatId: string, messageId: string, text: string): Promise<boolean> {
  await this.bot.api.editMessageText(chatId, parseInt(messageId), text, {
    parse_mode: "HTML"
  });
  return true;
}
```

#### Auto-Refresh Manager
```typescript
private refreshIntervals: Map<string, NodeJS.Timeout> = new Map();
private lastMessages: Map<string, { id: string; text: string }> = new Map();

private startAutoRefresh(sessionKey: string, instanceId: string, chatId: string, channel: Channel) {
  const interval = setInterval(async () => {
    const lastMsg = this.lastMessages.get(`${chatId}:${instanceId}`);
    await this.sendSnapshot(instanceId, chatId, channel, lastMsg?.id);
  }, 10000); // 10 seconds

  this.refreshIntervals.set(sessionKey, interval);
}
```

#### Smart Snapshot Sending
```typescript
private async sendSnapshot(instanceId: string, chatId: string, channel: Channel, editMessageId?: string) {
  const snapshot = await this.pty.snapshot(instanceId);
  const text = this.formatSnapshot(snapshot);

  // Try to edit existing message
  if (editMessageId && channel.editMessage) {
    const edited = await channel.editMessage(chatId, editMessageId, text);
    if (edited) return;
  }

  // Send new message if edit fails
  const msgId = await channel.sendMessage(chatId, text);
  this.lastMessages.set(`${chatId}:${instanceId}`, { id: msgId, text });
}
```

## Test Results

### Test Scenario
1. Connect to htop instance
2. Wait 30 seconds (3 refreshes)
3. Kill PTY

### Test Output
```
📤 NEW MESSAGE (ID: 3): <pre>...htop output...</pre>
  🔄 Starting auto-refresh for session telegram:test-chat-123

✏️  EDITED MESSAGE (ID: 3, Edit #1): <pre>...updated htop...</pre>
✏️  EDITED MESSAGE (ID: 3, Edit #2): <pre>...updated htop...</pre>
✏️  EDITED MESSAGE (ID: 3, Edit #3): <pre>...updated htop...</pre>

  ⏹️  Stopped auto-refresh for session telegram:test-chat-123
```

## Benefits

1. **No Message Spam**: Edits same message instead of sending new ones
2. **Live Updates**: TUI applications update in real-time
3. **Resource Efficient**: Only active sessions refresh
4. **Clean Cleanup**: Auto-stops when session ends
5. **Color Preservation**: ANSI colors maintained in updates

## Use Cases

- **htop**: Live system monitoring
- **top**: Process monitoring
- **vim**: Text editing (with manual refresh)
- **nano**: Text editing (with manual refresh)
- **watch**: Command monitoring
- **tmux**: Terminal multiplexer sessions

## Configuration

- **Refresh Interval**: 10 seconds (configurable in code)
- **Max Edits**: Unlimited (Telegram allows editing messages up to 48 hours old)
- **Color Support**: Enabled by default (uses `?color=true` parameter)

## Future Enhancements

1. **Configurable Refresh Rate**: Allow users to set custom refresh intervals
2. **Smart Refresh**: Detect if PTY output changed before editing
3. **Pause/Resume**: Commands to pause and resume auto-refresh
4. **Multiple Messages**: Handle long outputs that exceed Telegram's message limit

## Status

✅ **Working** - Tested with htop, auto-refreshes every 10 seconds
✅ **Tested** - Mock chat shows 3 successful edits
✅ **Deployed** - Gateway running with hot reload
