# PTY Gateway

Connect 13+ messaging platforms to PTY service - outbound only, works behind any firewall.

## Quick Start

```bash
# Interactive registration (recommended)
pty-gateway --register

# Start gateway
pty-gateway
```

## Supported Channels

| Channel | Library | Auth | Size | Status |
|---------|---------|------|------|--------|
| **Telegram** | grammy | Bot token | 1.4MB | ✅ Included |
| **Discord** | discord.js | Bot token | 3.3MB | ✅ Included |
| **WhatsApp** | @whiskeysockets/baileys | QR code | 9MB | ✅ Optional |
| **Slack** | @slack/bolt | Bot token | 11MB | ✅ Optional |
| **Matrix** | matrix-js-sdk | Access token | 14MB | ✅ Optional |
| **IRC** | irc-framework | None | 0.5MB | ✅ Optional |
| **LINE** | @line/bot-sdk | Channel token | 16MB | ✅ Optional |
| **Nostr** | nostr-tools | Private key | 0.5MB | ✅ Optional |
| **Twitch** | tmi.js | OAuth | 0.3MB | ✅ Optional |
| **BlueBubbles** | HTTP | API key | - | ✅ No deps |
| **Mattermost** | HTTP | Bot token | - | ✅ No deps |
| **Feishu** | HTTP | App credentials | - | ✅ No deps |
| **QQ Bot** | HTTP | App credentials | - | ✅ No deps |

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

## Registration Walkthrough

### Telegram

```bash
pty-gateway --register
```

1. Select `telegram`
2. Open Telegram, search `@BotFather`
3. Send `/newbot`
4. Choose bot name (e.g., "PTY Gateway")
5. Choose username ending in `bot` (e.g., `my_pty_bot`)
6. Paste the token BotFather gives you

### Discord

1. Select `discord`
2. Go to https://discord.com/developers/applications
3. Create New Application
4. Add Bot, enable "Message Content Intent"
5. Reset Token to get your bot token
6. Use OAuth2 > URL Generator to invite bot to your server

### WhatsApp

1. Select `whatsapp`
2. Install: `npm install @whiskeysockets/baileys`
3. Scan QR code with WhatsApp on your phone

### Slack

1. Select `slack`
2. Create Slack App at https://api.slack.com/apps
3. Get Bot User OAuth Token (`xoxb-...`)
4. Get App-Level Token (`xapp-...`) for Socket Mode

## Commands

Available on all channels:

| Command | Description |
|---------|-------------|
| `/start <command> [args]` | Start PTY instance |
| `/connect [id]` | Connect to instance |
| `/kill` | Kill instance |
| `/list` | List instances |
| `/snapshot` | Get buffer |
| `/help` | Show help |

### Examples

```
/start vim file.txt      # Start vim
/start htop              # Start htop
/connect                 # List available instances
/connect abc123          # Connect to specific instance
/snapshot                # Get current buffer
/kill                    # Kill instance
```

## Configuration

Config stored in `~/.pty-gateway/config.json`:

```json
{
  "telegram": {
    "botToken": "123456:ABC..."
  },
  "discord": {
    "botToken": "MTk..."
  },
  "whatsapp": {
    "sessionPath": "~/.pty-gateway/whatsapp-session"
  }
}
```

## CLI Options

```bash
pty-gateway [options]

Options:
  -r, --register             Interactive channel registration
  -p, --pty <url>            PTY service URL (default: http://localhost:3000)
  -t, --token <token>        PTY auth token

Telegram:
  --telegram-token <token>   Telegram bot token
  --telegram-users <ids>     Allowed user IDs

Discord:
  --discord-token <token>    Discord bot token
  --discord-guild <id>       Restrict to guild

WhatsApp:
  --whatsapp-session <path>  Session directory

Slack:
  --slack-bot-token <token>  Bot token (xoxb-...)
  --slack-app-token <token>  App token (xapp-...)

Matrix:
  --matrix-homeserver <url>  Homeserver URL
  --matrix-access-token <t>  Access token
  --matrix-user-id <id>      User ID (@bot:matrix.org)

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

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Run with coverage
pnpm test:coverage

# Development mode
pnpm dev
```

## Project Structure

```
src/
├── index.ts           # CLI entry point
├── pty-client.ts      # HTTP/WS client to PTY service
├── router.ts          # Message routing logic
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

3. Add dependency to `package.json` peerDependencies

## License

MIT
