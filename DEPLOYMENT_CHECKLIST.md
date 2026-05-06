# Deployment Checklist

Pre-deployment validation for PTY Gateway.

## Pre-Deployment

### 1. Environment Variables
```bash
# Required
export TELEGRAM_BOT_TOKEN="your-token-here"
export TELEGRAM_ALLOWED_USERS="your-user-id"

# Optional (with defaults)
export PTY_URL="http://localhost:3000"
export RATE_LIMIT_TOKENS="5"
export RATE_LIMIT_INTERVAL="minute"
```

### 2. Verify PTY Service
```bash
# Check PTY service is running
curl http://localhost:3000/health

# Expected: {"status":"ok","apps":0}
```

### 3. Install Dependencies
```bash
pnpm install
pnpm build
```

## Deployment

### Option 1: PM2 (Recommended)
```bash
# Start gateway
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs pty-gateway
```

### Option 2: Systemd
```bash
# Copy service file
sudo cp pty-gateway.service /etc/systemd/system/

# Create config directory
sudo mkdir -p /etc/pty-gateway
sudo cp config.env.example /etc/pty-gateway/config.env
sudo chmod 600 /etc/pty-gateway/config.env

# Edit config
sudo nano /etc/pty-gateway/config.env

# Start service
sudo systemctl daemon-reload
sudo systemctl start pty-gateway
sudo systemctl enable pty-gateway
```

## Post-Deployment Validation

### 1. Health Check
```bash
# Gateway should respond
pm2 logs pty-gateway --lines 20

# Look for: "✅ Telegram bot started"
```

### 2. Test Commands
```bash
# In Telegram, send:
/start bash

# Expected: "Started PTY: 1\nCommand: bash\nPID: <pid>"
```

### 3. Test Rate Limiting
```bash
# Send 6 commands rapidly
# Expected: Rate limit message on 6th command
```

### 4. Test Session Management
```bash
/start vim test.txt
# Type: i (insert mode)
# Type: hello world
# Type: <Esc>:wq
/kill

# Expected: Session killed successfully
```

## Rollback Procedure

### PM2 Rollback
```bash
# Stop gateway
pm2 stop pty-gateway

# Checkout previous version
git checkout <previous-commit>

# Rebuild
pnpm build

# Restart
pm2 restart pty-gateway
```

### Systemd Rollback
```bash
sudo systemctl stop pty-gateway
git checkout <previous-commit>
pnpm build
sudo systemctl start pty-gateway
```

## Monitoring

### Logs
```bash
# PM2
pm2 logs pty-gateway

# Systemd
sudo journalctl -u pty-gateway -f
```

### Health Monitoring
```bash
# Check PTY service
curl http://localhost:3000/health

# Check gateway process
pm2 status
# or
sudo systemctl status pty-gateway
```

## Troubleshooting

### Gateway won't start
1. Check environment variables are set
2. Verify PTY service is running
3. Check logs for errors
4. Verify dependencies installed

### Commands not working
1. Check rate limiting logs
2. Verify PTY service connectivity
3. Check user is in allowed list
4. Review gateway logs

### Memory issues
1. Check for zombie PTY instances: `/list`
2. Kill unused sessions: `/kill <id>`
3. Restart gateway if needed
4. Monitor memory: `pm2 monit`

## Security Checklist

- [ ] Bot token not in git
- [ ] Allowed users configured
- [ ] Rate limiting enabled
- [ ] PTY service isolated
- [ ] Logs monitored
- [ ] Regular updates applied
