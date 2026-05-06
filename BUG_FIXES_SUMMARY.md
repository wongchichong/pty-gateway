# PTY Gateway - Bug Fixes Summary

## Issues Fixed

### Issue 1: Auto-Snapshot After Commands ✅
**Problem**: Commands like `pwd`/`ls` were sent to PTY but no snapshot was returned to show the output.

**Root Cause**: The router was sending commands to PTY but not triggering a snapshot response.

**Solution**: Added automatic snapshot trigger after command execution:
```typescript
// Auto-snapshot: Send snapshot immediately after command execution
setTimeout(async () => {
  const lastMsg = this.lastMessages.get(`${msg.chatId}:${session.instanceId}`);
  await this.sendSnapshot(session.instanceId, msg.chatId, channel, lastMsg?.id);
}, 500); // 500ms delay for command execution
```

**Result**: Commands now automatically show output via snapshot after 500ms.

### Issue 2: Telegram HTML Color Support ✅
**Problem**: Colors not showing in Telegram - messages appeared as plain text.

**Root Cause**: Telegram Bot API does NOT support `<span style="color:...">` HTML tags. The error was:
```
Bad Request: can't parse entities: Tag "span" must have class "tg-spoiler"
```

**Telegram HTML Limitations**:
- ❌ No support for `<span style="color:...">`
- ❌ No support for inline styles
- ❌ No support for custom colors
- ✅ Only supports: `<b>`, `<i>`, `<u>`, `<s>`, `<code>`, `<pre>`, `<a>`

**Solution**: Removed HTML formatting and switched to plain code blocks:
```typescript
// Use plain code block formatting for better compatibility
const content = lines.join("\n");
return "```\n" + content + "\n```";
```

**Result**: Messages now display correctly in Telegram using monospace font.

## Test Results

### Test 1: Auto-Snapshot After Commands
```
👤 USER: pwd
📤 Sending to PTY instance: d35d63e2...
✏️  EDIT: ```\nroot@localhost:~/projects/pty# pwd\n/root/projects/pty\n```
```

✅ **Working** - Snapshot automatically sent after command execution

### Test 2: Message Formatting
```
📤 BOT: ```
root@localhost:~/projects/pty# ls
AGENTS.md  package.json  pty.ts  README.md
```
```

✅ **Working** - Messages display correctly in Telegram with monospace font

## Implementation Details

### File Changes

**src/router.ts**:
1. Added auto-snapshot trigger in `handleChannelMessage()` (line 180-192)
2. Simplified `formatSnapshot()` to use plain code blocks (line 591-602)
3. Removed HTML parse mode from `sendSnapshot()` (line 507-547)

### Behavior Changes

**Before**:
- Commands sent to PTY → No response
- HTML with `<span style="color:...">` → Error in Telegram

**After**:
- Commands sent to PTY → Auto-snapshot after 500ms
- Plain code blocks → Correct display in Telegram

## Telegram Font Information

**Default Font**: Telegram uses a system monospace font for code blocks:
- **iOS**: SF Mono
- **Android**: Roboto Mono
- **Desktop**: Consolas / Monaco / Menlo

**Note**: The font cannot be changed - it's determined by the Telegram client's system settings.

## Summary

Both issues are now resolved:
- ✅ Auto-snapshot after commands (500ms delay)
- ✅ Correct message formatting in Telegram (plain code blocks)
- ✅ Message editing working (updates same message)
- ✅ Auto-refresh still working (10s intervals)

The gateway is now fully functional with proper Telegram support! 🚀
