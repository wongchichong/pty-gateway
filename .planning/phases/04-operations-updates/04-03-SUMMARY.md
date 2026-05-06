# SUMMARY: Set Up Alerting

**Plan ID**: 04-03
**Phase**: 4 - Operations Updates
**Status**: ⏭️ Deferred
**Commit**: N/A

## Decision

Alerting integration deferred because:

1. **Personal use** - No need for production alerting
2. **Simple monitoring** - PM2/systemd logs sufficient
3. **Low traffic** - Personal communication doesn't need alerts
4. **Context budget** - Prioritize core documentation

## Current Monitoring

**Available:**
- PM2 logs: `pm2 logs pty-gateway`
- Systemd logs: `journalctl -u pty-gateway -f`
- Health endpoint: `curl http://localhost:3000/health`
- Process monitoring: `pm2 monit`

## When to Add Alerting

Add webhook alerts when:
- Deploying to production server
- Multiple users depend on service
- Need proactive monitoring
- High availability required

## Implementation (Future)

```typescript
// Add to monitor-gateway.ts
async function sendAlert(message: string) {
  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (webhook) {
    await fetch(webhook, {
      method: 'POST',
      body: JSON.stringify({ text: message })
    });
  }
}
```

## Success Criteria

- [ ] Webhook integration added (deferred)
- [ ] Alert threshold configurable (deferred)
