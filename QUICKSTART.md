# Quick Start - PTY Gateway

## What Happened & Prevention

**Issue**: Telegram messages stuck in queue because gateway wasn't running.

**Root Cause**: No process supervision → gateway crashed/stopped → messages accumulated.

**Prevention**: Use PM2 for auto-restart and monitoring.

## Quick Commands

```bash
# Check if messages are stuck
pnpm queue:check

# Start gateway with auto-restart (PM2)
pnpm pm2:start

# Check gateway status
pm2 status

# View logs
pnpm pm2:logs

# Monitor health
pnpm monitor

# Restart gateway
pnpm pm2:restart

# Stop gateway
pnpm pm2:stop
```

## Setup PM2 (One-time)

```bash
# Install PM2 globally
npm install -g pm2

# Start gateway
pnpm pm2:start

# Save PM2 configuration
pm2 save

# Auto-start on boot
pm2 startup
```

## Monitoring

### Check Telegram Queue
```bash
pnpm queue:check
```

Output:
- `✓ No pending updates` = Good
- `Found N update(s)` = Gateway may be down

### Diagnose Telegram Bot
```bash
pnpm telegram:diagnose
```

Checks:
- Bot token validity
- API connection
- Webhook status

### Continuous Monitoring
```bash
pnpm monitor
```

Checks every 30s:
- PTY server health
- Gateway process
- Telegram queue size

## Troubleshooting

### Messages Not Processing

1. Check queue: `pnpm queue:check`
2. Check gateway: `pm2 status`
3. Check logs: `pnpm pm2:logs`
4. Restart: `pnpm pm2:restart`

### Gateway Won't Start

1. Check PTY server: `curl http://localhost:3000/health`
2. Check token: `pnpm telegram:diagnose`
3. Check logs: `pnpm pm2:logs`

### Gateway Keeps Crashing

1. Check memory: `pm2 monit`
2. Check logs: `pnpm pm2:logs`
3. Check recent changes: `git log`

## Full Documentation

See `OPERATIONS.md` for:
- Detailed troubleshooting
- Systemd setup
- Alerting configuration
- Architecture improvements
- Environment variables

## Architecture

```
Telegram API
    ↓ (webhook/polling)
Message Queue (update_id)
    ↓
Gateway Process (polls getUpdates)
    ↓
Router.handleChannelMessage()
    ↓
Command Handler / PTY Session
    ↓
Response to Telegram
```

**Failure point**: Gateway process must be running to poll messages.

**Solution**: PM2 auto-restart + monitoring.

## Environment Variables

Required in `.env` or PM2 config:
```bash
TELEGRAM_BOT_TOKEN=your_token_here
TELEGRAM_ALLOWED_USERS=your_user_id
```

Optional:
```bash
PTY_URL=http://localhost:3000
TELEGRAM_ALLOWED_CHATS=chat_id_1,chat_id_2
```
