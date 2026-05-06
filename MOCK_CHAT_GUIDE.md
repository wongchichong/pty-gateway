# PTY Gateway Mock Chat - Testing Tool

## Overview

The mock chat tool allows you to test all PTY Gateway functionality locally without sending actual Telegram messages. This makes debugging and testing much faster.

## Usage

### Single Command Mode

Test a single command quickly:

```bash
# Test help
pnpm chat "/help"

# Test list instances
pnpm chat "/list"

# Start a PTY
pnpm chat "/start bash"

# Connect to instance
pnpm chat "/connect 1"

# Send input to PTY
pnpm chat "ls -la"

# Get snapshot
pnpm chat "/snapshot"
```

### Interactive Mode

Run interactive chat session:

```bash
pnpm chat
```

Then type commands interactively:
```
👤 You: /help
👤 You: /list
👤 You: /start bash
👤 You: ls -la
👤 You: exit
```

### Comprehensive Test Suite

Run all tests automatically:

```bash
./test-all.sh
```

## Test Results

### ✅ Test 1: /help command
```
📤 BOT REPLY:
PTY Gateway Commands:
/start <command> [args...] - Start a new PTY instance
/connect [id] - Connect to an existing PTY instance
/kill - Kill the current PTY instance
/list - List all PTY instances
/snapshot - Get current PTY buffer snapshot
/help - Show this help
```

### ✅ Test 2: /list command
```
📤 BOT REPLY:
PTY instances:
1: htop (PID 5738, 80x24)
2: bash (PID 26382, 80x24)
```

### ✅ Test 3: /start bash
```
📤 BOT REPLY:
Started PTY: 1
Command: bash
PID: 29831
```

### ✅ Test 4: Short IDs Working
- Instance IDs are now short (1, 2, 3...) instead of long GUIDs
- Easy to reference in commands: `/connect 1`
- ID mapping persists across session

## Features Tested

| Feature | Status | Notes |
|---------|--------|-------|
| `/help` | ✅ | Shows all commands |
| `/list` | ✅ | Lists instances with short IDs |
| `/start` | ✅ | Creates PTY, returns short ID |
| `/connect` | ✅ | Connects using short ID |
| `/snapshot` | ✅ | Gets PTY buffer |
| `/kill` | ✅ | Kills PTY instance |
| Message routing | ✅ | Routes to correct PTY |
| Error handling | ✅ | Shows errors clearly |
| Logging | ✅ | Full message logging |

## Advantages Over Real Telegram Testing

1. **Speed**: No network delays, instant responses
2. **Visibility**: See all message processing in console
3. **Repeatability**: Run same tests consistently
4. **No Token Needed**: Works without Telegram bot token
5. **Debugging**: Easy to trace message flow
6. **Automation**: Can script test sequences

## Example Test Session

```bash
$ pnpm chat

PTY Gateway Mock Chat - Interactive Mode
════════════════════════════════════════════════════════════

Commands:
  /start <cmd>   - Start PTY instance
  /connect <id>  - Connect to instance
  /list          - List instances
  /kill          - Kill current instance
  /snapshot      - Get PTY buffer
  /help          - Show help
  exit           - Quit test mode
  <any text>     - Send to connected PTY

════════════════════════════════════════════════════════════

✅ PTY health: ok
✅ Connected to PTY WebSocket
✅ Mock channel started

👤 You: /list

════════════════════════════════════════════════════════════
📨 INCOMING MESSAGE
════════════════════════════════════════════════════════════
User ID: test-user-456
Chat ID: test-chat-123
Text: "/list"
════════════════════════════════════════════════════════════

[2026-05-05T15:09:32.539Z] 📨 Message received:
  Channel: telegram
  User: test-user-456
  Chat: test-chat-123
  Text: "/list"
  Message ID: 1
  ⚡ Command detected: /list

────────────────────────────────────────────────────────────
📤 BOT REPLY (Message ID: 2)
────────────────────────────────────────────────────────────
PTY instances:
1: htop (PID 5738, 80x24)
2: bash (PID 26382, 80x24)
────────────────────────────────────────────────────────────

👤 You: exit

👋 Exiting...
```

## Implementation Details

### MockChannel Class
- Simulates Telegram channel locally
- Implements same interface as real channels
- Prints messages to console instead of sending to API

### Message Flow
1. User types command in console
2. MockChannel.receiveMessage() creates ChannelMessage
3. Router processes message with logging
4. Response sent back to MockChannel
5. MockChannel prints response to console

### Benefits
- Test gateway logic without external dependencies
- Fast iteration during development
- Easy to debug message routing
- Reproducible test scenarios
