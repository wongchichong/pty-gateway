# Size Feature - Testing Guide

## Features Implemented

### 1. **Per-Channel Default Sizes**
- Telegram: 40x80 (narrow for mobile)
- Discord: 60x40 (medium)
- Slack: 80x40 (desktop)
- CLI: Auto-detects terminal size

### 2. **`/size` Command**
Set custom size for new PTY instances:
```
/size 40x80   - Set narrow size
/size 80x40   - Set desktop size
/size 120x40  - Set wide terminal
/size reset   - Reset to channel default
/size         - Show current size and help
```

### 3. **Responsive CLI**
The `pnpm dev chat` command auto-detects terminal size:
```
📐 Terminal size: 80x24
```

## Testing

### Test 1: Check Default Size
Send to Telegram:
```
/size
```

Expected output:
```
Current size: default
Channel default: 40x80
```

### Test 2: Set Custom Size
Send to Telegram:
```
/size 80x40
```

Expected output:
```
✅ Size set to 80x40
Will apply to new PTY instances created with /start
```

### Test 3: Start Instance with Custom Size
Send to Telegram:
```
/size 60x40
/start htop
/list
```

Expected output:
```
🚀 Starting PTY: htop (60x40)
✅ PTY started: 1 (PID: ...)

1: htop (PID ..., 60x40)
```

### Test 4: Reset to Default
Send to Telegram:
```
/size reset
```

Expected output:
```
✅ Size reset to 40x80 (channel default)
```

### Test 5: CLI Auto-Detection
Run in terminal:
```bash
pnpm dev chat '/start bash'
```

Expected output:
```
📐 Terminal size: 80x24  (or your terminal size)
🚀 Starting PTY: bash (80x24)
```

### Test 6: Invalid Size
Send to Telegram:
```
/size 10x10
```

Expected output:
```
Columns must be between 20 and 200 (got 10)
```

## How It Works

### Session-Based Size Storage
```typescript
interface UserSession {
  instanceId: string;
  channel: ChannelType;
  chatId: string;
  lastActivity: number;
  cols?: number;  // Custom size
  rows?: number;
}
```

### Size Priority
1. Session custom size (set via `/size`)
2. Channel default size
3. Fallback: 80x24

### When Size Is Applied
- **`/start`**: Uses session size or channel default
- **`/connect`**: Instance keeps its original size
- **Existing instances**: Never resized (PTY limitation)

## Architecture

```
User sends: /size 40x80
    ↓
Router.cmdSize()
    ↓
Update session.cols, session.rows
    ↓
User sends: /start htop
    ↓
Router.cmdStart()
    ↓
Get size from session (40x80)
    ↓
pty.spawn({ cols: 40, rows: 80 })
    ↓
Instance created with 40x80 size
```

## Future Enhancements

### 1. **Dynamic Resize**
Add `/resize` command to resize running PTY:
```typescript
await pty.resize(instanceId, newCols, newRows);
```

### 2. **Size Profiles**
Save named size profiles:
```
/size save mobile 40x80
/size save desktop 120x40
/size load mobile
```

### 3. **Auto-Resize on Terminal Change**
Detect terminal resize and update PTY:
```typescript
process.stdout.on('resize', () => {
  const cols = process.stdout.columns;
  const rows = process.stdout.rows;
  pty.resize(instanceId, cols, rows);
});
```

## Files Modified

- `src/router.ts`:
  - Added `cols`/`rows` to `UserSession`
  - Added `channelDefaults` map
  - Added `cmdSize()` method
  - Updated `cmdStart()` to use session size
  - Updated `cmdHelp()` to include `/size`

- `src/index.ts`:
  - Added terminal size detection in `chatCommand()`
  - Set channel defaults based on terminal

## Notes

- Size only affects NEW instances created with `/start`
- Existing instances keep their original size
- Size is per-session (different users can have different sizes)
- Terminal size detection caps at 120x40 for readability
