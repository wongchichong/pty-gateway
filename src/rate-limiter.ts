import { RateLimiter } from "limiter";
import type { ChannelType } from "./channels/types.js";

// Rate limit configuration per channel type
const RATE_LIMITS: Record<ChannelType, { tokens: number; interval: "minute" | "second" }> = {
  telegram: { tokens: 5, interval: "minute" },
  discord: { tokens: 10, interval: "minute" },
  whatsapp: { tokens: 5, interval: "minute" },
  slack: { tokens: 10, interval: "minute" },
  matrix: { tokens: 10, interval: "minute" },
  irc: { tokens: 20, interval: "minute" },
  line: { tokens: 5, interval: "minute" },
  nostr: { tokens: 10, interval: "minute" },
  twitch: { tokens: 20, interval: "minute" },
  wechat: { tokens: 5, interval: "minute" },
  googlechat: { tokens: 10, interval: "minute" },
  msteams: { tokens: 10, interval: "minute" },
  nextcloud: { tokens: 10, interval: "minute" },
  synology: { tokens: 10, interval: "minute" },
  tlon: { tokens: 10, interval: "minute" },
  webchat: { tokens: 30, interval: "minute" },
  signal: { tokens: 5, interval: "minute" },
  imessage: { tokens: 30, interval: "minute" },
  bluebubbles: { tokens: 30, interval: "minute" },
  feishu: { tokens: 10, interval: "minute" },
  mattermost: { tokens: 10, interval: "minute" },
  qqbot: { tokens: 10, interval: "minute" },
};

// Track limiters per user per channel
const userLimiters = new Map<string, RateLimiter>();

function getLimiterKey(channel: ChannelType, userId: string): string {
  return `${channel}:${userId}`;
}

export function checkRateLimit(channel: ChannelType, userId: string): { allowed: boolean; remaining: number } {
  const key = getLimiterKey(channel, userId);
  const config = RATE_LIMITS[channel] || { tokens: 5, interval: "minute" as const };

  let limiter = userLimiters.get(key);

  if (!limiter) {
    limiter = new RateLimiter({
      tokensPerInterval: config.tokens,
      interval: config.interval,
    });
    userLimiters.set(key, limiter);
  }

  const allowed = limiter.tryRemoveTokens(1);
  const remaining = limiter.getTokensRemaining();

  return { allowed, remaining };
}

export function getRateLimitMessage(channel: ChannelType): string {
  const config = RATE_LIMITS[channel] || { tokens: 5 };
  return `⚠️ Rate limit exceeded. You can send ${config.tokens} commands per minute. Please wait before sending more commands.`;
}

// Cleanup old limiters every 5 minutes to prevent memory leaks
setInterval(() => {
  if (userLimiters.size > 1000) {
    userLimiters.clear();
    console.log("[RateLimiter] Cleared cache (size > 1000)");
  }
}, 5 * 60 * 1000);
