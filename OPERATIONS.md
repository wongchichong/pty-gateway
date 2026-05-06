# PTY Gateway Operations Guide

## What Happened

**Problem**: Telegram messages were stuck in queue because the gateway wasn't running.

**Root Cause Analysis**:

1. **Telegram's Polling Model**:
   - Messages sent to bot → stored on Telegram servers with incrementing `update_id`
   - Bot must actively poll via `getUpdates()` to consume messages
   - No running bot = messages accumulate indefinitely

2. **What We Observed**:
   - 3 messages queued: `/list` (01:10:42), `/help` (01:10:56), `/help` (01:11:58)
   - Gateway process was not running
   - No consumer for the messages

3. **Why It Happened**:
   - Gateway was started manually for testing
   - Process terminated (crash, manual stop, or system restart)
   - No supervision or auto-restart mechanism
   - No monitoring to detect the failure

## Prevention Strategies

### 1. Process Supervision (Recommended: PM2)

**Install PM2**:
```bash
npm install -g pm2
```

**Start with PM2**:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Generate systemd startup script
```

**Benefits**:
- ✅ Auto-restart on crash
- ✅ Automatic startup on boot
- ✅ Log management
- ✅ Process monitoring
- ✅ Resource limits

**Commands**:
```bash
pm2 status              # Check status
pm2 logs pty-gateway    # View logs
pm2 restart pty-gateway # Restart
pm2 stop pty-gateway    # Stop
pm2 monit               # Live monitoring
```

### 2. Systemd Service (Production)

**Install service**:
```bash
sudo cp pty-gateway.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable pty-gateway
sudo systemctl start pty-gateway
```

**Commands**:
```bash
sudo systemctl status pty-gateway
sudo systemctl restart pty-gateway
sudo journalctl -u pty-gateway -f  # Follow logs
```

### 3. Health Monitoring

**Run monitor**:
```bash
# One-time check
pnpm exec tsx src/check-telegram-queue.ts

# Continuous monitoring
pnpm exec tsx src/monitor-gateway.ts

# With PM2
pm2 start ecosystem.config.js --only pty-gateway-monitor
```

**Monitor checks**:
- PTY server health
- Gateway process running
- Telegram queue size
- Auto-alert when queue > 5 messages

### 4. Alerting

**Queue size alert** (in monitor):
```typescript
if (queueSize > MAX_QUEUE_SIZE) {
  // Send alert to Slack/Discord/Email
  await sendAlert(`Gateway queue building up: ${queueSize} messages`);
}
```

**Integration options**:
- Slack webhook
- Discord webhook
- Email via SendGrid/AWS SES
- PagerDuty incident

## Monitoring Checklist

### Daily Checks
- [ ] Check PM2/systemd status: `pm2 status` or `systemctl status pty-gateway`
- [ ] Check logs for errors: `pm2 logs pty-gateway --lines 100`
- [ ] Verify Telegram queue: `pnpm exec tsx src/check-telegram-queue.ts`

### Weekly Checks
- [ ] Review error logs: `/var/log/pty-gateway/error.log`
- [ ] Check memory usage: `pm2 monit`
- [ ] Verify PTY server health: `curl http://localhost:3000/health`

### Monthly Checks
- [ ] Update dependencies: `pnpm update`
- [ ] Review and rotate logs
- [ ] Test failover: Kill gateway, verify auto-restart

## Troubleshooting

### Gateway Won't Start

**Check logs**:
```bash
pm2 logs pty-gateway --err
# or
journalctl -u pty-gateway -n 100
```

**Common issues**:
1. PTY server not running:
   ```bash
   pty --serve --port 3000
   ```

2. Invalid Telegram token:
   ```bash
   pnpm exec tsx src/diagnose-telegram.ts $TELEGRAM_BOT_TOKEN
   ```

3. Port already in use:
   ```bash
   lsof -i :3000
   kill -9 <PID>
   ```

### Messages Not Being Processed

**Check queue**:
```bash
pnpm exec tsx src/check-telegram-queue.ts
```

**If queue has messages**:
1. Verify gateway is running
2. Check logs for errors
3. Verify user is in allowed list
4. Restart gateway

### Gateway Keeps Crashing

**Check memory**:
```bash
pm2 monit
```

**Check recent changes**:
```bash
git log --oneline -10
```

**Enable debug logging**:
```bash
LOG_LEVEL=debug pm2 restart pty-gateway
```

## Architecture Improvements

### Future Enhancements

1. **Webhook Mode** (instead of polling):
   - Telegram pushes messages to HTTP endpoint
   - No queue buildup
   - Requires public HTTPS endpoint
   - Use with Cloudflare Workers or similar

2. **Message Persistence**:
   - Store messages in database before processing
   - Retry failed messages
   - Audit trail

3. **Health Dashboard**:
   - Real-time metrics
   - Queue depth visualization
   - Historical trends

4. **Multi-instance Support**:
   - Run multiple gateway instances
   - Load balancing
   - Failover

## Quick Reference

```bash
# Start gateway
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs pty-gateway

# Check Telegram queue
pnpm exec tsx src/check-telegram-queue.ts

# Diagnose Telegram
pnpm exec tsx src/diagnose-telegram.ts $TELEGRAM_BOT_TOKEN

# Restart gateway
pm2 restart pty-gateway

# Stop gateway
pm2 stop pty-gateway

# Monitor health
pm2 start ecosystem.config.js --only pty-gateway-monitor
```

## Environment Variables

Required:
- `TELEGRAM_BOT_TOKEN` - Bot token from @BotFather
- `TELEGRAM_ALLOWED_USERS` - Comma-separated user IDs

Optional:
- `PTY_URL` - PTY server URL (default: http://localhost:3000)
- `TELEGRAM_ALLOWED_CHATS` - Comma-separated chat IDs
- `RATE_LIMIT_TOKENS` - Commands per minute per user (default: 5)
- `RATE_LIMIT_INTERVAL` - Rate limit interval: "minute" or "second" (default: "minute")
- `AUTO_RESTART` - Enable auto-restart in monitor (true/false)
- `LOG_LEVEL` - Logging level (info/debug/error)
- `AUTO_SNAPSHOT_DELAY` - Delay before auto-snapshot in ms (default: 500)
- `AUTO_REFRESH_INTERVAL` - Auto-refresh interval in ms (default: 10000)
- `MAX_EDITS` - Max message edits before delete (default: 20)
- `MAX_MESSAGE_LENGTH` - Max message length before truncation (default: 3500)

## Security Configuration

**Personal Use Setup:**
This gateway is configured for personal communication use with no command restrictions.

**Rate Limiting:**
- Default: 5 commands per minute per user
- Adjust via `RATE_LIMIT_TOKENS` environment variable
- Prevents spam and API abuse

**No Command Whitelist:**
All commands are allowed in PTY sessions. Security relies on:
- PTY service isolation
- User trust (personal use)
- Rate limiting protection

## Support

- Check logs first: `pm2 logs pty-gateway`
- Run diagnostics: `pnpm exec tsx src/diagnose-telegram.ts`
- Check queue: `pnpm exec tsx src/check-telegram-queue.ts`
- Review this guide: `cat OPERATIONS.md`
