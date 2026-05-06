# Using Bash Commands in PTY Gateway

## ✅ Commands ARE Working!

The test confirms that bash commands like `pwd`, `ls`, and `ls -la` are successfully executing in the PTY sessions.

## How It Works

### 1. Connect to Bash PTY
```
/connect 2
✅ Connected to PTY: 2
Command: bash
PID: 26382
```

### 2. Send Commands
```
pwd              → Shows current directory
ls               → Lists files
ls -la           → Detailed listing
cd /tmp          → Change directory
echo "Hello"     → Print message
```

### 3. See Output

Commands execute immediately, but output appears in:

**Option A: Auto-Refresh (10s)**
- Gateway updates message every 10 seconds
- Command output appears in next refresh
- Creates "live terminal" experience

**Option B: Manual Snapshot**
```
/snapshot        → Get current PTY buffer immediately
```

**Option C: Wait for Auto-Refresh**
- Just wait 10 seconds
- Message automatically updates with output

## Test Results

### Test: pwd command
```
👤 USER: pwd
📤 Sending to PTY instance: 9baa361b...

/snapshot shows:
/root/projects/pty
```

### Test: ls -la command
```
👤 USER: ls -la
📤 Sending to PTY instance: 9baa361b...

/snapshot shows:
total 292
drwxrws---.  9 root root  3452 May  2 11:48 .
drwxr-xr-x. 37 root root  3452 May  5 12:15 ..
-rw-r--r--.  1 root root 10343 May  3 06:25 AGENTS.md
...
```

## Why Output Might Seem "Missing"

### Initial Connection Shows History
When you first connect, the snapshot shows:
- Previous commands in bash history
- Current terminal state
- This is the bash buffer, not new output

### Output Appears After Command Execution
1. You send: `pwd`
2. Bash executes: `pwd`
3. PTY buffer updates with output
4. Auto-refresh (10s) or `/snapshot` shows result

## Best Practices

### For Quick Commands (ls, pwd)
```
pwd
/snapshot        → See output immediately
```

### For Interactive Programs (vim, nano)
```
/start vim file.txt
# Output updates every 10s automatically
```

### For Long-Running Commands (find, grep)
```
find / -name "*.log"
# Wait for auto-refresh or use /snapshot
```

## Real Telegram Usage

In Telegram:
1. `/connect 2` - Connect to bash
2. `pwd` - Send command
3. Wait 10s - Message auto-updates with output
4. Or `/snapshot` - Get output immediately

## Verification

Run the test:
```bash
pnpm exec tsx test-bash-routing.ts
```

Output shows:
- ✅ Commands sent to PTY
- ✅ Commands executed
- ✅ Output in snapshots
- ✅ Auto-refresh working

## Summary

**Commands ARE working!** The output appears in:
- Auto-refresh updates (every 10s)
- Manual `/snapshot` command
- Initial connection snapshot (shows history)

For immediate output, use `/snapshot` after sending commands.