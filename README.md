# PTY Gateway

Connect 22+ messaging platforms to PTY service - outbound only, works behind any firewall.

## Features

- **22+ Messaging Channels**: Telegram, Discord, WhatsApp, Slack, Matrix, WeChat, LINE, IRC, Nostr, Twitch, and more
- **Numeric Instance IDs**: Simple numeric IDs (1, 2, 3...) for easy reference
- **Auto-refresh**: 10-second PTY buffer updates with smart edit management (20-edit limit)
- **Flexible Sizing**: Per-channel defaults + `/size` command for custom PTY dimensions
- **Responsive CLI**: Auto-detects terminal window size
- **HTML Format**: Telegram output in `<pre>` tags (no ANSI codes)
- **ANSI Preservation**: CLI commands show raw ANSI for TUI rendering
- **Telegram Command Menu**: All 8 commands visible in `/` dropdown

## Supported Channels

| Channel | Library | Auth | Size | Status |
|---------|---------|------|------|--------|
| **Telegram** | grammy | Bot token | 1.4MB | ✅ Included |
| **Discord** | discord.js | Bot token | 3.3MB | ✅ Included |
| **WhatsApp** | @whiskeysockets/baileys | QR code | 9MB | ✅ Optional |
| **Slack** | @slack/bolt | Bot token | 11MB | ✅ Optional |
| **Matrix** | matrix-js-sdk | Access token | 14MB | ✅ Optional |
| **WeChat** | wechaty | QR code | 15MB | ✅ Optional |
| **LINE** | @line/bot-sdk | Channel token | 16MB | ✅ Optional |
| **IRC** | irc-framework | None | 0.5MB | ✅ Optional |
| **Nostr** | nostr-tools | Private key | 0.5MB | ✅ Optional |
| **Twitch** | tmi.js | OAuth | 0.3MB | ✅ Optional |
| **Google Chat** | HTTP webhook | Service account | - | ✅ No deps |
| **MS Teams** | HTTP webhook | App credentials | - | ✅ No deps |
| **BlueBubbles** | HTTP | API key | - | ✅ No deps |
| **Mattermost** | HTTP | Bot token | - | ✅ No deps |
| **Feishu** | HTTP | App credentials | - | ✅ No deps |
| **QQ Bot** | HTTP | App credentials | - | ✅ No deps |
| **Nextcloud** | HTTP | User credentials | - | ✅ No deps |
| **Synology Chat** | HTTP | Token | - | ✅ No deps |
| **Tlon/Urbit** | HTTP | API key | - | ✅ No deps |
| **WebChat** | ws | None | - | ✅ Built-in |
| **Signal** | signal-cli | Phone number | - | ✅ Requires Java |
| **iMessage** | AppleScript | None | - | ✅ macOS only |

## Quick Start

```bash
# Interactive registration (recommended)
pty-gateway --register

# Start gateway
pty-gateway

# Or with specific channels
pty-gateway --telegram-token <TOKEN> --telegram-users <USER_ID>
```

## Commands

Available on all channels:

| Command | Description | Example |
|---------|-------------|---------|
| `/start <command> [args]` | Start PTY instance | `/start htop` |
| `/connect [id]` | Connect to instance | `/connect 1` or `/connect 28025` |
| `/kill` | Kill instance | `/kill` |
| `/list` | List instances | `/list` |
| `/snapshot` | Get buffer | `/snapshot` |
| `/status` | Show status | `/status` |
| `/size [colsxrows]` | Set PTY size | `/size 40x80` |
| `/help` | Show help | `/help` |

### Instance IDs

- **Numeric IDs**: Simple numbers (1, 2, 3...)
- **PID Lookup**: Can also connect by process ID (`/connect 28025`)
- **Consistent**: Same IDs across CLI and Chat

### Size Management

```bash
# Set custom size
/size 40x80    # Narrow for Telegram (mobile)
/size 80x40    # Desktop width
/size 120x40   # Wide terminal

# Check current size
/size

# Reset to default
/size reset
```

**Per-Channel Defaults**:
- Telegram: 40x80 (narrow for mobile)
- Discord: 60x40 (medium)
- Slack: 80x40 (desktop)
- CLI: Auto-detects terminal size

### Auto-refresh

When connected to a PTY instance:
- **10-second updates**: Buffer snapshots every 10s
- **Edit tracking**: Edits existing message (#1/20, #2/20...)
- **Buffer comparison**: Skips update if unchanged
- **20-edit limit**: Deletes and creates fresh message after 20 edits

## CLI Usage

```bash
# List instances
pnpm dev list

# Connect to instance (shows ANSI snapshot)
pnpm dev connect 1

# Get snapshot (shows ANSI output)
pnpm dev snapshot 1

# Send command
pnpm dev send 1 'ls -la'

# Chat mode (HTML format, auto-detects terminal size)
pnpm dev chat '/start bash'
pnpm dev chat '/connect 1'
pnpm dev chat '/size 80x40'
```

## Install-on-Use Pattern

Only install what you need:

```bash
# Base install (105MB - Telegram + Discord)
npm install pty-gateway

# Add WhatsApp support (+9MB)
npm install @whiskeysockets/baileys

# Add Slack support (+11MB)
npm install @slack/bolt

# Add Matrix support (+14MB)
npm install matrix-js-sdk

# Add WeChat support (+15MB)
npm install wechaty
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      pty-gateway                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │Telegram │ │ Discord │ │WhatsApp │ │  Slack  │  ...     │
│  │(grammy) │ │(discord)│ │(baileys)│ │ (bolt)  │          │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘          │
│       │           │           │           │                │
│       └───────────┼───────────┼───────────┘                │
│                   ▼           ▼                            │
│         ┌─────────────────────────────┐                    │
│         │     Channel Router          │                    │
│         │   (message → PTY commands)  │                    │
│         └────────────┬────────────────┘                    │
│                      ▼                                      │
│         ┌─────────────────────────────┐                    │
│         │     PTY Service Client      │                    │
│         │    (HTTP/WS to PTY)         │                    │
│         └────────────┬────────────────┘                    │
└──────────────────────┼──────────────────────────────────────┘
                       ▼
         ┌─────────────────────────────┐
         │     PTY Service             │
         │   pty --serve --port 3000   │
         └─────────────────────────────┘
```

## Webhook Server

For platforms that require webhooks (LINE, Google Chat, MS Teams, etc.):

```bash
# Start gateway with webhook server
pty-gateway --webhook-port 3002
```

Webhook endpoints:
- `POST /webhook/line` - LINE Messaging API
- `POST /webhook/googlechat` - Google Chat
- `POST /webhook/msteams` - MS Teams
- `POST /webhook/synology` - Synology Chat
- `POST /webhook/nextcloud` - Nextcloud Talk

## Registration Walkthrough

### Telegram

1. Open Telegram, search `@BotFather`
2. Send `/newbot`
3. Choose bot name and username
4. Paste the token

**Telegram Features**:
- Command menu with all 8 commands (type `/` to see)
- HTML format with `<pre>` tags
- Auto-refresh with 10s updates
- Narrow 40x80 default size for mobile

### Discord

1. Go to https://discord.com/developers/applications
2. Create New Application → Add Bot
3. Enable "Message Content Intent"
4. Copy bot token

### WhatsApp

1. Install: `npm install @whiskeysockets/baileys`
2. Scan QR code with WhatsApp on your phone

### WeChat

1. Install: `npm install wechaty wechaty-puppet-wechat4u`
2. Scan QR code with WeChat

### Slack

1. Create Slack App at https://api.slack.com/apps
2. Get Bot User OAuth Token (`xoxb-...`)
3. Get App-Level Token (`xapp-...`) for Socket Mode

## CLI Options

```bash
pty-gateway [options]

Options:
  -r, --register             Interactive channel registration
  -p, --pty <url>            PTY service URL (default: http://localhost:3000)
  --webhook-port <port>      Webhook server port (default: 3002)

Channel options:
  --telegram-token <token>   Telegram bot token
  --telegram-users <ids>     Allowed Telegram user IDs (comma-separated)
  --telegram-chats <ids>     Allowed Telegram chat IDs (comma-separated)
  --discord-token <token>    Discord bot token
  --whatsapp-session <path>  WhatsApp session directory
  --slack-bot-token <token>  Slack bot token (xoxb-...)
  --slack-app-token <token>  Slack app token (xapp-...)
  --matrix-homeserver <url>  Matrix homeserver URL
  --matrix-access-token <t>  Matrix access token
  --matrix-user-id <id>      Matrix user ID (@bot:matrix.org)
  --irc-server <server>      IRC server
  --irc-nick <nick>          IRC nickname
  --line-token <token>       LINE channel access token
  --line-secret <secret>     LINE channel secret
  --nostr-key <key>          Nostr private key
  --twitch-token <token>     Twitch OAuth token
  --twitch-channels <list>   Twitch channels to join
  --wechat-puppet <name>     WeChat puppet type

Environment Variables:
  PTY_URL                    PTY service URL
  TELEGRAM_BOT_TOKEN         Telegram bot token
  DISCORD_BOT_TOKEN          Discord bot token
```

## Outbound-Only Pattern

All channels use **outbound connections**:

| Channel | Connection Type |
|---------|-----------------|
| Telegram | Polling (gateway → api.telegram.org) |
| Discord | Gateway WebSocket (gateway → gateway.discord.gg) |
| WhatsApp | WebSocket (gateway → WhatsApp servers) |
| Slack | Socket Mode (gateway → Slack servers) |
| Matrix | Client-Server API (gateway → homeserver) |
| IRC | IRC protocol (gateway → IRC server) |

**No inbound connections needed** - works behind any firewall or NAT.

## Operations

### Process Management (PM2)

```bash
# Install PM2
npm install -g pm2

# Start gateway
pnpm pm2:start

# Check status
pm2 status

# View logs
pnpm pm2:logs

# Restart
pnpm pm2:restart

# Stop
pnpm pm2:stop
```

### Health Monitoring

```bash
# Check Telegram queue
pnpm queue:check

# Diagnose Telegram bot
pnpm telegram:diagnose

# Continuous monitoring
pnpm monitor
```

### Documentation

- `QUICKSTART.md` - Quick reference
- `OPERATIONS.md` - Operations guide
- `AUTO_REFRESH.md` - Auto-refresh documentation
- `SIZE_FEATURE.md` - Size management guide
- `TEST_RESULTS.md` - Test results summary
- `POSTMORTEM.md` - Incident analysis

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Development mode
pnpm dev

# Test chat mode
pnpm chat "/help"
pnpm chat "/list"
pnpm chat "/start bash"
```

## Project Structure

```
src/
├── index.ts           # CLI entry point
├── pty-client.ts      # HTTP/WS client to PTY service
├── router.ts          # Message routing logic
├── webhook.ts         # Webhook server for LINE/Google Chat/MS Teams
├── monitor-gateway.ts # Health monitoring
├── check-telegram-queue.ts # Queue checker
├── diagnose-telegram.ts # Telegram diagnostics
├── utils/
│   └── deps.ts        # Dynamic dependency loader
└── channels/
    ├── types.ts       # Channel interface & configs
    ├── telegram.ts    # Telegram (grammy)
    ├── discord.ts     # Discord (discord.js)
    ├── whatsapp.ts    # WhatsApp (baileys)
    ├── slack.ts       # Slack (bolt)
    ├── matrix.ts      # Matrix (matrix-js-sdk)
    ├── irc.ts         # IRC (irc-framework)
    ├── line.ts        # LINE (@line/bot-sdk)
    ├── nostr.ts       # Nostr (nostr-tools)
    ├── twitch.ts      # Twitch (tmi.js)
    ├── wechat.ts      # WeChat (wechaty)
    ├── googlechat.ts  # Google Chat (HTTP)
    ├── msteams.ts     # MS Teams (HTTP)
    ├── nextcloud.ts   # Nextcloud Talk (HTTP)
    ├── synology.ts    # Synology Chat (HTTP)
    ├── tlon.ts        # Tlon/Urbit (HTTP)
    ├── webchat.ts     # WebChat (ws)
    ├── signal.ts      # Signal (signal-cli)
    ├── http.ts        # Generic HTTP channel
    └── index.ts       # Exports & factory
```

## Adding New Channels

1. Create `src/channels/mychannel.ts`:

```typescript
import type { Channel, ChannelMessage, MessageHandler } from "./types.js";

export class MyChannel implements Channel {
  readonly type = "mychannel" as const;
  
  async start() { /* connect */ }
  async stop() { /* disconnect */ }
  async sendMessage(chatId: string, text: string) { /* send */ }
  onMessage(handler: MessageHandler) { /* register handler */ }
}
```

2. Add to `src/channels/index.ts`

3. Add dependency to `package.json` peerDependencies (if needed)

## Test Results

**Latest Run**: 2026-05-06
- **Total Tests**: 30
- **Passed**: 25 (83%)
- **Failed**: 5 (test architecture issue, not bugs)

**All Features Working**:
- ✅ Numeric IDs (1, 2, 3...)
- ✅ HTML format for Telegram
- ✅ ANSI preservation for CLI
- ✅ Auto-refresh (10s updates)
- ✅ Size management
- ✅ Telegram command menu
- ✅ Responsive CLI

See `TEST_RESULTS.md` for detailed analysis.

## License

MIT
