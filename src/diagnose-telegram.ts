#!/usr/bin/env tsx
/**
 * Telegram API Diagnostic Tool
 * Tests token validity and bot information
 */

import { Bot } from "grammy";

async function diagnose() {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.argv[2];

  if (!token) {
    console.error("❌ No token provided");
    console.log("\nUsage:");
    console.log("  tsx src/diagnose-telegram.ts <BOT_TOKEN>");
    console.log("  TELEGRAM_BOT_TOKEN=<token> tsx src/diagnose-telegram.ts");
    console.log("\nGet your token from @BotFather on Telegram");
    process.exit(1);
  }

  console.log("🔍 Telegram Bot Diagnostic\n");
  console.log(`Token: ${token.slice(0, 10)}...${token.slice(-10)}\n`);

  // Validate token format
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
    console.error("⚠️  Warning: Token format looks invalid");
    console.error("Expected format: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz\n");
  }

  const bot = new Bot(token);

  try {
    console.log("📡 Testing connection to Telegram API...\n");

    // Get bot info
    const me = await bot.api.getMe();
    console.log("✅ Connection successful!\n");

    console.log("═══════════════════════════════════════");
    console.log("Bot Information:");
    console.log("═══════════════════════════════════════");
    console.log(`  ID:        ${me.id}`);
    console.log(`  Username:  @${me.username}`);
    console.log(`  Name:      ${me.first_name}`);
    if (me.last_name) console.log(`  Last Name: ${me.last_name}`);
    console.log(`  Is Bot:    ${me.is_bot}`);
    console.log(`  Language:  ${me.language_code || "N/A"}`);

    if (me.can_join_groups !== undefined) {
      console.log(`\n  Can Join Groups:  ${me.can_join_groups ? "✓" : "✗"}`);
    }
    if (me.can_read_all_group_messages !== undefined) {
      console.log(`  Read All Groups:  ${me.can_read_all_group_messages ? "✓" : "✗"}`);
    }
    if (me.supports_inline_queries !== undefined) {
      console.log(`  Inline Queries:  ${me.supports_inline_queries ? "✓" : "✗"}`);
    }

    console.log("\n═══════════════════════════════════════");
    console.log("API Endpoints:");
    console.log("═══════════════════════════════════════");

    // Test getUpdates (check if bot can receive messages)
    const updates = await bot.api.getUpdates({ limit: 1, timeout: 0 });
    console.log(`  getUpdates: ✅ Working (${updates.length} pending updates)`);

    // Test webhook info
    const webhookInfo = await bot.api.getWebhookInfo();
    console.log(`  getWebhookInfo: ✅ Working`);

    if (webhookInfo.url) {
      console.log(`\n  ⚠️  Webhook is set: ${webhookInfo.url}`);
      console.log("  This bot is using webhook mode, not polling");
      console.log("  Delete webhook with: bot.api.deleteWebhook()");
    } else {
      console.log(`\n  ✓ No webhook set (polling mode available)`);
    }

    console.log("\n═══════════════════════════════════════");
    console.log("Next Steps:");
    console.log("═══════════════════════════════════════");
    console.log("1. Start a chat with your bot:");
    console.log(`   https://t.me/${me.username}\n`);
    console.log("2. Send /start to the bot\n");
    console.log("3. Run the gateway:");
    console.log("   pty-gateway --telegram-token \"$TELEGRAM_BOT_TOKEN\"\n");

    console.log("═══════════════════════════════════════");
    console.log("✅ All diagnostics passed!");
    console.log("═══════════════════════════════════════\n");

  } catch (err) {
    console.error("\n❌ Connection failed!\n");
    console.error("═══════════════════════════════════════");
    console.error("Error Details:");
    console.error("═══════════════════════════════════════");

    if (err instanceof Error) {
      if (err.message.includes("401") || err.message.includes("Unauthorized")) {
        console.error("  Status: Invalid token");
        console.error("  Reason: The bot token is incorrect or revoked");
        console.error("\n  Solution:");
        console.error("  1. Go to @BotFather on Telegram");
        console.error("  2. Find your bot with /mybots");
        console.error("  3. Click 'API Token' → 'Revoke current token'");
        console.error("  4. Get a new token and try again");
      } else if (err.message.includes("404") || err.message.includes("Not Found")) {
        console.error("  Status: Bot not found");
        console.error("  Reason: No bot exists with this token");
        console.error("\n  Solution:");
        console.error("  Create a new bot with @BotFather using /newbot");
      } else if (err.message.includes("ENOTFOUND") || err.message.includes("ECONNREFUSED")) {
        console.error("  Status: Network error");
        console.error("  Reason: Cannot reach Telegram API servers");
        console.error("\n  Solution:");
        console.error("  Check your internet connection");
        console.error("  Try: curl https://api.telegram.org");
      } else {
        console.error(`  Error: ${err.message}`);
      }
    } else {
      console.error(`  Unknown error: ${err}`);
    }

    console.error("═══════════════════════════════════════\n");
    process.exit(1);
  }
}

diagnose();
