# Telegram Message Queue Issue - Post-Mortem

## Incident Summary

**Date**: 2026-05-06
**Duration**: ~1 minute (01:10:42 - 01:11:58)
**Impact**: 3 Telegram messages stuck in queue, not processed
**Severity**: Low (no data loss, messages processed after gateway restart)

## Timeline

- **01:10:42** - User sent `/list` command → queued (update_id: 467653489)
- **01:10:56** - User sent `/help` command → queued (update_id: 467653490)
- **01:11:58** - User sent `/help` command → queued (update_id: 467653491)
- **01:15:00** - Gateway started, all messages processed immediately

## Root Cause

**Primary Cause**: Gateway process was not running

**Contributing Factors**:
1. Manual process start (no supervision)
2. Process terminated (reason unknown - crash, manual stop, or resource limit)
3. No monitoring to detect failure
4. No auto-restart mechanism

**Technical Details**:
- Telegram uses polling model: messages accumulate on server with incrementing `update_id`
- Bot must call `getUpdates()` to consume messages
- Without active polling, messages queue indefinitely
- No webhook configured (would have avoided this issue)

## Detection

**How Discovered**: User reported "msg receiving broken"

**Diagnostic Steps**:
1. Ran `pnpm queue:check` → found 3 messages in queue
2. Ran `pnpm telegram:diagnose` → bot valid, no webhook
3. Checked process: `ps aux | grep tsx` → no gateway running

## Resolution

**Immediate Fix**:
1. Started gateway: `pnpm dev --telegram-token <TOKEN> --telegram-users <USER_ID>`
2. All queued messages processed automatically
3. Queue emptied

**Time to Resolution**: ~5 minutes

## Prevention Measures Implemented

### 1. Process Supervision (PM2)

**Files Created**:
- `ecosystem.config.js` - PM2 configuration with auto-restart
- `pty-gateway.service` - Systemd service definition

**Features**:
- Auto-restart on crash (max 10 restarts, 3s delay)
- Auto-start on boot
- Log management
- Memory limits (500M)
- Graceful shutdown (5s timeout)

**Usage**:
```bash
pnpm pm2:start    # Start with supervision
pm2 save          # Save configuration
pm2 startup       # Generate boot script
```

### 2. Health Monitoring

**Files Created**:
- `src/monitor-gateway.ts` - Continuous health monitor

**Checks** (every 30s):
- PTY server health
- Gateway process running
- Telegram queue size (alert if > 5 messages)

**Usage**:
```bash
pnpm monitor      # Run continuous monitor
```

### 3. Diagnostic Tools

**Existing Tools**:
- `src/check-telegram-queue.ts` - Check message queue
- `src/diagnose-telegram.ts` - Validate bot token and connection

**New npm Scripts**:
```bash
pnpm queue:check       # Check queue
pnpm telegram:diagnose # Diagnose bot
pnpm monitor           # Continuous monitoring
pnpm pm2:start         # Start with PM2
pnpm pm2:logs          # View logs
pnpm pm2:restart       # Restart gateway
```

### 4. Documentation

**Files Created**:
- `OPERATIONS.md` - Comprehensive operations guide
- `QUICKSTART.md` - Quick reference for common tasks
- `POSTMORTEM.md` - This document

**Topics Covered**:
- Troubleshooting procedures
- Monitoring checklist
- Architecture overview
- Environment variables
- Alerting setup

## Lessons Learned

### What Went Well
- Quick diagnosis with existing tools
- No data loss (Telegram preserves messages)
- Easy recovery (just restart gateway)

### What Could Be Improved
- No alerting when gateway down
- Manual process management
- No visibility into queue depth
- No health dashboard

### Action Items

**Completed**:
- [x] PM2 configuration for auto-restart
- [x] Health monitoring script
- [x] Diagnostic npm scripts
- [x] Operations documentation
- [x] Quick start guide

**Future Improvements**:
- [ ] Webhook mode (eliminates polling issues)
- [ ] Message persistence (database before processing)
- [ ] Health dashboard (real-time metrics)
- [ ] Alerting integration (Slack/Discord/PagerDuty)
- [ ] Multi-instance support (load balancing, failover)

## Monitoring & Alerting

### Daily Checks
```bash
# Quick health check
pm2 status
pnpm queue:check
```

### Continuous Monitoring
```bash
# Run monitor in background
pm2 start ecosystem.config.js --only pty-gateway-monitor
```

### Alert Integration (Future)
```typescript
// In monitor-gateway.ts
if (queueSize > MAX_QUEUE_SIZE) {
  await sendSlackAlert(`Gateway queue: ${queueSize} messages`);
}
```

## Architecture Recommendations

### Short-term (Implemented)
- ✅ PM2 process supervision
- ✅ Health monitoring
- ✅ Diagnostic tools
- ✅ Documentation

### Medium-term
- [ ] Switch to webhook mode
- [ ] Add message persistence
- [ ] Implement alerting
- [ ] Create health dashboard

### Long-term
- [ ] Multi-instance deployment
- [ ] Load balancing
- [ ] Database-backed queue
- [ ] Metrics & analytics

## Cost Analysis

**Downtime Cost**: Minimal (internal tool, no SLA)
**Recovery Cost**: ~5 minutes developer time
**Prevention Cost**: ~2 hours (setup PM2, monitoring, docs)

**ROI**: Prevents future incidents, reduces debugging time

## Related Issues

- None (first occurrence)

## References

- [Telegram Bot API - getUpdates](https://core.telegram.org/bots/api#getupdates)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Grammy Documentation](https://grammy.dev/guide/polling.html)

## Appendix

### Message Queue State (Before Fix)
```
Update ID: 467653489
Message ID: 158
From: C.Wong (@wongcc)
User ID: 255433743
Chat ID: 255433743
Text: "/list"
Date: 2026-05-06T01:10:42.000Z

Update ID: 467653490
Message ID: 159
Text: "/help"
Date: 2026-05-06T01:10:56.000Z

Update ID: 467653491
Message ID: 160
Text: "/help"
Date: 2026-05-06T01:11:58.000Z
```

### Gateway Logs (After Restart)
```
[2026-05-06T01:10:42.000Z] 📨 Message received: "/list"
[Telegram] 📤 Sending message: "No PTY instances running."
✅ Message sent (ID: 161)

[2026-05-06T01:10:56.000Z] 📨 Message received: "/help"
✅ Message sent (ID: 162)

[2026-05-06T01:11:58.000Z] 📨 Message received: "/help"
✅ Message sent (ID: 163)
```

### PM2 Configuration
```javascript
{
  name: "pty-gateway",
  autorestart: true,
  max_restarts: 10,
  restart_delay: 3000,
  min_uptime: "10s"
}
```

---

**Document Version**: 1.0
**Last Updated**: 2026-05-06
**Author**: Claude (AI Assistant)
**Review Date**: 2026-06-06
