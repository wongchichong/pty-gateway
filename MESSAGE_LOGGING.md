# Message Logging Output Examples

## What You'll See When Gateway Starts

### 1. **Message Received** (for every incoming message)
```
[2026-05-05T13:05:27.000Z] 📨 Message received:
  Channel: telegram
  User: 255433743
  Chat: 255433743
  Text: "hello"
  Message ID: 19
```

### 2. **Command Detected** (when message starts with /)
```
[2026-05-05T13:05:30.000Z] 📨 Message received:
  Channel: telegram
  User: 255433743
  Chat: 255433743
  Text: "/help"
  Message ID: 18
  ⚡ Command detected: /help
  📖 Sending help text
[Telegram] 📤 Sending message to chat 255433743:
  Text: "PTY Gateway Commands:
/start <command> [args...] - Start a new PTY instance
/connect [id] - Connect to an existing PTY instance
/kill - Kill the current PTY instance
/list - List all PTY instances
/snapshot - Get current PTY buffer snapshot
/help - Show this help

Any other message is sent as input to the connected PTY."
  ✅ Message sent (ID: 21)
```

### 3. **Starting PTY Instance** (when /start command is used)
```
[2026-05-05T13:06:00.000Z] 📨 Message received:
  Channel: telegram
  User: 255433743
  Chat: 255433743
  Text: "/start bash"
  Message ID: 22
  ⚡ Command detected: /start bash
  🚀 Starting PTY: bash
  ✅ PTY started: abc123 (PID: 12345)
[Telegram] 📤 Sending message to chat 255433743:
  Text: "Started PTY: abc123
Command: bash
PID: 12345"
  ✅ Message sent (ID: 23)
```

### 4. **Input to PTY** (when user sends text with active session)
```
[2026-05-05T13:06:15.000Z] 📨 Message received:
  Channel: telegram
  User: 255433743
  Chat: 255433743
  Text: "ls -la"
  Message ID: 24
  📤 Sending to PTY instance: abc123
```

### 5. **No Active Session** (when user sends text without session)
```
[2026-05-05T13:07:00.000Z] 📨 Message received:
  Channel: telegram
  User: 255433743
  Chat: 255433743
  Text: "hihi"
  Message ID: 13
  ℹ️  No active session - message ignored
```

## Current Queue Status

Your bot has **9 pending messages** that will be processed when you start the gateway:

1. `/help` - Will show help text
2. `hihi` - No session, will be ignored
3. `helo` - No session, will be ignored
4. `hi` - No session, will be ignored
5. `hihi` - No session, will be ignored
6. `test bot` - No session, will be ignored
7. `/help` - Will show help text
8. `hello` - No session, will be ignored
9. `test` - No session, will be ignored

## How to Start

```bash
# Option 1: Use the test script
./test-logging.sh

# Option 2: Run directly
node dist/index.js

# Option 3: Run with pnpm
pnpm start
```

## Expected Output

When you start the gateway, you'll see:
1. Connection messages
2. All 9 queued messages processed with detailed logging
3. Bot responses for `/help` commands
4. Real-time logging for any new messages you send

## Test It Live

1. Start the gateway
2. Open Telegram: https://t.me/SupremeDivinityAI_bot
3. Send messages and watch them appear in the console
4. Try commands: `/help`, `/start bash`, `/list`
