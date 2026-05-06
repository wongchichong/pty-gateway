import { Bot } from "grammy";

const token = "8520957421:AAGBrVEnuGDeFAfAE1GRyJ_-0rJSTL9FtKU";
const bot = new Bot(token);

async function checkUpdates() {
  console.log("📥 Fetching recent updates from Telegram...\n");

  const updates = await bot.api.getUpdates({ limit: 10, timeout: 0 });

  if (updates.length === 0) {
    console.log("✓ No pending updates found.");
    console.log("  The message queue is empty.\n");
    return;
  }

  console.log(`Found ${updates.length} update(s) in queue:\n`);
  console.log("═══════════════════════════════════════\n");

  for (const update of updates) {
    if (update.message) {
      const msg = update.message;
      console.log(`Update ID: ${update.update_id}`);
      console.log(`Message ID: ${msg.message_id}`);
      console.log(`From: ${msg.from?.first_name} (@${msg.from?.username || "N/A"})`);
      console.log(`User ID: ${msg.from?.id}`);
      console.log(`Chat ID: ${msg.chat.id}`);
      console.log(`Chat Type: ${msg.chat.type}`);
      console.log(`Text: "${msg.text}"`);
      console.log(`Date: ${new Date(msg.date * 1000).toISOString()}`);
      console.log("\n═══════════════════════════════════════\n");
    }
  }

  console.log("💡 Queue Status:");
  console.log("  - These messages are waiting to be processed");
  console.log("  - They will be handled when the gateway starts");
  console.log("  - The oldest update_id will be processed first\n");

  console.log("🔧 To process these messages:");
  console.log("  1. Start the PTY service: pty --serve --port 3000");
  console.log("  2. Start the gateway: pty-gateway\n");
}

checkUpdates().catch(console.error);
